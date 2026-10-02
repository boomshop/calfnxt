/**
 * Shared Y-floor auto-scale for scrolling dB charts (HistoryChart, EnvelopeChart).
 *
 * Continuous envelope → 6 dB snap with attack hold + slow release; range_y
 * glides via rAF while grid_y jumps to the snapped destination.
 */

export const AUTO_SCALE_HARD_MIN = -60;
export const AUTO_SCALE_SOFT_MIN = -12;
export const AUTO_SCALE_SNAP_DB = 6;
/** Expand only after target stays below the floor this long (ignores spikes). */
export const AUTO_SCALE_ATTACK_MS = 200;
export const AUTO_SCALE_RELEASE_TAU_S = 2;
/** Smooth range_y glide toward the snapped floor (seconds). */
export const AUTO_SCALE_ANIM_TAU_S = 0.22;
export const AUTO_SCALE_ANIM_EPS_DB = 0.08;
/** Settle envelope onto target so soft-min is reachable despite asymp. release. */
export const AUTO_SCALE_SETTLE_DB = 0.35;

export type AutoScaleChart = {
  set: (key: string, value: unknown) => void;
  isDestructed?: () => boolean;
};

/** Snap a dB floor down onto the auto-scale grid, clamped to hard/soft limits. */
export function snapAutoScaleMin(envDb: number): number {
  const clamped = Math.max(
    AUTO_SCALE_HARD_MIN,
    Math.min(AUTO_SCALE_SOFT_MIN, envDb),
  );
  return Math.floor(clamped / AUTO_SCALE_SNAP_DB) * AUTO_SCALE_SNAP_DB;
}

/**
 * 6 dB display snap with Schmitt hysteresis on the way up so the range does
 * not chatter when the envelope hovers on a step boundary.
 *
 * Release uses a small epsilon below the next step: the floor envelope
 * approaches its target asymptotically, and `Math.floor` maps (−18, −12) → −18,
 * so without ε the soft min would never unlock once the range had expanded.
 */
export function snapAutoScaleDisplay(
  envDb: number,
  currentDisplay: number,
): number {
  const ideal = snapAutoScaleMin(envDb);
  if (ideal < currentDisplay) return ideal;
  if (envDb >= currentDisplay + AUTO_SCALE_SNAP_DB - AUTO_SCALE_SETTLE_DB)
    return ideal;
  return currentDisplay;
}

/**
 * Clamp a raw deepest sample into the auto-scale working range.
 * Silence sentinels at HARD_MIN are still valid targets.
 */
export function clampAutoScaleTarget(deepest: number): number {
  return Math.max(
    AUTO_SCALE_HARD_MIN,
    Math.min(AUTO_SCALE_SOFT_MIN, deepest),
  );
}

/**
 * Stateful floor + range_y animation. Own one instance per chart mount.
 */
export class ChartYAutoScale {
  /** Continuous floor envelope (dB); snapped value is the animation target. */
  floorEnv = AUTO_SCALE_SOFT_MIN;
  displayMin = snapAutoScaleMin(AUTO_SCALE_SOFT_MIN);
  /** Currently applied range_y.min while gliding toward displayMin. */
  animMin = snapAutoScaleMin(AUTO_SCALE_SOFT_MIN);
  /** Optional: notified whenever applied range_y.min changes (incl. glide). */
  onRangeMin: ((min: number) => void) | null = null;

  private animRaf = 0;
  private animLastT = 0;
  private floorInit = false;
  private floorLastT = 0;
  /** ms target has stayed below env; expand only after AUTO_SCALE_ATTACK_MS. */
  private attackHoldMs = 0;
  /** Deepest target seen during the current attack hold. */
  private attackPending = AUTO_SCALE_SOFT_MIN;
  private enabled = true;
  private yMax = 0;
  /**
   * Smooth range_y glide toward the snapped floor. Default true.
   */
  animateRange = true;
  /** Release time constant (seconds). Attack stay-low hold is unchanged. */
  releaseTauS = AUTO_SCALE_RELEASE_TAU_S;

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.cancelAnim();
      this.floorInit = false;
      this.attackHoldMs = 0;
    }
  }

  /** Current range_y.min to apply on attach. */
  get rangeMin(): number {
    return this.animMin;
  }

  cancelAnim(): void {
    if (this.animRaf) {
      cancelAnimationFrame(this.animRaf);
      this.animRaf = 0;
    }
  }

  reset(): void {
    this.cancelAnim();
    this.floorEnv = AUTO_SCALE_SOFT_MIN;
    this.displayMin = snapAutoScaleMin(AUTO_SCALE_SOFT_MIN);
    this.animMin = this.displayMin;
    this.floorInit = false;
    this.floorLastT = 0;
    this.attackHoldMs = 0;
    this.attackPending = AUTO_SCALE_SOFT_MIN;
  }

  private setAnimMin(chart: AutoScaleChart, min: number): void {
    this.animMin = min;
    // AUX Chart.initialize forces range_y.reverse=true (0 dB at the top).
    // Always re-assert it — a prior reverse:false sticks on the live Range
    // until remount and makes fills look like inverted GR.
    chart.set('range_y', { min, max: this.yMax, reverse: true });
    this.onRangeMin?.(min);
  }

  /**
   * Drive the floor from the deepest plotted Y.
   * `null` = no buffer yet — do not lock onto −60.
   */
  apply(
    chart: AutoScaleChart,
    deepest: number | null,
    yMax: number,
    setGridY?: (min: number) => void,
  ): void {
    if (!this.enabled || chart.isDestructed?.()) return;
    if (deepest == null) return;

    this.yMax = yMax;
    const target = clampAutoScaleTarget(deepest);
    const now = performance.now();

    if (!this.floorInit) {
      this.floorEnv = target;
      this.floorInit = true;
      this.floorLastT = now;
      this.attackHoldMs = 0;
      this.attackPending = target;
      const snapped0 = snapAutoScaleMin(target);
      this.displayMin = snapped0;
      this.setAnimMin(chart, snapped0);
      setGridY?.(snapped0);
      return;
    }

    const dtMs = Math.min(100, Math.max(0, now - this.floorLastT));
    this.floorLastT = now;
    let env = this.floorEnv;
    if (target < env) {
      this.attackHoldMs += dtMs;
      this.attackPending = Math.min(this.attackPending, target);
      if (this.attackHoldMs >= AUTO_SCALE_ATTACK_MS) {
        env = this.attackPending;
        this.attackHoldMs = 0;
        this.attackPending = env;
      }
    } else {
      this.attackHoldMs = 0;
      this.attackPending = target;
      if (dtMs > 0) {
        const dt = dtMs / 1000;
        env += (target - env) * (1 - Math.exp(-dt / this.releaseTauS));
      }
      if (Math.abs(target - env) <= AUTO_SCALE_SETTLE_DB) env = target;
    }
    this.floorEnv = clampAutoScaleTarget(env);

    const prevSnap = this.displayMin;
    const snapped = snapAutoScaleDisplay(this.floorEnv, prevSnap);
    this.displayMin = snapped;
    if (snapped !== prevSnap) setGridY?.(snapped);
    if (Math.abs(this.animMin - snapped) > AUTO_SCALE_ANIM_EPS_DB) {
      if (this.animateRange) this.ensureRangeAnim(chart);
      else this.setAnimMin(chart, snapped);
    }
  }

  private ensureRangeAnim(chart: AutoScaleChart): void {
    if (this.animRaf) return;
    this.animLastT = performance.now();
    const tick = (now: number) => {
      this.animRaf = 0;
      if (!this.enabled || chart.isDestructed?.()) return;
      const dt = Math.min(0.05, Math.max(0, (now - this.animLastT) / 1000));
      this.animLastT = now;
      const dest = this.displayMin;
      let cur = this.animMin;
      if (dt > 0) {
        cur += (dest - cur) * (1 - Math.exp(-dt / AUTO_SCALE_ANIM_TAU_S));
      }
      if (Math.abs(dest - cur) <= AUTO_SCALE_ANIM_EPS_DB) cur = dest;
      this.setAnimMin(chart, cur);
      if (cur !== dest) {
        this.animRaf = requestAnimationFrame(tick);
      }
    };
    this.animRaf = requestAnimationFrame(tick);
  }
}
