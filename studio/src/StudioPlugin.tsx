import { useEffect, useMemo, useRef } from 'react';
import {
  CompressorUI,
  DeesserUI,
  DelayUI,
  EqualizerUI,
  ReverbUI,
  StereoUI,
  TransientsUI,
  createBoundCompressorHost,
  createBoundDeesserHost,
  createBoundDelayHost,
  createBoundEqualizerHost,
  createBoundReverbHost,
  createBoundStereoHost,
  createBoundTransientsHost,
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
      case 'deesser':
        return createBoundDeesserHost();
      case 'delay':
        return createBoundDelayHost();
      case 'equalizer':
        return createBoundEqualizerHost();
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

    (async () => {
      const { params, viz } = await fixtureLoaders[pluginId]();
      if (cancelled) return;

      // Let Header / chart widgets subscribe to the host bridge first.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      demoAppliers[pluginId](host, params, viz);
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
    };
  }, [pluginId, host, onReady]);

  switch (pluginId) {
    case 'compressor':
      return <CompressorUI host={host as ReturnType<typeof createBoundCompressorHost>} />;
    case 'deesser':
      return <DeesserUI host={host as ReturnType<typeof createBoundDeesserHost>} />;
    case 'delay':
      return <DelayUI host={host as ReturnType<typeof createBoundDelayHost>} />;
    case 'equalizer':
      return <EqualizerUI host={host as ReturnType<typeof createBoundEqualizerHost>} />;
    case 'reverb':
      return <ReverbUI host={host as ReturnType<typeof createBoundReverbHost>} />;
    case 'stereo':
      return <StereoUI host={host as ReturnType<typeof createBoundStereoHost>} />;
    case 'transients':
      return <TransientsUI host={host as ReturnType<typeof createBoundTransientsHost>} />;
  }
}
