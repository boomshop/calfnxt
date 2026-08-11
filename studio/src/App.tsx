import { useCallback, useEffect, useState } from 'react';
import {
  editorSizes,
  isPluginId,
  knownPluginIds,
  pluginIdFromHash,
  type PluginId,
} from '@calfnxt/ui';
import { StudioPlugin } from './StudioPlugin';

export function App() {
  const [pluginId, setPluginId] = useState(() => pluginIdFromHash());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setReady(false);
      setPluginId(pluginIdFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const onReady = useCallback(() => setReady(true), []);

  if (!isPluginId(pluginId)) {
    return (
      <div style={{ padding: 24, color: '#fff', fontFamily: 'system-ui' }}>
        Unknown plugin. Use{' '}
        {knownPluginIds().map((id) => (
          <a key={id} href={`#${id}`} style={{ color: '#4af', marginRight: 8 }}>
            #{id}
          </a>
        ))}
      </div>
    );
  }

  const id = pluginId as PluginId;
  const { width, height } = editorSizes[id];

  return (
    <div
      className="StudioFrame"
      data-studio-frame=""
      data-plugin={id}
      data-ready={ready ? '1' : '0'}
      style={{ width, height }}
    >
      <StudioPlugin pluginId={id} onReady={onReady} />
    </div>
  );
}
