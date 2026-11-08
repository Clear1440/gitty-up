import fs from 'node:fs/promises';
import path from 'node:path';

const FILE_NAME = 'settings.json';

const DEFAULTS = {
  /** Where repositories.json lives. Null keeps it in the home folder, next to this file. */
  dataDir: null,
  appearance: { scheme: 'default', mode: 'dark' },
};

/**
 * Persists the app's preferences as a JSON file in the home folder (~/.gitty-up, or
 * GITTY_UP_DATA_DIR). It always stays there, even when the data moves elsewhere,
 * because it is what records where the data went.
 */
export class SettingsStore {
  #homeDir;
  #filePath;
  #data = null;

  constructor(homeDir) {
    this.#homeDir = homeDir;
    this.#filePath = path.join(homeDir, FILE_NAME);
  }

  /** The folder the data lives in when no other has been chosen. */
  get defaultDataDir() {
    return this.#homeDir;
  }

  async get() {
    this.#data ??= await this.#load();
    return structuredClone(this.#data);
  }

  /** The folder repositories.json is read from and written to. */
  async dataDir() {
    return (await this.get()).dataDir ?? this.#homeDir;
  }

  /** Saves the given settings, keeping the rest as they are. */
  async update(changes) {
    const data = { ...(await this.get()), ...changes };
    await fs.mkdir(this.#homeDir, { recursive: true });
    // Write then rename, so a crash can never leave a half-written file.
    const temporaryPath = `${this.#filePath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2));
    await fs.rename(temporaryPath, this.#filePath);
    this.#data = data;
    return structuredClone(data);
  }

  async #load() {
    try {
      const saved = JSON.parse(await fs.readFile(this.#filePath, 'utf8'));
      return {
        ...DEFAULTS,
        ...saved,
        appearance: { ...DEFAULTS.appearance, ...saved.appearance },
      };
    } catch (error) {
      if (error.code === 'ENOENT') return structuredClone(DEFAULTS);
      throw error;
    }
  }
}
