import { postToHost } from './bridge';

export function vizBinsFromWidth(
  width: number,
  minBins = 48,
  maxBins = 512,
): number {
  return Math.max(minBins, Math.min(maxBins, Math.round(width)));
}

export function postVizBins(
  vizId: string,
  el: Element,
  minBins = 48,
  maxBins = 512,
): void {
  postToHost({
    t: 'vizcfg',
    id: vizId,
    bins: vizBinsFromWidth(el.getBoundingClientRect().width, minBins, maxBins),
  });
}

/** Observe width → vizcfg bins (rAF-coalesced). Returns disconnect. */
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
