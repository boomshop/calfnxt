import { DynamicValue } from "@deutschesoft/awml";
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizEnvelope,
  bindVizGr,
  bindVizPoint,
} from "./bind_param";

type ParamMeta = { id: string; default?: number };

/** Resolve a plain default from generated `pluginMeta.parameters`. */
export function makeParamDefault(
  parameters: readonly ParamMeta[],
): (name: string, fallback?: number) => number {
  return (name, fallback = 0) => {
    const meta = parameters.find((p) => p.id === name);
    return typeof meta?.default === "number" ? meta.default : fallback;
  };
}

/**
 * Shared bindNum / bindBool factories for host models.
 * `paramDefault` should already be typed to the plugin's param id keys.
 */
export function makeHostParamBinders<ParamIds extends Record<string, number>>(
  paramIds: ParamIds,
  paramDefault: (name: string, fallback?: number) => number,
) {
  function bindNum(
    name: keyof ParamIds & string,
    fallback = 0,
    mapPlain?: (v: number) => number,
  ): DynamicValue<number> {
    const dv = DynamicValue.fromConstant(paramDefault(name, fallback));
    bindParamToHost(dv, paramIds[name], mapPlain);
    return dv;
  }

  function bindBool(
    name: keyof ParamIds & string,
    opts?: { invert?: boolean },
  ): DynamicValue<boolean> {
    const rawOn = paramDefault(name, 0) >= 0.5;
    const dv = DynamicValue.fromConstant(opts?.invert ? !rawOn : rawOn);
    bindBoolParamToHost(dv, paramIds[name], opts);
    return dv;
  }

  return { bindNum, bindBool };
}

/** Wire the common dynamics viz trio (GR / transfer point / history). */
export function bindDynamicsHostViz(
  id: string,
  opts: {
    gr$?: DynamicValue<number>;
    point$?: DynamicValue<number[]>;
    historyData$?: DynamicValue<Float32Array | null>;
  },
): void {
  if (opts.gr$)
    bindVizGr(opts.gr$, id);
  if (opts.point$)
    bindVizPoint(opts.point$, id);
  if (opts.historyData$)
    bindVizEnvelope(opts.historyData$, id);
}
