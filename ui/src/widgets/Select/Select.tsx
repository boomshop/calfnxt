import { Select as AuxSelect } from "@deutschesoft/aux-widgets/src/index.pure.js";
import { componentFromWidget } from "@deutschesoft/use-aux-widgets";
import type { DynamicValue } from "@deutschesoft/awml";
import "./Select.scss";

const SelectBindings = {
  entries$: { name: "entries" },
  value$: { name: "value" },
  selected$: { name: "selected" },
};

const SelectWidget = componentFromWidget(
  AuxSelect,
  SelectBindings,
  { auto_size: true },
  "Select",
);

export interface SelectProps {
  value$?: DynamicValue<unknown>;
  entries?: unknown;
  className?: string;
  [key: string]: unknown;
}

export function Select(props: SelectProps) {
  return <SelectWidget {...props} />;
}
