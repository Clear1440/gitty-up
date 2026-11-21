import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE_NAME = 'ai-activity.json';
/** How many calls that changed something are kept, on disk, oldest dropped first. */
export const MAX_WRITES = 500;
/** How many calls that only read are kept, in memory only, oldest dropped first. */
export const MAX_READS = 200;

const newestFirst = (a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0);

/**
 * What AI tools did through the MCP server, newest first.
 *
 * Calls that change a repository are what the log is for, so they are saved as JSON in
 * the home folder and survive a restart. Calls that only read can come by the hundred
 * while an AI tool looks around, so they are kept in memory alone: still there to look at,
 * but never costing a disk write, and never crowding the changes out of the file.
 *
 * Saves are written to a temporary file and renamed, so a crash cannot leave half a file,
 * and run one at a time, so calls landing together cannot interleave.
 */
export class ActivityLog {
  #filePath;
  #writes = null;
  #reads = [];
  #loading = null;
  #saving = Promise.resolve();
  #isSaveQueued = false;

  constructor(dir) {
    this.#filePath = path.join(dir, FILE_NAME);
  }

  async list() {
    await this.#load();
    return [...this.#writes, ...this.#reads].sort(newestFirst).map((entry) => structuredClone(entry));
  }

  async get(id) {
    await this.#load();
    const entry = this.#find(id);
    return entry ? structuredClone(entry) : null;
  }

  /**
   * Adds an entry, giving it an id. It is listed at once, and saved in the background:
   * `flush` waits for that.
   */
  async add(entry) {
    await this.#load();
    const added = { id: randomUUID(), ...entry };
    if (added.write) {
      this.#writes.push(added);
      this.#writes.splice(0, this.#writes.length - MAX_WRITES);
      this.#save();
    } else {
      this.#reads.push(added);
      this.#reads.splice(0, this.#reads.length - MAX_READS);
    }
    return structuredClone(added);
  }

  /** Merges `changes` into an entry, resolving with it, or null if it is gone. */
  async update(id, changes) {
    await this.#load();
    const entry = this.#find(id);
    if (!entry) return null;
    Object.assign(entry, changes);
    if (entry.write) this.#save();
    return structuredClone(entry);
  }

  async clear() {
    await this.#load();
    this.#writes = [];
    this.#reads = [];
    await this.#save();
  }

  /** Resolves once everything added so far is on disk. */
  flush() {
    return this.#saving;
  }

  #find(id) {
    return this.#writes.find((entry) => entry.id === id) ?? this.#reads.find((entry) => entry.id === id);
  }

  #load() {
    this.#loading ??= this.#read().then((entries) => {
      this.#writes = entries;
    });
    return this.#loading;
  }

  async #read() {
    try {
      const saved = JSON.parse(await fs.readFile(this.#filePath, 'utf8'));
      const entries = Array.isArray(saved?.entries) ? saved.entries : [];
      return entries.filter((entry) => entry && typeof entry.id === 'string').slice(-MAX_WRITES);
    } catch (error) {
      // A log that cannot be read must not stop AI tools working: start a fresh one.
      if (error.code !== 'ENOENT') console.error(`Could not read ${this.#filePath}:`, error.message);
      return [];
    }
  }

  /**
   * Queues a save of the whole log. A save already waiting to start will pick up this
   * change too, so a burst of calls costs one or two writes, not one each.
   */
  #save() {
    if (this.#isSaveQueued) return this.#saving;
    this.#isSaveQueued = true;
    this.#saving = this.#saving.then(async () => {
      this.#isSaveQueued = false;
      try {
        await this.#write(JSON.stringify({ version: 1, entries: this.#writes }));
      } catch (error) {
        console.error(`Could not save ${this.#filePath}:`, error.message);
      }
    });
    return this.#saving;
  }

  async #write(text) {
    await fs.mkdir(path.dirname(this.#filePath), { recursive: true });
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, text);
    await fs.rename(temporaryPath, this.#filePath);
  }
}
