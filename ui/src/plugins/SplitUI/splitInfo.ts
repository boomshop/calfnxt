/** Hover titles for Split controls (musicians / producers). */

export const splitInfo = {
  volumeL:
    'Level for the left output. The mono input is copied to both channels first — use this to balance dual sends, headphone feeds, or PA zones without touching the right side.',

  volumeR:
    'Level for the right output. Same mono source as the left; trim independently when the two destinations need different gain.',

  muteL:
    'Silences the left output only. Useful for checking one side, soloing a dual-mono path, or muting a dead zone in a split rig.',

  muteR:
    'Silences the right output only. Same idea as Mute L for the other channel.',

  phaseL:
    'Inverts left polarity (180°). Fixes cancellation when this path sums with another mic or bus; can also create intentional nulls. Re-check mono if anything else shares the source.',

  phaseR:
    'Inverts right polarity. Same as Phase L — common when one side hits a flipped DI or a reversed mic pair member.',
};
