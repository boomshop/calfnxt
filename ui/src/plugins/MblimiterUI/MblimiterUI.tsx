import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  BandBridgeChart,
  Button,
  Buttons,
  HistoryChart,
  Knob,
  LevelMeter,
  MB_FREQ_MAX,
  MB_FREQ_MIN,
  MultibandChart,
  Toggle,
  WithInfo,
  type BandBridgeSegment,
} from '../../widgets';
import { paramIds } from '../../generated/mblimiterModel';
import {
  LIMITER_CURVE_ENTRIES,
  MBLIMITER_MAX_BANDS,
  MBLIMITER_MIN_BANDS,
  MBLIMITER_SLOPE_ENTRIES,
  mblimiterParamDefault,
  type IMblimiterBand,
  type IMblimiterHost,
} from '../../host/mblimiterHost';
import '../PluginUI.scss';
import './MblimiterUI.scss';
import { mblimiterInfo } from './mblimiterInfo';
import { isStudioCapture } from '../../studioFlag';

/** Band strips are capped so wide editors keep them readable, centered in the row. */
const STRIP_MAX_PX = 256;
/** `--gap` of the plugin theme: editor padding and strip spacing. */
const GAP_PX = 8;

const LOG_MIN = Math.log(MB_FREQ_MIN);
const LOG_SPAN = Math.log(MB_FREQ_MAX) - LOG_MIN;

/** Chart x position (0…1) of a frequency on the logarithmic axis. */
function freqFraction(hz: number): number {
  const f = Math.min(MB_FREQ_MAX, Math.max(MB_FREQ_MIN, hz));
  return (Math.log(f) - LOG_MIN) / LOG_SPAN;
}

/**
 * Horizontal span (0…1 of the content width) of the flex strip for band
 * `index` of `count` — mirrors the flex row: equal widths capped at
 * `STRIP_MAX_PX`, `GAP_PX` between them, centered.
 */
function stripSpan(index: number, count: number, editorWidth: number) {
  const content = Math.max(1, editorWidth - 2 * GAP_PX);
  const strip = Math.min(
    STRIP_MAX_PX,
    (content - (count - 1) * GAP_PX) / count,
  );
  const row = count * strip + (count - 1) * GAP_PX;
  const left = (content - row) * 0.5 + index * (strip + GAP_PX);
  return { from: left / content, to: (left + strip) / content };
}

/** Plain values of a fixed list of models (crossovers) as React state. */
function useNumberValues(models: DynamicValue<number>[]): number[] {
  const [values, setValues] = useState(() => models.map((dv) => dv.value));

  useEffect(() => {
    const sync = () => setValues(models.map((dv) => dv.value));
    sync();
    const unsubs = models.map((dv) => dv.subscribe(sync, false));
    return () => unsubs.forEach((u) => u());
  }, [models]);

  return values;
}

const COEFF_DOTS = [-1, -0.5, 0, 0.5, 1];
const COEFF_LABELS = [
  { pos: -1, label: '−1' },
  { pos: 0, label: '0' },
  { pos: 1, label: '1' },
];

const GR_GRADIENT = [
  { value: 0, color: '#0066ff' },
  { value: 60, color: '#ff0066' },
];

const LEVEL_GRADIENT = [
  { value: -60, color: '#0066ff' },
  { value: 0, color: '#ff0066' },
];

const LIMIT_DOTS = [-24, -18, -12, -6, -3, 0];
const LIMIT_LABELS = [
  { pos: -24, label: '−24' },
  { pos: -18, label: '−18' },
  { pos: -12, label: '−12' },
  { pos: -6, label: '−6' },
  { pos: -3, label: '−3' },
  { pos: 0, label: '0' },
];

const LOOK_DOTS = [0.1, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const LOOK_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 3, label: '3' },
  { pos: 4, label: '4' },
  { pos: 5, label: '5' },
  { pos: 7, label: '7' },
  { pos: 10, label: '10' },
];

const RELEASE_DOTS = [1, 10, 50, 100, 250, 500, 1000];
const RELEASE_LABELS = [
  { pos: 1, label: '1' },
  { pos: 10, label: '10' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
];

const OS_DOTS = [1, 2, 3, 4];
const OS_LABELS = OS_DOTS.map((n) => ({ pos: n, label: `${n}×` }));

const ASC_DOTS = [0, 0.25, 0.5, 0.75, 1];
const ASC_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.5, label: '0.5' },
  { pos: 1, label: '1' },
];

const KNEE_DOTS = [0, 3, 6, 9, 12];
const KNEE_LABELS = KNEE_DOTS.map((n) => ({ pos: n, label: String(n) }));

const HOLD_DOTS = [0, 10, 25, 50, 100, 250, 500];
const HOLD_LABELS = [
  { pos: 0, label: '0' },
  { pos: 10, label: '10' },
  { pos: 25, label: '25' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
];

const UNIT_DOTS = [0, 0.25, 0.5, 0.75, 1];
const UNIT_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.5, label: '0.5' },
  { pos: 1, label: '1' },
];

const MARGIN_DOTS = [0, 0.1, 0.5, 1, 2, 3];
const MARGIN_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.1, label: '0.1' },
  { pos: 0.5, label: '0.5' },
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 3, label: '3' },
];

const XOVER_PARAM_IDS = [
  paramIds.xover1,
  paramIds.xover2,
  paramIds.xover3,
  paramIds.xover4,
  paramIds.xover5,
];

export interface MblimiterUIProps {
  host: IMblimiterHost;
}

function BandStrip(props: { band: IMblimiterBand; compactKnobs: boolean }) {
  const { band, compactKnobs } = props;
  const studioMeterProps = isStudioCapture() ? { falling: 0 as const } : {};
  const knobSize = compactKnobs ? 'tiny' : 'small';

  return (
    <div className="strip block" data-band={band.id}>
      <div className="history">
        <HistoryChart
          data$={band.historyData$}
          vizId="mblimiter"
          graphs={[
            { className: 'hist-audio', mode: 'bottom' },
            { className: 'hist-audio-filtered', mode: 'bottom' },
            {
              className: 'hist-gr',
              mode: 'line',
              toFront: true,
              gradient: true,
            },
          ]}
        />
      </div>

      <div className="meters">
        <WithInfo title={mblimiterInfo.bandIn}>
          <LevelMeter
            className="band-in"
            size="small"
            layout="top"
            value$={band.inLevel$}
            min={-60}
            max={0}
            show_scale={false}
            scale="decibel"
            log_factor={3}
            gradient={LEVEL_GRADIENT}
            {...studioMeterProps}
          />
        </WithInfo>
        <WithInfo title={mblimiterInfo.bandGr}>
          <LevelMeter
            className="band-gr"
            size="small"
            layout="top"
            value$={band.gr$}
            min={0}
            max={60}
            base={0}
            reverse
            show_scale={false}
            falling={0}
            auto_hold={800}
            scale="log2"
            log_factor={3}
            gradient={GR_GRADIENT}
          />
        </WithInfo>
        <WithInfo title={mblimiterInfo.bandOut}>
          <LevelMeter
            className="band-out"
            size="small"
            layout="top"
            value$={band.outLevel$}
            min={-60}
            max={0}
            show_scale
            scale="decibel"
            log_factor={3}
            gradient={LEVEL_GRADIENT}
            {...studioMeterProps}
          />
        </WithInfo>
      </div>

      <div className="knobs">
        <WithInfo title={mblimiterInfo.bandRelease}>
          <Knob
            label="Release"
            size={knobSize}
            value$={band.release$}
            min={-1}
            max={1}
            reset={band.defaults.release}
            base={0}
            dots={COEFF_DOTS}
            labels={COEFF_LABELS}
            beginEdit={() => band.beginEdit('release')}
            endEdit={() => band.endEdit('release')}
            {...{ 'value.format': (v: number) => v.toFixed(2) }}
          />
        </WithInfo>
        <WithInfo title={mblimiterInfo.bandListen}>
          <Toggle
            state$={band.listen$}
            icon="headphones"
            className="listen warn"
          />
        </WithInfo>
        <WithInfo title={mblimiterInfo.bandWeight}>
          <Knob
            label="Weight"
            size={knobSize}
            value$={band.weight$}
            min={-1}
            max={1}
            reset={band.defaults.weight}
            base={0}
            dots={COEFF_DOTS}
            labels={COEFF_LABELS}
            beginEdit={() => band.beginEdit('weight')}
            endEdit={() => band.endEdit('weight')}
            {...{ 'value.format': (v: number) => v.toFixed(2) }}
          />
        </WithInfo>
      </div>
    </div>
  );
}

export function MblimiterUI(props: MblimiterUIProps) {
  const { host } = props;
  const numBands = Math.max(
    MBLIMITER_MIN_BANDS,
    Math.min(
      MBLIMITER_MAX_BANDS,
      Math.round(useDynamicValueReadonly(host.numBands$, 4)),
    ),
  );
  const slope = useDynamicValueReadonly(host.slope$, 48);
  const curve = useDynamicValueReadonly(host.curve$, 0);
  const xoverValues = useNumberValues(host.xover$);
  const editorWidth = host.meta.editor.width;

  const setNumBands = useCallback(
    (n: number) => {
      const next = Math.max(
        MBLIMITER_MIN_BANDS,
        Math.min(MBLIMITER_MAX_BANDS, n),
      );
      if (next === Math.round(host.numBands$.value)) return;
      host.beginEdit(paramIds.num_bands);
      host.numBands$.set(next);
      host.endEdit(paramIds.num_bands);
    },
    [host],
  );

  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  const grs$ = useMemo(() => host.bands.map((band) => band.gr$), [host.bands]);
  const listens$ = useMemo(
    () => host.bands.map((band) => band.listen$),
    [host.bands],
  );

  const bandEdges = useMemo(() => {
    return Array.from({ length: numBands }, (_, b) => ({
      lo: b === 0 ? MB_FREQ_MIN : (xoverValues[b - 1] ?? MB_FREQ_MIN),
      hi: b >= numBands - 1 ? MB_FREQ_MAX : (xoverValues[b] ?? MB_FREQ_MAX),
    }));
  }, [numBands, xoverValues]);

  const bridgeSegments = useMemo<BandBridgeSegment[]>(
    () =>
      bandEdges.map((edge, b) => {
        const strip = stripSpan(b, numBands, editorWidth);
        return {
          in1: freqFraction(edge.lo),
          in2: freqFraction(edge.hi),
          out1: strip.from,
          out2: strip.to,
        };
      }),
    [bandEdges, editorWidth, numBands],
  );

  return (
    <div className="MblimiterUI PluginUI">
      <Header title="Multiband Limiter" io={host.io}>
        <WithInfo title={mblimiterInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={mblimiterInfo.diffListen}>
          <Toggle
            state$={host.diffListen$}
            icon="headphones"
            className="warn"
          />
        </WithInfo>
        <WithInfo title={mblimiterInfo.slope} className="info-block slope">
          <Buttons
            entries={MBLIMITER_SLOPE_ENTRIES}
            value={slope}
            onChange={(v) => {
              host.beginEdit(paramIds.slope);
              host.slope$.set(v);
              host.endEdit(paramIds.slope);
            }}
          />
        </WithInfo>
        <WithInfo
          title={mblimiterInfo.numBands}
          className="info-block bandcount">
          <div className="bandcount">
            <Button
              label="−"
              onClick={() => setNumBands(numBands - 1)}
              disabled={numBands <= MBLIMITER_MIN_BANDS}
            />
            <Button
              label="+"
              onClick={() => setNumBands(numBands + 1)}
              disabled={numBands >= MBLIMITER_MAX_BANDS}
            />
          </div>
        </WithInfo>
      </Header>

      <MultibandChart
        bandCount={numBands}
        slope$={host.slope$}
        gr$={grs$}
        xover$={host.xover$}
        listen$={listens$}
        showThresholds={false}
        xoverEdit={(index) => ({
          beginEdit: () => host.beginEdit(XOVER_PARAM_IDS[index]!),
          endEdit: () => host.endEdit(XOVER_PARAM_IDS[index]!),
        })}
      />

      <BandBridgeChart segments={bridgeSegments} className="bridge" />

      <div className="strips">
        {host.bands.slice(0, numBands).map((band) => (
          <BandStrip
            key={band.id}
            band={band}
            compactKnobs={numBands >= MBLIMITER_MAX_BANDS}
          />
        ))}
      </div>

      <div className="main">
        <div className="block limit">
          <div className="title">Limit</div>

          <div className="top">
            <WithInfo title={mblimiterInfo.oversampling}>
              <Knob
                label="Oversampling"
                value$={host.oversampling$}
                min={1}
                max={4}
                snap={1}
                reset={mblimiterParamDefault('oversampling')}
                dots={OS_DOTS}
                labels={OS_LABELS}
                {...{ 'value.format': (v: number) => `${Math.round(v)}×` }}
                {...edit(paramIds.oversampling)}
                start={225}
                angle={90}
              />
            </WithInfo>

            <WithInfo title={mblimiterInfo.attack}>
              <Knob
                label="Look"
                value$={host.attack$}
                min={0.1}
                max={10}
                reset={mblimiterParamDefault('attack')}
                dots={LOOK_DOTS}
                labels={LOOK_LABELS}
                {...{ 'value.format': (v: number) => `${v.toFixed(2)} ms` }}
                {...edit(paramIds.attack)}
                scale="log2"
                log_factor={2}
              />
            </WithInfo>

            <WithInfo title={mblimiterInfo.limit}>
              <Knob
                label="Limit"
                size="large"
                value$={host.limit$}
                min={-24}
                max={0}
                reset={mblimiterParamDefault('limit')}
                dots={LIMIT_DOTS}
                labels={LIMIT_LABELS}
                {...{ 'value.format': (v: number) => `${v.toFixed(1)} dB` }}
                {...edit(paramIds.limit)}
              />
            </WithInfo>

            <WithInfo title={mblimiterInfo.release}>
              <Knob
                label="Release"
                value$={host.release$}
                min={1}
                max={1000}
                reset={mblimiterParamDefault('release')}
                dots={RELEASE_DOTS}
                labels={RELEASE_LABELS}
                {...{
                  'value.format': (v: number) =>
                    v >= 1000 ? '1 s' : `${Math.round(v)} ms`,
                }}
                {...edit(paramIds.release)}
                scale="log2"
                log_factor={5}
              />
            </WithInfo>

            <WithInfo title={mblimiterInfo.knee}>
              <Knob
                label="Knee"
                value$={host.knee$}
                min={0}
                max={12}
                reset={mblimiterParamDefault('knee')}
                dots={KNEE_DOTS}
                labels={KNEE_LABELS}
                {...{ 'value.format': (v: number) => `${v.toFixed(1)} dB` }}
                {...edit(paramIds.knee)}
                className="knee"
              />
            </WithInfo>
          </div>

          <div className="bottom">
            <WithInfo title={mblimiterInfo.autoLevel}>
              <Toggle state$={host.autoLevel$} label="Auto Level" />
            </WithInfo>

            <div className="feat-group">
              <WithInfo title={mblimiterInfo.asc}>
                <Toggle state$={host.asc$} label="ASC" />
              </WithInfo>
              <WithInfo title={mblimiterInfo.ascCoeff}>
                <Knob
                  label="Level"
                  size="small"
                  value$={host.ascCoeff$}
                  enabled$={host.asc$}
                  min={0}
                  max={1}
                  reset={mblimiterParamDefault('asc_coeff')}
                  dots={ASC_DOTS}
                  labels={ASC_LABELS}
                  {...{ 'value.format': (v: number) => v.toFixed(2) }}
                  {...edit(paramIds.asc_coeff)}
                />
              </WithInfo>
            </div>

            <WithInfo title={mblimiterInfo.curve} className="info-block">
              <Buttons
                entries={LIMITER_CURVE_ENTRIES}
                value={curve}
                onChange={(v) => {
                  host.beginEdit(paramIds.curve);
                  host.curve$.set(v);
                  host.endEdit(paramIds.curve);
                }}
              />
            </WithInfo>

            <WithInfo title={mblimiterInfo.minRelease}>
              <Toggle state$={host.minRelease$} label="Min Release" />
            </WithInfo>
          </div>
        </div>

        <div className="block meter">
          <div className="title">Attenuation</div>
          <WithInfo title={mblimiterInfo.gr}>
            <LevelMeter
              className="gr"
              value$={host.gr$}
              min={0}
              max={24}
              base={0}
              reverse
              label="GR"
              show_scale
              falling={0}
              auto_hold={800}
              scale="log2"
              log_factor={5}
              levels={[1, 3, 6, 12]}
              gradient={[
                { value: 0, color: '#0066ff' },
                { value: 24, color: '#ff0066' },
              ]}
            />
          </WithInfo>
        </div>

        <div className="block character">
          <div className="title">Character</div>

          <div className="feat-group">
            <WithInfo title={mblimiterInfo.colorEnable}>
              <Toggle state$={host.colorEnable$} label="Color" />
            </WithInfo>
            <WithInfo title={mblimiterInfo.color}>
              <Knob
                label="Amount"
                size="medium"
                value$={host.color$}
                enabled$={host.colorEnable$}
                min={0}
                max={1}
                reset={mblimiterParamDefault('color')}
                dots={UNIT_DOTS}
                labels={UNIT_LABELS}
                {...{
                  'value.format': (v: number) => `${Math.round(v * 100)} %`,
                }}
                {...edit(paramIds.color)}
              />
            </WithInfo>
          </div>

          <div className="feat-group">
            <WithInfo title={mblimiterInfo.truePeak}>
              <Toggle state$={host.truePeak$} label="True Peak" />
            </WithInfo>
            <WithInfo title={mblimiterInfo.margin}>
              <Knob
                label="Margin"
                size="medium"
                value$={host.margin$}
                enabled$={host.truePeak$}
                min={0}
                max={3}
                reset={mblimiterParamDefault('margin')}
                dots={MARGIN_DOTS}
                labels={MARGIN_LABELS}
                {...{ 'value.format': (v: number) => `${v.toFixed(2)} dB` }}
                {...edit(paramIds.margin)}
                scale="log2"
                log_factor={3}
              />
            </WithInfo>
          </div>

          <div className="feat-group">
            <WithInfo title={mblimiterInfo.holdEnable}>
              <Toggle state$={host.holdEnable$} label="Hold" />
            </WithInfo>
            <WithInfo title={mblimiterInfo.releaseHold}>
              <Knob
                label="Time"
                size="medium"
                value$={host.releaseHold$}
                enabled$={host.holdEnable$}
                min={0}
                max={500}
                reset={mblimiterParamDefault('release_hold')}
                dots={HOLD_DOTS}
                labels={HOLD_LABELS}
                {...{ 'value.format': (v: number) => `${Math.round(v)} ms` }}
                {...edit(paramIds.release_hold)}
                scale="log2"
                log_factor={5}
              />
            </WithInfo>
          </div>

          <div className="feat-group">
            <WithInfo title={mblimiterInfo.emphasisEnable}>
              <Toggle state$={host.emphasisEnable$} label="Emphasis" />
            </WithInfo>
            <WithInfo title={mblimiterInfo.emphasis}>
              <Knob
                label="Amount"
                size="medium"
                value$={host.emphasis$}
                enabled$={host.emphasisEnable$}
                min={0}
                max={1}
                reset={mblimiterParamDefault('emphasis')}
                dots={UNIT_DOTS}
                labels={UNIT_LABELS}
                {...{
                  'value.format': (v: number) => `${Math.round(v * 100)} %`,
                }}
                {...edit(paramIds.emphasis)}
              />
            </WithInfo>
          </div>
        </div>
      </div>
    </div>
  );
}
