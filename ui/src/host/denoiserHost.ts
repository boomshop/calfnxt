import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/denoiserModel';
import {
  bindBoolParamToHost,
  bindIrMessages,
  bindParamToHost,
  bindVizResponse,
  bindVizSpectrum,
  postBegin,
  postEnd,
} from '../utils/bind_param';
import { postToHost } from '../utils/bridge';

export const DENOISER_QUALITY_ENTRIES = [
  { label: 'Fast', value: 0 },
  { label: 'Normal', value: 1 },
  { label: 'Studio', value: 2 },
  { label: 'Ultra', value: 3 },
];

/** FFT length for a Quality plain (0…3). Matches `qualityToFft` in the DSP. */
export function denoiserQualityFft(quality: number): number {
  switch (Math.round(quality)) {
    case 0:
      return 1024;
    case 2:
      return 4096;
    case 3:
      return 8192;
    default:
      return 2048;
  }
}

/** Display tilt (matches Analyzer / EQ / Tamer spectrum). */
export const DENOISER_SPECTRUM_ENTRIES = [
  { label: 'Lin', value: 0 },
  { label: '−3 dB', value: 1 },
  { label: '−4.5 dB', value: 2 },
];

export type DenoiserProfileSlot = {
  /** UI slot 1…3 */
  i: number;
  valid: boolean;
  db: number[];
  /** Log fraction 0…1 of each display-slot center. Absent on older payloads. */
  t?: number[];
  /** FFT length the fingerprint was learned at. Absent until the host reports it. */
  fft?: number;
};

export type IDenoiserHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  profile$: DynamicValue<number>;
  blend$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  floor$: DynamicValue<number>;
  /** dB above the raised floor where gain is −6 dB. 3 = unstretched Wiener, 24 = wide. */
  span$: DynamicValue<number>;
  /** dB added to every noise-power bin before the gain law. */
  offset$: DynamicValue<number>;
  fLo$: DynamicValue<number>;
  /** 0 off / 1…4 = 12/24/36/48 dB/oct. */
  fLoSlope$: DynamicValue<number>;
  fHi$: DynamicValue<number>;
  /** 0 off / 1…4 = 12/24/36/48 dB/oct. */
  fHiSlope$: DynamicValue<number>;
  quality$: DynamicValue<number>;
  spectrum$: DynamicValue<number>;
  diffListen$: DynamicValue<boolean>;
  /** Header Mono: left input, both outputs, one FFT. */
  mono$: DynamicValue<boolean>;
  /** 0 off / 1…3 profile listen. */
  listen$: DynamicValue<number>;
  /** Per-card listen toggles (exclusive with each other and Diff Listen). */
  listenSlot1$: DynamicValue<boolean>;
  listenSlot2$: DynamicValue<boolean>;
  listenSlot3$: DynamicValue<boolean>;
  /** Per-card Learn toggles — average while on, finalize on release (exclusive). */
  learnSlot1$: DynamicValue<boolean>;
  learnSlot2$: DynamicValue<boolean>;
  learnSlot3$: DynamicValue<boolean>;
  spectrumData$: DynamicValue<number[]>;
  profileSpectrum$: DynamicValue<number[]>;
  /** Learned fingerprints, spectrum layout, viz ids denoiser_p1…p3. */
  profile1$: DynamicValue<number[]>;
  profile2$: DynamicValue<number[]>;
  profile3$: DynamicValue<number[]>;
  grResponse$: DynamicValue<number[]>;
  /** Learned profile snapshots from host IR `profiles` messages. */
  profiles$: DynamicValue<DenoiserProfileSlot[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  clearProfile: (slot: number) => void;
  selectProfile: (slot: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function denoiserParamDefault(
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

function emptyProfiles(): DenoiserProfileSlot[] {
  return [
    { i: 1, valid: false, db: [] },
    { i: 2, valid: false, db: [] },
    { i: 3, valid: false, db: [] },
  ];
}

/**
 * Keep listen$ (0…3), per-slot toggles, and Diff Listen exclusive.
 * Profile listen wins over Diff Listen (matches DSP).
 */
function wireListenExclusivity(
  listen$: DynamicValue<number>,
  slots: [
    DynamicValue<boolean>,
    DynamicValue<boolean>,
    DynamicValue<boolean>,
  ],
  diffListen$: DynamicValue<boolean>,
): void {
  let syncing = false;

  const applyListen = (n: number) => {
    const slot = Math.max(0, Math.min(3, Math.round(n)));
    syncing = true;
    if (Math.round(listen$.value ?? 0) !== slot) listen$.set(slot);
    for (let i = 0; i < 3; ++i) {
      const want = slot === i + 1;
      if (!!slots[i].value !== want) slots[i].set(want);
    }
    if (slot >= 1 && diffListen$.value) diffListen$.set(false);
    syncing = false;
  };

  listen$.subscribe((v) => {
    if (syncing) return;
    applyListen(v ?? 0);
  }, false);

  for (let i = 0; i < 3; ++i) {
    const slot = i + 1;
    slots[i].subscribe((on) => {
      if (syncing) return;
      if (on) applyListen(slot);
      else if (Math.round(listen$.value ?? 0) === slot) applyListen(0);
    }, false);
  }

  diffListen$.subscribe((on) => {
    if (syncing) return;
    if (on && Math.round(listen$.value ?? 0) >= 1) applyListen(0);
  }, false);

  applyListen(listen$.value ?? 0);
}

/**
 * Exclusive Learn toggles: on → `{cmd:learn}`, off → `{cmd:stop}`.
 * Starting another slot turns the previous one off (finalize then restart).
 */
function wireLearnToggles(
  slots: [
    DynamicValue<boolean>,
    DynamicValue<boolean>,
    DynamicValue<boolean>,
  ],
): void {
  let syncing = false;

  for (let i = 0; i < 3; ++i) {
    const slot = i + 1;
    slots[i].subscribe((on) => {
      if (syncing) return;
      if (on) {
        syncing = true;
        for (let j = 0; j < 3; ++j) {
          if (j !== i && slots[j].value) slots[j].set(false);
        }
        syncing = false;
        postToHost({ t: 'ir', cmd: 'learn', slot });
      } else {
        postToHost({ t: 'ir', cmd: 'stop', slot });
      }
    }, false);
  }
}

export function createBoundDenoiserHost(): IDenoiserHost {
  const spectrumData$ = DynamicValue.fromConstant<number[]>([]);
  const profileSpectrum$ = DynamicValue.fromConstant<number[]>([]);
  const profile1$ = DynamicValue.fromConstant<number[]>([]);
  const profile2$ = DynamicValue.fromConstant<number[]>([]);
  const profile3$ = DynamicValue.fromConstant<number[]>([]);
  const grResponse$ = DynamicValue.fromConstant<number[]>([]);
  const profiles$ = DynamicValue.fromConstant<DenoiserProfileSlot[]>(emptyProfiles());

  bindVizSpectrum(spectrumData$, 'fft');
  bindVizSpectrum(profileSpectrum$, 'denoiser_prof');
  bindVizSpectrum(profile1$, 'denoiser_p1');
  bindVizSpectrum(profile2$, 'denoiser_p2');
  bindVizSpectrum(profile3$, 'denoiser_p3');
  bindVizResponse(grResponse$, 'denoiser');

  const listen$ = bindNum('listen', 0);
  const diffListen$ = bindBool('diff_listen');
  const listenSlot1$ = DynamicValue.fromConstant(false);
  const listenSlot2$ = DynamicValue.fromConstant(false);
  const listenSlot3$ = DynamicValue.fromConstant(false);
  wireListenExclusivity(
    listen$,
    [listenSlot1$, listenSlot2$, listenSlot3$],
    diffListen$,
  );

  const learnSlot1$ = DynamicValue.fromConstant(false);
  const learnSlot2$ = DynamicValue.fromConstant(false);
  const learnSlot3$ = DynamicValue.fromConstant(false);
  wireLearnToggles([learnSlot1$, learnSlot2$, learnSlot3$]);

  const profile$ = bindNum('profile', 1);

  bindIrMessages((msg) => {
    if (msg.cmd !== 'profiles') return;
    const next = emptyProfiles();
    const slots = Array.isArray(msg.slots) ? msg.slots : [];
    for (const s of slots) {
      if (!s || typeof s !== 'object') continue;
      const i = Math.round(Number(s.i));
      if (i < 1 || i > 3) continue;
      const db = Array.isArray(s.db)
        ? s.db.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : -120))
        : [];
      const t = Array.isArray(s.t)
        ? s.t.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0))
        : undefined;
      const fft = Number(s.fft);
      next[i - 1] = {
        i,
        valid: Number(s.valid) >= 0.5,
        db,
        t: t && t.length === db.length ? t : undefined,
        fft: Number.isFinite(fft) && fft > 0 ? Math.round(fft) : undefined,
      };
    }
    profiles$.set(next);
  });

  const clearProfile = (slot: number) => {
    const n = Math.round(slot);
    if (n < 1 || n > 3) return;
    // Optimistic UI — don't wait for the IR `profiles` echo.
    const cur = profiles$.value ?? emptyProfiles();
    const next = cur.map((p, i) =>
      i === n - 1 ? { i: n, valid: false, db: [] as number[] } : { ...p },
    );
    profiles$.set(next);
    // DSP clear cancels an in-progress learn (no commit) then wipes.
    postToHost({ t: 'ir', cmd: 'clear', slot: n });
    const learnSlots = [learnSlot1$, learnSlot2$, learnSlot3$];
    // After clear: turning Learn off only posts stop (no-op if already cancelled).
    if (learnSlots[n - 1]?.value) learnSlots[n - 1]!.set(false);
  };

  const selectProfile = (slot: number) => {
    const n = Math.round(slot);
    if (n < 1 || n > 3) return;
    postBegin(paramIds.profile);
    profile$.set(n);
    postEnd(paramIds.profile);
  };

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    profile$,
    blend$: bindNum('blend', 250),
    amount$: bindNum('amount', 1),
    floor$: bindNum('floor', -20),
    span$: bindNum('span', 12),
    offset$: bindNum('offset', 0),
    fLo$: bindNum('f_lo', 20),
    fLoSlope$: bindNum('f_lo_slope', 2),
    fHi$: bindNum('f_hi', 160),
    fHiSlope$: bindNum('f_hi_slope', 2),
    quality$: bindNum('quality', 1),
    spectrum$: bindNum('spectrum', 1),
    diffListen$,
    mono$: bindBool('mono'),
    listen$,
    listenSlot1$,
    listenSlot2$,
    listenSlot3$,
    learnSlot1$,
    learnSlot2$,
    learnSlot3$,
    spectrumData$,
    profileSpectrum$,
    profile1$,
    profile2$,
    profile3$,
    grResponse$,
    profiles$,
    beginEdit: postBegin,
    endEdit: postEnd,
    clearProfile,
    selectProfile,
  };
}
