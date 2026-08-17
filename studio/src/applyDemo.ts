import type { DynamicValue } from '@deutschesoft/awml';
import type {
  ICompressorHost,
  IExpanderHost,
  IDeesserHost,
  IDelayHost,
  IEqualizerHost,
  IHarmonicsHost,
  ILimiterHost,
  IMblimiterHost,
  IMbcompHost,
  IReverbHost,
  IStereoHost,
  ITransientsHost,
  IAnalyzerHost,
  IFilterHost,
  IRingmodHost,
  IPulsatorHost,
  ICrusherHost,
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
  /** Waveshaper viz [zone, …densityBins] in 0…1 (harmonics). */
  shape?: number[];
  /** Spectrum: [bins, hold, avg×N, max×N, L×N, R×N] dBFS. */
  spectrum?: number[];
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

export function applyExpanderDemo(
  host: IExpanderHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.threshold$, params.threshold);
  setNum(host.releaseThreshold$, params.release_threshold);
  setNum(host.ratio$, params.ratio);
  setNum(host.knee$, params.knee);
  setNum(host.attack$, params.attack);
  setNum(host.hold$, params.hold);
  setNum(host.release$, params.release);
  setNum(host.range$, params.range);
  setNum(host.mode$, params.mode);
  setNum(host.link$, params.link);
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
  setNum(host.target$, params.target);
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
  setNum(host.lookahead$, params.lookahead);
  setNum(host.view$, params.view);
  setNum(host.hipass$, params.hipass);
  setNum(host.lopass$, params.lopass);
  setNum(host.hpMode$, params.hp_mode);
  setNum(host.lpMode$, params.lp_mode);
  setBool(host.listen$, params.listen);
  setNum(host.softClip$, params.soft_clip);
  setNum(host.link$, params.link);
  setNum(host.sensitivity$, params.sensitivity);
  setBool(host.delta$, params.delta);

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

export function applyAnalyzerDemo(
  host: IAnalyzerHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.mode$, params.mode);
  setBool(host.hold$, params.hold);
  setNum(host.fftSize$, params.fft_size);
  setNum(host.scale$, params.scale);

  applySharedViz(viz);
  if (typeof viz.corr === 'number')
    host.corr$.set(viz.corr);
  if (viz.gonio)
    host.gonio$.set(viz.gonio);
  if (viz.spectrum) {
    host.spectrum$.set(viz.spectrum);
    pushViz('fft', 'spectrum', viz.spectrum);
  }
}

export function applyFilterDemo(
  host: IFilterHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setBool(host.mono$, params.mono);
  setNum(host.mode$, params.mode);
  setNum(host.resonance$, params.resonance);
  setNum(host.frequency$, params.frequency);
  setNum(host.inertia$, params.inertia);
  setBool(host.envPower$, params.env_power);
  setNum(host.mix$, params.mix);
  setNum(host.softClip$, params.soft_clip);
  setNum(host.target$, params.target);
  setNum(host.activation$, params.activation);
  setNum(host.attack$, params.attack);
  setNum(host.release$, params.release);
  setNum(host.detection$, params.detection);
  setNum(host.spectrum$, params.spectrum);
  applySharedViz(viz);
}

export function applyRingmodDemo(
  host: IRingmodHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.modMode$, params.mod_mode);
  setNum(host.modFreq$, params.mod_freq);
  setNum(host.modAmount$, params.mod_amount);
  setNum(host.modPhase$, params.mod_phase);
  setNum(host.modDetune$, params.mod_detune);
  setBool(host.modListen$, params.mod_listen);
  setNum(host.lfo1Mode$, params.lfo1_mode);
  setNum(host.lfo1Freq$, params.lfo1_freq);
  setNum(host.lfo1ModFreqLo$, params.lfo1_mod_freq_lo);
  setNum(host.lfo1ModFreqHi$, params.lfo1_mod_freq_hi);
  setBool(host.lfo1ModFreqActive$, params.lfo1_mod_freq_active);
  setNum(host.lfo1ModDetuneLo$, params.lfo1_mod_detune_lo);
  setNum(host.lfo1ModDetuneHi$, params.lfo1_mod_detune_hi);
  setBool(host.lfo1ModDetuneActive$, params.lfo1_mod_detune_active);
  setNum(host.lfo2Mode$, params.lfo2_mode);
  setNum(host.lfo2Freq$, params.lfo2_freq);
  setNum(host.lfo2Lfo1FreqLo$, params.lfo2_lfo1_freq_lo);
  setNum(host.lfo2Lfo1FreqHi$, params.lfo2_lfo1_freq_hi);
  setBool(host.lfo2Lfo1FreqActive$, params.lfo2_lfo1_freq_active);
  setNum(host.lfo2ModAmountLo$, params.lfo2_mod_amount_lo);
  setNum(host.lfo2ModAmountHi$, params.lfo2_mod_amount_hi);
  setBool(host.lfo2ModAmountActive$, params.lfo2_mod_amount_active);
  applySharedViz(viz);
  host.lfoActivity$.set([0.55, 0.4]);
  host.lfo1Activity$.set(0.55);
  host.lfo2Activity$.set(0.4);
}

export function applyPulsatorDemo(
  host: IPulsatorHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.mode$, params.mode);
  setNum(host.amount$, params.amount);
  setNum(host.offsetL$, params.offset_l);
  setNum(host.offsetR$, params.offset_r);
  setBool(host.mono$, params.mono);
  setNum(host.pulseWidth$, params.pulsewidth);
  setBool(host.sync$, params.sync);
  setNum(host.bpm$, params.bpm);
  setNum(host.ms$, params.ms);
  applySharedViz(viz);
  // Shared phase (L+R advance together); Y differs by Offset L/R.
  host.lfo$.set([0.22, 0, 0.22, 0]);
  host.hostTempo$.set([1, 120]);
}

export function applyCrusherDemo(
  host: ICrusherHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.bits$, params.bits);
  setNum(host.morph$, params.morph);
  setBool(host.mode$, params.mode);
  setNum(host.dc$, params.dc);
  setNum(host.aa$, params.anti_aliasing);
  applySharedViz(viz);
  const applyShape = () => {
    if (!viz.shape) return;
    host.shapePoint$.set(viz.shape);
    pushViz('crusher', 'shape', viz.shape);
  };
  applyShape();
  const hold = window.setInterval(() => {
    applySharedViz(viz);
    applyShape();
  }, 50);
  return () => window.clearInterval(hold);
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
  setBool(host.mono$, params.mono);
  setNum(host.spectrum$, params.spectrum);
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
  if (viz.spectrum) {
    host.spectrumData$.set(viz.spectrum);
    pushViz('fft', 'spectrum', viz.spectrum);
  }
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

export function applyHarmonicsDemo(
  host: IHarmonicsHost,
  params: Record<string, unknown>,
  viz: VizFixture,
) {
  setBool(host.bypass$, params.bypass);
  setNum(host.drive$, params.drive);
  setNum(host.blend$, params.blend);
  setNum(host.dry$, params.dry);
  setNum(host.wet$, params.wet);
  setNum(host.oversample$, params.oversample);
  setNum(host.asymmetry$, params.asymmetry);
  setNum(host.tone$, params.tone);
  setNum(host.preHipass$, params.pre_hipass);
  setNum(host.preLopass$, params.pre_lopass);
  setNum(host.preHpMode$, params.pre_hp_mode);
  setNum(host.preLpMode$, params.pre_lp_mode);
  setNum(host.postHipass$, params.post_hipass);
  setNum(host.postLopass$, params.post_lopass);
  setNum(host.postHpMode$, params.post_hp_mode);
  setNum(host.postLpMode$, params.post_lp_mode);
  setBool(host.preListen$, params.pre_listen);
  setBool(host.listen$, params.listen);

  applySharedViz(viz);
  const applyShape = () => {
    if (!viz.shape) return;
    host.shapePoint$.set(viz.shape);
    pushViz('harmonics', 'shape', viz.shape);
  };
  applyShape();
  const hold = window.setInterval(() => {
    applySharedViz(viz);
    applyShape();
  }, 50);
  return () => window.clearInterval(hold);
}

function applyMblimiterMeters(host: IMblimiterHost, viz: VizFixture) {
  applySharedViz(viz);
  if (viz.gains) {
    // gains are ≤0 dB; host expects positive amounts for strip + overall meters.
    const amounts = viz.gains.map((db) => Math.max(0, -db));
    const overall =
      typeof viz.gr === 'number' && Number.isFinite(viz.gr)
        ? viz.gr
        : Math.max(0, ...amounts);
    host.grAll$.set([...amounts, overall]);
    for (const band of host.bands) {
      const v = amounts[band.index];
      band.gr$.set(typeof v === 'number' ? v : 0);
    }
    host.gr$.set(overall);
  } else if (typeof viz.gr === 'number') {
    host.gr$.set(viz.gr);
  }
  if (viz.bandio) {
    host.bandIo$.set(viz.bandio);
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
    pushViz('mblimiter', 'bandio', viz.bandio);
  }
}

export function applyMblimiterDemo(
  host: IMblimiterHost,
  params: Record<string, unknown>,
  viz: VizFixture,
): () => void {
  setBool(host.bypass$, params.bypass);
  setBool(host.mono$, params.mono);
  setNum(host.numBands$, params.num_bands);
  setNum(host.slope$, params.slope);
  const xovers = params.xovers;
  if (Array.isArray(xovers))
    xovers.forEach((hz, i) => setNum(host.xover$[i], hz));

  setNum(host.limit$, params.limit);
  setNum(host.attack$, params.attack);
  setNum(host.release$, params.release);
  setBool(host.minRelease$, params.min_release);
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

  const bands = params.bands;
  if (Array.isArray(bands)) {
    for (const b of bands) {
      if (!b || typeof b !== 'object') continue;
      const rec = b as Record<string, unknown>;
      const idx = typeof rec.index === 'number' ? rec.index : -1;
      const band = host.bands[idx];
      if (!band) continue;
      setBool(band.listen$, rec.listen);
      setNum(band.weight$, rec.weight);
      setNum(band.release$, rec.release);
    }
  }

  if (viz.envelope)
    host.historyAll$.set(new Float32Array(viz.envelope));

  applyMblimiterMeters(host, viz);
  const hold = window.setInterval(() => applyMblimiterMeters(host, viz), 50);
  return () => window.clearInterval(hold);
}

export function applyMbcompDemo(
  host: IMbcompHost,
  params: Record<string, unknown>,
  viz: VizFixture,
): () => void {
  setBool(host.bypass$, params.bypass);
  setBool(host.mono$, params.mono);
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
  expander: applyExpanderDemo as DemoApplier,
  deesser: applyDeesserDemo as DemoApplier,
  delay: applyDelayDemo as DemoApplier,
  equalizer: applyEqualizerDemo as DemoApplier,
  harmonics: applyHarmonicsDemo as DemoApplier,
  limiter: applyLimiterDemo as DemoApplier,
  mbcomp: applyMbcompDemo as DemoApplier,
  mblimiter: applyMblimiterDemo as DemoApplier,
  reverb: applyReverbDemo as DemoApplier,
  stereo: applyStereoDemo as DemoApplier,
  transients: applyTransientsDemo as DemoApplier,
  analyzer: applyAnalyzerDemo as DemoApplier,
  filter: applyFilterDemo as DemoApplier,
  ringmod: applyRingmodDemo as DemoApplier,
  pulsator: applyPulsatorDemo as DemoApplier,
  crusher: applyCrusherDemo as DemoApplier,
};
