import { Toggle as AuxToggle } from "@deutschesoft/aux-widgets/src/index.pure.js";
import { componentFromWidget } from "@deutschesoft/use-aux-widgets";
import type { DynamicValue } from "@deutschesoft/awml";
import "./Toggle.scss";

const ToggleBindings = {
  state$: { name: "state" },
  disabled$: { name: "disabled" },
  enabled$: { name: "disabled", transformReceive: (v: boolean) => !v },
};

const ToggleWidget = componentFromWidget(
  AuxToggle,
  ToggleBindings,
  {},
  "Toggle",
);

export interface ToggleProps {
  state$?: DynamicValue<boolean>;
  className?: string;
  [key: string]: unknown;
}

export function Toggle(props: ToggleProps) {
  return <ToggleWidget {...props} />;
}
