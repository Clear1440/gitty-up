const PREFIX = 'mono-';

/**
 * A group opened as a mono repo goes by an id of its own, in place of a repository's,
 * so routes and tabs can treat the two alike. The client has the same rules in
 * src/utils/MonoIdHelper.js.
 */
export class MonoIdHelper {
  static fromGroupId(groupId) {
    return `${PREFIX}${groupId}`;
  }

  static isMonoId(id) {
    return id.startsWith(PREFIX);
  }

  static toGroupId(monoId) {
    return monoId.slice(PREFIX.length);
  }
}
