import { useEffect, useMemo, useState } from 'react';
import { DynamicValue } from '@deutschesoft/awml';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Buttons,
  Knob,
  PitchRollChart,
  Select,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds, pluginMeta } from '../../generated/tunerModel';
import {
  TUNER_DETECT_ENTRIES,
  TUNER_KEY_ENTRIES,
  TUNER_NOTE_LABELS,
  TUNER_PROFILE_ENTRIES,
  TUNER_REF_ENTRIES,
  TUNER_SCALE_TEMPLATES,
  TUNER_VIZ_ID,
  tunerParamDefault,
  tunerSourceDefaults,
  type ITunerHost,
} from '../../host/tunerHost';
import { tunerInfo } from './tunerInfo';
import '../PluginUI.scss';
import './TunerUI.scss';

export interface TunerUIProps {
  host: ITunerHost;
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
const RETUNE_DOTS = [1, 2, 4, 8, 20, 40, 80, 160, 320, 400];
const RETUNE_LABELS = [
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
const RELEASE_DOTS = [10, 50, 120, 250, 500, 1000, 2000];
const RELEASE_LABELS = [
  { pos: 10, label: '10' },
  { pos: 120, label: '120' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
  { pos: 2000, label: '2s' },
];
const THRESH_DOTS = [0, 5, 10, 20, 35, 50];
const THRESH_LABELS = [
  { pos: 0, label: '0' },
  { pos: 5, label: '5' },
  { pos: 10, label: '10' },
  { pos: 20, label: '20' },
  { pos: 35, label: '35' },
  { pos: 50, label: '50' },
];
const FLEX_DOTS = [0, 40, 80, 150, 250, 400];
const FLEX_LABELS = [
  { pos: 0, label: '0' },
  { pos: 40, label: '40' },
  { pos: 80, label: '80' },
  { pos: 150, label: '150' },
  { pos: 250, label: '250' },
  { pos: 400, label: '400' },
];
const FMIN_DOTS = [25, 31, 55, 80, 120, 400];
const FMIN_LABELS = [
  { pos: 25, label: '25' },
  { pos: 31, label: 'B0' },
  { pos: 55, label: 'C2' },
  { pos: 80, label: '80' },
  { pos: 400, label: '400' },
];
const FMAX_DOTS = [200, 400, 700, 1000, 1600, 2000];
const FMAX_LABELS = [
  { pos: 200, label: '200' },
  { pos: 400, label: '400' },
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
const VIB_TIME_DOTS = [0, 50, 100, 200, 500, 1000, 2000];
const VIB_TIME_LABELS = [
  { pos: 0, label: '0' },
  { pos: 100, label: '100' },
  { pos: 200, label: '200' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
  { pos: 2000, label: '2s' },
];
const VIB_RATE_DOTS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const VIB_RATE_LABELS = [
  { pos: 2, label: '2' },
  { pos: 3, label: '3' },
  { pos: 4, label: '4' },
  { pos: 5, label: '5' },
  { pos: 6, label: '6' },
  { pos: 7, label: '7' },
  { pos: 8, label: '8' },
  { pos: 9, label: '9' },
  { pos: 10, label: '10' },
];

export function TunerUI(props: TunerUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });
  const profile = useDynamicValueReadonly(host.profile$, 0);
  const detect = useDynamicValueReadonly(host.detect$, 0);
  const src = tunerSourceDefaults(profile);
  const [key, setKey] = useState(0);
  const scale$ = useMemo(() => DynamicValue.fromConstant(0), []);

  useEffect(() => {
    return scale$.subscribe((v) => {
      const i = Math.max(
        0,
        Math.min(TUNER_SCALE_TEMPLATES.length - 1, Math.round(Number(v))),
      );
      host.applyScale(i, key);
    }, false);
  }, [host, key, scale$]);

  const scaleEntries = useMemo(
    () => TUNER_SCALE_TEMPLATES.map((s, i) => ({ label: s.label, value: i })),
    [],
  );

  return (
    <div className="TunerUI PluginUI">
      <Header title="Tuner">
        <WithInfo title={tunerInfo.profile} className="info-block">
          <Buttons
            layout="horizontal"
            entries={[...TUNER_PROFILE_ENTRIES]}
            value={Math.round(profile)}
            onChange={(v) => host.applyProfile(v)}
          />
        </WithInfo>
        <WithInfo title={tunerInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
      </Header>

      <div className="top">
        <div className="block range">
          <div className="title">Range</div>
          <WithInfo title={tunerInfo.fmax}>
            <Knob
              label="High"
              value$={host.fmax$}
              min={FMAX_RANGE.min}
              max={FMAX_RANGE.max}
              reset={src.fmax}
              scale="frequency"
              dots={FMAX_DOTS}
              labels={FMAX_LABELS}
              {...edit(paramIds.fmax)}
              size="small"
            />
          </WithInfo>
          <WithInfo title={tunerInfo.fmin}>
            <Knob
              label="Low"
              value$={host.fmin$}
              min={FMIN_RANGE.min}
              max={FMIN_RANGE.max}
              reset={src.fmin}
              scale="frequency"
              dots={FMIN_DOTS}
              labels={FMIN_LABELS}
              {...edit(paramIds.fmin)}
              size="small"
            />
          </WithInfo>
        </div>

        <div className="block history">
          <div className="title">History</div>
          <WithInfo title={tunerInfo.history} className="info-block roll">
            <PitchRollChart
              data$={host.pitchData$}
              fmin$={host.fmin$}
              fmax$={host.fmax$}
              notes$={host.notes$}
              vizId={TUNER_VIZ_ID}
            />
          </WithInfo>
        </div>

        <div className="block notes">
          <div className="title">Scale</div>
          <WithInfo title={tunerInfo.ref} className="info-block">
            <Select value$={host.ref$} entries={TUNER_REF_ENTRIES} />
          </WithInfo>
          <WithInfo title={tunerInfo.scale} className="info-block">
            <Select value$={scale$} entries={scaleEntries} />
          </WithInfo>
          <WithInfo title={tunerInfo.key} className="info-block scale">
            <Buttons
              layout="horizontal"
              entries={TUNER_KEY_ENTRIES}
              value={key}
              onChange={(v) => {
                setKey(v);
                const i = Math.round(Number(scale$.value));
                host.applyScale(i, v);
              }}
            />
          </WithInfo>
          <WithInfo title={tunerInfo.notes} className="info-block keys">
            <div className="note-row">
              {host.notes$.map((dv, i) => (
                <Toggle
                  key={TUNER_NOTE_LABELS[i]}
                  state$={dv}
                  label={TUNER_NOTE_LABELS[i]}
                  className={
                    i === 1 || i === 3 || i === 6 || i === 8 || i === 10
                      ? 'key-black'
                      : 'key-white'
                  }
                />
              ))}
            </div>
          </WithInfo>
        </div>
      </div>

      <div className="bottom">
        <div className="block detector">
          <div className="title">Detector</div>

          <WithInfo title={tunerInfo.octaveProtect}>
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

          <WithInfo title={tunerInfo.quality}>
            <Knob
              label="Quality"
              value$={host.quality$}
              min={0}
              max={1}
              reset={tunerParamDefault('quality')}
              dots={QUALITY_DOTS}
              labels={QUALITY_LABELS}
              {...edit(paramIds.quality)}
            />
          </WithInfo>

          <WithInfo title={tunerInfo.unvoiced}>
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

          <WithInfo title={tunerInfo.detect} className="info-block detect">
            <Buttons
              layout="horizontal"
              entries={[...TUNER_DETECT_ENTRIES]}
              value={Math.round(detect)}
              onChange={(v) => {
                host.beginEdit(paramIds.detect);
                host.detect$.set(v);
                host.endEdit(paramIds.detect);
              }}
            />
          </WithInfo>
        </div>

        <div className="block correction">
          <div className="title">Correction</div>
          <WithInfo title={tunerInfo.keep} className="keep">
            <Knob
              label="Keep"
              value$={host.vibrato$}
              min={0}
              max={1}
              reset={src.vibrato}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="medium"
              {...edit(paramIds.vibrato)}
            />
          </WithInfo>

          <WithInfo title={tunerInfo.retune} className="retune">
            <Knob
              label="Retune"
              value$={host.retune$}
              min={1}
              max={400}
              reset={src.retune}
              scale="log2"
              log_factor={4}
              dots={RETUNE_DOTS}
              labels={RETUNE_LABELS}
              size="large"
              {...edit(paramIds.retune)}
            />
          </WithInfo>

          <WithInfo title={tunerInfo.flex} className="flex">
            <Knob
              label="Flex"
              value$={host.flex$}
              min={0}
              max={400}
              reset={src.flex}
              dots={FLEX_DOTS}
              labels={FLEX_LABELS}
              size="medium"
              {...edit(paramIds.flex)}
            />
          </WithInfo>

          <WithInfo title={tunerInfo.release} className="release">
            <Knob
              label="Release"
              value$={host.release$}
              min={10}
              max={2000}
              reset={tunerParamDefault('release')}
              scale="log2"
              log_factor={4}
              dots={RELEASE_DOTS}
              labels={RELEASE_LABELS}
              size="small"
              {...edit(paramIds.release)}
            />
          </WithInfo>

          <WithInfo title={tunerInfo.threshold} className="threshold">
            <Knob
              label="Thresh"
              value$={host.threshold$}
              min={0}
              max={50}
              reset={src.threshold}
              dots={THRESH_DOTS}
              labels={THRESH_LABELS}
              size="small"
              {...edit(paramIds.threshold)}
            />
          </WithInfo>

          <WithInfo title={tunerInfo.amount} className="amount">
            <Knob
              label="Amount"
              value$={host.amount$}
              min={0}
              max={1}
              reset={tunerParamDefault('amount')}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="small"
              {...edit(paramIds.amount)}
            />
          </WithInfo>

          <WithInfo title={tunerInfo.formant} className="formant">
            <Knob
              label="Formant"
              value$={host.formant$}
              min={0}
              max={1}
              reset={src.formant}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="small"
              {...edit(paramIds.formant)}
            />
          </WithInfo>
        </div>

        <div className="block vibrato">
          <div className="title">Vibrato</div>
          <WithInfo title={tunerInfo.vibrato} className="power">
            <Toggle state$={host.vibOn$} icon="power" className="power" />
          </WithInfo>
          <WithInfo title={tunerInfo.depth} className="depth">
            <Knob
              label="Depth"
              value$={host.settle$}
              min={0}
              max={1}
              reset={tunerParamDefault('settle')}
              enabled$={host.vibOn$}
              dots={PCT_DOTS}
              labels={PCT_LABELS}
              size="medium"
              scale="log2"
              log_factor={3}
              {...edit(paramIds.settle)}
            />
          </WithInfo>
          <WithInfo title={tunerInfo.vibRate} className="rate">
            <Knob
              label="Rate"
              value$={host.vibRate$}
              min={2}
              max={10}
              reset={tunerParamDefault('vib_rate')}
              enabled$={host.vibOn$}
              dots={VIB_RATE_DOTS}
              labels={VIB_RATE_LABELS}
              size="small"
              {...edit(paramIds.vib_rate)}
            />
          </WithInfo>
          <WithInfo title={tunerInfo.vibDelay} className="delay">
            <Knob
              label="Delay"
              value$={host.vibDelay$}
              min={0}
              max={2000}
              reset={tunerParamDefault('vib_delay')}
              enabled$={host.vibOn$}
              scale="log2"
              log_factor={3}
              dots={VIB_TIME_DOTS}
              labels={VIB_TIME_LABELS}
              size="small"
              {...edit(paramIds.vib_delay)}
            />
          </WithInfo>
          <WithInfo title={tunerInfo.vibFade} className="fade">
            <Knob
              label="Fade"
              value$={host.vibFade$}
              min={0}
              max={2000}
              reset={tunerParamDefault('vib_fade')}
              enabled$={host.vibOn$}
              scale="log2"
              log_factor={3}
              dots={VIB_TIME_DOTS}
              labels={VIB_TIME_LABELS}
              size="small"
              {...edit(paramIds.vib_fade)}
            />
          </WithInfo>
        </div>
      </div>
    </div>
  );
}
