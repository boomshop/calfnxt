import type { ReactNode } from "react";
import { knownPluginIds, type PluginId } from "../plugins/registry";
import { editorSizes } from "./editorSizes";
import "./DevShell.scss";

export interface DevShellProps {
  pluginId: PluginId;
  children: ReactNode;
}

/** Browser-only chrome: fixed editor frame + plugin switcher (Vite HMR). */
export function DevShell({ pluginId, children }: DevShellProps) {
  const { width, height } = editorSizes[pluginId];

  return (
    <div className="DevShell">
      <header className="DevShell__bar">
        <span className="DevShell__brand">calfNXT</span>
        <nav className="DevShell__nav" aria-label="Plugins">
          {knownPluginIds().map((id) => (
            <a
              key={id}
              href={`#${id}`}
              className={
                id === pluginId
                  ? "DevShell__link DevShell__link--active"
                  : "DevShell__link"
              }
            >
              #{id}
            </a>
          ))}
        </nav>
        <span className="DevShell__size">
          {width}×{height}
        </span>
      </header>
      <div className="DevShell__stage">
        <div
          className="DevShell__frame"
          style={{ width, height }}
          data-plugin={pluginId}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
