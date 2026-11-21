import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EQChart,
  Button,
  Buttons,
  Knob,
  Select,
  Toggle,
  WithInfo,
} from '../../widgets';
import { formatHz } from '../../utils/formatHz';
import {
  EQ_DEFAULT_SELECTED_INDEX,
  EQ_DYN_ATTACK_MAX,
  EQ_DYN_ATTACK_MIN,
  EQ_DYN_RATIO_MAX,
  EQ_DYN_RATIO_MIN,
  EQ_DYN_RELEASE_MAX,
  EQ_DYN_RELEASE_MIN,
  EQ_DYN_THRESH_MAX,
  EQ_DYN_THRESH_MIN,
  EQ_FILTER_TYPE_ENTRIES,
  EQ_FREQ_MAX,
  EQ_FREQ_MIN,
  EQ_CHART_RANGE_DEFAULT,
  EQ_CHART_RANGE_MAX,
  EQ_CHART_RANGE_MIN,
  type IEqualizerHost,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_PASS_SLOPE_ENTRIES,
  EQ_Q_MAX,
  EQ_Q_MIN,
  EQ_SPECTRUM_ENTRIES,
  EQ_DYN_MODE_ENTRIES,
  EQ_CHANNEL_ENTRIES,
  bandSupportsDyn,
  eqChannelClass,
  isPassFilter,
  miniBandYRange,
  type EqFilterType,
  type IEqualizerBand,
} from '../../host/equalizerHost';
import {
  paramIds,
  bandParamId,
  EQ_BAND_OFFSET,
} from '../../generated/equalizerModel';
import '../PluginUI.scss';
import './EqualizerUI.scss';
import { Header } from '../../components';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { onEqFile } from '../../utils/bind_param';
import { postToHost } from '../../utils/bridge';
import { equalizerInfo } from './equalizerInfo';
import {
  importRewBase64,
  importRewFile,
  type RewBand,
  type RewImport,
} from './rewImport';

/** Ring ticks / labels for EQ control knobs (Circular `labels` / `dots`). */
const EQ_FREQ_DOTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const EQ_FREQ_LABELS = [
  { pos: 20, label: '20' },
  { pos: 100, label: '100' },
  { pos: 1000, label: '1k' },
  { pos: 3000, label: '3k' },
  { pos: 10000, label: '10k' },
  { pos: 20000, label: '20k' },
];
const EQ_GAIN_DOTS = [-36, -24, -12, -6, 0, 6, 12, 24, 36];
const EQ_GAIN_LABELS = [
  { pos: -36, label: '−36' },
  { pos: -18, label: '−18' },
  { pos: 0, label: '0' },
  { pos: 18, label: '+18' },
  { pos: 36, label: '+36' },
];
const EQ_Q_DOTS = [0.1, 0.5, 0.707, 1, 2, 5, 10, 20, 30];
const EQ_Q_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 0.7, label: '0.7' },
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 5, label: '5' },
  { pos: 10, label: '10' },
  { pos: 30, label: '30' },
];

/** Dyn section — keep in sync with CompressorUI knob scales. */
const EQ_DYN_ATTACK_DOTS = [0.1, 1, 5, 10, 20, 50, 100, 250, 500];
const EQ_DYN_ATTACK_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 1, label: '1' },
  { pos: 10, label: '10' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
];

const EQ_DYN_RELEASE_DOTS = [1, 10, 50, 100, 200, 500, 1000, 2000];
const EQ_DYN_RELEASE_LABELS = [
  { pos: 1, label: '1' },
  { pos: 100, label: '100' },
  { pos: 200, label: '200' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1000' },
  { pos: 2000, label: '2000' },
];

const EQ_DYN_THRESH_DOTS = [-60, -48, -36, -24, -12, -6, 0];
const EQ_DYN_THRESH_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -48, label: '−48' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: -6, label: '−6' },
  { pos: 0, label: '0' },
];

const EQ_DYN_RATIO_DOTS = [1, 2, 4, 8, 12, 20];
const EQ_DYN_RATIO_LABELS = EQ_DYN_RATIO_DOTS.map((n) => ({
  pos: n,
  label: String(n),
}));

const EQ_RANGE_DOTS = [12, 18, 24, 30, 36];
const EQ_RANGE_LABELS = [
  { pos: 12, label: '12' },
  { pos: 24, label: '24' },
  { pos: 36, label: '36' },
];
/** Handle limits stay at the gain range so the chart zoom does not rewrite bands. */
const EQ_HANDLE_Y = { min: EQ_GAIN_MIN, max: EQ_GAIN_MAX };

function applyRewBands(host: IEqualizerHost, specs: RewBand[]) {
  let peakGain = 0;
  for (const spec of specs) {
    if (spec.type === 'lowpass' || spec.type === 'highpass') continue;
    peakGain = Math.max(peakGain, Math.abs(spec.gain));
  }
  host.bands.forEach((band, i) => {
    const spec = specs[i];
    const id = (offset: number) => bandParamId(i, offset);
    const edit = (param: number, write: () => void) => {
      host.beginEdit(param);
      write();
      host.endEdit(param);
    };
    // Dyn off first so the static curve follows the imported gain.
    edit(id(EQ_BAND_OFFSET.dyn), () => band.dyn$.set(false));
    edit(id(EQ_BAND_OFFSET.dyn_listen), () => band.listen$.set(false));
    if (!spec) {
      edit(id(EQ_BAND_OFFSET.active), () => band.active$.set(false));
      return;
    }
    // Type is set before gain/Q/slope. A type change restores remembered
    // siblings, and the writes below replace them with the file.
    edit(id(EQ_BAND_OFFSET.type), () => band.type$.set(spec.type));
    edit(id(EQ_BAND_OFFSET.slope), () => band.slope$.set(spec.slope));
    edit(id(EQ_BAND_OFFSET.freq), () => band.frequency$.set(spec.freq));
    edit(id(EQ_BAND_OFFSET.gain), () => band.gain$.set(spec.gain));
    edit(id(EQ_BAND_OFFSET.q), () => band.q$.set(spec.q));
    edit(id(EQ_BAND_OFFSET.channel), () => band.channel$.set(0));
    edit(id(EQ_BAND_OFFSET.active), () => band.active$.set(true));
  });
  if (peakGain > host.range$.value) {
    const next = Math.min(
      EQ_CHART_RANGE_MAX,
      Math.max(EQ_CHART_RANGE_MIN, Math.ceil(peakGain / 6) * 6),
    );
    if (next > host.range$.value) {
      host.beginEdit(paramIds.range);
      host.range$.set(next);
      host.endEdit(paramIds.range);
    }
  }
}

export interface EqualizerUIProps {
  host: IEqualizerHost;
}

function BandRow(props: {
  band: IEqualizerBand;
  index: number;
  selected: boolean;
  mono: boolean;
  onSelect: (id: string) => void;
}) {
  const { band, index, selected, mono, onSelect } = props;
  const active = useDynamicValueReadonly(band.active$, false);
  const freq = useDynamicValueReadonly(band.frequency$, 0);
  const gain = useDynamicValueReadonly(band.effectiveGain$, 0);
  const filterType = useDynamicValueReadonly<EqFilterType>(
    band.type$,
    'parametric',
  );
  const dyn = useDynamicValueReadonly(band.dyn$, false);
  const listen = useDynamicValueReadonly(band.listen$, false);
  const channel = useDynamicValueReadonly(band.channel$, 0);
  const dynActive = bandSupportsDyn(filterType) && dyn;
  const miniY = useMemo(
    () => miniBandYRange(gain, filterType),
    [gain, filterType],
  );
  // Global Mono always runs the Left path — stripe shows Stereo, not L/R/M/S.
  const freqChannelClass =
    active && !mono
      ? eqChannelClass(channel)
      : active && mono
        ? 'ch-stereo'
        : undefined;

  useEffect(() => {
    return band.active$.subscribe(() => onSelect(band.id), false);
  }, [band.active$, band.id, onSelect]);

  return (
    <div
      className={[
        'band',
        selected && 'selected',
        active && 'active',
        dynActive && 'dyn',
      ]
        .filter(Boolean)
        .join(' ')}>
      <button
        type="button"
        className={['mini', dynActive && 'dyn', listen && 'listen']
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelect(band.id)}
        aria-label={`Select band ${index + 1}`}>
        <span className={['freq', freqChannelClass].filter(Boolean).join(' ')}>
          {formatHz(freq)}
        </span>
        <EQChart
          bands={[band]}
          size="mini"
          interactive={false}
          yRange={miniY}
          className={active ? undefined : 'eq-band-off'}
        />
      </button>
      <Toggle
        state$={band.active$}
        label={String(index + 1)}
        className="band-active"
        icon={filterType}
      />
    </div>
  );
}

function BandControls(props: {
  band: IEqualizerBand;
  host: IEqualizerHost;
  mono: boolean;
}) {
  const { band, host, mono } = props;
  const filterType = useDynamicValueReadonly<EqFilterType>(
    band.type$,
    'parametric',
  );
  const dynMode = useDynamicValueReadonly(band.dynMode$, 0);
  const channel = useDynamicValueReadonly(band.channel$, 0);
  const pass = isPassFilter(filterType);
  const canDyn = bandSupportsDyn(filterType);
  return (
    <div className="controls" data-band={band.id}>
      <div className="block eq">
        <div className="title">Band {band.index + 1}</div>
        {!mono ? (
          <WithInfo
            title={equalizerInfo.channel}
            className="info-block channel">
            <Buttons
              layout="vertical"
              entries={EQ_CHANNEL_ENTRIES}
              value={Math.round(channel)}
              onChange={(v) => {
                const id = bandParamId(band.index, EQ_BAND_OFFSET.channel);
                host.beginEdit(id);
                band.channel$.set(v as number);
                host.endEdit(id);
              }}
            />
          </WithInfo>
        ) : null}
        <div className="eq-main">
          <WithInfo title={equalizerInfo.type}>
            <Select value$={band.type$} entries={EQ_FILTER_TYPE_ENTRIES} />
          </WithInfo>
          {pass ? (
            <WithInfo title={equalizerInfo.slope}>
              <Select
                className="slope"
                value$={band.slope$}
                entries={EQ_PASS_SLOPE_ENTRIES}
              />
            </WithInfo>
          ) : null}
          <WithInfo title={equalizerInfo.freq}>
            <Knob
              value$={band.frequency$}
              min={EQ_FREQ_MIN}
              max={EQ_FREQ_MAX}
              reset={band.defaults.frequency}
              label="Freq"
              size={pass ? 'large' : 'medium'}
              scale="frequency"
              dots={EQ_FREQ_DOTS}
              labels={EQ_FREQ_LABELS}
            />
          </WithInfo>
          {!pass ? (
            <WithInfo title={equalizerInfo.gain}>
              <Knob
                value$={band.gain$}
                min={EQ_GAIN_MIN}
                max={EQ_GAIN_MAX}
                reset={band.defaults.gain}
                label="Gain"
                size="large"
                base={0}
                dots={EQ_GAIN_DOTS}
                labels={EQ_GAIN_LABELS}
                {...{
                  'value.format': (v: number) => v.toFixed(1),
                }}
              />
            </WithInfo>
          ) : null}
          <WithInfo title={equalizerInfo.q}>
            <Knob
              value$={band.q$}
              min={EQ_Q_MIN}
              max={EQ_Q_MAX}
              reset={band.defaults.q}
              label="Q"
              size="medium"
              scale="log2"
              log_factor={4}
              dots={EQ_Q_DOTS}
              labels={EQ_Q_LABELS}
              {...{
                'value.format': (v: number) => v.toFixed(2),
              }}
            />
          </WithInfo>
          <WithInfo title={equalizerInfo.active} className="power">
            <Toggle state$={band.active$} icon="power" />
          </WithInfo>
        </div>
      </div>
      {canDyn ? (
        <div className="block dyn">
          <div className="title">Dynamics</div>

          <WithInfo title={equalizerInfo.dynThresh} className="thresh">
            <Knob
              value$={band.dynThreshold$}
              min={EQ_DYN_THRESH_MIN}
              max={EQ_DYN_THRESH_MAX}
              reset={band.defaults.dynThreshold}
              label="Thresh"
              base={0}
              dots={EQ_DYN_THRESH_DOTS}
              labels={EQ_DYN_THRESH_LABELS}
              enabled$={band.dyn$}
              {...{
                'value.format': (v: number) => v.toFixed(1),
              }}
            />
          </WithInfo>

          <WithInfo title={equalizerInfo.dynAttack} className="attack">
            <Knob
              value$={band.dynAttack$}
              min={EQ_DYN_ATTACK_MIN}
              max={EQ_DYN_ATTACK_MAX}
              reset={band.defaults.dynAttack}
              label="Attack"
              size="small"
              scale="log2"
              log_factor={4}
              dots={EQ_DYN_ATTACK_DOTS}
              labels={EQ_DYN_ATTACK_LABELS}
              enabled$={band.dyn$}
              {...{
                'value.format': (v: number) => `${v.toFixed(1)}`,
              }}
            />
          </WithInfo>

          <WithInfo title={equalizerInfo.dynRatio} className="ratio">
            <Knob
              value$={band.dynRatio$}
              min={EQ_DYN_RATIO_MIN}
              max={EQ_DYN_RATIO_MAX}
              reset={band.defaults.dynRatio}
              label="Ratio"
              scale="log2"
              log_factor={4}
              dots={EQ_DYN_RATIO_DOTS}
              labels={EQ_DYN_RATIO_LABELS}
              enabled$={band.dyn$}
              {...{
                'value.format': (v: number) => `${v.toFixed(1)}:1`,
              }}
            />
          </WithInfo>

          <WithInfo title={equalizerInfo.dynRelease} className="release">
            <Knob
              value$={band.dynRelease$}
              min={EQ_DYN_RELEASE_MIN}
              max={EQ_DYN_RELEASE_MAX}
              reset={band.defaults.dynRelease}
              label="Release"
              size="small"
              scale="log2"
              log_factor={4}
              dots={EQ_DYN_RELEASE_DOTS}
              labels={EQ_DYN_RELEASE_LABELS}
              enabled$={band.dyn$}
              {...{
                'value.format': (v: number) => `${v.toFixed(0)}`,
              }}
            />
          </WithInfo>

          <div className="buttons">
            <WithInfo title={equalizerInfo.dyn} className="power">
              <Toggle state$={band.dyn$} icon="power" />
            </WithInfo>

            <WithInfo title={equalizerInfo.dynMode} className="info-block mode">
              <Buttons
                entries={EQ_DYN_MODE_ENTRIES}
                value={Math.round(dynMode)}
                enabled$={band.dyn$}
                layout="vertical"
                onChange={(v) => {
                  const id = bandParamId(band.index, EQ_BAND_OFFSET.dyn_mode);
                  host.beginEdit(id);
                  band.dynMode$.set(v as number);
                  host.endEdit(id);
                }}
              />
            </WithInfo>

            <WithInfo title={equalizerInfo.listen} className="listen">
              <Toggle
                state$={band.listen$}
                icon="headphones"
                className="warn"
                enabled$={band.dyn$}
              />
            </WithInfo>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EqualizerUI(props: EqualizerUIProps) {
  const { host } = props;
  const bands = host.bands;
  const spectrumMode = useDynamicValueReadonly(host.spectrum$, 0);
  const mono = useDynamicValueReadonly(host.mono$, false);
  const chartRange = useDynamicValueReadonly(
    host.range$,
    EQ_CHART_RANGE_DEFAULT,
  );
  const chartYRange = useMemo(
    () => ({ min: -chartRange, max: chartRange }),
    [chartRange],
  );
  const [selectedBandId, setSelectedBandId] = useState(
    () =>
      bands[Math.round(host.selectedBandIndex$.value)]?.id ??
      bands[EQ_DEFAULT_SELECTED_INDEX]?.id ??
      bands[0]?.id ??
      '',
  );

  const selectedBand = useMemo(
    () => bands.find((b) => b.id === selectedBandId) ?? bands[0] ?? null,
    [bands, selectedBandId],
  );

  useEffect(() => {
    const unsub = host.selectedBandIndex$.subscribe((idx) => {
      const i = Math.max(0, Math.min(bands.length - 1, Math.round(idx)));
      const id = bands[i]?.id;
      if (id) setSelectedBandId(id);
    });
    return () => unsub();
  }, [host.selectedBandIndex$, bands]);

  useEffect(() => {
    if (!bands.some((b) => b.id === selectedBandId) && bands[0]) {
      const fallback = bands[EQ_DEFAULT_SELECTED_INDEX]?.id ?? bands[0].id;
      setSelectedBandId(fallback);
      host.selectedBandIndex$.set(bands.findIndex((b) => b.id === fallback));
    }
  }, [bands, selectedBandId, host.selectedBandIndex$]);

  const selectBand = useCallback(
    (id: string) => {
      setSelectedBandId(id);
      const idx = bands.findIndex((b) => b.id === id);
      if (idx >= 0) host.selectedBandIndex$.set(idx);
    },
    [bands, host.selectedBandIndex$],
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const [loadNote, setLoadNote] = useState('');
  const applyImport = useCallback(
    (result: RewImport) => {
      setLoadNote(result.summary);
      if (!result.ok) return;
      applyRewBands(host, result.bands);
      const first = bands[0];
      if (first) selectBand(first.id);
    },
    [bands, host, selectBand],
  );

  useEffect(() => {
    return onEqFile((msg) => {
      if (msg.cmd === 'error') {
        setLoadNote(msg.msg || 'Could not read that file.');
        return;
      }
      if (msg.cmd === 'text' && msg.b64) applyImport(importRewBase64(msg.b64));
    });
  }, [applyImport]);

  const onLoad = () => {
    if (window.calfnxtNative) {
      postToHost({ t: 'eqfile', cmd: 'browse' });
      return;
    }
    fileRef.current?.click();
  };

  return (
    <div className="EqualizerUI PluginUI">
      <Header title="Equalizer">
        <WithInfo title={equalizerInfo.mono}>
          <Toggle state$={host.mono$} icon="stereo" icon_active="mono" />
        </WithInfo>
        <WithInfo title={equalizerInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={equalizerInfo.spectrum} className="info-block">
          <Buttons
            layout="horizontal"
            entries={[...EQ_SPECTRUM_ENTRIES]}
            value={Math.round(spectrumMode)}
            onChange={(v) => {
              host.beginEdit(paramIds.spectrum);
              host.spectrum$.set(v as number);
              host.endEdit(paramIds.spectrum);
            }}
          />
        </WithInfo>
        <WithInfo title={equalizerInfo.load}>
          <Button icon="load" label={false} onClick={onLoad} />
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              void file.arrayBuffer().then((buf) => {
                applyImport(importRewFile(new Uint8Array(buf)));
              });
            }}
          />
        </WithInfo>
      </Header>

      <WithInfo title={equalizerInfo.chart} className="graph">
        <EQChart
          bands={bands}
          size="normal"
          selectedBandId={selectedBandId}
          onSelectBand={selectBand}
          yRange={chartYRange}
          handleYRange={EQ_HANDLE_Y}
          clipY={false}
          spectrumIn$={host.spectrumIn$}
          spectrumOut$={host.spectrumOut$}
          spectrumMode={Math.round(spectrumMode)}
        />
        <WithInfo title={equalizerInfo.range} className="chart-range">
          <Knob
            value$={host.range$}
            min={EQ_CHART_RANGE_MIN}
            max={EQ_CHART_RANGE_MAX}
            reset={EQ_CHART_RANGE_DEFAULT}
            snap={6}
            size="small"
            label="Range"
            beginEdit={() => host.beginEdit(paramIds.range)}
            endEdit={() => host.endEdit(paramIds.range)}
            dots={EQ_RANGE_DOTS}
            labels={EQ_RANGE_LABELS}
            {...{
              'value.format': (v: number) => `±${Math.round(v)}`,
            }}
          />
        </WithInfo>
        {loadNote ? <p className="eq-load-note">{loadNote}</p> : null}
      </WithInfo>

      {selectedBand ? (
        <BandControls band={selectedBand} host={host} mono={mono} />
      ) : null}

      <div className="bands">
        {bands.map((band, index) => (
          <BandRow
            key={band.id}
            band={band}
            index={index}
            selected={band.id === selectedBandId}
            mono={mono}
            onSelect={selectBand}
          />
        ))}
      </div>
    </div>
  );
}
