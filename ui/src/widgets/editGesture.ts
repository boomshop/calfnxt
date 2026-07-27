/** VST3 edit gesture: wrap a drag with beginEdit / endEdit around performEdit. */
export type AuxOnSet = (ev: unknown, key: string, value: unknown) => void;

export interface EditGesture {
  beginEdit?: () => void;
  endEdit?: () => void;
}

/** Compose AUX `onSet` so `interacting` drives the host edit gesture. */
export function composeInteractingOnSet(
  gesture: EditGesture,
  userOnSet?: AuxOnSet,
): AuxOnSet | undefined {
  if (!gesture.beginEdit && !gesture.endEdit && !userOnSet)
    return undefined;

  return (ev, key, value) => {
    if (key === "interacting") {
      if (value)
        gesture.beginEdit?.();
      else
        gesture.endEdit?.();
    }
    userOnSet?.(ev, key, value);
  };
}
