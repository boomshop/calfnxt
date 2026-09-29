import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { DynamicValue } from '@deutschesoft/awml';
import { Header } from '../../components';
import {
  Button,
  Buttons,
  DynamicsChart,
  FrequencyRange,
  HistoryChart,
  expanderHistorySeries,
  Knob,
  LevelMeter,
  MultiMeter,
  Select,
  State,
  Toggle,
  WithInfo,
} from '../../widgets';
import { persistedHistoryVisible$, DYNAMICS_TRIG_GR_TOGGLES } from '../../prefs/historySeriesVisible';
import { useDynamicValue } from '../../hooks/useDynamicValue';
import { paramIds } from '../../generated/expanderModel';
import {
  EXPANDER_CHANNEL_ENTRIES,
  EXPANDER_LINK_ENTRIES,
  EXPANDER_MODE_ENTRIES,
  expanderParamDefault,
  type ExpanderPanelId,
  type IExpanderHost,
  type IExpanderInhibitHost,
} from '../../host/expanderHost';
import '../PluginUI.scss';
import './ExpanderUI.scss';
import { expanderInfo } from './expanderInfo';

export interface ExpanderUIProps {
  host: IExpanderHost;
}

const RATIO_DOTS = [1, 2, 4, 8, 12, 20];
const RATIO_LABELS = RATIO_DOTS.map((n) => ({ pos: n, label: String(n) }));

const THRESH_DOTS = [-60, -48, -36, -24, -12, -6, 0];
const THRESH_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -48, label: '−48' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: -6, label: '−6' },
  { pos: 0, label: '0' },
];

const KNEE_DOTS = [0, 3, 6, 12, 18, 24];
const KNEE_LABELS = [
  { pos: 0, label: '0' },
  { pos: 6, label: '6' },
  { pos: 12, label: '12' },
  { pos: 18, label: '18' },
  { pos: 24, label: '24' },
];

const ATTACK_DOTS = [0.1, 1, 5, 10, 20, 50, 100, 250, 500];
const ATTACK_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 1, label: '1' },
  { pos: 10, label: '10' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
];

const HOLD_DOTS = [0, 10, 25, 50, 100, 200, 350, 500];
const HOLD_LABELS = [
  { pos: 0, label: '0' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
];

const RELEASE_DOTS = [1, 10, 50, 100, 200, 500, 1000, 2000];
const RELEASE_LABELS = [
  { pos: 1, label: '1' },
  { pos: 100, label: '100' },
  { pos: 200, label: '200' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
  { pos: 2000, label: '2s' },
];

const RANGE_DOTS = [-90, -60, -48, -36, -24, -12, 0];
const RANGE_LABELS = [
  { pos: -90, label: '−90' },
  { pos: -60, label: '−60' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: 0, label: '0' },
];

const GAIN_DOTS = [-24, -12, -6, 0, 6, 12, 24];
const GAIN_LABELS = [
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: 0, label: '0' },
  { pos: 12, label: '12' },
  { pos: 24, label: '24' },
];

/** Toggle `.inhibit-fire` on the AUX button from a 0…1 viz stream — no React re-render. */
function useFiringWarnClass(
  wrapRef: RefObject<HTMLElement | null>,
  amount$: DynamicValue<number> | undefined,
) {
  useEffect(() => {
    if (!amount$) return;
    const apply = (v: number) => {
      const btn =
        wrapRef.current?.querySelector<HTMLElement>('.aux-button') ?? null;
      btn?.classList.toggle('inhibit-fire', v > 0.05);
    };
    apply(amount$.value ?? 0);
    return amount$.subscribe(apply);
  }, [amount$, wrapRef]);
}

function PanelTab(props: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  info: string;
  led$?: DynamicValue<boolean>;
  firing$?: DynamicValue<number>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useFiringWarnClass(wrapRef, props.firing$);

  return (
    <WithInfo title={props.info} className="panel-tab-info">
      <div className="panel-tab" ref={wrapRef}>
        {props.led$ ? (
          <State
            state$={props.led$}
            className="tab-led"
            color="var(--color-accent)"
          />
        ) : null}
        <Button
          label={props.label}
          state={props.selected}
          onClick={props.onSelect}
        />
      </div>
    </WithInfo>
  );
}

function InhibitControls(props: {
  host: IExpanderHost;
  inv: IExpanderInhibitHost;
  prefix: 'inv1' | 'inv2';
}) {
  const { host, inv, prefix } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  return (
    <div className="inhibit-controls">
      <WithInfo title={expanderInfo.invActive}>
        <Toggle
          state$={inv.active$}
          icon="power"
          className="warn"
        />
      </WithInfo>
      <WithInfo title={expanderInfo.invGain}>
        <Knob
          label="Gain"
          value$={inv.gain$}
          min={-24}
          max={24}
          reset={expanderParamDefault(`${prefix}_gain`)}
          base={0}
          dots={GAIN_DOTS}
          labels={GAIN_LABELS}
          size="small"
          scale="decibel"
          log_factor={2}
          {...edit(paramIds[`${prefix}_gain`])}
        />
      </WithInfo>
      <WithInfo title={expanderInfo.invThreshold}>
        <Knob
          label="Thresh"
          value$={inv.threshold$}
          min={-60}
          max={0}
          reset={expanderParamDefault(`${prefix}_threshold`)}
          base={0}
          dots={THRESH_DOTS}
          labels={THRESH_LABELS}
          size="small"
          scale="decibel"
          log_factor={3}
          {...edit(paramIds[`${prefix}_threshold`])}
        />
      </WithInfo>
      <WithInfo title={expanderInfo.invHold}>
        <Knob
          label="Hold"
          value$={inv.hold$}
          min={0}
          max={500}
          reset={expanderParamDefault(`${prefix}_hold`)}
          dots={HOLD_DOTS}
          labels={HOLD_LABELS}
          size="small"
          {...{ 'value.format': (v: number) => `${v.toFixed(0)}` }}
          {...edit(paramIds[`${prefix}_hold`])}
          scale="log2"
          log_factor={3}
        />
      </WithInfo>
      <WithInfo title={expanderInfo.invRelease}>
        <Knob
          label="Release"
          value$={inv.release$}
          min={1}
          max={2000}
          reset={expanderParamDefault(`${prefix}_release`)}
          scale="log2"
          log_factor={4}
          dots={RELEASE_DOTS}
          labels={RELEASE_LABELS}
          size="small"
          {...{ 'value.format': (v: number) => `${v.toFixed(0)}` }}
          {...edit(paramIds[`${prefix}_release`])}
        />
      </WithInfo>
    </div>
  );
}

export function ExpanderUI({ host }: ExpanderUIProps) {
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });
  const mode = useDynamicValueReadonly(host.mode$, 0);
  const link = useDynamicValueReadonly(host.link$, 0);
  const openThresh = useDynamicValueReadonly(host.threshold$, -32);
  const [panel, setPanel] = useState<ExpanderPanelId>('detector');

  const [detListen, setDetListen] = useDynamicValue(host.listen$, false);
  const [inv1Listen, setInv1Listen] = useDynamicValue(host.inv1.listen$, false);
  const [inv2Listen, setInv2Listen] = useDynamicValue(host.inv2.listen$, false);
  const inv1Active = useDynamicValueReadonly(host.inv1.active$, false);
  const inv2Active = useDynamicValueReadonly(host.inv2.active$, false);

  const isDetector = panel === 'detector';
  const invPrefix = panel === 'inv2' ? 'inv2' : 'inv1';
  const inv = panel === 'inv2' ? host.inv2 : host.inv1;
  const showKeyMeters = inv1Active || inv2Active;
  const keyMeterLabels = useMemo(() => {
    const labels = ['Trig'];
    if (inv1Active) labels.push('I1', 'H1');
    if (inv2Active) labels.push('I2', 'H2');
    return labels;
  }, [inv1Active, inv2Active]);

  const detectorListed$ = useMemo(() => DynamicValue.fromConstant(true), []);
  const inv1DetectorListed$ = useMemo(() => DynamicValue.fromConstant(false), []);
  const inv2DetectorListed$ = useMemo(() => DynamicValue.fromConstant(false), []);
  const inv1PanelListed$ = useMemo(() => DynamicValue.fromConstant(false), []);
  const inv2PanelListed$ = useMemo(() => DynamicValue.fromConstant(false), []);
  const threshFlatDb$ = useMemo(
    () => DynamicValue.fromConstant<number | null>(null),
    [],
  );

  useEffect(() => {
    detectorListed$.set(panel === 'detector');
    inv1DetectorListed$.set(panel === 'detector' && inv1Active);
    inv2DetectorListed$.set(panel === 'detector' && inv2Active);
    inv1PanelListed$.set(panel === 'inv1');
    inv2PanelListed$.set(panel === 'inv2');
  }, [
    panel,
    inv1Active,
    inv2Active,
    detectorListed$,
    inv1DetectorListed$,
    inv2DetectorListed$,
    inv1PanelListed$,
    inv2PanelListed$,
  ]);

  useEffect(() => {
    if (panel === 'inv1') {
      const sync = () => threshFlatDb$.set(host.inv1.threshold$.value ?? null);
      sync();
      return host.inv1.threshold$.subscribe(sync);
    }
    if (panel === 'inv2') {
      const sync = () => threshFlatDb$.set(host.inv2.threshold$.value ?? null);
      sync();
      return host.inv2.threshold$.subscribe(sync);
    }
    threshFlatDb$.set(null);
  }, [panel, host.inv1.threshold$, host.inv2.threshold$, threshFlatDb$]);

  const selectPanel = (next: ExpanderPanelId) => {
    if (next === panel) return;
    // Leaving a panel clears that panel's Listen — only one Listen suite-wide.
    if (panel === 'detector' && detListen) setDetListen(false);
    if (panel === 'inv1' && inv1Listen) setInv1Listen(false);
    if (panel === 'inv2' && inv2Listen) setInv2Listen(false);
    setPanel(next);
  };

  const historySeries = useMemo(
    () =>
      expanderHistorySeries({
        inv1Visible$: persistedHistoryVisible$('expander', 'inv1', true),
        inv2Visible$: persistedHistoryVisible$('expander', 'inv2', true),
        detectorListed$,
        inv1DetectorListed$,
        inv2DetectorListed$,
        inv1PanelListed$,
        inv2PanelListed$,
        threshFlatDb$,
      }),
    [
      detectorListed$,
      inv1DetectorListed$,
      inv2DetectorListed$,
      inv1PanelListed$,
      inv2PanelListed$,
      threshFlatDb$,
    ],
  );

  return (
    <div className="ExpanderUI PluginUI">
      <Header title="Expander">
        <WithInfo title={expanderInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={expanderInfo.channel} className="info-block">
          <Select value$={host.channel$} entries={EXPANDER_CHANNEL_ENTRIES} />
        </WithInfo>
      </Header>

      <div className="history">
        <HistoryChart
          data$={host.historyData$}
          vizId="exp"
          autoScale
          series={historySeries}
          persistId="expander"
          persistToggles={DYNAMICS_TRIG_GR_TOGGLES}
        />
        {showKeyMeters ? (
          <WithInfo title={expanderInfo.keyMeters} className="key-meters">
            <MultiMeter
              value$={host.keyMeters$}
              count$={host.keyMeterCount$}
              labels={keyMeterLabels}
              min={-60}
              max={0}
              layout="right"
              show_scale
              scale="decibel"
              log_factor={3}
            />
          </WithInfo>
        ) : null}
      </div>

      <div className={`block panel panel-${panel}`}>
        <div className="panel-nav">
          <PanelTab
            label="Detector"
            selected={panel === 'detector'}
            onSelect={() => selectPanel('detector')}
            info={expanderInfo.panelDetector}
          />
          <PanelTab
            label="Inv 1"
            selected={panel === 'inv1'}
            onSelect={() => selectPanel('inv1')}
            info={expanderInfo.panelInv1}
            led$={host.inv1.active$}
            firing$={host.inv1.amount$}
          />
          <PanelTab
            label="Inv 2"
            selected={panel === 'inv2'}
            onSelect={() => selectPanel('inv2')}
            info={expanderInfo.panelInv2}
            led$={host.inv2.active$}
            firing$={host.inv2.amount$}
          />
        </div>

        <div className="panel-content">
          <FrequencyRange
            hipass$={isDetector ? host.hipass$ : inv.hipass$}
            lopass$={isDetector ? host.lopass$ : inv.lopass$}
            hpMode$={isDetector ? host.hpMode$ : inv.hpMode$}
            lpMode$={isDetector ? host.lpMode$ : inv.lpMode$}
            listen$={isDetector ? host.listen$ : inv.listen$}
            listenInfo={isDetector ? undefined : expanderInfo.invListen}
            hipassDefault={expanderParamDefault(
              isDetector ? 'hipass' : `${invPrefix}_hipass`,
            )}
            lopassDefault={expanderParamDefault(
              isDetector ? 'lopass' : `${invPrefix}_lopass`,
            )}
            hipassEdit={edit(
              isDetector ? paramIds.hipass : paramIds[`${invPrefix}_hipass`],
            )}
            lopassEdit={edit(
              isDetector ? paramIds.lopass : paramIds[`${invPrefix}_lopass`],
            )}
          />

          {isDetector ? (
            <div className="selects">
              <WithInfo
                title={expanderInfo.sidechainActive}
                className="sc-toggle">
                <Toggle
                  state$={host.sidechainActive$}
                  icon="sidechain"
                  className="warn"
                />
              </WithInfo>
              <div className="select-buttons">
                <WithInfo title={expanderInfo.mode} className="info-block">
                  <Buttons
                    entries={EXPANDER_MODE_ENTRIES}
                    value={mode}
                    onChange={(v) => {
                      host.beginEdit(paramIds.mode);
                      host.mode$.set(v);
                      host.endEdit(paramIds.mode);
                    }}
                  />
                </WithInfo>
                <WithInfo title={expanderInfo.link} className="info-block">
                  <Buttons
                    entries={EXPANDER_LINK_ENTRIES}
                    value={link}
                    onChange={(v) => {
                      host.beginEdit(paramIds.link);
                      host.link$.set(v);
                      host.endEdit(paramIds.link);
                    }}
                  />
                </WithInfo>
              </div>
            </div>
          ) : (
            <InhibitControls host={host} inv={inv} prefix={invPrefix} />
          )}
        </div>
      </div>

      <div className="block expander">
        <div className="title">Expander</div>

        <div className="upper">
          <WithInfo title={expanderInfo.threshold}>
            <Knob
              label="Thresh"
              value$={host.threshold$}
              min={-60}
              max={0}
              reset={expanderParamDefault('threshold')}
              base={0}
              dots={THRESH_DOTS}
              labels={THRESH_LABELS}
              {...edit(paramIds.threshold)}
              size="large"
              scale="decibel"
              log_factor={3}
            />
          </WithInfo>
          <WithInfo title={expanderInfo.ratio}>
            <Knob
              label="Ratio"
              value$={host.ratio$}
              min={1}
              max={20}
              reset={expanderParamDefault('ratio')}
              scale="log2"
              log_factor={4}
              dots={RATIO_DOTS}
              labels={RATIO_LABELS}
              {...{ 'value.format': (v: number) => `${v.toFixed(1)}:1` }}
              {...edit(paramIds.ratio)}
              size="large"
            />
          </WithInfo>
        </div>

        <div className="center">
          <WithInfo title={expanderInfo.attack}>
            <Knob
              label="Attack"
              value$={host.attack$}
              min={0.1}
              max={500}
              reset={expanderParamDefault('attack')}
              scale="log2"
              log_factor={4}
              dots={ATTACK_DOTS}
              labels={ATTACK_LABELS}
              size="small"
              {...{ 'value.format': (v: number) => `${v.toFixed(1)}` }}
              {...edit(paramIds.attack)}
            />
          </WithInfo>
          <WithInfo title={expanderInfo.hold}>
            <Knob
              label="Hold"
              value$={host.hold$}
              min={0}
              max={500}
              reset={expanderParamDefault('hold')}
              dots={HOLD_DOTS}
              labels={HOLD_LABELS}
              size="small"
              {...{ 'value.format': (v: number) => `${v.toFixed(0)}` }}
              {...edit(paramIds.hold)}
              scale="log2"
              log_factor={3}
            />
          </WithInfo>
          <WithInfo title={expanderInfo.release}>
            <Knob
              label="Release"
              value$={host.release$}
              min={1}
              max={2000}
              reset={expanderParamDefault('release')}
              scale="log2"
              log_factor={4}
              dots={RELEASE_DOTS}
              labels={RELEASE_LABELS}
              size="small"
              {...{ 'value.format': (v: number) => `${v.toFixed(0)}` }}
              {...edit(paramIds.release)}
            />
          </WithInfo>
        </div>
        <div className="lower">
          <WithInfo title={expanderInfo.knee}>
            <Knob
              label="Knee"
              value$={host.knee$}
              min={0}
              max={24}
              reset={expanderParamDefault('knee')}
              dots={KNEE_DOTS}
              labels={KNEE_LABELS}
              {...edit(paramIds.knee)}
              size="small"
            />
          </WithInfo>
          <WithInfo title={expanderInfo.relThreshActive}>
            <Toggle
              state$={host.relThreshActive$}
              icon="power"
            />
          </WithInfo>
          <WithInfo title={expanderInfo.releaseThreshold}>
            <Knob
              label="Rel Thresh"
              value$={host.releaseThreshold$}
              min={-60}
              max={openThresh}
              reset={expanderParamDefault('release_threshold')}
              base={0}
              dots={openThresh > -59.5 ? [-60, openThresh] : [-60]}
              labels={
                openThresh > -59.5
                  ? [
                      { pos: -60, label: '−60' },
                      {
                        pos: openThresh,
                        label:
                          Math.abs(openThresh) < 0.5
                            ? '0'
                            : `−${Math.abs(openThresh).toFixed(0)}`,
                      },
                    ]
                  : [{ pos: -60, label: '−60' }]
              }
              size="small"
              scale="decibel"
              log_factor={3}
              {...edit(paramIds.release_threshold)}
              enabled$={host.relThreshActive$}
            />
          </WithInfo>
          <WithInfo title={expanderInfo.range}>
            <Knob
              label="Range"
              value$={host.range$}
              min={-90}
              max={0}
              reset={expanderParamDefault('range')}
              base={0}
              dots={RANGE_DOTS}
              labels={RANGE_LABELS}
              size="small"
              scale="decibel"
              log_factor={3}
              {...edit(paramIds.range)}
            />
          </WithInfo>
        </div>
      </div>

      <div className="block chart">
        <div className="title">Transfer</div>
        <WithInfo title={expanderInfo.gr}>
          <LevelMeter
            className="gr"
            value$={host.gr$}
            min={0}
            max={60}
            base={0}
            reverse
            label="GR"
            show_scale
            falling={0}
            show_hold={false}
            scale="log2"
            log_factor={5}
            levels={[1, 3, 6, 12]}
          />
        </WithInfo>
        <DynamicsChart
          type="expander"
          threshold$={host.threshold$}
          releaseThreshold$={host.releaseThreshold$}
          relThreshActive$={host.relThreshActive$}
          ratio$={host.ratio$}
          range$={host.range$}
          knee$={host.knee$}
          point$={host.point$}
          beginEdit={() => {
            host.beginEdit(paramIds.threshold);
            host.beginEdit(paramIds.ratio);
            host.beginEdit(paramIds.release_threshold);
          }}
          endEdit={() => {
            host.endEdit(paramIds.threshold);
            host.endEdit(paramIds.ratio);
            host.endEdit(paramIds.release_threshold);
          }}
        />
      </div>
    </div>
  );
}
