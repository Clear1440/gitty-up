import { TextHelper } from '../../utils/TextHelper.js';

/** Questions about a repository's tags, as useTags returns them. */
export class TagHelper {
  /** The tag of exactly this name, or undefined. */
  static find(tags, name) {
    return tags?.find((tag) => tag.name === name);
  }

  /** Whether a tag of exactly this name exists. Tag names are case sensitive. */
  static exists(tags, name) {
    return Boolean(TagHelper.find(tags, name));
  }

  /** The tags whose name contains what was typed in the sidebar's filter. */
  static filter(tags, filter) {
    return tags.filter((tag) => TextHelper.includesIgnoringCase(tag.name, filter));
  }

  /** A line saying what a tag is, for a tooltip. */
  static describe(tag) {
    const kind = tag.annotated ? 'Annotated tag' : 'Tag';
    return `${kind} on ${tag.commit}: ${tag.subject}`;
  }
}
