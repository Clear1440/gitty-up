/**
 * File and folder paths. Paths inside a repository, as git gives them, always use `/`.
 * Folders on disk use whichever separator their operating system writes.
 */
export class PathHelper {
  /** A file's extension with its dot, such as ".log", or null when it has none. */
  static extensionOf(filePath) {
    const name = filePath.slice(filePath.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot) : null;
  }

  /** The folder a repository path is in, or null for a file at the top. */
  static folderOf(filePath) {
    const slash = filePath.lastIndexOf('/');
    return slash === -1 ? null : filePath.slice(0, slash);
  }

  /** The separator a folder on disk is written with: `\` on Windows, `/` elsewhere. */
  static separatorOf(folder) {
    return folder.includes('\\') ? '\\' : '/';
  }

  /** A folder without any separators at its end. */
  static trimEnd(folder) {
    return folder.replace(/[\\/]+$/, '');
  }

  /** A repository path made into a full path inside `folder`, as its system writes it. */
  static join(folder, filePath) {
    const separator = PathHelper.separatorOf(folder);
    return `${PathHelper.trimEnd(folder)}${separator}${filePath.split('/').join(separator)}`;
  }

  /** Whether two folders are the same, loosely, as Windows ignores case and slash style. */
  static isSame(a, b) {
    const normalize = (folder) => PathHelper.trimEnd((folder ?? '').replace(/\\/g, '/')).toLowerCase();
    return normalize(a) === normalize(b);
  }
}
