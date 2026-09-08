import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Button,
  Buttons,
  FREQUENCY_RANGE_LR_MODE_ENTRIES,
  FrequencyRange,
  ImpulseChart,
  Knob,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/impulseModel';
import { impulseParamDefault, type IImpulseHost } from '../../host/impulseHost';
import type { IrNode } from '../../irTypes';
import { impulseInfo } from './impulseInfo';
import '../PluginUI.scss';
import './ImpulseUI.scss';

export interface ImpulseUIProps {
  host: IImpulseHost;
}

const DECAY_DOTS = [0.15, 0.25, 0.5, 0.75, 1];
const DECAY_LABELS = [
  { pos: 0.15, label: '15' },
  { pos: 0.5, label: '50' },
  { pos: 1, label: '100' },
];
const PREDELAY_DOTS = [0, 10, 20, 50, 100, 200, 300, 400, 500];
const PREDELAY_LABELS = [
  { pos: 0, label: '0' },
  { pos: 20, label: '20' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 200, label: '200' },
  { pos: 300, label: '300' },
  { pos: 400, label: '400' },
  { pos: 500, label: '500' },
];
const MIX_DB_DOTS = [-60, -48, -36, -24, -12, -6, 0, 6, 12];
const MIX_DB_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: -6, label: '−6' },
  { pos: 0, label: '0' },
  { pos: 6, label: '6' },
  { pos: 12, label: '12' },
];

const SHAPE_DOTS = [1, 2, 3, 4, 5, 6, 7, 8];
const SHAPE_LABELS = [
  { pos: 1, label: 'Lin' },
  { pos: 2, label: '2' },
  { pos: 3, label: '3' },
  { pos: 4, label: '4' },
  { pos: 5, label: '5' },
  { pos: 6, label: '6' },
  { pos: 7, label: '7' },
  { pos: 8, label: '8' },
];

/** 0=Stereo, 1=L, 2=R, 3=L+R — wet feed only. */
const IMPULSE_SOURCE_ENTRIES = [
  { label: 'Stereo', value: 0 },
  { label: 'L', value: 1 },
  { label: 'R', value: 2 },
  { label: 'L+R', value: 3 },
];

function nodeMatches(n: IrNode, q: string): boolean {
  if (!q) return true;
  if (n.n.toLowerCase().includes(q)) return true;
  return (n.c ?? []).some((c) => nodeMatches(c, q));
}

function filterTree(nodes: IrNode[], q: string): IrNode[] {
  if (!q) return nodes;
  const out: IrNode[] = [];
  for (const n of nodes) {
    if (!nodeMatches(n, q)) continue;
    if (n.d && n.c) out.push({ ...n, c: filterTree(n.c, q) });
    else out.push(n);
  }
  return out;
}

function IrTree(props: {
  nodes: IrNode[];
  selected: string;
  onSelect: (rel: string) => void;
  open: Set<string>;
  toggle: (key: string) => void;
  prefix?: string;
}) {
  const { nodes, selected, onSelect, open, toggle, prefix = '' } = props;
  return (
    <ul className="ir-tree">
      {nodes.map((n) => {
        const key = prefix + n.n;
        if (n.d) {
          const isOpen = open.has(key);
          return (
            <li key={key} className="dir">
              <button
                type="button"
                className="row dir"
                onClick={() => toggle(key)}>
                <span className="twist">{isOpen ? '▾' : '▸'}</span>
                <span className="name">{n.n}</span>
              </button>
              {isOpen && n.c && n.c.length > 0 ? (
                <IrTree
                  nodes={n.c}
                  selected={selected}
                  onSelect={onSelect}
                  open={open}
                  toggle={toggle}
                  prefix={`${key}/`}
                />
              ) : null}
            </li>
          );
        }
        const rel = n.p ?? n.n;
        const active = rel === selected;
        return (
          <li key={key} className="file">
            <button
              type="button"
              className={`row file${active ? ' active' : ''}`}
              onClick={() => onSelect(rel)}>
              <span className="name">{n.n}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ImpulseUI(props: ImpulseUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });
  const tree = useDynamicValueReadonly(host.tree$, []);
  const selected = useDynamicValueReadonly(host.selected$, '');
  const status = useDynamicValueReadonly(host.status$, '');
  const root = useDynamicValueReadonly(host.root$, '');
  const source = useDynamicValueReadonly(host.source$, 0);
  const openList = useDynamicValueReadonly(host.openDirs$, []);
  const scrollFromHost = useDynamicValueReadonly(host.treeScroll$, 0);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => filterTree(tree, q), [tree, q]);
  const open = useMemo(() => new Set(openList), [openList]);
  const treeRef = useRef<HTMLDivElement>(null);
  const skipScroll = useRef(false);
  const scrollTimer = useRef(0);
  const rootLabel = root
    ? root.replace(/\/+$/, '').split('/').slice(-2).join('/')
    : 'No library';

  const toggle = useCallback(
    (key: string) => {
      const next = new Set(openList);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      const el = treeRef.current;
      host.setTreeUi(Array.from(next), el ? el.scrollTop : scrollFromHost);
    },
    [host, openList, scrollFromHost],
  );

  useEffect(() => {
    const el = treeRef.current;
    if (!el) return;
    if (Math.abs(el.scrollTop - scrollFromHost) < 1) return;
    skipScroll.current = true;
    el.scrollTop = scrollFromHost;
    const id = requestAnimationFrame(() => {
      skipScroll.current = false;
    });
    return () => cancelAnimationFrame(id);
  }, [scrollFromHost, shown.length]);

  const onTreeScroll = () => {
    if (skipScroll.current) return;
    const el = treeRef.current;
    if (!el) return;
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      host.setTreeUi(openList, el.scrollTop);
    }, 100);
  };

  return (
    <div className="PluginUI ImpulseUI">
      <Header title="Impulse">
        <WithInfo title={impulseInfo.source} className="info-block">
          <Buttons
            entries={IMPULSE_SOURCE_ENTRIES}
            value={Math.round(source)}
            onChange={(v) => {
              host.beginEdit(paramIds.source);
              host.source$.set(v);
              host.endEdit(paramIds.source);
            }}
          />
        </WithInfo>
        <WithInfo title={impulseInfo.bypass}>
          <Toggle state$={host.bypass$} icon="power" className="active" />
        </WithInfo>
      </Header>

      <ImpulseChart
        data$={host.wave$}
        decay$={host.decay$}
        predelay$={host.predelay$}
        shape$={host.shape$}
        {...edit(paramIds.decay)}
      />

      <div className="lib block">
        <div className="title">Library</div>
        <div className="lib-bar">
          <WithInfo title={impulseInfo.library}>
            <Button label="Select…" onClick={() => host.browseLibrary()} />
          </WithInfo>
          <Button
            label="Rescan"
            onClick={() => host.rescanLibrary()}
            disabled={!root}
          />
          <WithInfo title={impulseInfo.filter} className="filter-wrap">
            <input
              className="filter"
              type="search"
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </WithInfo>
          <span className="root" title={root || undefined}>
            {rootLabel}
          </span>
          <span className="status">{status}</span>
        </div>
        <div className="lib-tree" ref={treeRef} onScroll={onTreeScroll}>
          {shown.length === 0 ? (
            <div className="empty">
              {root
                ? 'No matching WAV / AIFF files.'
                : 'Choose a library folder to browse impulse responses.'}
            </div>
          ) : (
            <IrTree
              nodes={shown}
              selected={selected}
              onSelect={(rel) => host.selectIr(rel)}
              open={open}
              toggle={toggle}
            />
          )}
        </div>
      </div>

      <div className="ctrl block">
        <div className="title">Reverb</div>
        <FrequencyRange
          title="Wet Filter"
          hipass$={host.hipass$}
          lopass$={host.lopass$}
          hpMode$={host.hpMode$}
          lpMode$={host.lpMode$}
          modeEntries={FREQUENCY_RANGE_LR_MODE_ENTRIES}
          hipassDefault={impulseParamDefault('hipass')}
          lopassDefault={impulseParamDefault('lopass')}
          hipassEdit={edit(paramIds.hipass)}
          lopassEdit={edit(paramIds.lopass)}
          layout="vertical"
        />

        <div className="left">
          <WithInfo title={impulseInfo.decay} className="decay">
            <Knob
              label="Decay"
              value$={host.decay$}
              min={0.15}
              max={1}
              reset={impulseParamDefault('decay')}
              dots={DECAY_DOTS}
              labels={DECAY_LABELS}
              {...edit(paramIds.decay)}
              {...{ 'value.format': (v: number) => `${Math.round(v * 100)}%` }}
              size="large"
            />
          </WithInfo>
          <WithInfo title={impulseInfo.reverse} className="reverse">
            <Toggle state$={host.reverse$} label="Reverse" />
          </WithInfo>
        </div>

        <div className="knobs">
          <WithInfo title={impulseInfo.shape} className="shape">
            <Knob
              label="Shape"
              value$={host.shape$}
              min={1}
              max={8}
              reset={impulseParamDefault('shape')}
              dots={SHAPE_DOTS}
              labels={SHAPE_LABELS}
              scale="log2"
              {...edit(paramIds.shape)}
            />
          </WithInfo>
          <WithInfo title={impulseInfo.predelay} className="predelay">
            <Knob
              label="Predelay"
              value$={host.predelay$}
              min={0}
              max={500}
              unit="ms"
              reset={impulseParamDefault('predelay')}
              dots={PREDELAY_DOTS}
              labels={PREDELAY_LABELS}
              {...edit(paramIds.predelay)}
              scale="log2"
            />
          </WithInfo>
          <WithInfo title={impulseInfo.amount} className="wet">
            <Knob
              label="Wet"
              value$={host.amount$}
              min={-60}
              max={12}
              reset={impulseParamDefault('amount')}
              base={0}
              scale="decibel"
              log_factor={3}
              dots={MIX_DB_DOTS}
              labels={MIX_DB_LABELS}
              {...edit(paramIds.amount)}
            />
          </WithInfo>
          <WithInfo title={impulseInfo.dry} className="dry">
            <Knob
              label="Dry"
              value$={host.dry$}
              min={-60}
              max={12}
              reset={impulseParamDefault('dry')}
              base={0}
              scale="decibel"
              log_factor={3}
              dots={MIX_DB_DOTS}
              labels={MIX_DB_LABELS}
              {...edit(paramIds.dry)}
            />
          </WithInfo>
        </div>
      </div>
    </div>
  );
}
