import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { DevShell } from './dev/DevShell';
import {
  isPluginId,
  knownPluginIds,
  pluginApps,
  pluginIdFromHash,
  type PluginId,
} from './plugins/registry';
import { editorSizes } from './dev/editorSizes';
import { reportCssViewportOnce } from './reportViewport';
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

export function App() {
  const [pluginId, setPluginId] = useState(() => pluginIdFromHash());

  useEffect(() => {
    if (isPluginId(pluginId))
      reportCssViewportOnce(editorSizes[pluginId as PluginId]);
    else
      reportCssViewportOnce();
  }, [pluginId]);

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
