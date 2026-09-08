import { useCallback } from 'react';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import { Buttons, Knob, Toggle, WithInfo } from '../../widgets';
import { paramIds } from '../../generated/whammyModel';
import {
  WHAMMY_QUALITY_ENTRIES,
  WHAMMY_SNAP_ENTRIES,
  snapWhammyPitch,
  whammyParamDefault,
  type IWhammyHost,
} from '../../host/whammyHost';
import { whammyInfo } from './whammyInfo';
import '../PluginUI.scss';
import './WhammyUI.scss';

export interface WhammyUIProps {
  host: IWhammyHost;
}

const PITCH_DOTS = [
  -24, -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10, -9,
  -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
  14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
];
const PITCH_LABELS = [
  { pos: -24, label: '−24' },
  { pos: -22, label: '−22' },
  { pos: -20, label: '−20' },
  { pos: -18, label: '−18' },
  { pos: -16, label: '−16' },
  { pos: -14, label: '−14' },
  { pos: -12, label: '−12' },
  { pos: -10, label: '−10' },
  { pos: -8, label: '−8' },
  { pos: -6, label: '−6' },
  { pos: -4, label: '−4' },
  { pos: -2, label: '−2' },
  { pos: 0, label: '0' },
  { pos: 2, label: '2' },
  { pos: 4, label: '4' },
  { pos: 6, label: '6' },
  { pos: 8, label: '8' },
  { pos: 10, label: '10' },
  { pos: 12, label: '12' },
  { pos: 14, label: '14' },
  { pos: 16, label: '16' },
  { pos: 18, label: '18' },
  { pos: 20, label: '20' },
  { pos: 22, label: '22' },
  { pos: 24, label: '24' },
];

const MIX_DOTS = [0, 0.25, 0.5, 0.75, 1];
const MIX_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];

const GLIDE_DOTS = [0.5, 2, 8, 20, 50, 100, 250];
const GLIDE_LABELS = [
  { pos: 0.5, label: '0.5' },
  { pos: 8, label: '8' },
  { pos: 20, label: '20' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
];

const TONE_DOTS = [0, 0.25, 0.5, 0.75, 1];
const TONE_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];

function formatPitch(v: number, snap: number): string {
  const n = Math.abs(v) < (snap > 0 ? 0.25 : 0.05) ? 0 : v;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  const decimals = snap > 0 ? 0 : 1;
  return `${sign}${Math.abs(n).toFixed(decimals)}`;
}

export function WhammyUI(props: WhammyUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });
  const snap = Math.round(useDynamicValueReadonly(host.snap$, 0));
  const quality = Math.round(useDynamicValueReadonly(host.quality$, 0));

  const onSnap = useCallback(
    (v: number) => {
      const next = Math.round(v);
      host.beginEdit(paramIds.snap);
      host.snap$.set(next);
      host.endEdit(paramIds.snap);
      if (next > 0) {
        const snapped = snapWhammyPitch(host.pitch$.value, next);
        if (snapped !== host.pitch$.value) {
          host.beginEdit(paramIds.pitch);
          host.pitch$.set(snapped);
          host.endEdit(paramIds.pitch);
        }
      }
    },
    [host],
  );

  const snapStep = snap <= 0 ? 0 : snap >= 2 ? 2 : 1;

  return (
    <div className="WhammyUI PluginUI">
      <Header title="Whammy">
        <WithInfo title={whammyInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
      </Header>

      <div className="block mix">
        <div className="title">Blend</div>
        <WithInfo title={whammyInfo.tone} className="tone">
          <Knob
            label="Tone"
            value$={host.tone$}
            min={0}
            max={1}
            reset={whammyParamDefault('tone')}
            dots={TONE_DOTS}
            labels={TONE_LABELS}
            size="medium"
            {...edit(paramIds.tone)}
          />
        </WithInfo>
        <WithInfo title={whammyInfo.mix} className="mix">
          <Knob
            label="Mix"
            value$={host.mix$}
            min={0}
            max={1}
            reset={whammyParamDefault('mix')}
            dots={MIX_DOTS}
            labels={MIX_LABELS}
            size="large"
            {...edit(paramIds.mix)}
          />
        </WithInfo>
      </div>

      <div className="block pedal">
        <div className="title">Pitch</div>
        <WithInfo title={whammyInfo.snap} className=" snap">
          <Buttons
            layout="vertical"
            entries={[...WHAMMY_SNAP_ENTRIES]}
            value={snap}
            onChange={onSnap}
          />
        </WithInfo>
        <WithInfo title={whammyInfo.pitch} className=" pitch">
          <Knob
            label="Pitch"
            size="huge"
            value$={host.pitch$}
            min={-24}
            max={24}
            base={0}
            reset={whammyParamDefault('pitch')}
            snap={snapStep}
            step={snapStep || 1}
            dots={PITCH_DOTS}
            labels={PITCH_LABELS}
            {...{ 'value.format': (v: number) => formatPitch(v, snap) }}
            {...edit(paramIds.pitch)}
          />
        </WithInfo>
      </div>

      <div className="block feel">
        <div className="title">Feel</div>
        <WithInfo title={whammyInfo.quality} className="quality">
          <Buttons
            layout="vertical"
            entries={[...WHAMMY_QUALITY_ENTRIES]}
            value={quality}
            onChange={(v) => {
              host.beginEdit(paramIds.quality);
              host.quality$.set(v);
              host.endEdit(paramIds.quality);
            }}
          />
        </WithInfo>
        <WithInfo title={whammyInfo.glide} className="glide">
          <Knob
            label="Glide"
            value$={host.glide$}
            min={0.5}
            max={250}
            reset={whammyParamDefault('glide')}
            scale="log2"
            log_factor={4}
            dots={GLIDE_DOTS}
            labels={GLIDE_LABELS}
            size="medium"
            {...edit(paramIds.glide)}
          />
        </WithInfo>
      </div>
    </div>
  );
}
