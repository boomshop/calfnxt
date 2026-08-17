import { DynamicValue as DV } from '@deutschesoft/awml';
import { useMemo } from 'react';
import { Header } from '../../components';
import { CrusherChart, Knob, Toggle, WithInfo } from '../../widgets';
import { paramIds } from '../../generated/crusherModel';
import { crusherParamDefault, type ICrusherHost } from '../../host/crusherHost';
import { crusherInfo } from './crusherInfo';
import '../PluginUI.scss';
import './CrusherUI.scss';

export interface CrusherUIProps {
  host: ICrusherHost;
}

const BITS_DOTS = [1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16];
const BITS_LABELS = BITS_DOTS.map((n) => ({ pos: n, label: String(n) }));

const MIX_DOTS = [0, 0.25, 0.5, 0.75, 1];
const MIX_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];

const AA_DOTS = [0, 0.25, 0.5, 0.75, 1];
const AA_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];

const DC_DOTS = [-12, -6, 0, 6, 12];
const DC_LABELS = [
  { pos: -12, label: '−12' },
  { pos: -6, label: '−6' },
  { pos: 0, label: '0' },
  { pos: 6, label: '+6' },
  { pos: 12, label: '+12' },
];

export function CrusherUI(props: CrusherUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  // Chart expects numeric mode 0/1; host uses boolean Toggle.
  const modeNum$ = useMemo(() => {
    const dv = DV.fromConstant(host.mode$.value ? 1 : 0);
    host.mode$.subscribe((on) => {
      if (dv.value !== (on ? 1 : 0)) dv.set(on ? 1 : 0);
    });
    return dv;
  }, [host.mode$]);

  return (
    <div className="CrusherUI PluginUI">
      <Header title="Crusher">
        <WithInfo title={crusherInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
      </Header>

      <div className="block response">
        <div className="title">Response</div>
        <CrusherChart
          bits$={host.bits$}
          morph$={host.morph$}
          mode$={modeNum$}
          dc$={host.dc$}
          aa$={host.aa$}
          viz$={host.shapePoint$}
        />
      </div>

      <div className="block bits">
        <div className="title">Bit Reduction</div>
        <WithInfo title={crusherInfo.bits}>
          <Knob
            value$={host.bits$}
            label="Bit Reduction"
            size="huge"
            min={1}
            max={16}
            dots={BITS_DOTS}
            labels={BITS_LABELS}
            reset={crusherParamDefault('bits')}
            scale="log2"
            log_factor={6}
            {...edit(paramIds.bits)}
          />
        </WithInfo>
      </div>

      <div className="block shape">
        <div className="title">Shape</div>
        <WithInfo title={crusherInfo.dc}>
          <Knob
            value$={host.dc$}
            label="DC"
            min={-12}
            max={12}
            dots={DC_DOTS}
            labels={DC_LABELS}
            reset={crusherParamDefault('dc')}
            {...edit(paramIds.dc)}
          />
        </WithInfo>
        <WithInfo title={crusherInfo.aa}>
          <Knob
            value$={host.aa$}
            label="Anti-Aliasing"
            min={0}
            max={1}
            dots={AA_DOTS}
            labels={AA_LABELS}
            reset={crusherParamDefault('anti_aliasing')}
            {...edit(paramIds.anti_aliasing)}
          />
        </WithInfo>
        <WithInfo title={crusherInfo.morph}>
          <Knob
            value$={host.morph$}
            label="Mix"
            min={0}
            max={1}
            dots={MIX_DOTS}
            labels={MIX_LABELS}
            reset={crusherParamDefault('morph')}
            {...edit(paramIds.morph)}
          />
        </WithInfo>
        <WithInfo title={crusherInfo.mode} className="log">
          <Toggle state$={host.mode$} label="Logarithmic" />
        </WithInfo>
      </div>
    </div>
  );
}
