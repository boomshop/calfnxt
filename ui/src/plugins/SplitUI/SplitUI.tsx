import { useEffect, useMemo } from 'react';
import { Header } from '../../components';
import { createHeaderIo } from '../../host/headerMeters';
import { Knob, Toggle, WithInfo } from '../../widgets';
import { paramIds } from '../../generated/splitModel';
import { splitParamDefault, type ISplitHost } from '../../host/splitHost';
import { splitInfo } from './splitInfo';
import '../PluginUI.scss';
import './SplitUI.scss';

export interface SplitUIProps {
  host: ISplitHost;
}

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

export function SplitUI(props: SplitUIProps) {
  const { host } = props;
  const headerIo = useMemo(
    () => createHeaderIo({ input: 1, output: 2 }),
    [],
  );
  useEffect(() => () => headerIo.dispose(), [headerIo]);
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  return (
    <div className="SplitUI PluginUI">
      <Header title="Split" io={headerIo} />

      <div className="block left">
        <div className="title">Left</div>
        <WithInfo title={splitInfo.phaseL}>
          <Toggle
            state$={host.phaseL$}
            icon="phase"
            {...edit(paramIds.phase_l)}
          />
        </WithInfo>

        <WithInfo title={splitInfo.muteL}>
          <Toggle
            state$={host.muteL$}
            icon="speaker"
            icon_active="mute"
            {...edit(paramIds.mute_l)}
          />
        </WithInfo>

        <WithInfo title={splitInfo.volumeL}>
          <Knob
            value$={host.volumeL$}
            label="Volume Left"
            min={-60}
            max={12}
            unit="dB"
            dots={DB_DOTS}
            labels={DB_LABELS}
            reset={splitParamDefault('volume_l')}
            scale="decibel"
            log_factor={2}
            base={0}
            size="huge"
            {...edit(paramIds.volume_l)}
          />
        </WithInfo>
      </div>

      <div className="block right">
        <div className="title">Right</div>
        <WithInfo title={splitInfo.volumeR}>
          <Knob
            value$={host.volumeR$}
            label="Volume Right"
            min={-60}
            max={12}
            unit="dB"
            dots={DB_DOTS}
            labels={DB_LABELS}
            reset={splitParamDefault('volume_r')}
            scale="decibel"
            log_factor={2}
            base={0}
            size="huge"
            {...edit(paramIds.volume_r)}
          />
        </WithInfo>

        <WithInfo title={splitInfo.muteR}>
          <Toggle
            state$={host.muteR$}
            icon="speaker"
            icon_active="mute"
            {...edit(paramIds.mute_r)}
          />
        </WithInfo>

        <WithInfo title={splitInfo.phaseR}>
          <Toggle
            state$={host.phaseR$}
            icon="phase"
            {...edit(paramIds.phase_r)}
          />
        </WithInfo>
      </div>
    </div>
  );
}
