import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { postToHost } from './bridge';
import { DevShell } from './dev/DevShell';
import {
  isPluginId,
  knownPluginIds,
  pluginApps,
  pluginIdFromHash,
  type PluginId,
} from './plugins/registry';
import { Loading } from './widgets';

function FallbackMissing({ id }: { id: string }) {
  return (
    <div style={{ padding: '1.25rem', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ margin: '0 0 0.5rem' }}>
        Unknown plugin{id ? `: “${id}”` : ' (missing hash)'}.
      </p>
      <p style={{ margin: 0, opacity: 0.75 }}>
        Use <code>#&lt;id&gt;</code>, e.g.{' '}
        {knownPluginIds().map((k) => (
          <React.Fragment key={k}>
            <a href={`#${k}`}>#{k}</a>{' '}
          </React.Fragment>
        ))}
      </p>
    </div>
  );
}

/** Once: report CSS viewport so the native editor can scale the host window. */
function useReportCssViewport() {
  useEffect(() => {
    if (!window.calfnxtNative?.post) return;

    let sent = false;
    const report = () => {
      if (sent) return;
      const w = Math.round(window.innerWidth);
      const h = Math.round(window.innerHeight);
      if (w < 1 || h < 1) return;
      sent = true;
      postToHost({ t: 'viewport', w, h });
    };

    // After first layout (and a second frame for WebKit embed settle).
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(report);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);
}

export function App() {
  const [pluginId, setPluginId] = useState(() => pluginIdFromHash());
  useReportCssViewport();

  useEffect(() => {
    const onHash = () => setPluginId(pluginIdFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const LazyPlugin = useMemo(() => {
    if (!isPluginId(pluginId)) return null;
    return React.lazy(pluginApps[pluginId as PluginId]);
  }, [pluginId]);

  if (!LazyPlugin) return <FallbackMissing id={pluginId} />;

  const plugin = (
    <Suspense fallback={<Loading />}>
      <LazyPlugin />
    </Suspense>
  );

  // In the VST3 WebView the host already sizes the window to editor WxH.
  if (import.meta.env.DEV)
    return <DevShell pluginId={pluginId as PluginId}>{plugin}</DevShell>;
  return plugin;
}
