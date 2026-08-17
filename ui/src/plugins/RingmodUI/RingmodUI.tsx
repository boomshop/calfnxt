import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import { Button, Knob, State, Toggle, WaveformButtons, WithInfo } from '../../widgets';
import { paramIds } from '../../generated/ringmodModel';
import {
  ringmodParamDefault,
  type IRingmodHost,
} from '../../host/ringmodHost';
import { ringmodInfo } from './ringmodInfo';
import '../PluginUI.scss';
import './RingmodUI.scss';

export interface RingmodUIProps {
  host: IRingmodHost;
}

const MOD_FREQ_DOTS = [1, 10, 100, 1000, 10000, 20000];
const MOD_FREQ_LABELS = [
  { pos: 1, label: '1' },
  { pos: 10, label: '10' },
  { pos: 100, label: '100' },
  { pos: 1000, label: '1k' },
  { pos: 10000, label: '10k' },
  { pos: 20000, label: '20k' },
];

const LFO_FREQ_DOTS = [0.01, 0.1, 1, 10];
const LFO_FREQ_LABELS = [
  { pos: 0.01, label: '0.01' },
  { pos: 0.1, label: '0.1' },
  { pos: 1, label: '1' },
  { pos: 10, label: '10' },
];

const DETUNE_DOTS = [-200, -100, 0, 100, 200];
const DETUNE_LABELS = [
  { pos: -200, label: '−200' },
  { pos: 0, label: '0' },
  { pos: 100, label: '+100' },
  { pos: 200, label: '+200' },
];

const AMOUNT_DOTS = [0, 0.5, 1];
const AMOUNT_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '45' },
  { pos: 0.5, label: '90' },
  { pos: 0.75, label: '135' },
  { pos: 1, label: '100' },
];

const PHASE_DOTS = [0, 0.25, 0.5, 0.75, 1];
const PHASE_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '90' },
  { pos: 0.5, label: '180' },
  { pos: 0.75, label: '270' },
  { pos: 1, label: '360' },
];

export function RingmodUI(props: RingmodUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  const lfo1Mode = useDynamicValueReadonly(host.lfo1Mode$, 0);
  const modMode = useDynamicValueReadonly(host.modMode$, 0);
  const lfo2Mode = useDynamicValueReadonly(host.lfo2Mode$, 0);
  const lfo1FreqDriven = useDynamicValueReadonly(
    host.lfo2Lfo1FreqActive$,
    false,
  );
  const modFreqDriven = useDynamicValueReadonly(host.lfo1ModFreqActive$, false);
  const modDetuneDriven = useDynamicValueReadonly(
    host.lfo1ModDetuneActive$,
    false,
  );
  const modAmountDriven = useDynamicValueReadonly(
    host.lfo2ModAmountActive$,
    false,
  );

  return (
    <div className="RingmodUI PluginUI">
      <Header title="Ring Modulator">
        <WithInfo title={ringmodInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
      </Header>

      <div className="block lfo1">
        <div className="title">LFO 1</div>
        <div className="block frequency">
          <div className="title">Modulator Frequency</div>
          <WithInfo title={ringmodInfo.lfo1ModFreq}>
            <Toggle state$={host.lfo1ModFreqActive$} icon="power" />
          </WithInfo>
          <WithInfo title={ringmodInfo.lfo1ModFreq}>
            <Knob
              label="Min"
              value$={host.lfo1ModFreqLo$}
              enabled$={host.lfo1ModFreqActive$}
              min={1}
              max={20000}
              reset={ringmodParamDefault('lfo1_mod_freq_lo')}
              scale="frequency"
              dots={MOD_FREQ_DOTS}
              labels={MOD_FREQ_LABELS}
              size="small"
              {...edit(paramIds.lfo1_mod_freq_lo)}
            />
          </WithInfo>
          <WithInfo title={ringmodInfo.lfo1ModFreq}>
            <Knob
              label="Max"
              value$={host.lfo1ModFreqHi$}
              enabled$={host.lfo1ModFreqActive$}
              min={1}
              max={20000}
              reset={ringmodParamDefault('lfo1_mod_freq_hi')}
              scale="frequency"
              dots={MOD_FREQ_DOTS}
              labels={MOD_FREQ_LABELS}
              size="small"
              {...edit(paramIds.lfo1_mod_freq_hi)}
            />
          </WithInfo>
        </div>

        <div className="block detune">
          <div className="title">Modulator Detune</div>
          <WithInfo title={ringmodInfo.lfo1ModDetune}>
            <Toggle state$={host.lfo1ModDetuneActive$} icon="power" />
          </WithInfo>
          <WithInfo title={ringmodInfo.lfo1ModDetune}>
            <Knob
              label="Min"
              value$={host.lfo1ModDetuneLo$}
              enabled$={host.lfo1ModDetuneActive$}
              min={-200}
              max={200}
              reset={ringmodParamDefault('lfo1_mod_detune_lo')}
              base={0}
              dots={DETUNE_DOTS}
              labels={DETUNE_LABELS}
              size="small"
              {...edit(paramIds.lfo1_mod_detune_lo)}
            />
          </WithInfo>
          <WithInfo title={ringmodInfo.lfo1ModDetune}>
            <Knob
              label="Max"
              value$={host.lfo1ModDetuneHi$}
              enabled$={host.lfo1ModDetuneActive$}
              min={-200}
              max={200}
              reset={ringmodParamDefault('lfo1_mod_detune_hi')}
              base={0}
              dots={DETUNE_DOTS}
              labels={DETUNE_LABELS}
              size="small"
              {...edit(paramIds.lfo1_mod_detune_hi)}
            />
          </WithInfo>
        </div>

        <div className="knob-with-led frequency">
          <State state$={host.lfo1FreqLed$} color="var(--color-warn)" />
          <WithInfo title={ringmodInfo.lfo1Freq}>
            <Knob
              label={lfo1FreqDriven ? '(Freq)' : 'Freq'}
              value$={host.lfo1FreqView$}
              disabled$={host.lfo2Lfo1FreqActive$}
              className={lfo1FreqDriven ? 'lfo-driven' : ''}
              min={0.01}
              max={10}
              reset={ringmodParamDefault('lfo1_freq')}
              scale="frequency"
              log_factor={4}
              dots={LFO_FREQ_DOTS}
              labels={LFO_FREQ_LABELS}
              size="medium"
              {...edit(paramIds.lfo1_freq)}
            />
          </WithInfo>
        </div>

        <div className="footer-row">
          <WithInfo title={ringmodInfo.lfo1Reset}>
            <Button label="Reset" onClick={() => host.pulseReset(1)} />
          </WithInfo>
          <WithInfo title={ringmodInfo.lfo1Mode} className="info-block wave">
            <WaveformButtons
              value={lfo1Mode}
              onChange={(v) => {
                host.beginEdit(paramIds.lfo1_mode);
                host.lfo1Mode$.set(v);
                host.endEdit(paramIds.lfo1_mode);
              }}
            />
          </WithInfo>
          <State state$={host.lfo1Activity$} />
        </div>
      </div>

      <div className="block modulator">
        <div className="title">Modulator</div>
        <div className="knob-with-led detune">
          <State state$={host.modDetuneLed$} color="var(--color-warn)" />
          <WithInfo title={ringmodInfo.modDetune}>
            <Knob
              label={modDetuneDriven ? '(Detune)' : 'Detune'}
              value$={host.modDetuneView$}
              disabled$={host.lfo1ModDetuneActive$}
              className={modDetuneDriven ? 'lfo-driven' : ''}
              min={-200}
              max={200}
              reset={ringmodParamDefault('mod_detune')}
              base={0}
              dots={DETUNE_DOTS}
              labels={DETUNE_LABELS}
              size="small"
              {...edit(paramIds.mod_detune)}
            />
          </WithInfo>
        </div>

        <WithInfo title={ringmodInfo.modPhase} className="phase">
          <Knob
            label="Phase"
            value$={host.modPhase$}
            min={0}
            max={1}
            reset={ringmodParamDefault('mod_phase')}
            dots={PHASE_DOTS}
            labels={PHASE_LABELS}
            size="small"
            {...edit(paramIds.mod_phase)}
          />
        </WithInfo>

        <div className="knob-with-led frequency">
          <State state$={host.modFreqLed$} color="var(--color-warn)" />
          <WithInfo title={ringmodInfo.modFreq}>
            <Knob
              label={modFreqDriven ? '(Freq)' : 'Freq'}
              value$={host.modFreqView$}
              disabled$={host.lfo1ModFreqActive$}
              className={modFreqDriven ? 'lfo-driven' : ''}
              min={1}
              max={20000}
              reset={ringmodParamDefault('mod_freq')}
              scale="frequency"
              dots={MOD_FREQ_DOTS}
              labels={MOD_FREQ_LABELS}
              size="large"
              {...edit(paramIds.mod_freq)}
            />
          </WithInfo>
        </div>

        <div className="knob-with-led amount">
          <State state$={host.modAmountLed$} color="var(--color-warn)" />
          <WithInfo title={ringmodInfo.modAmount}>
            <Knob
              label={modAmountDriven ? '(Amount)' : 'Amount'}
              value$={host.modAmountView$}
              disabled$={host.lfo2ModAmountActive$}
              className={modAmountDriven ? 'lfo-driven' : ''}
              min={0}
              max={1}
              reset={ringmodParamDefault('mod_amount')}
              dots={AMOUNT_DOTS}
              labels={AMOUNT_LABELS}
              size="small"
              {...edit(paramIds.mod_amount)}
            />
          </WithInfo>
        </div>

        <WithInfo title={ringmodInfo.modListen} className="listen">
          <Toggle state$={host.modListen$} icon="headphones" className="warn" />
        </WithInfo>

        <div className="footer-row">
          <WithInfo title={ringmodInfo.modMode} className="info-block wave">
            <WaveformButtons
              value={modMode}
              onChange={(v) => {
                host.beginEdit(paramIds.mod_mode);
                host.modMode$.set(v);
                host.endEdit(paramIds.mod_mode);
              }}
            />
          </WithInfo>
        </div>
      </div>

      <div className="block lfo2">
        <div className="title">LFO 2</div>
        <WithInfo title={ringmodInfo.lfo2Freq} className="frequency">
          <Knob
            label="Freq"
            value$={host.lfo2Freq$}
            min={0.01}
            max={10}
            reset={ringmodParamDefault('lfo2_freq')}
            scale="frequency"
            log_factor={4}
            dots={LFO_FREQ_DOTS}
            labels={LFO_FREQ_LABELS}
            size="medium"
            {...edit(paramIds.lfo2_freq)}
          />
        </WithInfo>
        <div className="block">
          <div className="title">LFO 1 Frequency</div>
          <WithInfo title={ringmodInfo.lfo2Lfo1Freq}>
            <Knob
              label="Min"
              value$={host.lfo2Lfo1FreqLo$}
              enabled$={host.lfo2Lfo1FreqActive$}
              min={0.01}
              max={10}
              reset={ringmodParamDefault('lfo2_lfo1_freq_lo')}
              scale="frequency"
              log_factor={4}
              dots={LFO_FREQ_DOTS}
              labels={LFO_FREQ_LABELS}
              size="small"
              {...edit(paramIds.lfo2_lfo1_freq_lo)}
            />
          </WithInfo>
          <WithInfo title={ringmodInfo.lfo2Lfo1Freq}>
            <Knob
              label="Max"
              value$={host.lfo2Lfo1FreqHi$}
              enabled$={host.lfo2Lfo1FreqActive$}
              min={0.01}
              max={10}
              reset={ringmodParamDefault('lfo2_lfo1_freq_hi')}
              scale="frequency"
              log_factor={4}
              dots={LFO_FREQ_DOTS}
              labels={LFO_FREQ_LABELS}
              size="small"
              {...edit(paramIds.lfo2_lfo1_freq_hi)}
            />
          </WithInfo>
          <WithInfo title={ringmodInfo.lfo2Lfo1Freq}>
            <Toggle state$={host.lfo2Lfo1FreqActive$} icon="power" />
          </WithInfo>
        </div>

        <div className="block">
          <div className="title">Modulator Amount</div>
          <WithInfo title={ringmodInfo.lfo2ModAmount}>
            <Knob
              label="Min"
              value$={host.lfo2ModAmountLo$}
              enabled$={host.lfo2ModAmountActive$}
              min={0}
              max={1}
              reset={ringmodParamDefault('lfo2_mod_amount_lo')}
              dots={AMOUNT_DOTS}
              labels={AMOUNT_LABELS}
              size="small"
              {...edit(paramIds.lfo2_mod_amount_lo)}
            />
          </WithInfo>
          <WithInfo title={ringmodInfo.lfo2ModAmount}>
            <Knob
              label="Max"
              value$={host.lfo2ModAmountHi$}
              enabled$={host.lfo2ModAmountActive$}
              min={0}
              max={1}
              reset={ringmodParamDefault('lfo2_mod_amount_hi')}
              dots={AMOUNT_DOTS}
              labels={AMOUNT_LABELS}
              size="small"
              {...edit(paramIds.lfo2_mod_amount_hi)}
            />
          </WithInfo>
          <WithInfo title={ringmodInfo.lfo2ModAmount}>
            <Toggle state$={host.lfo2ModAmountActive$} icon="power" />
          </WithInfo>
        </div>

        <div className="footer-row">
          <State state$={host.lfo2Activity$} />
          <WithInfo title={ringmodInfo.lfo2Mode} className="info-block wave">
            <WaveformButtons
              value={lfo2Mode}
              onChange={(v) => {
                host.beginEdit(paramIds.lfo2_mode);
                host.lfo2Mode$.set(v);
                host.endEdit(paramIds.lfo2_mode);
              }}
            />
          </WithInfo>
          <WithInfo title={ringmodInfo.lfo2Reset}>
            <Button label="Reset" onClick={() => host.pulseReset(2)} />
          </WithInfo>
        </div>
      </div>
    </div>
  );
}
