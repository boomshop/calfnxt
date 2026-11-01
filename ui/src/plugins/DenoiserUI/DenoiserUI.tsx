import { useMemo } from 'react';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Buttons,
  ConfirmButton,
  DenoiserChart,
  Knob,
  ProfileMiniSpectrum,
  Select,
  Toggle,
  WithInfo,
} from '../../widgets';
import { FREQUENCY_RANGE_MODE_ENTRIES } from '../../widgets/FrequencyRange/FrequencyRange';
import { paramIds } from '../../generated/denoiserModel';
import {
  DENOISER_DETECT_ENTRIES,
  DENOISER_PROFILE_MODE_ENTRIES,
  DENOISER_QUALITY_ENTRIES,
  DENOISER_SPECTRUM_ENTRIES,
  denoiserParamDefault,
  denoiserQualityFft,
  type DenoiserProfileSlot,
  type IDenoiserHost,
} from '../../host/denoiserHost';
import { denoiserInfo } from './denoiserInfo';
import '../PluginUI.scss';
import './DenoiserUI.scss';

export interface DenoiserUIProps {
  host: IDenoiserHost;
}

const PROFILE_DOTS = [1, 2, 3];
const PROFILE_LABELS = PROFILE_DOTS.map((n) => ({ pos: n, label: String(n) }));

const BLEND_DOTS = [10, 50, 100, 250, 500, 1000, 2000, 3000, 4000, 5000];
const BLEND_LABELS = [
  { pos: 10, label: '10' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
  { pos: 2000, label: '2s' },
  { pos: 3000, label: '3s' },
  { pos: 4000, label: '4s' },
  { pos: 5000, label: '5s' },
];

const UNIT_DOTS = [0, 0.25, 0.5, 0.75, 1];
const UNIT_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '0.25' },
  { pos: 0.5, label: '0.5' },
  { pos: 0.75, label: '0.75' },
  { pos: 1, label: '1' },
];

const FLOOR_DOTS = [-60, -48, -36, -24, -18, -12, -6, 0];
const FLOOR_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -48, label: '−48' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: 0, label: '0' },
];

const OFFSET_DOTS = [0, 6, 12, 18, 24];
const OFFSET_LABELS = OFFSET_DOTS.map((n) => ({ pos: n, label: String(n) }));

const OCTAVE_FRACTIONS = [
  { pos: 0, label: '0' },
  { pos: 1 / 8, label: '1/8' },
  { pos: 1 / 4, label: '1/4' },
  { pos: 1 / 3, label: '1/3' },
  { pos: 1 / 2, label: '1/2' },
  { pos: 1, label: '1' },
];

function formatOctave(v: number): string {
  for (const f of OCTAVE_FRACTIONS) {
    if (Math.abs(v - f.pos) < 0.008) return f.label;
  }
  return v.toFixed(2);
}

const SPAN_DOTS = [3, 6, 12, 18, 24];
const SPAN_LABELS = [
  { pos: 3, label: '3' },
  { pos: 6, label: '6' },
  { pos: 12, label: '12' },
  { pos: 18, label: '18' },
  { pos: 24, label: '24' },
];

const HP_LP_DOTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const HP_LP_LABELS = [
  { pos: 20, label: '20' },
  { pos: 100, label: '100' },
  { pos: 1000, label: '1k' },
  { pos: 10000, label: '10k' },
  { pos: 20000, label: '20k' },
];

const LISTEN_SLOTS = ['listenSlot1$', 'listenSlot2$', 'listenSlot3$'] as const;
const LEARN_SLOTS = ['learnSlot1$', 'learnSlot2$', 'learnSlot3$'] as const;
const PROFILE_SERIES = ['profile1$', 'profile2$', 'profile3$'] as const;

function ProfileCard(props: {
  host: IDenoiserHost;
  slot: number;
  data: DenoiserProfileSlot;
  active: boolean;
  /** This slot is one side of a fractional Profile mix. */
  mix: boolean;
  /** Current Quality plain, so Add/Learn follows the FFT grid. */
  quality: number;
  listen$: IDenoiserHost['listenSlot1$'];
  learn$: IDenoiserHost['learnSlot1$'];
  tilt: number;
}) {
  const { host, slot, data, active, mix, quality, listen$, learn$, tilt } =
    props;
  // Add continues the average. A Quality change stores a different FFT
  // length, so the next capture replaces the fingerprint.
  const canAdd =
    data.valid &&
    (data.fft == null || data.fft === denoiserQualityFft(quality));

  return (
    <div
      className={`block profile-card${active ? ' active' : ''}${mix ? ' mix' : ''}${data.valid ? ' valid' : ''}`}
      onClick={() => host.selectProfile(slot)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          host.selectProfile(slot);
        }
      }}>
      <div className="title">Profile {slot}</div>
      <WithInfo title={denoiserInfo.selectCard} className="info-block mini">
        <div
          className="ProfileMiniSpectrum"
          onClick={(e) => e.stopPropagation()}>
          <WithInfo title={denoiserInfo.listen}>
            <Toggle
              state$={listen$}
              icon="headphones"
              className="listen warn"
            />
          </WithInfo>
          <ProfileMiniSpectrum
            data$={host[PROFILE_SERIES[slot - 1]!]}
            tilt={tilt}
          />
        </div>
      </WithInfo>
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        <WithInfo title={denoiserInfo.learn}>
          <Toggle
            state$={learn$}
            label={canAdd ? 'Add' : 'Learn'}
            className="warn"
          />
        </WithInfo>
        <WithInfo title={denoiserInfo.clear}>
          <ConfirmButton
            label="Clear"
            label_confirm="Sure?"
            icon_confirm={false}
            onConfirmed={() => host.clearProfile(slot)}
          />
        </WithInfo>
      </div>
    </div>
  );
}

export function DenoiserUI(props: DenoiserUIProps) {
  const { host } = props;
  const edit = useMemo(() => {
    const gesture = (id: number) => ({
      beginEdit: () => host.beginEdit(id),
      endEdit: () => host.endEdit(id),
    });
    return {
      f_lo: gesture(paramIds.f_lo),
      f_hi: gesture(paramIds.f_hi),
      profile: gesture(paramIds.profile),
      amount: gesture(paramIds.amount),
      span: gesture(paramIds.span),
      floor: gesture(paramIds.floor),
      offset: gesture(paramIds.offset),
      octave: gesture(paramIds.octave),
      blend: gesture(paramIds.blend),
    };
  }, [host]);

  const quality = Math.round(useDynamicValueReadonly(host.quality$, 1));
  const spectrum = Math.round(useDynamicValueReadonly(host.spectrum$, 1));
  const profile = useDynamicValueReadonly(host.profile$, 1);
  const profileMode = Math.round(useDynamicValueReadonly(host.profileMode$, 0));
  const detect = Math.round(useDynamicValueReadonly(host.detect$, 0));
  const profiles = useDynamicValueReadonly(host.profiles$, [
    { i: 1, valid: false, db: [] },
    { i: 2, valid: false, db: [] },
    { i: 3, valid: false, db: [] },
  ]);

  return (
    <div className="DenoiserUI PluginUI">
      <Header title="Denoiser">
        <WithInfo title={denoiserInfo.mono}>
          <Toggle state$={host.mono$} icon="stereo" icon_active="mono" />
        </WithInfo>
        <WithInfo title={denoiserInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={denoiserInfo.diffListen}>
          <Toggle
            state$={host.diffListen$}
            icon="headphones"
            className="warn"
          />
        </WithInfo>
        <WithInfo title={denoiserInfo.spectrum} className="info-block">
          <Buttons
            layout="horizontal"
            entries={[...DENOISER_SPECTRUM_ENTRIES]}
            value={spectrum}
            onChange={(v) => {
              host.beginEdit(paramIds.spectrum);
              host.spectrum$.set(v as number);
              host.endEdit(paramIds.spectrum);
            }}
          />
        </WithInfo>
      </Header>

      <DenoiserChart
        spectrum$={host.spectrumData$}
        profileSpectrum$={host.profileSpectrum$}
        offset$={host.offset$}
        span$={host.span$}
        gr$={host.grResponse$}
        spectrumTilt={spectrum}
        fLo$={host.fLo$}
        fHi$={host.fHi$}
        fLoSlope$={host.fLoSlope$}
        fHiSlope$={host.fHiSlope$}
        fLoEdit={edit.f_lo}
        fHiEdit={edit.f_hi}
      />

      <div className="profiles">
        {[1, 2, 3].map((slot) => (
          <ProfileCard
            key={slot}
            host={host}
            slot={slot}
            data={profiles[slot - 1] ?? { i: slot, valid: false, db: [] }}
            active={Math.abs(profile - slot) < 0.05}
            mix={
              profile - Math.floor(profile) > 0.05 &&
              (slot === Math.floor(profile) ||
                slot === Math.floor(profile) + 1) &&
              Math.abs(profile - slot) >= 0.05
            }
            quality={quality}
            listen$={host[LISTEN_SLOTS[slot - 1]!]}
            learn$={host[LEARN_SLOTS[slot - 1]!]}
            tilt={spectrum}
          />
        ))}
      </div>

      <div className="filter block">
        <div className="title">Filter</div>
        <WithInfo title={denoiserInfo.fLoSlope} className="slope">
          <Select
            value$={host.fLoSlope$}
            entries={FREQUENCY_RANGE_MODE_ENTRIES}
          />
        </WithInfo>
        <WithInfo title={denoiserInfo.fLo}>
          <Knob
            label="HP Hz"
            value$={host.fLo$}
            min={20}
            max={20000}
            reset={denoiserParamDefault('f_lo')}
            scale="frequency"
            dots={HP_LP_DOTS}
            labels={HP_LP_LABELS}
            size="small"
            {...edit.f_lo}
          />
        </WithInfo>
        <WithInfo title={denoiserInfo.fHi}>
          <Knob
            label="LP Hz"
            value$={host.fHi$}
            min={20}
            max={20000}
            reset={denoiserParamDefault('f_hi')}
            scale="frequency"
            dots={HP_LP_DOTS}
            labels={HP_LP_LABELS}
            size="small"
            {...edit.f_hi}
          />
        </WithInfo>
        <WithInfo title={denoiserInfo.fHiSlope} className="slope">
          <Select
            value$={host.fHiSlope$}
            entries={FREQUENCY_RANGE_MODE_ENTRIES}
          />
        </WithInfo>
      </div>

      <div className="quality block">
        <div className="title">Quality</div>
        <WithInfo title={denoiserInfo.quality} className="info-block quality">
          <Buttons
            layout="horizontal"
            entries={[...DENOISER_QUALITY_ENTRIES]}
            value={quality}
            onChange={(v) => {
              host.beginEdit(paramIds.quality);
              host.quality$.set(v as number);
              host.endEdit(paramIds.quality);
            }}
          />
        </WithInfo>
      </div>

      <div className="block process">
        <div className="title">Process</div>
        <div className="col">
          <WithInfo title={denoiserInfo.profileMode} className="profile-mode">
            <Buttons
              layout="horizontal"
              entries={[...DENOISER_PROFILE_MODE_ENTRIES]}
              value={profileMode}
              onChange={(v) => {
                const mode = Math.round(v as number);
                host.beginEdit(paramIds.profile_mode);
                host.profileMode$.set(mode);
                host.endEdit(paramIds.profile_mode);
                if (mode === 0) {
                  const snapped = Math.min(3, Math.max(1, Math.round(profile)));
                  if (Math.abs(profile - snapped) > 1e-3) {
                    host.beginEdit(paramIds.profile);
                    host.profile$.set(snapped);
                    host.endEdit(paramIds.profile);
                  }
                }
              }}
            />
          </WithInfo>
          <WithInfo title={denoiserInfo.profile} className="profile">
            <Knob
              key={profileMode}
              label="Profile"
              value$={host.profile$}
              min={1}
              max={3}
              {...(profileMode === 0 ? { snap: 1 } : {})}
              reset={denoiserParamDefault('profile')}
              dots={PROFILE_DOTS}
              labels={PROFILE_LABELS}
              size="large"
              {...{
                'value.format': (v: number) =>
                  profileMode === 0 ? `${Math.round(v)}` : v.toFixed(1),
              }}
              {...edit.profile}
              start={135}
              angle={90}
              basis={120}
              reverse
            />
          </WithInfo>
          <WithInfo title={denoiserInfo.detect} className="detect">
            <Buttons
              layout="horizontal"
              entries={[...DENOISER_DETECT_ENTRIES]}
              value={detect}
              onChange={(v) => {
                host.beginEdit(paramIds.detect);
                host.detect$.set(v as number);
                host.endEdit(paramIds.detect);
              }}
            />
          </WithInfo>
        </div>
        <div className="col">
          <WithInfo title={denoiserInfo.amount}>
            <Knob
              label="Amount"
              value$={host.amount$}
              min={0}
              max={1}
              reset={denoiserParamDefault('amount')}
              dots={UNIT_DOTS}
              labels={UNIT_LABELS}
              size="large"
              {...{
                'value.format': (v: number) => `${Math.round(v * 100)}`,
              }}
              {...edit.amount}
            />
          </WithInfo>
          <WithInfo title={denoiserInfo.octave} className="octave">
            <Knob
              label="Octave"
              value$={host.octave$}
              min={0}
              max={1}
              reset={denoiserParamDefault('octave')}
              scale="log2"
              log_factor={3}
              dots={OCTAVE_FRACTIONS.map((f) => f.pos)}
              labels={OCTAVE_FRACTIONS}
              size="small"
              {...{ 'value.format': formatOctave }}
              {...edit.octave}
            />
          </WithInfo>
        </div>
        <div className="col">
          <WithInfo title={denoiserInfo.span}>
            <Knob
              label="Span"
              value$={host.span$}
              min={3}
              max={24}
              reset={denoiserParamDefault('span')}
              dots={SPAN_DOTS}
              labels={SPAN_LABELS}
              size="medium"
              {...{
                'value.format': (v: number) => `${v.toFixed(1)}`,
              }}
              {...edit.span}
            />
          </WithInfo>
          <WithInfo title={denoiserInfo.floor}>
            <Knob
              label="Floor"
              value$={host.floor$}
              min={-60}
              max={0}
              reset={denoiserParamDefault('floor')}
              dots={FLOOR_DOTS}
              labels={FLOOR_LABELS}
              size="medium"
              {...{
                'value.format': (v: number) => `${v.toFixed(1)}`,
              }}
              {...edit.floor}
            />
          </WithInfo>
        </div>
        <div className="col">
          <WithInfo title={denoiserInfo.offset}>
            <Knob
              label="Offset"
              value$={host.offset$}
              min={0}
              max={24}
              reset={denoiserParamDefault('offset')}
              dots={OFFSET_DOTS}
              labels={OFFSET_LABELS}
              size="medium"
              {...{
                'value.format': (v: number) => `${v.toFixed(1)}`,
              }}
              {...edit.offset}
            />
          </WithInfo>
          <WithInfo title={denoiserInfo.blend}>
            <Knob
              label="Blend"
              value$={host.blend$}
              min={10}
              max={5000}
              reset={denoiserParamDefault('blend')}
              scale="log2"
              log_factor={4}
              dots={BLEND_DOTS}
              labels={BLEND_LABELS}
              size="medium"
              {...{ 'value.format': (v: number) => `${Math.round(v)}` }}
              {...edit.blend}
            />
          </WithInfo>
        </div>
      </div>
    </div>
  );
}
