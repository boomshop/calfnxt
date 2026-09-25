import { useEffect, useRef } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { Label as AuxLabel } from '@deutschesoft/aux-widgets/src/index.pure.js';
import {
  componentFromWidget,
  useDynamicValueReadonly,
} from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Button,
  Buttons,
  CorrelationMeter,
  GonioMeter,
  HistoryChart,
  LevelMeter,
  MultiMeter,
  SpectrumChart,
  SpectrumDiffChart,
  SPECTRUM_MODE,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/analyzerModel';
import { postToHost } from '../../utils/bridge';
import {
  ANALYZER_FFT_ENTRIES,
  ANALYZER_SCALE_ENTRIES,
  ANALYZER_STANDARD_ENTRIES,
  type IAnalyzerHost,
} from '../../host/analyzerHost';
import '../PluginUI.scss';
import './AnalyzerUI.scss';
import { analyzerInfo } from './analyzerInfo';
import { Scale } from '../../widgets/Scale';

const LOUD_DB_MIN = -48;
const LOUD_DB_MAX = 6;

function loudHistoryDb(v: number): number {
  if (!Number.isFinite(v) || v < -90) return LOUD_DB_MIN;
  return Math.max(LOUD_DB_MIN, Math.min(LOUD_DB_MAX, v));
}

/** Slot order matches the loudness history: M, S, true peak, RMS. */
const LOUD_GRAPHS = [
  {
    className: 'hist-mom',
    mode: 'line' as const,
    toDb: loudHistoryDb,
    toFront: true,
  },
  { className: 'hist-st', mode: 'line' as const, toDb: loudHistoryDb },
  { className: 'hist-tp', mode: 'line' as const, toDb: loudHistoryDb },
  { className: 'hist-rms', mode: 'line' as const, toDb: loudHistoryDb },
];

const LEVEL_METER = {
  min: -60,
  max: 6,
  layout: 'right' as const,
  falling: 0,
  scale: 'linear' as const,
  show_scale: false,
};

function formatReadout(v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= -90) return '—';
  return v.toFixed(1);
}

const Readout = componentFromWidget(
  AuxLabel,
  { label$: { name: 'label' } },
  { format: formatReadout },
  'Readout',
);

/** Number only. Class toggles on the viz stream, no React render. */
function LimitReadout({
  value$,
  limit$,
}: {
  value$: DynamicValue<number>;
  limit$: DynamicValue<number>;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let value = -200;
    let limit = 0;
    const sync = () => {
      const over = Number.isFinite(value) && value > -90 && value > limit;
      ref.current?.classList.toggle('is-over', over);
    };
    const unValue = value$.subscribe((v) => {
      value = v;
      sync();
    }, true);
    const unLimit = limit$.subscribe((v) => {
      limit = v;
      sync();
    }, true);
    return () => {
      unValue();
      unLimit();
    };
  }, [value$, limit$]);
  return (
    <span ref={ref} className="limit">
      <Readout label$={value$} />
    </span>
  );
}

export interface AnalyzerUIProps {
  host: IAnalyzerHost;
}

export function AnalyzerUI(props: AnalyzerUIProps) {
  const { host } = props;
  const waterfall = useDynamicValueReadonly(host.mode$, false);
  const pause = useDynamicValueReadonly(host.hold$, false);
  const fftSizeRaw = useDynamicValueReadonly(host.fftSize$, 2);
  const scaleRaw = useDynamicValueReadonly(host.scale$, 0);
  const standardRaw = useDynamicValueReadonly(host.standard$, 2);
  const fftSize = Math.round(fftSizeRaw);
  const scale = Math.round(scaleRaw);
  const standard = Math.round(standardRaw);

  const setParam = (id: number, apply: () => void) => {
    host.beginEdit(id);
    apply();
    host.endEdit(id);
  };

  return (
    <div className="AnalyzerUI PluginUI">
      <Header title="Analyzer">
        <WithInfo title={analyzerInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={analyzerInfo.reset}>
          <Button
            label="Reset"
            onClick={() => postToHost({ t: 'meter', cmd: 'reset' })}
          />
        </WithInfo>
      </Header>

      <div className="block tools">
        <WithInfo title={analyzerInfo.waterfall}>
          <Toggle state$={host.mode$} label="Waterfall" />
        </WithInfo>
        <WithInfo title={analyzerInfo.fftSize}>
          <Buttons
            layout="horizontal"
            entries={[...ANALYZER_FFT_ENTRIES]}
            value={fftSize}
            onChange={(v) =>
              setParam(paramIds.fft_size, () => host.fftSize$.set(v as number))
            }
          />
        </WithInfo>
        <WithInfo title={analyzerInfo.scale}>
          <Buttons
            layout="horizontal"
            entries={[...ANALYZER_SCALE_ENTRIES]}
            value={scale}
            onChange={(v) =>
              setParam(paramIds.scale, () => host.scale$.set(v as number))
            }
          />
        </WithInfo>
        <WithInfo title={analyzerInfo.resetPeak}>
          <Button
            label="Reset Peak"
            onClick={() => postToHost({ t: 'meter', cmd: 'resetpeak' })}
          />
        </WithInfo>

        <i />

        <WithInfo title={analyzerInfo.pause}>
          <Toggle state$={host.hold$} label="Pause" />
        </WithInfo>
        <WithInfo title={analyzerInfo.standard}>
          <Buttons
            layout="horizontal"
            entries={[...ANALYZER_STANDARD_ENTRIES]}
            value={standard}
            onChange={(v) => {
              const row = ANALYZER_STANDARD_ENTRIES.find((e) => e.value === v);
              if (!row) return;
              setParam(paramIds.standard, () => host.standard$.set(row.value));
              setParam(paramIds.target, () => host.target$.set(row.target));
              setParam(paramIds.tp_ceil, () => host.tpCeil$.set(row.ceil));
            }}
          />
        </WithInfo>
      </div>

      <WithInfo title={analyzerInfo.curves} className="chart-info">
        <SpectrumChart
          data$={host.spectrum$}
          mode={waterfall ? SPECTRUM_MODE.Spectralizer : SPECTRUM_MODE.Stereo}
          monitor
          scale={scale}
          hold={!pause}
        />
      </WithInfo>

      <WithInfo title={analyzerInfo.diff} className="diff-info">
        <SpectrumDiffChart data$={host.spectrum$} />
      </WithInfo>

      <div className="hist">
        <WithInfo title={analyzerInfo.integrated} className="hist-info">
          <HistoryChart
            data$={host.loudnessHistory$}
            vizId="loud"
            windowMs={12000}
          slotMs={100}
            dbMin={LOUD_DB_MIN}
            dbMax={LOUD_DB_MAX}
            graphs={LOUD_GRAPHS}
          />
        </WithInfo>
        <div className="hist-legend">
          <span className="mom">M</span>
          <span className="st">ST</span>
          <span className="tp">TP</span>
          <span className="rms">RMS</span>
        </div>
      </div>

      <div className="side">
        <div className="block readout">
          <div className="figures">
            <label>
              Momentary <Readout label$={host.momentary$} />
            </label>
            <label>
              Short-term <Readout label$={host.shortTerm$} />
            </label>
            <label>
              Integrated{' '}
              <LimitReadout value$={host.integrated$} limit$={host.target$} />
            </label>
            <label>
              Range <Readout label$={host.lra$} />
            </label>
            <label>
              L Peak <LimitReadout value$={host.peakL$} limit$={host.tpCeil$} />
            </label>
            <label>
              R Peak <LimitReadout value$={host.peakR$} limit$={host.tpCeil$} />
            </label>
            <label>
              L RMS <Readout label$={host.rmsL$} />
            </label>
            <label>
              R RMS <Readout label$={host.rmsR$} />
            </label>
          </div>
        </div>
        <div className="block meters">
          <Scale
            min={-60}
            max={6}
            {...{
              base: 0,
              fixed_dots: [
                -60, -57, -54, -51, -48, -45, -42, -39, -36, -33, -30, -27, -24,
                -21, -18, -15, -12, -9, -6, -3, 0, 3, 6,
              ],
              fixed_labels: [-60, -48, -36, -24, -12, -6, 0, 6],
            }}
            layout="right"
            scale="linear"
            labels={(v: number) => v.toFixed(0)}
          />
          <WithInfo title={analyzerInfo.truePeak} className="levels">
            <MultiMeter
              value$={host.levels$}
              count={4}
              labels={['L RMS', 'L Pk', 'R Pk', 'R RMS']}
              min={-60}
              max={6}
              falling={0}
              scale="linear"
              layout="right"
              show_scale={false}
            />
          </WithInfo>
          <WithInfo title={analyzerInfo.integrated} className="lufs">
            <MultiMeter
              value$={host.lufs$}
              count={3}
              labels={['M', 'ST', 'I']}
              min={-60}
              max={6}
              falling={0}
              scale="linear"
              layout="left"
              show_scale={false}
            />
          </WithInfo>
          <WithInfo title={analyzerInfo.integrated} className="range">
            <LevelMeter
              label="R"
              value$={host.lraHi$}
              base$={host.lraLo$}
              min={-60}
              max={6}
              layout="left"
              falling={0}
              scale="linear"
              show_hold
              auto_hold={false}
              {...{
                'scale.base': 0,
                'scale.fixed_dots': [
                  -60, -57, -54, -51, -48, -45, -42, -39, -36, -33, -30, -27,
                  -24, -21, -18, -15, -12, -9, -6, -3, 0, 3, 6,
                ],
              }}
              {...{
                'scale.fixed_labels': [-60, -48, -36, -24, -12, -6, 0, 6],
              }}
            />
          </WithInfo>
        </div>
        <div className="block gonio">
          <WithInfo title={analyzerInfo.gonio}>
            <GonioMeter samples$={host.gonio$} />
          </WithInfo>
          <WithInfo title={analyzerInfo.corr}>
            <CorrelationMeter value$={host.corr$} />
          </WithInfo>
        </div>
      </div>
    </div>
  );
}
