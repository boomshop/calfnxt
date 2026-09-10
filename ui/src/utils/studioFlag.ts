/** True when the Screenshot Studio boots the UI (static fixtures, no DSP). */
export function isStudioCapture(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as Window & { __CALFNXT_STUDIO__?: boolean }).__CALFNXT_STUDIO__ ===
      true
  );
}
