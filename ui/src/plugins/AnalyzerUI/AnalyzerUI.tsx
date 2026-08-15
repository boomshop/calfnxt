import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Buttons,
  CorrelationMeter,
  GonioMeter,
  SpectrumChart,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/analyzerModel';
import {
  ANALYZER_FFT_ENTRIES,
  ANALYZER_MODE_ENTRIES,
  ANALYZER_SCALE_ENTRIES,
  type IAnalyzerHost,
} from '../../host/analyzerHost';
import '../PluginUI.scss';
import './AnalyzerUI.scss';
import { analyzerInfo } from './analyzerInfo';

export interface AnalyzerUIProps {
  host: IAnalyzerHost;
}

export function AnalyzerUI(props: AnalyzerUIProps) {
  const { host } = props;
  const mode = useDynamicValueReadonly(host.mode$, 0);
  const hold = useDynamicValueReadonly(host.hold$, false);
  const fftSizeRaw = useDynamicValueReadonly(host.fftSize$, 1);
  const scaleRaw = useDynamicValueReadonly(host.scale$, 0);
  const fftSize = Math.round(fftSizeRaw);
  const scale = Math.round(scaleRaw);

  return (
    <div className="AnalyzerUI PluginUI">
      <Header title="Analyzer">
        <WithInfo title={analyzerInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={analyzerInfo.hold}>
          <Toggle state$={host.hold$} label="Hold" />
        </WithInfo>
      </Header>

      <SpectrumChart
        data$={host.spectrum$}
        mode={mode}
        scale={scale}
        hold={!!hold}
      />

      <div className="block mode">
        <div className="title">Mode</div>
        <WithInfo title={analyzerInfo.mode} className="info-block">
          <Buttons
            layout="vertical"
            entries={[...ANALYZER_MODE_ENTRIES]}
            value={mode}
            onChange={(v) => {
              host.beginEdit(paramIds.mode);
              host.mode$.set(v as number);
              host.endEdit(paramIds.mode);
            }}
          />
        </WithInfo>
      </div>

      <div className="block fft">
        <div className="title">FFT</div>
        <WithInfo title={analyzerInfo.fftSize} className="info-block">
          <Buttons
            layout="horizontal"
            entries={[...ANALYZER_FFT_ENTRIES]}
            value={fftSize}
            onChange={(v) => {
              host.beginEdit(paramIds.fft_size);
              host.fftSize$.set(v as number);
              host.endEdit(paramIds.fft_size);
            }}
          />
        </WithInfo>
      </div>

      <div className="block tilt">
        <div className="title">Scale</div>
        <WithInfo title={analyzerInfo.scale} className="info-block">
          <Buttons
            layout="vertical"
            entries={[...ANALYZER_SCALE_ENTRIES]}
            value={scale}
            onChange={(v) => {
              host.beginEdit(paramIds.scale);
              host.scale$.set(v as number);
              host.endEdit(paramIds.scale);
            }}
          />
        </WithInfo>
      </div>

      <div className="block gonio">
        <WithInfo title={analyzerInfo.gonio}>
          <GonioMeter samples$={host.gonio$} />
        </WithInfo>
        <WithInfo title={analyzerInfo.corr}>
          <CorrelationMeter value$={host.corr$} />
        </WithInfo>
      </div>
    </div>
  );
}
