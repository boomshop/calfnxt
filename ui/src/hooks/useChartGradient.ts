import { useCallback, useEffect, useId, useRef } from 'react';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Vertical level paint: bottom/low = blue, top/high = red (EQ response match). */
export const CHART_LEVEL_CUT = '#0066ff';
export const CHART_LEVEL_BOOST = '#ff0066';

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
 * Install a vertical blue→red level gradient on an AUX chart SVG and paint
 * optional targets. Returns `reassert` for after AUX rewrites paths.
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
    if (!grad) {
      grad = document.createElementNS(
        SVG_NS,
        'linearGradient',
      ) as SVGLinearGradientElement;
      grad.id = gradId;
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', '0');
      grad.setAttribute('x2', '0');
      // Same stop layout as EQChart (stretched mid transition).
      const stopCut = document.createElementNS(SVG_NS, 'stop');
      stopCut.setAttribute('offset', '20%');
      stopCut.setAttribute('stop-color', CHART_LEVEL_CUT);
      const stopBoost = document.createElementNS(SVG_NS, 'stop');
      stopBoost.setAttribute('offset', '800%');
      stopBoost.setAttribute('stop-color', CHART_LEVEL_BOOST);
      grad.appendChild(stopCut);
      grad.appendChild(stopBoost);
      defs.appendChild(grad);
    }

    const paintValue = `url(#${gradId})`;
    svg.style.setProperty(cssVar, paintValue);

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
      // Default: bottom = cut/low (blue), top = boost/high (red).
      if (reverse) {
        grad!.setAttribute('y1', '0');
        grad!.setAttribute('y2', String(h));
      } else {
        grad!.setAttribute('y1', String(h));
        grad!.setAttribute('y2', '0');
      }
    };
    syncGeom();
    apply();

    const ro = new ResizeObserver(syncGeom);
    ro.observe(svg);
    return () => {
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
