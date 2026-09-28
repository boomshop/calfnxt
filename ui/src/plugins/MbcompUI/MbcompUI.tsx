import { useCallback, useMemo } from 'react';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Button,
  Buttons,
  DynamicsChart,
  HistoryChart,
  mbcompHistorySeries,
  Knob,
  LevelMeter,
  MultibandChart,
  Select,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/mbcompModel';
import {
  MBCOMP_CHANNEL_ENTRIES,
  MBCOMP_LINK_ENTRIES,
  MBCOMP_MAX_BANDS,
  MBCOMP_MIN_BANDS,
  MBCOMP_MODE_ENTRIES,
  MBCOMP_SLOPE_ENTRIES,
  MBCOMP_SCALE_ENTRIES,
  type IMbcompBand,
  type IMbcompHost,
} from '../../host/mbcompHost';
import '../PluginUI.scss';
import './MbcompUI.scss';
import { mbcompInfo } from './mbcompInfo';
import { isStudioCapture } from '../../utils/studioFlag';
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

const XOVER_PARAM_IDS = [
  paramIds.xover1,
  paramIds.xover2,
  paramIds.xover3,
  paramIds.xover4,
  paramIds.xover5,
];

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
        'strip block',
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
          windowMs={2000}
          sourceWindowMs={4000}
          autoScale
          className={bypass ? 'disabled' : undefined}
          series={mbcompHistorySeries()}
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
            show_hold={false}
            scale="log2"
            log_factor={3}
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
            show_hold={false}
            scale="log2"
            log_factor={5}
            levels={[1, 3, 6, 12]}
          />
        </WithInfo>
        <DynamicsChart
          key={band.id}
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
  const mono = useDynamicValueReadonly(host.mono$, false);
  const selected = Math.min(
    numBands - 1,
    useDynamicValueReadonly(host.selectedBandIndex$, 0),
  );

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
        <WithInfo title={mbcompInfo.mono}>
          <Toggle state$={host.mono$} icon="stereo" icon_active="mono" />
        </WithInfo>
        <WithInfo title={mbcompInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        {!mono ? (
          <WithInfo title={mbcompInfo.channel} className="info-block">
            <Select value$={host.channel$} entries={MBCOMP_CHANNEL_ENTRIES} />
          </WithInfo>
        ) : null}
        <WithInfo title={mbcompInfo.slope} className="info-block slope">
          <Select value$={host.slope$} entries={MBCOMP_SLOPE_ENTRIES} />
        </WithInfo>
        <WithInfo title={mbcompInfo.scale} className="info-block scale">
          <Select value$={host.scale$} entries={[...MBCOMP_SCALE_ENTRIES]} />
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
        spectrumIn$={host.spectrumIn$}
        spectrumOut$={host.spectrumOut$}
        spectrumScale$={host.scale$}
        thresholdEdit={(index) => ({
          beginEdit: () => host.bands[index]?.beginEdit('threshold'),
          endEdit: () => host.bands[index]?.endEdit('threshold'),
        })}
        xoverEdit={(index) => ({
          beginEdit: () => host.beginEdit(XOVER_PARAM_IDS[index]!),
          endEdit: () => host.endEdit(XOVER_PARAM_IDS[index]!),
        })}
      />

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

      <BandDetail band={selectedBand} point$={host.point$} />
    </div>
  );
}
