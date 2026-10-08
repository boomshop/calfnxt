import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Buttons,
  ConfirmButton,
  DenoiserChart,
  Knob,
  ProfileMiniSpectrum,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/denoiserModel';
import {
  DENOISER_QUALITY_ENTRIES,
  DENOISER_SPECTRUM_ENTRIES,
  denoiserParamDefault,
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

const LISTEN_SLOTS = ['listenSlot1$', 'listenSlot2$', 'listenSlot3$'] as const;
const LEARN_SLOTS = ['learnSlot1$', 'learnSlot2$', 'learnSlot3$'] as const;

function ProfileCard(props: {
  host: IDenoiserHost;
  slot: number;
  data: DenoiserProfileSlot;
  active: boolean;
  listen$: IDenoiserHost['listenSlot1$'];
  learn$: IDenoiserHost['learnSlot1$'];
  tilt: number;
}) {
  const { host, slot, data, active, listen$, learn$, tilt } = props;

  return (
    <div
      className={`block profile-card${active ? ' active' : ''}${data.valid ? ' valid' : ''}`}
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
            <Toggle state$={listen$} icon="headphones" className="listen warn" />
          </WithInfo>
          <ProfileMiniSpectrum db={data.db} valid={data.valid} tilt={tilt} />
        </div>
      </WithInfo>
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        <WithInfo title={denoiserInfo.learn}>
          <Toggle
            state$={learn$}
            label={data.valid ? 'Add' : 'Learn'}
            className="warn"
          />
        </WithInfo>
        <WithInfo title={denoiserInfo.clear}>
          <ConfirmButton
            label="Clear"
            label_confirm="Sure?"
            onConfirmed={() => host.clearProfile(slot)}
          />
        </WithInfo>
      </div>
    </div>
  );
}

export function DenoiserUI(props: DenoiserUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  const quality = Math.round(useDynamicValueReadonly(host.quality$, 1));
  const spectrum = Math.round(useDynamicValueReadonly(host.spectrum$, 1));
  const profile = Math.round(useDynamicValueReadonly(host.profile$, 1));
  const profiles = useDynamicValueReadonly(host.profiles$, [
    { i: 1, valid: false, db: [] },
    { i: 2, valid: false, db: [] },
    { i: 3, valid: false, db: [] },
  ]);

  return (
    <div className="DenoiserUI PluginUI">
      <Header title="Denoiser">
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
        gr$={host.grResponse$}
        spectrumTilt={spectrum}
        fLo$={host.fLo$}
        fHi$={host.fHi$}
        fLoOn$={host.fLoOn$}
        fHiOn$={host.fHiOn$}
        fLoEdit={edit(paramIds.f_lo)}
        fHiEdit={edit(paramIds.f_hi)}
      />

      <div className="profiles">
        {[1, 2, 3].map((slot) => (
          <ProfileCard
            key={slot}
            host={host}
            slot={slot}
            data={profiles[slot - 1] ?? { i: slot, valid: false, db: [] }}
            active={profile === slot}
            listen$={host[LISTEN_SLOTS[slot - 1]!]}
            learn$={host[LEARN_SLOTS[slot - 1]!]}
            tilt={spectrum}
          />
        ))}
      </div>

      <div className="block process">
        <div className="title">Process</div>
        <WithInfo title={denoiserInfo.profile}>
          <Knob
            label="Profile"
            value$={host.profile$}
            min={1}
            max={3}
            snap={1}
            reset={denoiserParamDefault('profile')}
            dots={PROFILE_DOTS}
            labels={PROFILE_LABELS}
            size="large"
            {...{ 'value.format': (v: number) => `${Math.round(v)}` }}
            {...edit(paramIds.profile)}
            start={135}
            angle={90}
            reverse
          />
        </WithInfo>
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
            {...edit(paramIds.amount)}
          />
        </WithInfo>
        <div className="col">
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
              {...edit(paramIds.blend)}
            />
          </WithInfo>
          <WithInfo title={denoiserInfo.fLoOn}>
            <Toggle state$={host.fLoOn$} label="Limit Low" />
          </WithInfo>
        </div>
        <div className="col">
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
              {...edit(paramIds.floor)}
            />
          </WithInfo>
          <WithInfo title={denoiserInfo.fHiOn}>
            <Toggle state$={host.fHiOn$} label="Limit High" />
          </WithInfo>
        </div>
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
    </div>
  );
}
