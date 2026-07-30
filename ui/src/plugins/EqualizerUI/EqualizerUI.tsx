import { useCallback, useEffect, useMemo, useState } from 'react';
import { EQChart, Icon, Knob, Select, Toggle } from '../../widgets';
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
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_PASS_SLOPE_ENTRIES,
  EQ_Q_MAX,
  EQ_Q_MIN,
  bandSupportsDyn,
  isPassFilter,
  type EqFilterType,
  type IEqualizerBand,
  type IEqualizerHost,
} from '../../host/equalizerHost';
import '../PluginUI.scss';
import './EqualizerUI.scss';
import { Header } from '../../components';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';

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
const EQ_GAIN_DOTS = [-24, -18, -12, -6, 0, 6, 12, 18, 24];
const EQ_GAIN_LABELS = [
  { pos: -24, label: '−24' },
  { pos: -12, label: '12' },
  { pos: 0, label: '0' },
  { pos: 12, label: '+12' },
  { pos: 24, label: '+24' },
];
const EQ_Q_DOTS = [0.1, 0.5, 0.707, 1, 2, 5, 10, 20];
const EQ_Q_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 0.7, label: '0.7' },
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 5, label: '5' },
  { pos: 10, label: '10' },
  { pos: 20, label: '20' },
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
  { pos: 1000, label: '1s' },
  { pos: 2000, label: '2s' },
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

export interface EqualizerUIProps {
  host: IEqualizerHost;
}


function BandRow(props: {
  band: IEqualizerBand;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { band, index, selected, onSelect } = props;
  const active = useDynamicValueReadonly(band.active$, false);
  const filterType = useDynamicValueReadonly<EqFilterType>(band.type$, 'parametric');
  const dyn = useDynamicValueReadonly(band.dyn$, false);
  const listen = useDynamicValueReadonly(band.listen$, false);
  const dynActive = bandSupportsDyn(filterType) && dyn;

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
      <Icon
        icon={filterType}
        size={20}
        className="band-type"
        title={filterType}
        onClick={() => onSelect(band.id)}
      />
      <button
        type="button"
        className={['mini', dynActive && 'dyn', listen && 'listen']
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelect(band.id)}
        aria-label={`Select band ${index + 1}`}>
        <EQChart
          bands={[band]}
          size="mini"
          interactive={false}
          className={active ? undefined : 'eq-band-off'}
        />
      </button>
      <Toggle
        state$={band.active$}
        label={String(index + 1)}
        className="band-active"
      />
    </div>
  );
}

function BandControls(props: { band: IEqualizerBand }) {
  const { band } = props;
  const filterType = useDynamicValueReadonly<EqFilterType>(band.type$, 'parametric');
  const pass = isPassFilter(filterType);
  const canDyn = bandSupportsDyn(filterType);
  const doesDyn = useDynamicValueReadonly(band.dyn$, false);

  return (
    <div className="controls" data-band={band.id}>
      <div className="block eq">
        <Select value$={band.type$} entries={EQ_FILTER_TYPE_ENTRIES} />
        {pass ? (
          <Select
            className="slope"
            value$={band.slope$}
            entries={EQ_PASS_SLOPE_ENTRIES}
          />
        ) : null}
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
          {...{
            'value.format': (v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0),
          }}
        />
        {!pass ? (
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
        ) : null}
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
        <Toggle state$={band.active$} icon="power" />
        <div className="label">Band {band.index + 1}</div>
        <Icon
          icon={filterType}
          size={32}
          className="band-type"
          title={filterType}
        />
      </div>
      {canDyn ? (
        <div className={doesDyn ? 'block dyn active' : 'block dyn inactive'}>
          <div className="title">Dynamics</div>
          <Toggle state$={band.dyn$} icon="power" />
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
            {...{
              'value.format': (v: number) => `${v.toFixed(1)}`,
            }}
          />
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
            {...{
              'value.format': (v: number) => `${v.toFixed(0)}`,
            }}
          />
          <Toggle state$={band.listen$} icon="headphones" className="warn" />
          <Knob
            value$={band.dynThreshold$}
            min={EQ_DYN_THRESH_MIN}
            max={EQ_DYN_THRESH_MAX}
            reset={band.defaults.dynThreshold}
            label="Thresh"
            size="small"
            base={0}
            dots={EQ_DYN_THRESH_DOTS}
            labels={EQ_DYN_THRESH_LABELS}
            {...{
              'value.format': (v: number) => v.toFixed(1),
            }}
          />
          <Knob
            value$={band.dynRatio$}
            min={EQ_DYN_RATIO_MIN}
            max={EQ_DYN_RATIO_MAX}
            reset={band.defaults.dynRatio}
            label="Ratio"
            size="small"
            scale="log2"
            log_factor={4}
            dots={EQ_DYN_RATIO_DOTS}
            labels={EQ_DYN_RATIO_LABELS}
            {...{
              'value.format': (v: number) => `${v.toFixed(1)}:1`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function EqualizerUI(props: EqualizerUIProps) {
  const { host } = props;
  const bands = host.bands;
  const [selectedBandId, setSelectedBandId] = useState(
    () => bands[EQ_DEFAULT_SELECTED_INDEX]?.id ?? bands[0]?.id ?? '',
  );

  const selectedBand = useMemo(
    () => bands.find((b) => b.id === selectedBandId) ?? bands[0] ?? null,
    [bands, selectedBandId],
  );

  useEffect(() => {
    if (!bands.some((b) => b.id === selectedBandId) && bands[0])
      setSelectedBandId(bands[EQ_DEFAULT_SELECTED_INDEX]?.id ?? bands[0].id);
  }, [bands, selectedBandId]);

  const selectBand = useCallback((id: string) => {
    setSelectedBandId(id);
  }, []);

  return (
    <div className="EqualizerUI PluginUI">
      <Header title="Equalizer">
        <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
      </Header>

      <EQChart
        bands={bands}
        size="normal"
        selectedBandId={selectedBandId}
        onSelectBand={selectBand}
      />

      {selectedBand ? <BandControls band={selectedBand} /> : null}

      <div className="bands">
        {bands.map((band, index) => (
          <BandRow
            key={band.id}
            band={band}
            index={index}
            selected={band.id === selectedBandId}
            onSelect={selectBand}
          />
        ))}
      </div>
    </div>
  );
}
