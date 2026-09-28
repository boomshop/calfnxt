import { postToHost } from './bridge';

/** Map chart CSS width → vizcfg bin count (suite default). */
export function vizBinsFromWidth(
  width: number,
  minBins = 48,
  maxBins = 512,
): number {
  const w = Math.round(width);
  return Math.max(minBins, Math.min(maxBins, w));
}

/** Post `{t:"vizcfg",id,bins}` from an element's current width. */
export function postVizBins(
  vizId: string,
  el: Element,
  minBins = 48,
  maxBins = 512,
): void {
  const width = el.getBoundingClientRect().width;
  postToHost({ t: 'vizcfg', id: vizId, bins: vizBinsFromWidth(width, minBins, maxBins) });
}

/**
 * Observe `el` and re-post viz bins on resize (rAF-coalesced).
 * Returns a disconnect function.
 */
export function observeVizBins(
  el: Element,
  vizId: string,
  minBins = 48,
  maxBins = 512,
): () => void {
  const send = () => postVizBins(vizId, el, minBins, maxBins);
  send();
  let raf = 0;
  const ro = new ResizeObserver(() => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      send();
    });
  });
  ro.observe(el);
  return () => {
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
  };
}
