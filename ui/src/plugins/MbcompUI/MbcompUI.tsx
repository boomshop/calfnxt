import { useCallback, useEffect, useMemo, useState } from 'react';
import { DynamicValue } from '@deutschesoft/awml';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  BandBridgeChart,
  Button,
  Buttons,
  DynamicsChart,
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
import { paramIds } from '../../generated/mbcompModel';
import {
  MBCOMP_LINK_ENTRIES,
  MBCOMP_MAX_BANDS,
  MBCOMP_MIN_BANDS,
  MBCOMP_MODE_ENTRIES,
  MBCOMP_SLOPE_ENTRIES,
  type IMbcompBand,
  type IMbcompHost,
} from '../../host/mbcompHost';
import '../PluginUI.scss';
import './MbcompUI.scss';
import { mbcompInfo } from './mbcompInfo';
import { isStudioCapture } from '../../studioFlag';

const RATIO_DOTS = [1, 2, 4, 8, 12, 20];
const RATIO_LABELS = RATIO_DOTS.map((n) => ({ pos: n, label: String(n) }));

const THRESH_DOTS = [-60, -48, -36, -24, -12, -6, 0];
const THRESH_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: 0, label: '0' },
];

const KNEE_DOTS = [0, 3, 6, 12, 18, 24];
const KNEE_LABELS = [
  { pos: 0, label: '0' },
  { pos: 6, label: '6' },
  { pos: 12, label: '12' },
  { pos: 18, label: '18' },
  { pos: 24, label: '24' },
];

const ATTACK_DOTS = [0.1, 1, 5, 10, 20, 50, 100, 250, 500];
const ATTACK_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 1, label: '1' },
  { pos: 10, label: '10' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
];

const RELEASE_DOTS = [1, 10, 50, 100, 200, 500, 1000, 2000];
const RELEASE_LABELS = [
  { pos: 1, label: '1' },
  { pos: 100, label: '100' },
  { pos: 200, label: '200' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
  { pos: 2000, label: '2s' },
];

const MAKEUP_DOTS = [0, 6, 12, 18, 24];
const MAKEUP_LABELS = [
  { pos: 0, label: '0' },
  { pos: 6, label: '6' },
  { pos: 12, label: '12' },
  { pos: 18, label: '18' },
  { pos: 24, label: '24' },
];

const PERCENT_DOTS = [0, 0.25, 0.5, 0.75, 1];
const PERCENT_LABELS = [
  { pos: 0, label: '0 %' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100 %' },
];

const GR_GRADIENT = [
  { value: 0, color: '#0066ff' },
  { value: 60, color: '#ff0066' },
];

/** In/Out strip meters (−60…0 dB). */
const LEVEL_GRADIENT = [
  { value: -60, color: '#0066ff' },
  { value: 0, color: '#ff0066' },
];

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

const XOVER_PARAM_IDS = [
  paramIds.xover1,
  paramIds.xover2,
  paramIds.xover3,
  paramIds.xover4,
  paramIds.xover5,
];

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

export interface MbcompUIProps {
  host: IMbcompHost;
}

function BandStrip(props: {
  band: IMbcompBand;
  selected: boolean;
  /** When true (fewer than 5 bands), show Makeup next to Thresh/Ratio. */
  showMakeup: boolean;
  onSelect: (index: number) => void;
}) {
  const { band, selected, showMakeup, onSelect } = props;
  const bypass = useDynamicValueReadonly(band.bypass$, false);
  // Studio only: freeze meters (AUX falling ignores repeated identical peaks).
  // Do not pass falling={undefined} live — that stomps LevelMeter's default (10).
  const studioMeterProps = isStudioCapture() ? { falling: 0 as const } : {};

  return (
    <div
      className={[
        'strip',
        selected && 'selected',
        bypass && 'bypassed',
        showMakeup && 'with-makeup',
      ]
        .filter(Boolean)
        .join(' ')}
      data-band={band.id}>
      <div
        className={['history', bypass && 'disabled'].filter(Boolean).join(' ')}>
        <HistoryChart
          data$={band.historyData$}
          vizId="mbcomp"
          className={bypass ? 'disabled' : undefined}
          graphs={[
            { className: 'hist-full', mode: 'bottom' },
            { className: 'hist-band', mode: 'bottom' },
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
        <WithInfo title={mbcompInfo.bandIn}>
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
        <WithInfo title={mbcompInfo.gr}>
          {/* Same as Compressor / detail GR: DSP ≤0 → host positive 0…60 + reverse. */}
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
        <WithInfo title={mbcompInfo.bandOut}>
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
        <WithInfo title={mbcompInfo.threshold}>
          <Knob
            label="Thresh"
            size="small"
            value$={band.threshold$}
            disabled$={band.bypass$}
            min={-60}
            max={0}
            reset={band.defaults.threshold}
            base={0}
            dots={THRESH_DOTS}
            labels={THRESH_LABELS}
            scale="decibel"
            log_factor={3}
            beginEdit={() => band.beginEdit('threshold')}
            endEdit={() => band.endEdit('threshold')}
            {...{ 'value.format': (v: number) => v.toFixed(1) }}
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.ratio}>
          <Knob
            label="Ratio"
            size="small"
            value$={band.ratio$}
            disabled$={band.bypass$}
            min={1}
            max={20}
            reset={band.defaults.ratio}
            scale="log2"
            log_factor={4}
            dots={RATIO_DOTS}
            labels={RATIO_LABELS}
            beginEdit={() => band.beginEdit('ratio')}
            endEdit={() => band.endEdit('ratio')}
            {...{ 'value.format': (v: number) => `${v.toFixed(1)}:1` }}
          />
        </WithInfo>
        {showMakeup && (
          <WithInfo title={mbcompInfo.makeup}>
            <Knob
              label="Makeup"
              size="small"
              value$={band.makeup$}
              disabled$={band.bypass$}
              min={0}
              max={24}
              reset={band.defaults.makeup}
              base={0}
              dots={MAKEUP_DOTS}
              labels={MAKEUP_LABELS}
              beginEdit={() => band.beginEdit('makeup')}
              endEdit={() => band.endEdit('makeup')}
            />
          </WithInfo>
        )}
      </div>

      <div className="bottom">
        <WithInfo title={mbcompInfo.bandListen}>
          <Toggle
            state$={band.listen$}
            icon="headphones"
            className="listen warn"
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.bandSelect} className="band-select">
          <Button
            label={`Band ${band.index + 1}`}
            onClick={() => onSelect(band.index)}
            state={selected}
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.bandBypass}>
          <Toggle state$={band.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
      </div>
    </div>
  );
}

function BandDetail(props: {
  band: IMbcompBand;
  point$: IMbcompHost['point$'];
}) {
  const { band, point$ } = props;
  const mode = useDynamicValueReadonly(band.mode$, 1);
  const link = useDynamicValueReadonly(band.link$, 0);
  const edit = (key: Parameters<IMbcompBand['beginEdit']>[0]) => ({
    beginEdit: () => band.beginEdit(key),
    endEdit: () => band.endEdit(key),
  });

  return (
    <div className="detail" data-band={band.id}>
      <div className="block detector">
        <div className="title">Band {band.index + 1} Detector</div>
        <div className="selects">
          <WithInfo title={mbcompInfo.mode} className="info-block">
            <Buttons
              entries={MBCOMP_MODE_ENTRIES}
              value={mode}
              onChange={(v) => {
                band.beginEdit('mode');
                band.mode$.set(v);
                band.endEdit('mode');
              }}
            />
          </WithInfo>
          <WithInfo title={mbcompInfo.link} className="info-block">
            <Buttons
              entries={MBCOMP_LINK_ENTRIES}
              value={link}
              onChange={(v) => {
                band.beginEdit('link');
                band.link$.set(v);
                band.endEdit('link');
              }}
            />
          </WithInfo>
        </div>
      </div>

      <div className="block compressor">
        <div className="title">Band {band.index + 1} Dynamics</div>
        <WithInfo title={mbcompInfo.threshold} className="threshold">
          <Knob
            label="Thresh"
            size="large"
            value$={band.threshold$}
            min={-60}
            max={0}
            reset={band.defaults.threshold}
            base={0}
            dots={THRESH_DOTS}
            labels={THRESH_LABELS}
            scale="decibel"
            log_factor={3}
            {...edit('threshold')}
            {...{ 'value.format': (v: number) => v.toFixed(1) }}
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.attack} className="attack">
          <Knob
            label="Attack"
            size="small"
            value$={band.attack$}
            min={0.1}
            max={500}
            reset={band.defaults.attack}
            scale="log2"
            log_factor={4}
            dots={ATTACK_DOTS}
            labels={ATTACK_LABELS}
            {...edit('attack')}
            {...{ 'value.format': (v: number) => v.toFixed(1) }}
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.release} className="release">
          <Knob
            label="Release"
            size="small"
            value$={band.release$}
            min={1}
            max={2000}
            reset={band.defaults.release}
            scale="log2"
            log_factor={4}
            dots={RELEASE_DOTS}
            labels={RELEASE_LABELS}
            {...edit('release')}
            {...{ 'value.format': (v: number) => v.toFixed(0) }}
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.pdr} className="pdr">
          <Knob
            label="PDR"
            size="small"
            value$={band.pdr$}
            min={0}
            max={1}
            reset={band.defaults.pdr}
            dots={PERCENT_DOTS}
            labels={PERCENT_LABELS}
            {...edit('pdr')}
            {...{ 'value.format': (v: number) => `${Math.round(v * 100)} %` }}
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.ratio} className="ratio">
          <Knob
            label="Ratio"
            size="large"
            value$={band.ratio$}
            min={1}
            max={20}
            reset={band.defaults.ratio}
            scale="log2"
            log_factor={4}
            dots={RATIO_DOTS}
            labels={RATIO_LABELS}
            {...edit('ratio')}
            {...{ 'value.format': (v: number) => `${v.toFixed(1)}:1` }}
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.knee} className="knee">
          <Knob
            label="Knee"
            size="small"
            value$={band.knee$}
            min={0}
            max={24}
            reset={band.defaults.knee}
            dots={KNEE_DOTS}
            labels={KNEE_LABELS}
            {...edit('knee')}
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.makeup} className="makeup">
          <Knob
            label="Makeup"
            size="small"
            value$={band.makeup$}
            min={0}
            max={24}
            reset={band.defaults.makeup}
            base={0}
            dots={MAKEUP_DOTS}
            labels={MAKEUP_LABELS}
            {...edit('makeup')}
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.mix} className="mix">
          <Knob
            label="Mix"
            size="small"
            value$={band.mix$}
            min={0}
            max={1}
            reset={band.defaults.mix}
            dots={PERCENT_DOTS}
            labels={PERCENT_LABELS}
            {...edit('mix')}
            {...{ 'value.format': (v: number) => `${Math.round(v * 100)} %` }}
          />
        </WithInfo>
      </div>

      <div className="block chart">
        <div className="title">Band {band.index + 1} Transfer</div>
        <WithInfo title={mbcompInfo.gr}>
          <LevelMeter
            className="gr"
            value$={band.gr$}
            min={0}
            max={60}
            base={0}
            reverse
            label="GR"
            show_scale
            falling={0}
            auto_hold={800}
            scale="log2"
            log_factor={5}
            levels={[1, 3, 6, 12]}
            gradient={GR_GRADIENT}
          />
        </WithInfo>
        <DynamicsChart
          threshold$={band.threshold$}
          ratio$={band.ratio$}
          makeup$={band.makeup$}
          knee$={band.knee$}
          point$={point$}
          beginEdit={() => {
            band.beginEdit('threshold');
            band.beginEdit('ratio');
          }}
          endEdit={() => {
            band.endEdit('threshold');
            band.endEdit('ratio');
          }}
        />
      </div>
    </div>
  );
}

export function MbcompUI(props: MbcompUIProps) {
  const { host } = props;
  const numBands = Math.max(
    MBCOMP_MIN_BANDS,
    Math.min(
      MBCOMP_MAX_BANDS,
      Math.round(useDynamicValueReadonly(host.numBands$, 4)),
    ),
  );
  const slope = useDynamicValueReadonly(host.slope$, 48);
  const selected = Math.min(
    numBands - 1,
    useDynamicValueReadonly(host.selectedBandIndex$, 0),
  );
  const xoverValues = useNumberValues(host.xover$);
  const editorWidth = host.meta.editor.width;

  const setNumBands = useCallback(
    (n: number) => {
      const next = Math.max(MBCOMP_MIN_BANDS, Math.min(MBCOMP_MAX_BANDS, n));
      if (next === Math.round(host.numBands$.value)) return;
      host.beginEdit(paramIds.num_bands);
      host.numBands$.set(next);
      host.endEdit(paramIds.num_bands);
    },
    [host],
  );

  const selectBand = useCallback(
    (index: number) => host.selectedBandIndex$.set(index),
    [host],
  );

  const bandEdges = useMemo(() => {
    return Array.from({ length: numBands }, (_, b) => ({
      lo: b === 0 ? MB_FREQ_MIN : (xoverValues[b - 1] ?? MB_FREQ_MIN),
      hi: b >= numBands - 1 ? MB_FREQ_MAX : (xoverValues[b] ?? MB_FREQ_MAX),
    }));
  }, [numBands, xoverValues]);

  const topSegments = useMemo<BandBridgeSegment[]>(
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

  const bottomSegments = useMemo<BandBridgeSegment[]>(() => {
    const strip = stripSpan(selected, numBands, editorWidth);
    return [{ in1: strip.from, in2: strip.to, out1: 0, out2: 1 }];
  }, [editorWidth, numBands, selected]);

  const selectedBand = host.bands[selected] ?? host.bands[0]!;
  const thresholds$ = useMemo(
    () => host.bands.map((band) => band.threshold$),
    [host.bands],
  );
  const grs$ = useMemo(() => host.bands.map((band) => band.gr$), [host.bands]);
  const bypasses$ = useMemo(
    () => host.bands.map((band) => band.bypass$),
    [host.bands],
  );
  const listens$ = useMemo(
    () => host.bands.map((band) => band.listen$),
    [host.bands],
  );

  return (
    <div className="MbcompUI PluginUI">
      <Header title="Multiband Compressor" io={host.io}>
        <WithInfo title={mbcompInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={mbcompInfo.slope} className="info-block slope">
          <Buttons
            entries={MBCOMP_SLOPE_ENTRIES}
            value={slope}
            onChange={(v) => {
              host.beginEdit(paramIds.slope);
              host.slope$.set(v);
              host.endEdit(paramIds.slope);
            }}
          />
        </WithInfo>
        <WithInfo title={mbcompInfo.numBands} className="info-block bandcount">
          <div className="bandcount">
            <Button
              label="−"
              onClick={() => setNumBands(numBands - 1)}
              disabled={numBands <= MBCOMP_MIN_BANDS}
            />
            <Button
              label="+"
              onClick={() => setNumBands(numBands + 1)}
              disabled={numBands >= MBCOMP_MAX_BANDS}
            />
          </div>
        </WithInfo>
      </Header>

      <MultibandChart
        bandCount={numBands}
        slope$={host.slope$}
        threshold$={thresholds$}
        gr$={grs$}
        xover$={host.xover$}
        bypass$={bypasses$}
        listen$={listens$}
        selectedBand={selected}
        onSelectBand={selectBand}
        thresholdEdit={(index) => ({
          beginEdit: () => host.bands[index]?.beginEdit('threshold'),
          endEdit: () => host.bands[index]?.endEdit('threshold'),
        })}
        xoverEdit={(index) => ({
          beginEdit: () => host.beginEdit(XOVER_PARAM_IDS[index]!),
          endEdit: () => host.endEdit(XOVER_PARAM_IDS[index]!),
        })}
      />

      <BandBridgeChart segments={topSegments} className="bridge top" />

      <div className="strips">
        {host.bands.slice(0, numBands).map((band) => (
          <BandStrip
            key={band.id}
            band={band}
            selected={band.index === selected}
            showMakeup={numBands < 5}
            onSelect={selectBand}
          />
        ))}
      </div>

      <BandBridgeChart segments={bottomSegments} className="bridge bottom" />

      <BandDetail band={selectedBand} point$={host.point$} />
    </div>
  );
}
