import { useCallback, useEffect, useId, useRef } from 'react';
import { themeColors$ } from '../theme/themeColors';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Primary level gradient on the chart SVG (`url(#…)`).
 * Default (reverse: false): top warn (hot) → bottom accent (cold).
 */
export const GRAPH_GRADIENT_VAR = '--graph-gradient';
/**
 * Inverse level gradient: top accent → bottom warn.
 * Always installed alongside `--graph-gradient`.
 */
export const GRAPH_GRADIENT_INV_VAR = '--graph-gradient-inv';
/**
 * Same as `--graph-gradient`, but stop colors mixed toward white (pastel fill).
 * Does not replace the vivid gradients — use `.fill-grad-light` / `.stroke-grad-light`.
 */
export const GRAPH_GRAD_LIGHT_VAR = '--graph-grad-light';
/** Inverse of `--graph-grad-light`. */
export const GRAPH_GRAD_LIGHT_INV_VAR = '--graph-grad-light-inv';
/** @deprecated Prefer GRAPH_GRADIENT_VAR — still dual-written for legacy SCSS. */
export const CHART_LEVEL_STROKE_VAR = '--chart-level-stroke';
/** @deprecated Prefer GRAPH_GRADIENT_INV_VAR. */
export const CHART_LEVEL_STROKE_INV_VAR = '--chart-level-stroke-inv';

/** Mix amount toward white for light gradients (0…1). */
export const GRAPH_GRAD_LIGHT_MIX = 0.6;

export type ChartGradientPaint = 'stroke' | 'fill' | 'both';

export type UseChartGradientOptions = {
  svg: SVGSVGElement | null | undefined;
  /** Skip install (e.g. mini charts). Default true when svg is set. */
  enabled?: boolean;
  /**
   * CSS variable targets receive as inline paint. Default `--graph-gradient`
   * (after `reverse` swap). Prefer leaving default and using utility classes.
   */
  cssVar?: string;
  /** Elements that receive the gradient paint. */
  targets?: ReadonlyArray<SVGElement | null | undefined>;
  /** Apply gradient as stroke, fill, or both. */
  paint?: ChartGradientPaint;
  /**
   * Optional stop opacities: `cut` = cold / accent end, `boost` = hot / warn
   * end. Defaults to fully opaque (1, 1).
   */
  opacities?: { cut: number; boost: number };
  /** Height for userSpaceOnUse y1/y2. Defaults to svg clientHeight. */
  getHeight?: (svg: SVGSVGElement) => number;
  /**
   * When true, swap primary ↔ inv CSS vars so `--graph-gradient` is
   * accent-top / warn-bottom (legacy opt-in).
   */
  reverse?: boolean;
  /**
   * Stop offsets along top→bottom. `cut` = first stop (top), `boost` = second
   * (bottom). Default is a normal full-height span (`0%`…`100%`).
   */
  stopOffsets?: { cut: string; boost: string };
  /**
   * White mix for light gradients (0…1). Default {@link GRAPH_GRAD_LIGHT_MIX}.
   */
  lightMix?: number;
};

function applyPaint(
  el: SVGElement,
  paint: ChartGradientPaint,
  value: string,
): void {
  if (paint === 'stroke' || paint === 'both') el.style.stroke = value;
  if (paint === 'fill' || paint === 'both') el.style.fill = value;
}

function clearPaint(el: SVGElement, paint: ChartGradientPaint): void {
  if (paint === 'stroke' || paint === 'both') el.style.removeProperty('stroke');
  if (paint === 'fill' || paint === 'both') el.style.removeProperty('fill');
}

function ensureLinearGradient(
  defs: Element,
  id: string,
  topOff: string,
  botOff: string,
): {
  grad: SVGLinearGradientElement;
  stopTop: SVGStopElement;
  stopBot: SVGStopElement;
} {
  let grad = defs.querySelector(
    `:scope > #${CSS.escape(id)}`,
  ) as SVGLinearGradientElement | null;
  let stopTop: SVGStopElement;
  let stopBot: SVGStopElement;
  if (!grad) {
    grad = document.createElementNS(
      SVG_NS,
      'linearGradient',
    ) as SVGLinearGradientElement;
    grad.id = id;
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', '0');
    grad.setAttribute('x2', '0');
    stopTop = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
    stopTop.setAttribute('offset', topOff);
    stopBot = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
    stopBot.setAttribute('offset', botOff);
    grad.appendChild(stopTop);
    grad.appendChild(stopBot);
    defs.appendChild(grad);
  } else {
    stopTop = grad.querySelectorAll('stop')[0] as SVGStopElement;
    stopBot = grad.querySelectorAll('stop')[1] as SVGStopElement;
  }
  return { grad, stopTop, stopBot };
}

/** Mix `#rrggbb` toward white by `t` (0 = keep, 1 = white). */
export function mixHexTowardWhite(hex: string, t: number): string {
  const m = hex.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const w = Math.max(0, Math.min(1, t));
  const mix = (c: number) => Math.round(c + (255 - c) * w);
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function resolvePaintVar(cssVar: string): string {
  if (
    cssVar === GRAPH_GRADIENT_INV_VAR ||
    cssVar === CHART_LEVEL_STROKE_INV_VAR ||
    cssVar === GRAPH_GRAD_LIGHT_INV_VAR
  )
    return cssVar;
  if (
    cssVar === GRAPH_GRADIENT_VAR ||
    cssVar === CHART_LEVEL_STROKE_VAR ||
    cssVar === GRAPH_GRAD_LIGHT_VAR
  )
    return cssVar;
  return GRAPH_GRADIENT_VAR;
}

/**
 * Install vertical level gradients on an AUX chart SVG:
 *   `--graph-gradient` / `-inv`       vivid warn↔accent
 *   `--graph-grad-light` / `-inv`     same, stops mixed toward white
 * (`reverse: true` swaps which URL is bound to which var.)
 * Also mirrors `--chart-level-stroke` / `--chart-level-stroke-inv`.
 * Optional `targets` get inline paint. Returns `reassert` after AUX redraws.
 */
export function useChartGradient(options: UseChartGradientOptions): () => void {
  const {
    svg,
    enabled = true,
    cssVar = GRAPH_GRADIENT_VAR,
    targets,
    paint = 'stroke',
    opacities,
    getHeight,
    reverse = false,
    stopOffsets,
    lightMix = GRAPH_GRAD_LIGHT_MIX,
  } = options;
  const idBase = `chart-level-grad-${useId().replace(/:/g, '')}`;
  const hotId = `${idBase}-hot`;
  const coldId = `${idBase}-inv`;
  const hotLightId = `${idBase}-hot-light`;
  const coldLightId = `${idBase}-inv-light`;
  const applyRef = useRef<() => void>(() => {});
  const cutOpacity = opacities?.cut ?? 1;
  const boostOpacity = opacities?.boost ?? 1;
  const topOff = stopOffsets?.cut ?? '0%';
  const botOff = stopOffsets?.boost ?? '100%';

  useEffect(() => {
    if (!svg || !enabled) return;

    let defs = svg.querySelector(':scope > defs.chart-level-defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      defs.classList.add('chart-level-defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    const hot = ensureLinearGradient(defs, hotId, topOff, botOff);
    const inv = ensureLinearGradient(defs, coldId, topOff, botOff);
    const hotLight = ensureLinearGradient(defs, hotLightId, topOff, botOff);
    const invLight = ensureLinearGradient(defs, coldLightId, topOff, botOff);

    const hotUrl = `url(#${hotId})`;
    const invUrl = `url(#${coldId})`;
    const hotLightUrl = `url(#${hotLightId})`;
    const invLightUrl = `url(#${coldLightId})`;
    const primaryUrl = reverse ? invUrl : hotUrl;
    const inverseUrl = reverse ? hotUrl : invUrl;
    const primaryLightUrl = reverse ? invLightUrl : hotLightUrl;
    const inverseLightUrl = reverse ? hotLightUrl : invLightUrl;

    const bindVars = () => {
      svg.style.setProperty(GRAPH_GRADIENT_VAR, primaryUrl);
      svg.style.setProperty(GRAPH_GRADIENT_INV_VAR, inverseUrl);
      svg.style.setProperty(GRAPH_GRAD_LIGHT_VAR, primaryLightUrl);
      svg.style.setProperty(GRAPH_GRAD_LIGHT_INV_VAR, inverseLightUrl);
      svg.style.setProperty(CHART_LEVEL_STROKE_VAR, primaryUrl);
      svg.style.setProperty(CHART_LEVEL_STROKE_INV_VAR, inverseUrl);
      if (
        cssVar !== GRAPH_GRADIENT_VAR &&
        cssVar !== GRAPH_GRADIENT_INV_VAR &&
        cssVar !== GRAPH_GRAD_LIGHT_VAR &&
        cssVar !== GRAPH_GRAD_LIGHT_INV_VAR &&
        cssVar !== CHART_LEVEL_STROKE_VAR &&
        cssVar !== CHART_LEVEL_STROKE_INV_VAR
      ) {
        svg.style.setProperty(cssVar, primaryUrl);
      }
    };
    bindVars();

    const paintStop = (
      stop: SVGStopElement,
      offset: string,
      color: string,
      opacity: number,
    ) => {
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      stop.setAttribute('stop-opacity', String(opacity));
    };

    const syncStops = () => {
      const c = themeColors$.value;
      const warnL = mixHexTowardWhite(c.warn, lightMix);
      const accentL = mixHexTowardWhite(c.accent, lightMix);

      paintStop(hot.stopTop, topOff, c.warn, boostOpacity);
      paintStop(hot.stopBot, botOff, c.accent, cutOpacity);
      paintStop(inv.stopTop, topOff, c.accent, cutOpacity);
      paintStop(inv.stopBot, botOff, c.warn, boostOpacity);

      paintStop(hotLight.stopTop, topOff, warnL, boostOpacity);
      paintStop(hotLight.stopBot, botOff, accentL, cutOpacity);
      paintStop(invLight.stopTop, topOff, accentL, cutOpacity);
      paintStop(invLight.stopBot, botOff, warnL, boostOpacity);
    };

    const apply = () => {
      const paintVar = resolvePaintVar(cssVar);
      for (const el of targets ?? []) {
        if (!el) continue;
        applyPaint(el, paint, `var(${paintVar})`);
      }
    };
    applyRef.current = apply;

    const syncGeom = () => {
      const h = Math.max(1, getHeight?.(svg) || svg.clientHeight || 1);
      for (const g of [hot.grad, inv.grad, hotLight.grad, invLight.grad]) {
        g.setAttribute('y1', '0');
        g.setAttribute('y2', String(h));
      }
    };

    syncStops();
    syncGeom();
    apply();

    const unsubTheme = themeColors$.subscribe(() => {
      syncStops();
      apply();
    });

    const ro = new ResizeObserver(syncGeom);
    ro.observe(svg);
    return () => {
      unsubTheme();
      ro.disconnect();
      applyRef.current = () => {};
      for (const el of targets ?? []) {
        if (el) clearPaint(el, paint);
      }
      svg.style.removeProperty(GRAPH_GRADIENT_VAR);
      svg.style.removeProperty(GRAPH_GRADIENT_INV_VAR);
      svg.style.removeProperty(GRAPH_GRAD_LIGHT_VAR);
      svg.style.removeProperty(GRAPH_GRAD_LIGHT_INV_VAR);
      svg.style.removeProperty(CHART_LEVEL_STROKE_VAR);
      svg.style.removeProperty(CHART_LEVEL_STROKE_INV_VAR);
      if (
        cssVar !== GRAPH_GRADIENT_VAR &&
        cssVar !== GRAPH_GRADIENT_INV_VAR &&
        cssVar !== GRAPH_GRAD_LIGHT_VAR &&
        cssVar !== GRAPH_GRAD_LIGHT_INV_VAR &&
        cssVar !== CHART_LEVEL_STROKE_VAR &&
        cssVar !== CHART_LEVEL_STROKE_INV_VAR
      ) {
        svg.style.removeProperty(cssVar);
      }
      hot.grad.remove();
      inv.grad.remove();
      hotLight.grad.remove();
      invLight.grad.remove();
      if (defs && !defs.childElementCount) defs.remove();
    };
  }, [
    svg,
    enabled,
    cssVar,
    hotId,
    coldId,
    hotLightId,
    coldLightId,
    getHeight,
    targets,
    paint,
    reverse,
    topOff,
    botOff,
    cutOpacity,
    boostOpacity,
    lightMix,
  ]);

  return useCallback(() => applyRef.current(), []);
}
