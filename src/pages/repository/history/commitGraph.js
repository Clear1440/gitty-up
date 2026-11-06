/** How many colors the tree cycles through: --color-graph-1 and up in tokens.css. */
export const GRAPH_COLOR_COUNT = 6;

function firstFreeLane(lanes) {
  const index = lanes.findIndex((lane) => !lane);
  return index === -1 ? lanes.length : index;
}

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
      lanes[column] = { hash: commit.hash, color: nextColor() };
    }
    const { color } = lanes[column];
    const segments = [];

    lanes.forEach((lane, index) => {
      if (lane && index !== column) {
        segments.push({ kind: 'through', from: index, to: index, color: lane.color });
      }
    });
    if (!isBranchTip) segments.push({ kind: 'top', from: column, to: column, color });
    lanes[column] = null;

    commit.parents.forEach((parent, parentIndex) => {
      const isFirstParent = parentIndex === 0;
      let target = lanes.findIndex((lane) => lane?.hash === parent);
      if (target === -1) {
        target = isFirstParent ? column : firstFreeLane(lanes);
        lanes[target] = { hash: parent, color: isFirstParent ? color : nextColor() };
      }
      segments.push({
        kind: 'bottom',
        from: column,
        to: target,
        // A branch keeps its color until it joins. A merge shows the incoming branch's.
        color: isFirstParent ? color : lanes[target].color,
      });
    });

    columnCount = Math.max(columnCount, lanes.length, column + 1);
    while (lanes.length > 0 && !lanes.at(-1)) lanes.pop();

    return { column, color, segments };
  });

  return { rows, columnCount };
}
