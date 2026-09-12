import { useCallback, useEffect, useRef } from 'react';
// @ts-expect-error AUX frequencyresponse has no published typings in this package build.
import { FrequencyResponse as AuxFrequencyResponse } from '@deutschesoft/aux-widgets/src/widgets/frequencyresponse.js';
import type { DynamicValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
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
const MAX_TEETH = 128;

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

/** Vertical stems from 0 dB to each peak/notch magnitude. */
function combStems(
  raw: number[],
  channel: 'L' | 'R',
  dbMin: number,
  dbMax: number,
): { x: number; y: number }[] {
  const nL = Math.max(0, Math.min(MAX_TEETH, Math.round(raw[0] ?? 0)));
  const nR = Math.max(0, Math.min(MAX_TEETH, Math.round(raw[1] ?? 0)));
  const n = channel === 'L' ? nL : nR;
  const base = channel === 'L' ? 2 : 2 + 2 * nL;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; ++i) {
    const f = raw[base + 2 * i];
    const db = raw[base + 2 * i + 1];
    if (typeof f !== 'number' || !Number.isFinite(f))
      continue;
    const y = Math.min(dbMax, Math.max(dbMin, typeof db === 'number' && Number.isFinite(db) ? db : 0));
    const x = Math.min(F_MAX, Math.max(F_MIN, f));
    pts.push({ x, y: 0 });
    pts.push({ x, y });
    pts.push({ x, y: 0 });
  }
  return pts;
}

function modulationDots(
  raw: number[],
  channel: 'L' | 'R',
  mode: 'response' | 'comb',
  dbMin: number,
  dbMax: number,
): { x: number; y: number }[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  if (mode === 'comb') return combStems(raw, channel, dbMin, dbMax);
  const payload = parseResponse(raw);
  const n = Math.max(1, payload.bins);
  return seriesDots(channel === 'L' ? payload.L : payload.R, n, dbMin, dbMax);
}

export interface ModulationChartProps {
  /** Viz payload: response [bins,L×N,R×N] or comb [nL,nR,(f,dB)…]. */
  data$: DynamicValue<number[]>;
  vizId?: string;
  /** `response` = continuous |H| (Phaser). `comb` = peak/notch stems (Flanger). */
  mode?: 'response' | 'comb';
  /** Y axis in dB (Phaser/Flanger/Chorus share this widget with different spans). */
  dbMin?: number;
  dbMax?: number;
  className?: string;
}

/**
 * L/R modulation chart (Phaser response curve or Flanger comb stems).
 * AUX FrequencyResponse + log frequency axis; paint via AWML Bindings.
 */
export function ModulationChart(props: ModulationChartProps) {
  const {
    data$,
    vizId = MOD_VIZ_ID,
    mode = 'response',
    dbMin = MOD_DB_MIN_DEFAULT,
    dbMax = MOD_DB_MAX_DEFAULT,
    className,
  } = props;

  const chartRef = useRef<AuxFrInstance | null>(null);
  const graphsRef = useRef<AuxGraph[]>([]);
  const graphBindingsRef = useRef<Bindings[]>([]);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const dbMinRef = useRef(dbMin);
  const dbMaxRef = useRef(dbMax);
  dbMinRef.current = dbMin;
  dbMaxRef.current = dbMax;

  const sendVizBins = useCallback(
    (el: Element) => {
      if (modeRef.current === 'comb')
        return;
      const width = Math.round(el.getBoundingClientRect().width);
      const next = Math.max(32, Math.min(MAX_BINS, width));
      postToHost({ t: 'vizcfg', id: vizId, bins: next });
    },
    [vizId],
  );

  const disposeBindings = useCallback(() => {
    for (const b of graphBindingsRef.current) b.dispose();
    graphBindingsRef.current = [];
  }, []);

  // Rare axis / mode change: re-bind so transformReceive closes over new mode.
  useEffect(() => {
    const chart = chartRef.current;
    const graphs = graphsRef.current;
    if (!chart || chart.isDestructed?.() || graphs.length < 2) return;
    chart.set('range_y', { min: dbMin, max: dbMax, scale: 'linear' });
    chart.set('db_grid', 12);
    disposeBindings();
    graphBindingsRef.current = [
      bindAuxOptions(graphs[0]!, [
        {
          name: 'dots',
          backendValue: data$,
          readonly: true,
          transformReceive: (raw: unknown) =>
            modulationDots(
              (raw as number[]) ?? [],
              'L',
              modeRef.current,
              dbMinRef.current,
              dbMaxRef.current,
            ),
        },
      ]),
      bindAuxOptions(graphs[1]!, [
        {
          name: 'dots',
          backendValue: data$,
          readonly: true,
          transformReceive: (raw: unknown) =>
            modulationDots(
              (raw as number[]) ?? [],
              'R',
              modeRef.current,
              dbMinRef.current,
              dbMaxRef.current,
            ),
        },
      ]),
    ];
  }, [data$, dbMin, dbMax, mode, disposeBindings]);

  const widgetRef = useCallback(
    (w: AuxFrInstance | null) => {
      if (!w) {
        resizeRoRef.current?.disconnect();
        resizeRoRef.current = null;
        disposeBindings();
        chartRef.current = null;
        graphsRef.current = [];
        return;
      }
      if (chartRef.current === w)
        return;
      disposeBindings();
      chartRef.current = w;
      graphsRef.current = [];

      w.set('range_x', { min: F_MIN, max: F_MAX, scale: 'frequency' });
      w.set('range_y', { min: dbMin, max: dbMax, scale: 'linear' });
      w.set('db_grid', 12);

      const gL = w.addGraph({
        type: 'L',
        mode: 'line',
        class: mode === 'comb' ? 'mod-L mod-stem' : 'mod-L',
      });
      const gR = w.addGraph({
        type: 'L',
        mode: 'line',
        class: mode === 'comb' ? 'mod-R mod-stem' : 'mod-R',
      });
      gL.element?.classList.add('mod-L');
      gR.element?.classList.add('mod-R');
      if (mode === 'comb') {
        gL.element?.classList.add('mod-stem');
        gR.element?.classList.add('mod-stem');
      }
      graphsRef.current = [gL, gR];
      graphBindingsRef.current = [
        bindAuxOptions(gL, [
          {
            name: 'dots',
            backendValue: data$,
            readonly: true,
            transformReceive: (raw: unknown) =>
              modulationDots(
                (raw as number[]) ?? [],
                'L',
                modeRef.current,
                dbMinRef.current,
                dbMaxRef.current,
              ),
          },
        ]),
        bindAuxOptions(gR, [
          {
            name: 'dots',
            backendValue: data$,
            readonly: true,
            transformReceive: (raw: unknown) =>
              modulationDots(
                (raw as number[]) ?? [],
                'R',
                modeRef.current,
                dbMinRef.current,
                dbMaxRef.current,
              ),
          },
        ]),
      ];

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
    [data$, dbMin, dbMax, mode, sendVizBins, disposeBindings],
  );

  return (
    <div className={['ModulationChart', mode === 'comb' ? 'is-comb' : '', className].filter(Boolean).join(' ')}>
      <FrWidget className="ModulationChart-aux" widgetRef={widgetRef} />
    </div>
  );
}
