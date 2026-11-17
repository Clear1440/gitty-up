import { useEffect, useMemo, useState } from 'react';
import { CssTokenHelper } from '../../styles/CssTokenHelper.js';

/** The branch name a row shows, or null for a row with no branch to show. */
export function branchLabelOf(repository) {
  const summary = repository.summary;
  if (!repository.path || !repository.available || !summary) return null;
  return summary.detached ? 'detached HEAD' : summary.branch;
}

let canvas = null;

function measure(text, font) {
  canvas ??= document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = font;
  return context.measureText(text).width;
}

/**
 * How wide the branch column of the repository list must be for its widest branch name,
 * so the counts after it sit right beside the branches and still line up row to row.
 * Measured again once the web font has loaded, as the fallback font is a different width.
 */
export function useBranchColumnWidth(repositories, condensed) {
  const [fontsLoaded, setFontsLoaded] = useState(0);

  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && setFontsLoaded((count) => count + 1));
    return () => {
      live = false;
    };
  }, []);

  return useMemo(() => {
    const labels = (repositories ?? []).map(branchLabelOf).filter(Boolean);
    if (labels.length === 0) return null;
    const size = CssTokenHelper.readPixels(condensed ? '--font-size-xs' : '--font-size-sm');
    const font = `${CssTokenHelper.read('--font-weight-medium')} ${size}px ${CssTokenHelper.read('--font-sans')}`;
    const widest = Math.max(...labels.map((label) => measure(label, font)));
    // The branch icon and the space after it, and a pixel or two for rounding.
    return Math.ceil(widest + size * 1.4 + 2);
    // fontsLoaded only asks for a new measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositories, condensed, fontsLoaded]);
}
