import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE_NAME = 'repositories.json';

/** The same folder must always map to the same id, whatever its casing on Windows. */
function repositoryId(repositoryPath) {
  const key = process.platform === 'win32' ? repositoryPath.toLowerCase() : repositoryPath;
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

function createEntry(repositoryPath) {
  return {
    id: repositoryId(repositoryPath),
    name: path.basename(repositoryPath),
    path: repositoryPath,
    linkedAt: new Date().toISOString(),
  };
}

/**
 * Persists the linked repositories as a JSON file in the data directory.
 * A stub is an entry known only by its remote URL. Its `path` stays null until
 * it is cloned or located, when `resolveStub` swaps it for a real entry.
 */
export class RepositoryStore {
  #filePath;
  #repositories = null;

  constructor(dataDir) {
    this.#filePath = path.join(dataDir, FILE_NAME);
  }

  async list() {
    this.#repositories ??= await this.#load();
    return [...this.#repositories];
  }

  async get(id) {
    return (await this.list()).find((repository) => repository.id === id) ?? null;
  }

  /** Links a repository. Linking the same folder twice returns the existing entry. */
  async add(repositoryPath) {
    const repository = createEntry(repositoryPath);
    const existing = await this.get(repository.id);
    if (existing) return existing;

    await this.#save([...(await this.list()), repository]);
    return repository;
  }

  /** Adds a stub. Adding the same URL twice returns the existing entry. */
  async addStub({ url, name }) {
    const id = repositoryId(`remote:${url}`);
    const existing = await this.get(id);
    if (existing) return existing;

    const stub = { id, name, path: null, remoteUrl: url, linkedAt: new Date().toISOString() };
    await this.#save([...(await this.list()), stub]);
    return stub;
  }

  /** Turns a stub into a linked repository, keeping its place in the list. */
  async resolveStub(stubId, repositoryPath) {
    const repository = createEntry(repositoryPath);
    const existing = await this.get(repository.id);
    if (existing) {
      await this.remove(stubId);
      return existing;
    }
    const repositories = await this.list();
    await this.#save(repositories.map((entry) => (entry.id === stubId ? repository : entry)));
    return repository;
  }

  async remove(id) {
    const repositories = await this.list();
    await this.#save(repositories.filter((repository) => repository.id !== id));
  }

  async #load() {
    try {
      const { repositories } = JSON.parse(await fs.readFile(this.#filePath, 'utf8'));
      return repositories;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async #save(repositories) {
    await fs.mkdir(path.dirname(this.#filePath), { recursive: true });
    // Write then rename, so a crash can never leave a half-written file.
    const temporaryPath = `${this.#filePath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify({ repositories }, null, 2));
    await fs.rename(temporaryPath, this.#filePath);
    this.#repositories = repositories;
  }
}
