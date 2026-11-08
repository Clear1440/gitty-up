import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HashHelper } from '../utils/HashHelper.js';

const FILE_NAME = 'repositories.json';
/** Repository and group ids are this many characters long. */
const ID_LENGTH = 12;

/** The same folder must always map to the same id, whatever its casing on Windows. */
function repositoryId(repositoryPath) {
  const key = process.platform === 'win32' ? repositoryPath.toLowerCase() : repositoryPath;
  return HashHelper.sha256(key).slice(0, ID_LENGTH);
}

function createEntry(repositoryPath) {
  return {
    id: repositoryId(repositoryPath),
    name: path.basename(repositoryPath),
    path: repositoryPath,
    linkedAt: new Date().toISOString(),
  };
}

const createGroup = (name) => ({ id: randomUUID().slice(0, ID_LENGTH), name });

const findGroupByName = (groups, name) =>
  groups.find((group) => group.name.toLowerCase() === name.toLowerCase());

function withoutGroup(repository) {
  const ungrouped = { ...repository };
  delete ungrouped.groupId;
  return ungrouped;
}

/**
 * Persists the linked repositories and their groups as a JSON file in the data directory.
 * A stub is an entry known only by its remote URL. Its `path` stays null until
 * it is cloned or located, when `resolveStub` swaps it for a real entry.
 * A repository belongs to at most one group, through its optional `groupId`. A group
 * opened as a mono repo also remembers the branch it is on, as `monoBranch`.
 */
export class RepositoryStore {
  #filePath;
  #data = null;

  constructor(dataDir) {
    this.#filePath = path.join(dataDir, FILE_NAME);
  }

  async list() {
    this.#data ??= await this.#load();
    return [...this.#data.repositories];
  }

  async get(id) {
    return (await this.list()).find((repository) => repository.id === id) ?? null;
  }

  /** Links a repository. Linking the same folder twice returns the existing entry. */
  async add(repositoryPath) {
    const repository = createEntry(repositoryPath);
    const existing = await this.get(repository.id);
    if (existing) return existing;

    await this.#save({ repositories: [...(await this.list()), repository] });
    return repository;
  }

  /**
   * Links many repositories in one write. With a `groupName` they join that group,
   * creating it if needed, except for any already placed in a group of their own.
   */
  async addMany(repositoryPaths, { groupName } = {}) {
    if (repositoryPaths.length === 0) return;

    const byId = new Map((await this.list()).map((repository) => [repository.id, repository]));
    const groups = await this.listGroups();
    const group = groupName && (findGroupByName(groups, groupName) ?? createGroup(groupName));

    for (const repositoryPath of repositoryPaths) {
      const entry = createEntry(repositoryPath);
      const repository = byId.get(entry.id) ?? entry;
      const joinsGroup = group && !repository.groupId;
      byId.set(entry.id, joinsGroup ? { ...repository, groupId: group.id } : repository);
    }

    await this.#save({
      repositories: [...byId.values()],
      groups: group && !groups.includes(group) ? [...groups, group] : groups,
    });
  }

  /** Adds a stub. Adding the same URL twice returns the existing entry. */
  async addStub({ url, name }) {
    const id = repositoryId(`remote:${url}`);
    const existing = await this.get(id);
    if (existing) return existing;

    const stub = { id, name, path: null, remoteUrl: url, linkedAt: new Date().toISOString() };
    await this.#save({ repositories: [...(await this.list()), stub] });
    return stub;
  }

  /** Turns a stub into a linked repository, keeping its place in the list and its group. */
  async resolveStub(stubId, repositoryPath) {
    const repository = createEntry(repositoryPath);
    const existing = await this.get(repository.id);
    if (existing) {
      await this.remove(stubId);
      return existing;
    }
    const repositories = await this.list();
    const { groupId } = repositories.find((entry) => entry.id === stubId);
    const resolved = groupId ? { ...repository, groupId } : repository;
    await this.#save({
      repositories: repositories.map((entry) => (entry.id === stubId ? resolved : entry)),
    });
    return resolved;
  }

  async remove(id) {
    const repositories = await this.list();
    await this.#save({ repositories: repositories.filter((repository) => repository.id !== id) });
  }

  async listGroups() {
    await this.list();
    return [...this.#data.groups];
  }

  async getGroup(id) {
    return (await this.listGroups()).find((group) => group.id === id) ?? null;
  }

  /** Adds a group. A name already in use returns that group. */
  async addGroup(name) {
    const groups = await this.listGroups();
    const existing = findGroupByName(groups, name);
    if (existing) return existing;

    const group = createGroup(name);
    await this.#save({ groups: [...groups, group] });
    return group;
  }

  async renameGroup(id, name) {
    const groups = await this.listGroups();
    const renamed = groups.map((group) => (group.id === id ? { ...group, name } : group));
    await this.#save({ groups: renamed });
    return renamed.find((group) => group.id === id);
  }

  /** Sets the branch a group opens on as a mono repo. Having one is what marks it opened. */
  async setMonoBranch(id, monoBranch) {
    const groups = await this.listGroups();
    await this.#save({
      groups: groups.map((group) => (group.id === id ? { ...group, monoBranch } : group)),
    });
  }

  /** Removes a group. Its repositories stay linked and become ungrouped. */
  async removeGroup(id) {
    const [repositories, groups] = await Promise.all([this.list(), this.listGroups()]);
    await this.#save({
      repositories: repositories.map((repository) =>
        repository.groupId === id ? withoutGroup(repository) : repository,
      ),
      groups: groups.filter((group) => group.id !== id),
    });
  }

  /** Moves a repository into a group, or out of any group when `groupId` is null. */
  async setGroup(id, groupId) {
    const repositories = await this.list();
    await this.#save({
      repositories: repositories.map((repository) => {
        if (repository.id !== id) return repository;
        return groupId ? { ...repository, groupId } : withoutGroup(repository);
      }),
    });
  }

  async #load() {
    try {
      const { repositories, groups = [] } = JSON.parse(await fs.readFile(this.#filePath, 'utf8'));
      return { repositories, groups };
    } catch (error) {
      if (error.code === 'ENOENT') return { repositories: [], groups: [] };
      throw error;
    }
  }

  /** Writes the given parts of the data, keeping the rest as it is. */
  async #save(changes) {
    const data = { ...this.#data, ...changes };
    await fs.mkdir(path.dirname(this.#filePath), { recursive: true });
    // Write then rename, so a crash can never leave a half-written file.
    const temporaryPath = `${this.#filePath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2));
    await fs.rename(temporaryPath, this.#filePath);
    this.#data = data;
  }
}
