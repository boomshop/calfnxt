import { useEffect, useMemo } from 'react';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import { createHeaderIo } from '../../host/headerMeters';
import { Buttons, Knob, PitchRollChart, Toggle, WithInfo } from '../../widgets';
import { paramIds, pluginMeta } from '../../generated/octaverModel';
import {
  OCTAVER_DETECT_ENTRIES,
  OCTAVER_PROFILE_ENTRIES,
  OCTAVER_SUB_WAVE_ENTRIES,
  OCTAVER_VIZ_ID,
  octaverParamDefault,
  octaverSourceDefaults,
  type IOctaverHost,
} from '../../host/octaverHost';
import { octaverInfo } from './octaverInfo';
import '../PluginUI.scss';
import './OctaverUI.scss';

export interface OctaverUIProps {
  host: IOctaverHost;
}

const QUALITY_DOTS = [0, 0.25, 0.5, 0.75, 1];
const QUALITY_LABELS = [
  { pos: 0, label: 'live' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.65, label: 'mix' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: 'HiQ' },
];
const PCT_DOTS = [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1];
const PCT_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.05, label: '5' },
  { pos: 0.1, label: '10' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];
const FMIN_DOTS = [25, 31, 55, 80, 120, 240, 400];
const FMIN_LABELS = [
  { pos: 25, label: '25' },
  { pos: 31, label: 'B0' },
  { pos: 55, label: 'C2' },
  { pos: 80, label: '80' },
  { pos: 120, label: '120' },
  { pos: 240, label: '240' },
  { pos: 400, label: '400' },
];
const FMAX_DOTS = [200, 400, 800, 1000, 1600, 2000];
const FMAX_LABELS = [
  { pos: 200, label: '200' },
  { pos: 400, label: '400' },
  { pos: 700, label: '800' },
  { pos: 1000, label: '1k' },
  { pos: 1600, label: '1.6k' },
  { pos: 2000, label: '2k' },
];
function paramMinMax(id: string): { min: number; max: number } {
  const p = pluginMeta.parameters.find((x) => x.id === id);
  return { min: Number(p?.min ?? 0), max: Number(p?.max ?? 1) };
}
const FMIN_RANGE = paramMinMax('fmin');
const FMAX_RANGE = paramMinMax('fmax');
/** Same shape as Tuner Retune (1…400 ms). */
const GLIDE_DOTS = [1, 2, 4, 8, 20, 40, 80, 160, 320, 400];
const GLIDE_LABELS = [
  { pos: 1, label: '1' },
  { pos: 4, label: '4' },
  { pos: 8, label: '8' },
  { pos: 20, label: '20' },
  { pos: 40, label: '40' },
  { pos: 80, label: '80' },
  { pos: 160, label: '160' },
  { pos: 320, label: '320' },
  { pos: 400, label: '400' },
];
const GATE_DOTS = [-60, -48, -36, -24, -12, 0];
const GATE_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -48, label: '−48' },
  { pos: -24, label: '−24' },
  { pos: 0, label: '0' },
];
const ATTACK_DOTS = [0, 8, 20, 40, 60, 80];
const ATTACK_LABELS = [
  { pos: 0, label: '0' },
  { pos: 8, label: '8' },
  { pos: 20, label: '20' },
  { pos: 40, label: '40' },
  { pos: 60, label: '60' },
  { pos: 80, label: '80' },
];
const BAL_DOTS = [-1, -0.5, 0, 0.5, 1];
const BAL_LABELS = [
  { pos: -1, label: 'L' },
  { pos: -0.5, label: '-.5' },
  { pos: 0, label: 'C' },
  { pos: 0.5, label: '+.5' },
  { pos: 1, label: 'R' },
];
const DB_DOTS = [-60, -36, -24, -12, -6, 0, 6, 12];
const DB_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -48, label: '−48' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: 0, label: '0' },
  { pos: 6, label: '+6' },
  { pos: 12, label: '+12' },
];

const levelKnob = {
  min: -60,
  max: 12,
  unit: 'dB' as const,
  dots: DB_DOTS,
  labels: DB_LABELS,
  scale: 'decibel' as const,
  log_factor: 2,
  base: 0,
};
export function OctaverUI(props: OctaverUIProps) {
  const { host } = props;
  const headerIo = useMemo(() => createHeaderIo(), []);
  useEffect(() => () => headerIo.dispose(), [headerIo]);

  const profile = useDynamicValueReadonly(host.profile$, 0);
  const detect = useDynamicValueReadonly(host.detect$, 0);
  const subWave = useDynamicValueReadonly(host.subWave$, 0);
  const src = octaverSourceDefaults(profile);

  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  return (
    <div className="OctaverUI PluginUI">
      <Header title="Octaver" io={headerIo}>
        <WithInfo title={octaverInfo.mono}>
          <Toggle state$={host.mono$} icon="stereo" icon_active="mono" />
        </WithInfo>
        <WithInfo title={octaverInfo.bypass} className="bypass">
          <Toggle state$={host.bypass$} icon="bypass" />
        </WithInfo>
        <WithInfo title={octaverInfo.profile}>
          <Buttons
            layout="horizontal"
            entries={OCTAVER_PROFILE_ENTRIES}
            value={Math.round(profile)}
            onChange={(v) => host.applySourceDefaults(v)}
          />
        </WithInfo>
      </Header>

      <div className="top">
        <div className="block detector">
          <div className="title">Detector</div>
          <WithInfo title={octaverInfo.detect} className="detect">
            <Buttons
              layout="horizontal"
              entries={OCTAVER_DETECT_ENTRIES}
              value={Math.round(detect)}
              onChange={(v) => {
                host.beginEdit(paramIds.detect);
                host.detect$.set(v);
                host.endEdit(paramIds.detect);
              }}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.quality} className="quality">
            <Knob
              label="Quality"
              value$={host.quality$}
              min={0}
              max={1}
              reset={src.quality}
              dots={QUALITY_DOTS}
              labels={QUALITY_LABELS}
              {...edit(paramIds.quality)}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.octaveProtect} className="octave">
            <Knob
              label="Octave"
              value$={host.octaveProtect$}
              min={0}
              max={1}
              reset={src.octave}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              {...edit(paramIds.octave_protect)}
              size="small"
            />
          </WithInfo>
          <WithInfo title={octaverInfo.unvoiced} className="unvoiced">
            <Knob
              label="Unvoiced"
              value$={host.unvoiced$}
              min={0}
              max={1}
              reset={src.unvoiced}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              {...edit(paramIds.unvoiced)}
              size="small"
            />
          </WithInfo>
        </div>

        <div className="block range">
          <div className="title">Range</div>
          <WithInfo title={octaverInfo.fmax}>
            <Knob
              label="High"
              value$={host.fmax$}
              min={FMAX_RANGE.min}
              max={FMAX_RANGE.max}
              reset={src.fmax}
              scale="frequency"
              dots={FMAX_DOTS}
              labels={FMAX_LABELS}
              size="small"
              {...edit(paramIds.fmax)}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.fmin}>
            <Knob
              label="Low"
              value$={host.fmin$}
              min={FMIN_RANGE.min}
              max={FMIN_RANGE.max}
              reset={src.fmin}
              scale="frequency"
              dots={FMIN_DOTS}
              labels={FMIN_LABELS}
              size="small"
              {...edit(paramIds.fmin)}
            />
          </WithInfo>
        </div>

        <WithInfo title={octaverInfo.history} className="info-block history">
          <PitchRollChart
            data$={host.pitchData$}
            fmin$={host.fmin$}
            fmax$={host.fmax$}
            notes$={host.notes$}
            mode="octaver"
            showConfidenceStrip={false}
            vizId={OCTAVER_VIZ_ID}
          />
        </WithInfo>

        <div className="block shifter">
          <div className="title">Shifter</div>
          <WithInfo title={octaverInfo.glide} className="glide">
            <Knob
              label="Glide"
              value$={host.glide$}
              min={1}
              max={400}
              unit="ms"
              scale="log2"
              log_factor={3}
              reset={octaverParamDefault('glide')}
              dots={GLIDE_DOTS}
              labels={GLIDE_LABELS}
              {...edit(paramIds.glide)}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.gate} className="gate">
            <Knob
              label="Gate"
              value$={host.gate$}
              min={-60}
              max={0}
              unit="dB"
              scale="decibel"
              log_factor={2}
              base={0}
              reset={octaverParamDefault('gate')}
              dots={GATE_DOTS}
              labels={GATE_LABELS}
              {...edit(paramIds.gate)}
              size="small"
            />
          </WithInfo>
          <WithInfo title={octaverInfo.attack} className="attack">
            <Knob
              label="Attack"
              value$={host.attack$}
              min={0}
              max={80}
              unit="ms"
              reset={octaverParamDefault('attack')}
              dots={ATTACK_DOTS}
              labels={ATTACK_LABELS}
              {...edit(paramIds.attack)}
              size="small"
            />
          </WithInfo>
        </div>
      </div>

      <div className="main">
        <div className="block voice m2">
          <div className="title">−2</div>
          <WithInfo title={octaverInfo.m2}>
            <Toggle state$={host.m2On$} icon="power" className="power" />
          </WithInfo>
          <WithInfo title={octaverInfo.listen}>
            <Toggle
              state$={host.m2Listen$}
              icon="headphones"
              className="listen warn"
              enabled$={host.m2On$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.level}>
            <Knob
              label="Level"
              value$={host.m2Level$}
              reset={octaverParamDefault('m2_level')}
              size="medium"
              {...levelKnob}
              {...edit(paramIds.m2_level)}
              enabled$={host.m2On$}
            />
          </WithInfo>

          <WithInfo title={octaverInfo.balance}>
            <Knob
              label="Bal"
              value$={host.m2Bal$}
              min={-1}
              max={1}
              reset={0}
              base={0}
              dots={BAL_DOTS}
              labels={BAL_LABELS}
              size="small"
              {...edit(paramIds.m2_bal)}
              enabled$={host.m2On$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.formant}>
            <Knob
              label="Formant"
              value$={host.m2Formant$}
              min={0}
              max={1}
              reset={octaverParamDefault('m2_formant')}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="small"
              {...edit(paramIds.m2_formant)}
              enabled$={host.m2On$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.tone}>
            <Knob
              label="Tone"
              value$={host.m2Tone$}
              min={0}
              max={1}
              reset={octaverParamDefault('m2_tone')}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="small"
              {...edit(paramIds.m2_tone)}
              enabled$={host.m2On$}
            />
          </WithInfo>
        </div>

        <div className="block voice m1">
          <div className="title">−1</div>
          <WithInfo title={octaverInfo.m1}>
            <Toggle state$={host.m1On$} icon="power" className="power" />
          </WithInfo>
          <WithInfo title={octaverInfo.listen}>
            <Toggle
              state$={host.m1Listen$}
              icon="headphones"
              className="listen warn"
              enabled$={host.m1On$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.level}>
            <Knob
              label="Level"
              value$={host.m1Level$}
              reset={octaverParamDefault('m1_level')}
              size="medium"
              {...levelKnob}
              {...edit(paramIds.m1_level)}
              enabled$={host.m1On$}
            />
          </WithInfo>

          <WithInfo title={octaverInfo.balance}>
            <Knob
              label="Bal"
              value$={host.m1Bal$}
              min={-1}
              max={1}
              reset={0}
              base={0}
              dots={BAL_DOTS}
              labels={BAL_LABELS}
              size="small"
              {...edit(paramIds.m1_bal)}
              enabled$={host.m1On$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.formant}>
            <Knob
              label="Formant"
              value$={host.m1Formant$}
              min={0}
              max={1}
              reset={octaverParamDefault('m1_formant')}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="small"
              {...edit(paramIds.m1_formant)}
              enabled$={host.m1On$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.tone}>
            <Knob
              label="Tone"
              value$={host.m1Tone$}
              min={0}
              max={1}
              reset={octaverParamDefault('m1_tone')}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="small"
              {...edit(paramIds.m1_tone)}
              enabled$={host.m1On$}
            />
          </WithInfo>
        </div>

        <div className="block voice sub">
          <div className="title">Sub</div>
          <div className="voice-top">
            <WithInfo title={octaverInfo.sub}>
              <Toggle state$={host.subOn$} icon="power" className="power" />
            </WithInfo>
            <WithInfo title={octaverInfo.subWave} className="info-block wave">
              <Buttons
                layout="horizontal"
                entries={OCTAVER_SUB_WAVE_ENTRIES}
                value={Math.round(subWave)}
                onChange={(v) => {
                  host.beginEdit(paramIds.sub_wave);
                  host.subWave$.set(v);
                  host.endEdit(paramIds.sub_wave);
                }}
                enabled$={host.subOn$}
              />
            </WithInfo>
            <WithInfo title={octaverInfo.listen}>
              <Toggle
                state$={host.subListen$}
                icon="headphones"
                className="listen warn"
                enabled$={host.subOn$}
              />
            </WithInfo>
          </div>

          <WithInfo title={octaverInfo.level}>
            <Knob
              label="Level"
              value$={host.subLevel$}
              reset={octaverParamDefault('sub_level')}
              size="medium"
              {...levelKnob}
              {...edit(paramIds.sub_level)}
              enabled$={host.subOn$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.balance}>
            <Knob
              label="Bal"
              value$={host.subBal$}
              min={-1}
              max={1}
              reset={0}
              base={0}
              dots={BAL_DOTS}
              labels={BAL_LABELS}
              size="small"
              {...edit(paramIds.sub_bal)}
              enabled$={host.subOn$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.subHarm}>
            <Knob
              label="Harm"
              value$={host.subHarm$}
              min={0}
              max={1}
              reset={octaverParamDefault('sub_harm')}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="small"
              {...edit(paramIds.sub_harm)}
              enabled$={host.subOn$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.tone}>
            <Knob
              label="Tone"
              value$={host.subTone$}
              min={0}
              max={1}
              reset={octaverParamDefault('sub_tone')}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="small"
              {...edit(paramIds.sub_tone)}
              enabled$={host.subOn$}
            />
          </WithInfo>
        </div>

        <div className="block voice dry">
          <div className="title">Dry</div>
          <WithInfo title={octaverInfo.dry}>
            <Toggle state$={host.dryOn$} icon="power" className="power" />
          </WithInfo>
          <WithInfo title={octaverInfo.listen}>
            <Toggle
              state$={host.dryListen$}
              icon="headphones"
              className="listen warn"
              enabled$={host.dryOn$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.level}>
            <Knob
              label="Level"
              value$={host.dryLevel$}
              reset={octaverParamDefault('dry_level')}
              size="medium"
              {...levelKnob}
              {...edit(paramIds.dry_level)}
              enabled$={host.dryOn$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.balance}>
            <Knob
              label="Balance"
              value$={host.dryBal$}
              min={-1}
              max={1}
              reset={0}
              base={0}
              dots={BAL_DOTS}
              labels={BAL_LABELS}
              size="small"
              {...edit(paramIds.dry_bal)}
              enabled$={host.dryOn$}
            />
          </WithInfo>
        </div>

        <div className="block voice p1">
          <div className="title">+1</div>
          <WithInfo title={octaverInfo.p1}>
            <Toggle state$={host.p1On$} icon="power" className="power" />
          </WithInfo>
          <WithInfo title={octaverInfo.listen}>
            <Toggle
              state$={host.p1Listen$}
              icon="headphones"
              className="listen warn"
              enabled$={host.p1On$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.level}>
            <Knob
              label="Level"
              value$={host.p1Level$}
              reset={octaverParamDefault('p1_level')}
              size="medium"
              {...levelKnob}
              {...edit(paramIds.p1_level)}
              enabled$={host.p1On$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.balance}>
            <Knob
              label="Bal"
              value$={host.p1Bal$}
              min={-1}
              max={1}
              reset={0}
              base={0}
              dots={BAL_DOTS}
              labels={BAL_LABELS}
              size="small"
              {...edit(paramIds.p1_bal)}
              enabled$={host.p1On$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.formant}>
            <Knob
              label="Formant"
              value$={host.p1Formant$}
              min={0}
              max={1}
              reset={octaverParamDefault('p1_formant')}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="small"
              {...edit(paramIds.p1_formant)}
              enabled$={host.p1On$}
            />
          </WithInfo>
          <WithInfo title={octaverInfo.tone}>
            <Knob
              label="Tone"
              value$={host.p1Tone$}
              min={0}
              max={1}
              reset={octaverParamDefault('p1_tone')}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="small"
              {...edit(paramIds.p1_tone)}
              enabled$={host.p1On$}
            />
          </WithInfo>
        </div>
      </div>
    </div>
  );
}
