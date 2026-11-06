/** How many colors the tree cycles through: --color-graph-1 and up in tokens.css. */
export const GRAPH_COLOR_COUNT = 6;

const TRUNK_BRANCH = /^(main|master|trunk|develop)$/;

const MERGE_SUBJECTS = [
  /^Merge (?:remote-tracking )?branch '([^']+)'/,
  /^Merge pull request #\d+ from [^/\s]+\/(\S+)/,
];

function firstFreeLane(lanes) {
  const index = lanes.findIndex((lane) => !lane);
  return index === -1 ? lanes.length : index;
}

/** The branch a commit is the tip of, going by the refs on it. */
function branchAt({ refs = [] }) {
  const ref =
    refs.find(({ type }) => type === 'head') ??
    refs.find(({ type }) => type === 'branch') ??
    refs.find(({ type }) => type === 'remote');
  return ref?.localName ?? ref?.name ?? null;
}

/** What a merge brought in. It may have no ref left, so this is often all that names it. */
function mergedBranch({ subject = '' }) {
  for (const pattern of MERGE_SUBJECTS) {
    const match = pattern.exec(subject);
    if (match) return match[1];
  }
  return null;
}

const isTrunk = (track) => TRUNK_BRANCH.test(track.name);

/**
 * Lays out commits as a tree, one row per commit, ready to draw.
 *
 * Walking from newest to oldest, `lanes` holds which commit each vertical line is
 * waiting to reach. A commit sits on the lane waiting for it, and its parents then
 * take over: the first continues that lane and any others branch off to their own.
 * A parent that a lane is already waiting for joins that lane, so no two lanes ever
 * wait for the same commit.
 *
 * Commits must list children before their parents.
 *
 * Each row has a `column`, a `color`, and `segments` to draw:
 * - `through`: a lane passing straight down the whole row
 * - `top`: the lane arriving at this row's commit
 * - `bottom`: a line leaving this row's commit toward a parent
 *
 * The row and each segment also have a `branch`, its name or null. Git doesn't record
 * which branch a commit was made on, so this is a best guess: a lane's `track` is named
 * by the first ref or merge message found along it, and is shared by every segment on
 * it, which lets a name found further down reach the rows above.
 */
export function layoutCommitGraph(commits) {
  const lanes = [];
  let colorsUsed = 0;
  let columnCount = 0;

  const nextColor = () => {
    colorsUsed += 1;
    return (colorsUsed - 1) % GRAPH_COLOR_COUNT;
  };

  const rows = commits.map((commit) => {
    let column = lanes.findIndex((lane) => lane?.hash === commit.hash);
    const isBranchTip = column === -1;
    if (isBranchTip) {
      column = firstFreeLane(lanes);
      lanes[column] = { hash: commit.hash, color: nextColor(), track: { name: null } };
    }
    const { color, track } = lanes[column];
    track.name ??= branchAt(commit);
    const segments = [];

    lanes.forEach((lane, index) => {
      if (lane && index !== column) {
        const { color: laneColor, track: laneTrack } = lane;
        segments.push({ kind: 'through', from: index, to: index, color: laneColor, track: laneTrack });
      }
    });
    if (!isBranchTip) segments.push({ kind: 'top', from: column, to: column, color, track });
    lanes[column] = null;

    commit.parents.forEach((parent, parentIndex) => {
      const isFirstParent = parentIndex === 0;
      let target = lanes.findIndex((lane) => lane?.hash === parent);
      if (target === -1) {
        target = isFirstParent ? column : firstFreeLane(lanes);
        lanes[target] = {
          hash: parent,
          color: isFirstParent ? color : nextColor(),
          track: isFirstParent ? track : { name: mergedBranch(commit) },
        };
      } else if (isFirstParent && isTrunk(track) && !isTrunk(lanes[target].track)) {
        // A topic branch reached this commit first, but what lies below it is the trunk's.
        lanes[target].track = track;
      }
      segments.push({
        kind: 'bottom',
        from: column,
        to: target,
        // A branch keeps its color until it joins. A merge shows the incoming branch's.
        color: isFirstParent ? color : lanes[target].color,
        track: isFirstParent ? track : lanes[target].track,
      });
    });

    columnCount = Math.max(columnCount, lanes.length, column + 1);
    while (lanes.length > 0 && !lanes.at(-1)) lanes.pop();

    return { column, color, segments, track };
  });

  return {
    rows: rows.map(({ track, segments, ...row }) => ({
      ...row,
      branch: track.name,
      segments: segments.map(({ track: segmentTrack, ...segment }) => ({
        ...segment,
        branch: segmentTrack.name,
      })),
    })),
    columnCount,
  };
}
