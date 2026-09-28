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
 *
 * Opacity tiers (fill + stroke): full 1 | rich 0.75 | mostly 0.63 | semi 0.5 |
 * soft 0.37 | faint 0.25 | ghost 0.12 | none 0.
 * (`stroke-medium` = width; opacity uses `stroke-mostly` / `fill-mostly`.)
 */
export const GRAPH_STYLE = {
  /** Soft foreground fill (broadband level — not history-light). */
  audio: 'fill-color fill-soft stroke-none',
  /** Soft foreground fill (detector / band / filtered). */
  detector: 'fill-color fill-soft stroke-none',
  /** Gain-reduction line (solid foreground, thick). */
  gr: 'stroke-color stroke-thick fill-none',
  /** Dashed foreground line (inhibit / hold / search). */
  inhibit: 'fill-none stroke-color stroke-rich stroke-dashed',
  /** Closed fill between input and output envelopes (shaved peaks). */
  cutTips: 'fill-warn fill-rich stroke-none',
  /** Accent line only. */
  lineAccent: 'fill-none stroke-accent',
  /** Warn line only. */
  lineWarn: 'fill-none stroke-warn',
  /** Foreground line only. */
  lineColor: 'fill-none stroke-color',
  /** Soft filled spectrum / response — fill + stroke level gradients. */
  spectrum: 'fill-gradient fill-ghost stroke-gradient',
  /**
   * Bidirectional In/Out diff (Envelope / History): max envelope glows;
   * min mask darkens the shared body so only tips stay lit.
   */
  outerDiff: 'fill-gradient fill-full stroke-none',
  maskDiff: 'fill-background fill-semi stroke-none',
  /** Thin light contour on the processed result (cut above / boost below). */
  gainEdge: 'fill-none stroke-color stroke-thinner stroke-mostly',
  /**
   * Analyzer loudness history — ST = working loudness (color), M = live
   * accent, TP = warn ceiling, RMS = faint legacy level.
   */
  loudSt: 'fill-none stroke-color stroke-thick',
  loudMom: 'fill-none stroke-accent stroke-medium',
  loudTp: 'fill-none stroke-warn stroke-thin',
  loudRms: 'fill-none stroke-color stroke-thinnest stroke-semi',
} as const;

/** @deprecated Use GRAPH_STYLE — kept as alias for History call sites. */
export const HISTORY_STYLE = {
  /** History signal fill (solid for now; `fill-grad-light` kept for later). */
  audio: 'fill-color fill-soft stroke-none',
  detector: GRAPH_STYLE.detector,
  /** History GR — medium (suite default), no width utility. */
  gr: 'stroke-color fill-none',
  inhibit: GRAPH_STYLE.inhibit,
  loudMom: GRAPH_STYLE.loudMom,
  loudSt: GRAPH_STYLE.loudSt,
  loudTp: GRAPH_STYLE.loudTp,
  loudRms: GRAPH_STYLE.loudRms,
} as const;
