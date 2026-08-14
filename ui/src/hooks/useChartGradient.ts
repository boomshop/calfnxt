import { useCallback, useEffect, useId, useRef } from 'react';
import { themeColors$ } from '../theme/themeColors';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** CSS custom property set on the chart SVG; value is `url(#…)`. */
export const CHART_LEVEL_STROKE_VAR = '--chart-level-stroke';

export type UseChartGradientOptions = {
  svg: SVGSVGElement | null | undefined;
  /** Skip install (e.g. mini charts). Default true when svg is set. */
  enabled?: boolean;
  /** CSS variable name on the SVG. */
  cssVar?: string;
  /** Elements that receive the gradient paint. */
  targets?: ReadonlyArray<SVGElement | null | undefined>;
  /** Apply gradient as stroke (EQ baseline) or fill (filled graphs). */
  paint?: 'stroke' | 'fill';
  /** Height for userSpaceOnUse y1/y2. Defaults to svg clientHeight. */
  getHeight?: (svg: SVGSVGElement) => number;
  /** Swap blue/red vertically (top = blue, bottom = red). */
  reverse?: boolean;
};

/**
 * Install a vertical accent→warn level gradient on an AUX chart SVG and paint
 * optional targets. Stops track `themeColors$` (day/night + accent pair).
 * Returns `reassert` for after AUX rewrites paths.
 */
export function useChartGradient(
  options: UseChartGradientOptions,
): () => void {
  const {
    svg,
    enabled = true,
    cssVar = CHART_LEVEL_STROKE_VAR,
    targets,
    paint = 'stroke',
    getHeight,
    reverse = false,
  } = options;
  const gradId = `chart-level-grad-${useId().replace(/:/g, '')}`;
  const applyRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!svg || !enabled) return;

    let defs = svg.querySelector(':scope > defs.chart-level-defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      defs.classList.add('chart-level-defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    let grad = defs.querySelector(
      `#${CSS.escape(gradId)}`,
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
      stopCut.setAttribute('offset', '20%');
      stopBoost = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
      stopBoost.setAttribute('offset', '800%');
      grad.appendChild(stopCut);
      grad.appendChild(stopBoost);
      defs.appendChild(grad);
    } else {
      stopCut = grad.querySelectorAll('stop')[0] as SVGStopElement;
      stopBoost = grad.querySelectorAll('stop')[1] as SVGStopElement;
    }

    const paintValue = `url(#${gradId})`;
    svg.style.setProperty(cssVar, paintValue);

    const syncStops = () => {
      const c = themeColors$.value;
      stopCut.setAttribute('stop-color', c.accent);
      stopBoost.setAttribute('stop-color', c.warn);
    };

    const apply = () => {
      for (const el of targets ?? []) {
        if (!el) continue;
        el.style[paint] = `var(${cssVar})`;
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
        if (el) el.style.removeProperty(paint);
      }
      svg.style.removeProperty(cssVar);
      grad?.remove();
      if (defs && !defs.childElementCount) defs.remove();
    };
  }, [svg, enabled, cssVar, gradId, getHeight, targets, paint, reverse]);

  return useCallback(() => applyRef.current(), []);
}
