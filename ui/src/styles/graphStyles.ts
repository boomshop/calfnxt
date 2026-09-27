/**
 * Shared graph paint recipes (utility class strings from `graph.scss`).
 * Append via `addGraphClasses(el, GRAPH_STYLE.…)` or put in `className`.
 */

/** Apply space-separated utility / semantic classes onto an SVG node. */
export function addGraphClasses(
  el: Element | null | undefined,
  ...classNames: Array<string | undefined | false | null>
): void {
  if (!el) return;
  const list: string[] = [];
  for (const c of classNames) {
    if (!c) continue;
    for (const part of c.split(/\s+/)) {
      if (part) list.push(part);
    }
  }
  if (list.length) el.classList.add(...list);
}

/**
 * Common signal looks. Stroke widths lean on `.aux-graph` defaults (medium =
 * 1.5px) unless a width utility is included.
 */
export const GRAPH_STYLE = {
  /** Accent filled area + thin outline (input / full-range). */
  audio: 'fill-accent fill-faint stroke-accent stroke-thinner stroke-semi',
  /** Foreground filled area + thin outline (detector / band / filtered). */
  detector: 'fill-color fill-faint stroke-color stroke-thinner stroke-semi',
  /** Gain-reduction / level line with vertical gradient. */
  gr: 'fill-none stroke-gradient',
  /** Dashed foreground line (inhibit / hold / search). */
  inhibit: 'fill-none stroke-color stroke-semi stroke-dashed',
  /** Accent line only. */
  lineAccent: 'fill-none stroke-accent',
  /** Warn line only. */
  lineWarn: 'fill-none stroke-warn',
  /** Foreground line only. */
  lineColor: 'fill-none stroke-color',
  /** Soft filled spectrum / response under a gradient stroke. */
  spectrum: 'fill-color fill-ghost stroke-gradient',
  /** Analyzer loudness channels. */
  loudMom: 'fill-none stroke-accent',
  loudSt: 'fill-none stroke-color',
  loudTp: 'fill-none stroke-warn',
  loudRms: 'fill-none stroke-color stroke-faint',
} as const;

/** @deprecated Use GRAPH_STYLE — kept as alias for History call sites. */
export const HISTORY_STYLE = {
  audio: GRAPH_STYLE.audio,
  detector: GRAPH_STYLE.detector,
  gr: GRAPH_STYLE.gr,
  inhibit: GRAPH_STYLE.inhibit,
  loudMom: GRAPH_STYLE.loudMom,
  loudSt: GRAPH_STYLE.loudSt,
  loudTp: GRAPH_STYLE.loudTp,
  loudRms: GRAPH_STYLE.loudRms,
} as const;
