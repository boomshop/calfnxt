import { ALIGNER_LANES } from '../../host/alignerHost';

/** Inclusive join-group span. `joinOn[i]` means lane i is linked to the lane above. */
export function joinGroupRange(
  lane: number,
  joinOn: boolean[],
): { root: number; end: number } {
  let root = Math.max(0, Math.min(ALIGNER_LANES - 1, lane | 0));
  while (root > 0 && joinOn[root])
    --root;
  let end = root;
  while (end + 1 < ALIGNER_LANES && joinOn[end + 1])
    ++end;
  return { root, end };
}

/** First two lanes of a join group as stereo L/R; null when the group is mono. */
export function stereoPairOfGroup(
  root: number,
  end: number,
): { L: number; R: number } | null {
  if (end < root + 1)
    return null;
  return { L: root, R: root + 1 };
}

export type AnchorRole = 'primary' | 'partner' | 'none';

/** Primary = hit-trigger lane; partner = the other side of a stereo Join pair. */
export function anchorRole(
  lane: number,
  anchor: number,
  joinOn: boolean[],
): AnchorRole {
  const a = Math.round(anchor);
  const i = lane | 0;
  if (i === a)
    return 'primary';
  const { root, end } = joinGroupRange(a, joinOn);
  if (end === root + 1 && (i === root || i === end))
    return 'partner';
  return 'none';
}

/**
 * Wave fill source for a lane when the Anchor sits in a Join group.
 * Stereo Anchor: matching side on stereo lanes, L+R mid on mono (and deeper
 * chain members). Mono Anchor: that single lane everywhere.
 */
export function ghostForLane(
  lane: number,
  anchor: number,
  joinOn: boolean[],
): number | [number, number] {
  const a = Math.round(anchor);
  const { root: aRoot, end: aEnd } = joinGroupRange(a, joinOn);
  const pair = stereoPairOfGroup(aRoot, aEnd);
  if (!pair)
    return a;

  const { root: lRoot, end: lEnd } = joinGroupRange(lane, joinOn);
  const laneStereo = lEnd >= lRoot + 1;
  if (laneStereo) {
    const side = (lane | 0) - lRoot;
    if (side === 0)
      return pair.L;
    if (side === 1)
      return pair.R;
  }
  return [pair.L, pair.R];
}
