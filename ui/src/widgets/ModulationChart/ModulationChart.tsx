import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FrequencyResponse as AuxFrequencyResponse } from '@deutschesoft/aux-widgets/src/widgets/frequencyresponse.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { postToHost } from '../../bridge';
import './ModulationChart.scss';

type AuxFrInstance = InstanceType<typeof AuxFrequencyResponse> & {
  addGraph: (opts: Record<string, unknown>) => AuxGraph;
  element?: Element | null;
  isDestructed?: () => boolean;
};
type AuxGraph = {
  set: (key: string, value: unknown) => void;
  element?: Element | null;
};

const FrWidget = componentFromWidget(AuxFrequencyResponse);

const F_MIN = 20;
const F_MAX = 20000;
/** Default Y like Calf phaser line-graph (wide notches / dry+wet peaks). */
export const MOD_DB_MIN_DEFAULT = -36;
export const MOD_DB_MAX_DEFAULT = 24;
export const MOD_VIZ_ID = 'mod';
/** Match DSP / web_editor response cap. */
const MAX_BINS = 512;

function parseResponse(raw: number[]): { bins: number; L: Float32Array; R: Float32Array } {
  const bins = Math.max(1, Math.min(MAX_BINS, Math.round(raw[0] ?? 0)));
  const L = new Float32Array(bins);
  const R = new Float32Array(bins);
  for (let i = 0; i < bins; ++i) {
    L[i] = raw[1 + i] ?? MOD_DB_MIN_DEFAULT;
    R[i] = raw[1 + bins + i] ?? MOD_DB_MIN_DEFAULT;
  }
  return { bins, L, R };
}

function seriesDots(
  data: Float32Array,
  bins: number,
  dbMin: number,
  dbMax: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < bins; ++i) {
    const t = (i + 0.5) / bins;
    const hz = F_MIN * Math.pow(F_MAX / F_MIN, t);
    const db = data[i] ?? dbMin;
    pts.push({
      x: hz,
      y: Math.min(dbMax, Math.max(dbMin, db)),
    });
  }
  return pts;
}

export interface ModulationChartProps {
  /** Viz payload [bins, L×N, R×N] in dB. */
  data$: DynamicValue<number[]>;
  vizId?: string;
  /** Y axis in dB (Phaser/Flanger/Chorus share this widget with different spans). */
  dbMin?: number;
  dbMax?: number;
  className?: string;
}

/**
 * L/R frequency-response chart for modulation FX (Phaser, Flanger, Chorus).
 * AUX FrequencyResponse + log frequency axis; curves from DSP viz kind "response".
 *
 * Uses polyline (`L`) rather than H2: high-feedback phaser peaks are needle-thin;
 * horizontal smoothing + fake midpoint densify made those look broken.
 * Real EqualizerGraph oversampling needs a continuous |H|(f) — we densify in DSP
 * instead (multi-sample per bin).
 */
export function ModulationChart(props: ModulationChartProps) {
  const {
    data$,
    vizId = MOD_VIZ_ID,
    dbMin = MOD_DB_MIN_DEFAULT,
    dbMax = MOD_DB_MAX_DEFAULT,
    className,
  } = props;

  const chartRef = useRef<AuxFrInstance | null>(null);
  const graphsRef = useRef<AuxGraph[]>([]);
  const dataRef = useRef<number[]>([]);
  const binsRef = useRef(128);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const [bins, setBins] = useState(128);
  binsRef.current = bins;

  const applyCurves = useCallback(() => {
    const chart = chartRef.current;
    const graphs = graphsRef.current;
    if (!chart || chart.isDestructed?.() || graphs.length < 2)
      return;
    const payload = parseResponse(dataRef.current);
    const n = Math.max(1, payload.bins || binsRef.current);
    graphs[0]?.set('dots', seriesDots(payload.L, n, dbMin, dbMax));
    graphs[1]?.set('dots', seriesDots(payload.R, n, dbMin, dbMax));
  }, [dbMin, dbMax]);

  const sendVizBins = useCallback(
    (el: Element) => {
      const width = Math.round(el.getBoundingClientRect().width);
      const next = Math.max(32, Math.min(MAX_BINS, width));
      if (next !== binsRef.current)
        setBins(next);
      postToHost({ t: 'vizcfg', id: vizId, bins: next });
    },
    [vizId],
  );

  useEffect(() => data$.subscribe((v) => {
    dataRef.current = Array.isArray(v) ? v : [];
    const n = Math.round(dataRef.current[0] ?? 0);
    if (n >= 32 && n !== binsRef.current) {
      binsRef.current = n;
      setBins(n);
    }
    applyCurves();
  }), [data$, applyCurves]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDestructed?.())
      return;
    chart.set('range_y', { min: dbMin, max: dbMax, scale: 'linear' });
    chart.set('db_grid', 12);
    applyCurves();
  }, [dbMin, dbMax, bins, applyCurves]);

  const widgetRef = useCallback(
    (w: AuxFrInstance | null) => {
      if (!w) {
        resizeRoRef.current?.disconnect();
        resizeRoRef.current = null;
        chartRef.current = null;
        graphsRef.current = [];
        return;
      }
      if (chartRef.current === w)
        return;
      chartRef.current = w;
      graphsRef.current = [];

      w.set('range_x', { min: F_MIN, max: F_MAX, scale: 'frequency' });
      w.set('range_y', { min: dbMin, max: dbMax, scale: 'linear' });
      w.set('db_grid', 12);

      // Polyline: honest for steep resonant peaks (H2 overshoots / shreds them).
      const gL = w.addGraph({
        type: 'L',
        mode: 'line',
        class: 'mod-L',
      });
      const gR = w.addGraph({
        type: 'L',
        mode: 'line',
        class: 'mod-R',
      });
      gL.element?.classList.add('mod-L');
      gR.element?.classList.add('mod-R');
      graphsRef.current = [gL, gR];
      applyCurves();

      if (w.element && !resizeRoRef.current) {
        sendVizBins(w.element);
        let raf = 0;
        const ro = new ResizeObserver(() => {
          if (raf)
            cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            if (w.element)
              sendVizBins(w.element);
          });
        });
        ro.observe(w.element);
        resizeRoRef.current = ro;
      }
    },
    [applyCurves, dbMin, dbMax, sendVizBins],
  );

  return (
    <div className={['ModulationChart', className].filter(Boolean).join(' ')}>
      <FrWidget className="ModulationChart-aux" widgetRef={widgetRef} />
    </div>
  );
}
