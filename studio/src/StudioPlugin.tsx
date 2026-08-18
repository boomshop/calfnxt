import { useEffect, useMemo, useRef } from 'react';
import {
  CompressorUI,
  ExpanderUI,
  DeesserUI,
  DelayUI,
  EqualizerUI,
  HarmonicsUI,
  LimiterUI,
  MblimiterUI,
  MbcompUI,
  ReverbUI,
  StereoUI,
  TransientsUI,
  AnalyzerUI,
  FilterUI,
  RingmodUI,
  PulsatorUI,
  CrusherUI,
  PhaserUI,
  FlangerUI,
  createBoundCompressorHost,
  createBoundExpanderHost,
  createBoundDeesserHost,
  createBoundDelayHost,
  createBoundEqualizerHost,
  createBoundHarmonicsHost,
  createBoundLimiterHost,
  createBoundMblimiterHost,
  createBoundMbcompHost,
  createBoundReverbHost,
  createBoundStereoHost,
  createBoundTransientsHost,
  createBoundAnalyzerHost,
  createBoundFilterHost,
  createBoundRingmodHost,
  createBoundPulsatorHost,
  createBoundCrusherHost,
  createBoundPhaserHost,
  createBoundFlangerHost,
  showWidgetInfo$,
  type PluginId,
} from '@calfnxt/ui';
import { demoAppliers, type VizFixture } from './applyDemo';

type FixtureBundle = {
  params: Record<string, unknown>;
  viz: VizFixture;
};

const fixtureLoaders: Record<PluginId, () => Promise<FixtureBundle>> = {
  compressor: async () => ({
    params: (await import('../fixtures/compressor/params.json')).default,
    viz: (await import('../fixtures/compressor/viz.json')).default,
  }),
  expander: async () => ({
    params: (await import('../fixtures/expander/params.json')).default,
    viz: (await import('../fixtures/expander/viz.json')).default,
  }),
  deesser: async () => ({
    params: (await import('../fixtures/deesser/params.json')).default,
    viz: (await import('../fixtures/deesser/viz.json')).default,
  }),
  delay: async () => ({
    params: (await import('../fixtures/delay/params.json')).default,
    viz: (await import('../fixtures/delay/viz.json')).default,
  }),
  equalizer: async () => ({
    params: (await import('../fixtures/equalizer/params.json')).default,
    viz: (await import('../fixtures/equalizer/viz.json')).default,
  }),
  harmonics: async () => ({
    params: (await import('../fixtures/harmonics/params.json')).default,
    viz: (await import('../fixtures/harmonics/viz.json')).default,
  }),
  analyzer: async () => ({
    params: (await import('../fixtures/analyzer/params.json')).default,
    viz: (await import('../fixtures/analyzer/viz.json')).default,
  }),
  filter: async () => ({
    params: (await import('../fixtures/filter/params.json')).default,
    viz: (await import('../fixtures/filter/viz.json')).default,
  }),
  ringmod: async () => ({
    params: (await import('../fixtures/ringmod/params.json')).default,
    viz: (await import('../fixtures/ringmod/viz.json')).default,
  }),
  pulsator: async () => ({
    params: (await import('../fixtures/pulsator/params.json')).default,
    viz: (await import('../fixtures/pulsator/viz.json')).default,
  }),
  crusher: async () => ({
    params: (await import('../fixtures/crusher/params.json')).default,
    viz: (await import('../fixtures/crusher/viz.json')).default,
  }),
  phaser: async () => ({
    params: (await import('../fixtures/phaser/params.json')).default,
    viz: (await import('../fixtures/phaser/viz.json')).default,
  }),
  flanger: async () => ({
    params: (await import('../fixtures/flanger/params.json')).default,
    viz: (await import('../fixtures/flanger/viz.json')).default,
  }),
  limiter: async () => ({
    params: (await import('../fixtures/limiter/params.json')).default,
    viz: (await import('../fixtures/limiter/viz.json')).default,
  }),
  mbcomp: async () => ({
    params: (await import('../fixtures/mbcomp/params.json')).default,
    viz: (await import('../fixtures/mbcomp/viz.json')).default,
  }),
  mblimiter: async () => ({
    params: (await import('../fixtures/mblimiter/params.json')).default,
    viz: (await import('../fixtures/mblimiter/viz.json')).default,
  }),
  reverb: async () => ({
    params: (await import('../fixtures/reverb/params.json')).default,
    viz: (await import('../fixtures/reverb/viz.json')).default,
  }),
  stereo: async () => ({
    params: (await import('../fixtures/stereo/params.json')).default,
    viz: (await import('../fixtures/stereo/viz.json')).default,
  }),
  transients: async () => ({
    params: (await import('../fixtures/transients/params.json')).default,
    viz: (await import('../fixtures/transients/viz.json')).default,
  }),
};

export interface StudioPluginProps {
  pluginId: PluginId;
  onReady: () => void;
}

export function StudioPlugin({ pluginId, onReady }: StudioPluginProps) {
  const host = useMemo(() => {
    switch (pluginId) {
      case 'compressor':
        return createBoundCompressorHost();
      case 'expander':
        return createBoundExpanderHost();
      case 'deesser':
        return createBoundDeesserHost();
      case 'delay':
        return createBoundDelayHost();
      case 'equalizer':
        return createBoundEqualizerHost();
      case 'harmonics':
        return createBoundHarmonicsHost();
      case 'analyzer':
        return createBoundAnalyzerHost();
      case 'filter':
        return createBoundFilterHost();
      case 'ringmod':
        return createBoundRingmodHost();
      case 'pulsator':
        return createBoundPulsatorHost();
      case 'crusher':
        return createBoundCrusherHost();
      case 'phaser':
        return createBoundPhaserHost();
      case 'flanger':
        return createBoundFlangerHost();
      case 'limiter':
        return createBoundLimiterHost();
      case 'mbcomp':
        return createBoundMbcompHost();
      case 'mblimiter':
        return createBoundMblimiterHost();
      case 'reverb':
        return createBoundReverbHost();
      case 'stereo':
        return createBoundStereoHost();
      case 'transients':
        return createBoundTransientsHost();
    }
  }, [pluginId]);

  const readyOnce = useRef(false);

  useEffect(() => {
    readyOnce.current = false;
    let cancelled = false;
    let stopDemo: (() => void) | undefined;

    (async () => {
      const { params, viz } = await fixtureLoaders[pluginId]();
      if (cancelled) return;

      // Let Header / chart widgets subscribe to the host bridge first.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const cleanup = demoAppliers[pluginId](host, params, viz);
      if (typeof cleanup === 'function') stopDemo = cleanup;
      // Force again in case Header / localStorage re-enabled tips.
      showWidgetInfo$.set(false);

      // Second paint so AUX graphs pick up dots / meters.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 120));

      if (cancelled || readyOnce.current) return;
      readyOnce.current = true;
      onReady();
    })();

    return () => {
      cancelled = true;
      stopDemo?.();
    };
  }, [pluginId, host, onReady]);

  switch (pluginId) {
    case 'compressor':
      return <CompressorUI host={host as ReturnType<typeof createBoundCompressorHost>} />;
    case 'expander':
      return <ExpanderUI host={host as ReturnType<typeof createBoundExpanderHost>} />;
    case 'deesser':
      return <DeesserUI host={host as ReturnType<typeof createBoundDeesserHost>} />;
    case 'delay':
      return <DelayUI host={host as ReturnType<typeof createBoundDelayHost>} />;
    case 'equalizer':
      return <EqualizerUI host={host as ReturnType<typeof createBoundEqualizerHost>} />;
    case 'harmonics':
      return (
        <HarmonicsUI host={host as ReturnType<typeof createBoundHarmonicsHost>} />
      );
    case 'analyzer':
      return (
        <AnalyzerUI host={host as ReturnType<typeof createBoundAnalyzerHost>} />
      );
    case 'filter':
      return (
        <FilterUI host={host as ReturnType<typeof createBoundFilterHost>} />
      );
    case 'ringmod':
      return (
        <RingmodUI host={host as ReturnType<typeof createBoundRingmodHost>} />
      );
    case 'pulsator':
      return (
        <PulsatorUI host={host as ReturnType<typeof createBoundPulsatorHost>} />
      );
    case 'crusher':
      return (
        <CrusherUI host={host as ReturnType<typeof createBoundCrusherHost>} />
      );
    case 'phaser':
      return (
        <PhaserUI host={host as ReturnType<typeof createBoundPhaserHost>} />
      );
    case 'flanger':
      return (
        <FlangerUI host={host as ReturnType<typeof createBoundFlangerHost>} />
      );
    case 'limiter':
      return <LimiterUI host={host as ReturnType<typeof createBoundLimiterHost>} />;
    case 'mbcomp':
      return <MbcompUI host={host as ReturnType<typeof createBoundMbcompHost>} />;
    case 'mblimiter':
      return (
        <MblimiterUI host={host as ReturnType<typeof createBoundMblimiterHost>} />
      );
    case 'reverb':
      return <ReverbUI host={host as ReturnType<typeof createBoundReverbHost>} />;
    case 'stereo':
      return <StereoUI host={host as ReturnType<typeof createBoundStereoHost>} />;
    case 'transients':
      return <TransientsUI host={host as ReturnType<typeof createBoundTransientsHost>} />;
  }
}
