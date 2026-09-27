import { useCallback, useEffect, useId, useRef } from 'react';
import { themeColors$ } from '../theme/themeColors';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** CSS custom property on the chart SVG; value is `url(#…)`. */
export const GRAPH_GRADIENT_VAR = '--graph-gradient';
/** @deprecated Prefer GRAPH_GRADIENT_VAR — still dual-written for legacy SCSS. */
export const CHART_LEVEL_STROKE_VAR = '--chart-level-stroke';

export type ChartGradientPaint = 'stroke' | 'fill' | 'both';

export type UseChartGradientOptions = {
  svg: SVGSVGElement | null | undefined;
  /** Skip install (e.g. mini charts). Default true when svg is set. */
  enabled?: boolean;
  /** CSS variable name on the SVG. */
  cssVar?: string;
  /** Elements that receive the gradient paint. */
  targets?: ReadonlyArray<SVGElement | null | undefined>;
  /** Apply gradient as stroke, fill, or both. */
  paint?: ChartGradientPaint;
  /**
   * Optional stop opacities: `cut` = floor / bottom stop, `boost` = ceiling /
   * top stop. Defaults to fully opaque (1, 1).
   */
  opacities?: { cut: number; boost: number };
  /** Height for userSpaceOnUse y1/y2. Defaults to svg clientHeight. */
  getHeight?: (svg: SVGSVGElement) => number;
  /** Swap blue/red vertically (top = blue, bottom = red). */
  reverse?: boolean;
  /** Stop offsets. Default stretches accent through the body. */
  stopOffsets?: { cut: string; boost: string };
};

function applyPaint(
  el: SVGElement,
  paint: ChartGradientPaint,
  value: string,
): void {
  if (paint === 'stroke' || paint === 'both')
    el.style.stroke = value;
  if (paint === 'fill' || paint === 'both')
    el.style.fill = value;
}

function clearPaint(el: SVGElement, paint: ChartGradientPaint): void {
  if (paint === 'stroke' || paint === 'both')
    el.style.removeProperty('stroke');
  if (paint === 'fill' || paint === 'both')
    el.style.removeProperty('fill');
}

/**
 * Install a vertical accent↔warn level gradient on an AUX chart SVG and expose
 * it as `--graph-gradient` (also mirrors `--chart-level-stroke` for legacy SCSS).
 * Optional `targets` get an inline paint so AUX path redraws cannot drop it.
 * Utility classes `.stroke-gradient` / `.fill-gradient` read the CSS var.
 * Returns `reassert` for after AUX rewrites paths.
 */
export function useChartGradient(
  options: UseChartGradientOptions,
): () => void {
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
  } = options;
  const gradId = `chart-level-grad-${useId().replace(/:/g, '')}`;
  const applyRef = useRef<() => void>(() => {});
  const cutOpacity = opacities?.cut ?? 1;
  const boostOpacity = opacities?.boost ?? 1;

  useEffect(() => {
    if (!svg || !enabled) return;

    let defs = svg.querySelector(':scope > defs.chart-level-defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      defs.classList.add('chart-level-defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    // `:scope >` — a bare `#id` selector can hit another SVG in the same
    // document (two FrequencyRange charts). Cleanup would then remove the
    // other chart's gradient and both baselines fall back to solid accent.
    let grad = defs.querySelector(
      `:scope > #${CSS.escape(gradId)}`,
    ) as SVGLinearGradientElement | null;
    let stopCut: SVGStopElement;
    let stopBoost: SVGStopElement;
    if (!grad) {
      grad = document.createElementNS(
        SVG_NS,
        'linearGradient',
      ) as SVGLinearGradientElement;
      grad.id = gradId;
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', '0');
      grad.setAttribute('x2', '0');
      stopCut = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
      stopCut.setAttribute('offset', stopOffsets?.cut ?? '20%');
      stopBoost = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
      stopBoost.setAttribute('offset', stopOffsets?.boost ?? '800%');
      grad.appendChild(stopCut);
      grad.appendChild(stopBoost);
      defs.appendChild(grad);
    } else {
      stopCut = grad.querySelectorAll('stop')[0] as SVGStopElement;
      stopBoost = grad.querySelectorAll('stop')[1] as SVGStopElement;
    }

    const paintValue = `url(#${gradId})`;
    svg.style.setProperty(cssVar, paintValue);
    // Keep stroke-gradient / fill-gradient utilities and legacy SCSS in sync.
    if (cssVar !== GRAPH_GRADIENT_VAR)
      svg.style.setProperty(GRAPH_GRADIENT_VAR, paintValue);
    if (cssVar !== CHART_LEVEL_STROKE_VAR)
      svg.style.setProperty(CHART_LEVEL_STROKE_VAR, paintValue);

    const syncStops = () => {
      const c = themeColors$.value;
      stopCut.setAttribute('offset', stopOffsets?.cut ?? '20%');
      stopBoost.setAttribute('offset', stopOffsets?.boost ?? '800%');
      stopCut.setAttribute('stop-color', c.accent);
      stopCut.setAttribute('stop-opacity', String(cutOpacity));
      stopBoost.setAttribute('stop-color', c.warn);
      stopBoost.setAttribute('stop-opacity', String(boostOpacity));
    };

    const apply = () => {
      for (const el of targets ?? []) {
        if (!el) continue;
        applyPaint(el, paint, `var(${cssVar})`);
      }
    };
    applyRef.current = apply;

    const syncGeom = () => {
      const h = Math.max(
        1,
        getHeight?.(svg) || svg.clientHeight || 1,
      );
      if (reverse) {
        grad!.setAttribute('y1', '0');
        grad!.setAttribute('y2', String(h));
      } else {
        grad!.setAttribute('y1', String(h));
        grad!.setAttribute('y2', '0');
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
      svg.style.removeProperty(cssVar);
      if (cssVar !== GRAPH_GRADIENT_VAR)
        svg.style.removeProperty(GRAPH_GRADIENT_VAR);
      if (cssVar !== CHART_LEVEL_STROKE_VAR)
        svg.style.removeProperty(CHART_LEVEL_STROKE_VAR);
      grad?.remove();
      if (defs && !defs.childElementCount) defs.remove();
    };
  }, [
    svg,
    enabled,
    cssVar,
    gradId,
    getHeight,
    targets,
    paint,
    reverse,
    stopOffsets,
    cutOpacity,
    boostOpacity,
  ]);

  return useCallback(() => applyRef.current(), []);
}
