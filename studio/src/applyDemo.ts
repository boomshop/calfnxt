import type { DynamicValue } from '@deutschesoft/awml';
import type {
  ICompressorHost,
  IDeesserHost,
  IDelayHost,
  IEqualizerHost,
  ILimiterHost,
  IMbcompHost,
  IReverbHost,
  IStereoHost,
  ITransientsHost,
  PluginId,
} from '@calfnxt/ui';

export type VizFixture = {
  levelsIn?: number[];
  levelsOut?: number[];
  /** Interleaved history / envelope floats (+ optional trailing phase). */
  envelope?: number[];
  /** UI GR meter amount 0…60 (compressor / deesser). */
  gr?: number;
  /** Transfer operating point [inDb, outDb]. */
  point?: number[];
  corr?: number;
  gonio?: number[];
  tempo?: number[];
  gains?: number[];
  /** Interleaved per-band levels [in0, out0, in1, out1, …] in dB (mbcomp). */
  bandio?: number[];
};

function setNum(dv: DynamicValue<number> | undefined, v: unknown) {
  if (!dv || typeof v !== 'number' || !Number.isFinite(v)) return;
  dv.set(v);
}

function setBool(dv: DynamicValue<boolean> | undefined, v: unknown) {
  if (!dv) return;
  if (typeof v === 'boolean') dv.set(v);
  else if (typeof v === 'number') dv.set(v >= 0.5);
}

function pushViz(
  id: string,
  kind: string,
  v: number[],
) {
  const host = window.__calfnxtOnHost;
  if (typeof host !== 'function') return;
  host({ t: 'viz', id, kind, v } as never);
}

/** Shared meter / envelope injection (Header owns its own createHeaderIo). */
export function applySharedViz(viz: VizFixture) {
  if (viz.levelsIn)
    pushViz('in', 'levels', viz.levelsIn);
  if (viz.levelsOut)
    pushViz('out', 'levels', viz.levelsOut);
}

export function applyCompressorDemo(
  host: ICompressorHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.threshold$, params.threshold);
  setNum(host.ratio$, params.ratio);
  setNum(host.knee$, params.knee);
  setNum(host.attack$, params.attack);
  setNum(host.release$, params.release);
  setNum(host.makeup$, params.makeup);
  setNum(host.mix$, params.mix);
  setNum(host.mode$, params.mode);
  setNum(host.link$, params.link);
  setNum(host.pdr$, params.pdr);
  setNum(host.hipass$, params.hipass);
  setNum(host.lopass$, params.lopass);
  setNum(host.hpMode$, params.hp_mode);
  setNum(host.lpMode$, params.lp_mode);
  setBool(host.listen$, params.listen);

  applySharedViz(viz);
  if (viz.envelope)
    host.historyData$.set(new Float32Array(viz.envelope));
  if (typeof viz.gr === 'number')
    host.gr$.set(viz.gr);
  if (viz.point)
    host.point$.set(viz.point);
}

export function applyDeesserDemo(
  host: IDeesserHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.mode$, params.mode);
  setNum(host.detection$, params.detection);
  setNum(host.slope$, params.slope);
  setNum(host.threshold$, params.threshold);
  setNum(host.ratio$, params.ratio);
  setNum(host.laxity$, params.laxity);
  setNum(host.makeup$, params.makeup);
  setNum(host.splitFreq$, params.split_freq);
  setNum(host.hpQ$, params.hp_q);
  setNum(host.peakFreq$, params.peak_freq);
  setNum(host.peakGain$, params.peak_gain);
  setNum(host.peakQ$, params.peak_q);
  setBool(host.listen$, params.listen);

  applySharedViz(viz);
  if (viz.envelope)
    host.historyData$.set(new Float32Array(viz.envelope));
  if (typeof viz.gr === 'number')
    host.gr$.set(viz.gr);
}

export function applyTransientsDemo(
  host: ITransientsHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.mix$, params.mix);
  setNum(host.attackTime$, params.attack_time);
  setNum(host.attackBoost$, params.attack_boost);
  setNum(host.sustainThreshold$, params.sustain_threshold);
  setNum(host.releaseTime$, params.release_time);
  setNum(host.releaseBoost$, params.release_boost);
  setNum(host.display$, params.display);
  setNum(host.lookahead$, params.lookahead);
  setNum(host.view$, params.view);
  setNum(host.hipass$, params.hipass);
  setNum(host.lopass$, params.lopass);
  setNum(host.hpMode$, params.hp_mode);
  setNum(host.lpMode$, params.lp_mode);
  setBool(host.listen$, params.listen);

  applySharedViz(viz);
  if (viz.envelope)
    host.envelopeData$.set(new Float32Array(viz.envelope));
}

export function applyStereoDemo(
  host: IStereoHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.levelL$, params.level_l);
  setNum(host.levelR$, params.level_r);
  setNum(host.mode$, params.mode);
  setNum(host.mlev$, params.mlev);
  setNum(host.mpan$, params.mpan);
  setNum(host.slev$, params.slev);
  setNum(host.sbal$, params.sbal);
  setBool(host.decorr$, params.decorr);
  setNum(host.decorrAmount$, params.decorr_amount);
  setNum(host.decorrXover$, params.decorr_xover);
  setNum(host.decorrSlope$, params.decorr_slope);
  setNum(host.decorrStages$, params.decorr_stages);
  setNum(host.decorrSpread$, params.decorr_spread);
  setBool(host.muteL$, params.mute_l);
  setBool(host.muteR$, params.mute_r);
  setBool(host.phaseL$, params.phase_l);
  setBool(host.phaseR$, params.phase_r);
  setNum(host.delay$, params.delay);
  setNum(host.stereoBase$, params.stereo_base);
  setNum(host.stereoPhase$, params.stereo_phase);
  setNum(host.balanceOut$, params.balance_out);

  applySharedViz(viz);
  if (typeof viz.corr === 'number')
    host.corr$.set(viz.corr);
  if (viz.gonio)
    host.gonio$.set(viz.gonio);
}

export function applyDelayDemo(
  host: IDelayHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.active$, params.active);
  setBool(host.sync$, params.sync);
  setNum(host.bpm$, params.bpm);
  setNum(host.ms$, params.ms);
  setNum(host.subdiv$, params.subdiv);
  setNum(host.timeL$, params.time_l);
  setNum(host.timeR$, params.time_r);
  setNum(host.feedback$, params.feedback);
  setNum(host.amount$, params.amount);
  setNum(host.dry$, params.dry);
  setNum(host.width$, params.width);
  setNum(host.mixMode$, params.mix_mode);
  setNum(host.hipass$, params.hipass);
  setNum(host.lopass$, params.lopass);
  setNum(host.hpMode$, params.hp_mode);
  setNum(host.lpMode$, params.lp_mode);

  applySharedViz(viz);
  if (viz.tempo)
    host.hostTempo$.set(viz.tempo);
}

export function applyReverbDemo(
  host: IReverbHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.active$, params.active);
  setNum(host.roomSize$, params.room_size);
  setNum(host.distance$, params.distance);
  setNum(host.decay$, params.decay);
  setNum(host.diffusion$, params.diffusion);
  setNum(host.diffuse$, params.diffuse);
  setNum(host.predelay$, params.predelay);
  setNum(host.hipass$, params.hipass);
  setNum(host.lopass$, params.lopass);
  setNum(host.hpMode$, params.hp_mode);
  setNum(host.lpMode$, params.lp_mode);
  setBool(host.listen$, params.listen);
  setNum(host.hfDamp$, params.hf_damp);
  setNum(host.lfDamp$, params.lf_damp);
  setNum(host.air$, params.air);
  setNum(host.erMode$, params.er_mode);
  setNum(host.erLevel$, params.er_level);
  setNum(host.pathMode$, params.path_mode);
  setNum(host.lateLevel$, params.late_level);
  setNum(host.modRate$, params.mod_rate);
  setNum(host.modDepth$, params.mod_depth);
  setNum(host.widthMode$, params.width_mode);
  setNum(host.width$, params.width);
  setNum(host.duck$, params.duck);
  setBool(host.gate$, params.gate);
  setNum(host.gateThreshold$, params.gate_threshold);
  setNum(host.gateHold$, params.gate_hold);
  setNum(host.gateRelease$, params.gate_release);
  setBool(host.freeze$, params.freeze);
  setNum(host.dry$, params.dry);
  setNum(host.amount$, params.amount);

  applySharedViz(viz);
}

export function applyEqualizerDemo(
  host: IEqualizerHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  const bands = params.bands;
  if (Array.isArray(bands)) {
    for (const b of bands) {
      if (!b || typeof b !== 'object') continue;
      const rec = b as Record<string, unknown>;
      const idx = typeof rec.index === 'number' ? rec.index : -1;
      const band = host.bands[idx];
      if (!band) continue;
      setBool(band.active$, rec.active);
      setNum(band.frequency$, rec.frequency);
      setNum(band.gain$, rec.gain);
      setNum(band.q$, rec.q);
      if (typeof rec.slope === 'number')
        band.slope$.set(rec.slope as 12 | 24 | 36 | 48);
      if (typeof rec.type === 'string')
        band.type$.set(rec.type as typeof band.type$.value);
      if (typeof rec.gain === 'number')
        band.effectiveGain$.set(rec.gain);
    }
  }

  applySharedViz(viz);
  if (viz.gains)
    pushViz('eq', 'gains', viz.gains);
}

function applyMbcompMeters(host: IMbcompHost, viz: VizFixture) {
  applySharedViz(viz);
  if (viz.gains) {
    const gr = viz.gains.map((db) => Math.max(0, -db));
    host.grAll$.set(gr);
    for (const band of host.bands) {
      const v = gr[band.index];
      band.gr$.set(typeof v === 'number' ? v : 0);
    }
  }
  if (viz.bandio) {
    host.bandIo$.set(viz.bandio);
    // Nudge ±0.05 dB so AUX LevelMeter.set() always runs (identical peaks are
    // ignored while falling is active — and bindings may skip unchanged values).
    const eps = performance.now() % 2 < 1 ? 0.05 : 0;
    for (const band of host.bands) {
      const inDb = viz.bandio[band.index * 2];
      const outDb = viz.bandio[band.index * 2 + 1];
      band.inLevel$.set(
        typeof inDb === 'number' && Number.isFinite(inDb) ? inDb + eps : -96,
      );
      band.outLevel$.set(
        typeof outDb === 'number' && Number.isFinite(outDb) ? outDb + eps : -96,
      );
    }
    pushViz('mbcomp', 'bandio', viz.bandio);
  }
  if (viz.point) host.point$.set(viz.point);
}

export function applyLimiterDemo(
  host: ILimiterHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.limit$, params.limit);
  setNum(host.attack$, params.attack);
  setNum(host.release$, params.release);
  setBool(host.asc$, params.asc);
  setNum(host.ascCoeff$, params.asc_coeff);
  setNum(host.oversampling$, params.oversampling);
  setBool(host.autoLevel$, params.auto_level);
  setNum(host.curve$, params.curve);
  setNum(host.knee$, params.knee);
  setBool(host.colorEnable$, params.color_enable);
  setNum(host.color$, params.color);
  setBool(host.truePeak$, params.true_peak);
  setNum(host.margin$, params.margin);
  setBool(host.diffListen$, params.diff_listen);
  setBool(host.holdEnable$, params.hold_enable);
  setNum(host.releaseHold$, params.release_hold);
  setBool(host.emphasisEnable$, params.emphasis_enable);
  setNum(host.emphasis$, params.emphasis);

  applySharedViz(viz);
  if (viz.envelope)
    host.historyData$.set(new Float32Array(viz.envelope));
  if (typeof viz.gr === 'number')
    host.gr$.set(viz.gr);
}

export function applyMbcompDemo(
  host: IMbcompHost,
  params: Record<string, unknown>,
  viz: VizFixture,
): () => void {
  setBool(host.bypass$, params.bypass);
  setNum(host.numBands$, params.num_bands);
  setNum(host.slope$, params.slope);
  const xovers = params.xovers;
  if (Array.isArray(xovers))
    xovers.forEach((hz, i) => setNum(host.xover$[i], hz));

  const bands = params.bands;
  if (Array.isArray(bands)) {
    for (const b of bands) {
      if (!b || typeof b !== 'object') continue;
      const rec = b as Record<string, unknown>;
      const idx = typeof rec.index === 'number' ? rec.index : -1;
      const band = host.bands[idx];
      if (!band) continue;
      setBool(band.active$, rec.active);
      setBool(band.bypass$, rec.bypass);
      setBool(band.listen$, rec.listen);
      setNum(band.threshold$, rec.threshold);
      setNum(band.ratio$, rec.ratio);
      setNum(band.knee$, rec.knee);
      setNum(band.attack$, rec.attack);
      setNum(band.release$, rec.release);
      setNum(band.makeup$, rec.makeup);
      setNum(band.mix$, rec.mix);
      setNum(band.mode$, rec.mode);
      setNum(band.link$, rec.link);
      setNum(band.pdr$, rec.pdr);
    }
  }

  const selected =
    typeof params.selected_band === 'number' ? params.selected_band : 1;
  host.selectedBandIndex$.set(
    Math.max(0, Math.min(host.bands.length - 1, Math.round(selected))),
  );

  if (viz.envelope)
    host.historyAll$.set(new Float32Array(viz.envelope));

  applyMbcompMeters(host, viz);
  // Strip/header LevelMeters use AUX falling; static fixtures must be refreshed
  // or the bars empty before Playwright captures.
  const hold = window.setInterval(() => applyMbcompMeters(host, viz), 50);
  return () => window.clearInterval(hold);
}

export type DemoApplier = (
  host: unknown,
  params: Record<string, unknown>,
  viz: VizFixture,
) => void | (() => void);

export const demoAppliers: Record<PluginId, DemoApplier> = {
  compressor: applyCompressorDemo as DemoApplier,
  deesser: applyDeesserDemo as DemoApplier,
  delay: applyDelayDemo as DemoApplier,
  equalizer: applyEqualizerDemo as DemoApplier,
  limiter: applyLimiterDemo as DemoApplier,
  mbcomp: applyMbcompDemo as DemoApplier,
  reverb: applyReverbDemo as DemoApplier,
  stereo: applyStereoDemo as DemoApplier,
  transients: applyTransientsDemo as DemoApplier,
};
