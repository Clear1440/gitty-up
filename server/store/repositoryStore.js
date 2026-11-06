import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE_NAME = 'repositories.json';

/** The same folder must always map to the same id, whatever its casing on Windows. */
function repositoryId(repositoryPath) {
  const key = process.platform === 'win32' ? repositoryPath.toLowerCase() : repositoryPath;
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

/** Persists the linked repositories as a JSON file in the data directory. */
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
    const id = repositoryId(repositoryPath);
    const existing = await this.get(id);
    if (existing) return existing;

    const repository = {
      id,
      name: path.basename(repositoryPath),
      path: repositoryPath,
      linkedAt: new Date().toISOString(),
    };
    await this.#save([...(await this.list()), repository]);
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
