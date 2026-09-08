import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/impulseModel';
import {
  bindBoolParamToHost,
  bindIrMessages,
  bindParamToHost,
  bindVizWave,
  postBegin,
  postEnd,
} from '../bind_param';
import { postToHost } from '../bridge';
import type { IrNode } from '../irTypes';

export const IMPULSE_QUALITY_ENTRIES = [
  { label: 'Lo', value: 0 },
  { label: 'Mid', value: 1 },
  { label: 'Hi', value: 2 },
];

export type IImpulseHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  decay$: DynamicValue<number>;
  predelay$: DynamicValue<number>;
  hipass$: DynamicValue<number>;
  lopass$: DynamicValue<number>;
  hpMode$: DynamicValue<number>;
  lpMode$: DynamicValue<number>;
  reverse$: DynamicValue<boolean>;
  dry$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  source$: DynamicValue<number>;
  shape$: DynamicValue<number>;
  quality$: DynamicValue<number>;
  wave$: DynamicValue<number[]>;
  tree$: DynamicValue<IrNode[]>;
  root$: DynamicValue<string>;
  selected$: DynamicValue<string>;
  status$: DynamicValue<string>;
  openDirs$: DynamicValue<string[]>;
  treeScroll$: DynamicValue<number>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  browseLibrary: () => void;
  rescanLibrary: () => void;
  selectIr: (rel: string) => void;
  setTreeUi: (open: string[], scroll: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function impulseParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  return paramDefault(name, fallback);
}

function bindNum(name: keyof typeof paramIds, fallback = 0): DynamicValue<number> {
  const dv = DynamicValue.fromConstant(paramDefault(name, fallback));
  bindParamToHost(dv, paramIds[name]);
  return dv;
}

function bindBool(name: keyof typeof paramIds): DynamicValue<boolean> {
  const dv = DynamicValue.fromConstant(paramDefault(name, 0) >= 0.5);
  bindBoolParamToHost(dv, paramIds[name]);
  return dv;
}

function packTreeUi(open: string[], scroll: number): string {
  const paths = open.filter((p) => typeof p === 'string' && p.length > 0).slice(0, 512);
  return `${Math.max(0, Math.round(scroll))}\n${paths.join('\n')}`;
}

export function createBoundImpulseHost(): IImpulseHost {
  const wave$ = DynamicValue.fromConstant<number[]>([]);
  bindVizWave(wave$, 'impulse');
  const tree$ = DynamicValue.fromConstant<IrNode[]>([]);
  const root$ = DynamicValue.fromConstant('');
  const selected$ = DynamicValue.fromConstant('');
  const status$ = DynamicValue.fromConstant('');
  const openDirs$ = DynamicValue.fromConstant<string[]>([]);
  const treeScroll$ = DynamicValue.fromConstant(0);
  bindIrMessages((msg) => {
    if (msg.cmd === 'tree') {
      if (typeof msg.root === 'string')
        root$.set(msg.root);
      if (typeof msg.sel === 'string')
        selected$.set(msg.sel);
      if (typeof msg.status === 'string')
        status$.set(msg.status);
      if (Array.isArray(msg.tree))
        tree$.set(msg.tree);
      if (Array.isArray(msg.open))
        openDirs$.set(msg.open.filter((s): s is string => typeof s === 'string'));
      if (typeof msg.scroll === 'number' && Number.isFinite(msg.scroll))
        treeScroll$.set(Math.max(0, msg.scroll));
      return;
    }
    if (msg.cmd === 'sel') {
      if (typeof msg.path === 'string')
        selected$.set(msg.path);
      if (typeof msg.status === 'string')
        status$.set(msg.status);
      return;
    }
    if (msg.cmd === 'status' && typeof msg.status === 'string')
      status$.set(msg.status);
  });
  const setTreeUi = (open: string[], scroll: number) => {
    const nextOpen = open.filter((p) => typeof p === 'string' && p.length > 0).slice(0, 512);
    const nextScroll = Math.max(0, Math.round(scroll));
    openDirs$.set(nextOpen);
    treeScroll$.set(nextScroll);
    postToHost({ t: 'ir', cmd: 'ui', path: packTreeUi(nextOpen, nextScroll) });
  };
  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    decay$: bindNum('decay', 1),
    predelay$: bindNum('predelay', 0),
    hipass$: bindNum('hipass', 60),
    lopass$: bindNum('lopass', 10000),
    hpMode$: bindNum('hp_mode', 2),
    lpMode$: bindNum('lp_mode', 0),
    reverse$: bindBool('reverse'),
    dry$: bindNum('dry', 0),
    amount$: bindNum('amount', -12),
    source$: bindNum('source', 0),
    shape$: bindNum('shape', 4),
    quality$: bindNum('quality', 2),
    wave$,
    tree$,
    root$,
    selected$,
    status$,
    openDirs$,
    treeScroll$,
    beginEdit: (id) => postBegin(id),
    endEdit: (id) => postEnd(id),
    browseLibrary: () => postToHost({ t: 'ir', cmd: 'browse' }),
    rescanLibrary: () => postToHost({ t: 'ir', cmd: 'rescan' }),
    selectIr: (rel) => postToHost({ t: 'ir', cmd: 'select', path: rel }),
    setTreeUi,
  };
}
