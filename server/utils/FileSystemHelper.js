import fs from 'node:fs/promises';
import path from 'node:path';

/** Questions about files and folders on disk. */
export class FileSystemHelper {
  /** Whether anything exists at `target` that this process can reach. */
  static async exists(target) {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  /** Whether a folder is the top of a git working tree, going by its .git entry. */
  static isRepository(folder) {
    return FileSystemHelper.exists(path.join(folder, '.git'));
  }
}
