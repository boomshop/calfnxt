/** Hover titles for Compressor controls (musicians / producers). */

import type { FrequencyRangeInfo } from '../../widgets/FrequencyRange/frequencyRangeInfo';
import { infoDoc } from '../../widgets/WithInfo/infoDoc';

export const compressorInfo = {
  bypass: infoDoc({
    name: 'Bypass',
    lead: 'Lets the signal through with no compression, so you can compare the processed sound with the untouched one.',
    meta: [
      { label: 'DAW name', value: 'Bypass' },
      { label: 'Parameter ID', value: '2' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn it on and listen. You should hear the part without compression. Turn it off and the compressor is back. Use that to decide whether the compression is actually helping, or whether it is only making the part flatter.',
          },
          {
            p: 'When the short fade has finished, the GR meter sits at 0. If GR is still moving, the fade is not done yet.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The host can also switch this as the plug-in bypass. It is registered with the VST3 bypass flag.',
              'While it is on, the header In and Out gains are unity. They are not added on top.',
              'The compressor path itself fades out over a few milliseconds. After that fade, what you hear is the signal from before compression, makeup, and mix.',
              'Listen does not replace the output while Bypass is on.',
            ],
          },
        ],
      },
    ],
  }),

  channel: infoDoc({
    name: 'Channel',
    lead: 'Chooses which part of the stereo signal the compressor works on. The same choice is what it listens to.',
    meta: [
      { label: 'DAW name', value: 'Channel' },
      { label: 'Parameter ID', value: '19' },
      {
        label: 'Stored range',
        value: '0…4. The buttons send Stereo 0, Left 1, Right 2, Mid 3, Side 4.',
      },
      { label: 'Default', value: '0 (Stereo)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Stereo works on both sides, and both sides get the same gain. Link decides whether the louder side, the average, or the centre sets that gain.',
              'Left or Right works on that side only. The other side is left as it is. Use it when one side is the problem and the other should stay untouched.',
              'Mid works on the centre: what is shared by both speakers. The wide part is left as it is. Use it when the middle of the picture should be held and the width should stay.',
              'Side works on the wide part. The centre is left as it is. Use it when the edges of the picture are too lively and the middle should stay.',
            ],
          },
        ],
      },
      {
        heading: 'How to check it',
        blocks: [
          {
            p: 'Turn Listen on. You hear the part that will be compressed. Left or Right plays only that speaker. Mid plays the centre on both. Side plays the wide part, left and inverted right. If that is not the part you meant, change Channel before you judge the compression.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Mix blends compressed and original only on the path you selected. On Left, the right side stays original whatever Mix is.',
              'An external sidechain is read through the same choice. Mid listens to the centre of the sidechain, not of the main input.',
              'With Left, Right, Mid, or Side, the detector is already one signal, so Link barely changes anything. Link matters on Stereo.',
            ],
          },
        ],
      },
    ],
  }),

  sidechainActive: infoDoc({
    name: 'Sidechain',
    lead: 'Makes the compressor listen to another input, while the sound you hear stays the main signal.',
    meta: [
      { label: 'DAW name', value: 'Sidechain' },
      { label: 'Parameter ID', value: '3' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Route the other track into this plug-in’s sidechain input in the host, then turn this on. The main signal is turned down when that other signal gets loud. A kick can pull a bass down on each hit. A voice can pull a bed down while the voice is there.',
          },
          {
            p: 'Turn Listen on if you want to hear the signal that is doing the pushing. You should hear the other track, filtered by the controls above, not the main signal. If you still hear the main signal, the host has no active sidechain and detection has fallen back to it.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The external input is used only when this is on, the host provides a second input, and that bus is active. Otherwise the detector hears the main input.',
              'A mono sidechain is copied to both sides before Channel and Link.',
              'The filters, Mode, Link, and Channel all act on whatever the detector is hearing. They do not filter the main output, except while Listen is on.',
            ],
          },
        ],
      },
    ],
  }),

  listen: infoDoc({
    name: 'Listen',
    lead: 'Lets you hear what the compressor is listening to, instead of the compressed signal. While this is on, nothing is turned down.',
    meta: [
      { label: 'DAW name', value: 'Listen' },
      { label: 'Parameter ID', value: '18' },
      { label: 'Stored value', value: '0…1. On at 0.5 and above. The toggle writes 0 or 1.' },
      { label: 'Default', value: '0 (off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'The part that will cause the gain reduction: the main input, or the external sidechain if that input is active. Channel picks which part of the stereo picture that is. Left or Right plays only that side. Mid plays the centre on both speakers. Side plays the wide part, left and inverted right.',
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn it on and check that you are hearing the thing that should be pushing the compressor. If the solo is mostly something else, change Channel or the filters above, then turn Listen off and judge the compressed signal.',
          },
          {
            p: 'The GR meter can still move while you listen. That reduction is not in the sound until Listen is off.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Listen does nothing while Bypass is on.',
              'High-pass and low-pass set to Off do not narrow this solo.',
              'With Channel on Stereo, Max and Avg change the GR meter only. Link set to Mid is the exception: the solo becomes the centre.',
              'Makeup and Mix are not in this sound.',
            ],
          },
        ],
      },
    ],
  }),

  mode: infoDoc({
    name: 'Mode',
    lead: 'Sets how the compressor takes hold of the signal: on the instant spike, on a short average, or more gently once it is already working.',
    meta: [
      { label: 'DAW name', value: 'Mode' },
      { label: 'Parameter ID', value: '11' },
      { label: 'Stored range', value: '0…2. The buttons send Peak 0, RMS 1, Opto 2.' },
      { label: 'Default', value: '1 (RMS)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Peak grabs the loudest instant. Use it when a short spike is what should pull the level down: a hit, a consonant, a click. GR flashes with that spike. If only the spike is caught and the body of the note stays loud, that is Peak doing its job. If you wanted the whole note evened out, Peak is not following the body.',
              'RMS follows a short average of the level, so the body of the sound moves GR more than one click. Use it when you want the overall loudness held rather than every spike. A click can get through while the sustained part is turned down.',
              'Opto eases off once the compressor is already working: it gets slower to dig deeper and slower to let go. Use it when the gain should settle instead of clamping onto each peak. On a busy signal the reduction is less abrupt. This is a generic behaviour, not a copy of a particular optical compressor.',
            ],
          },
        ],
      },
      {
        heading: 'How to compare',
        blocks: [
          {
            p: 'Play one phrase and switch Mode without touching Threshold, Ratio, Attack, or Release. Watch GR and the history. Peak ticks on the spikes, RMS moves with the body of the phrase, Opto lets go more slowly after a loud moment.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The host stores a continuous value from 0 to 2. The processing rounds it to Peak, RMS, or Opto. The buttons send 0, 1, and 2.',
              'Peak jumps to the new level immediately and falls with Release. Attack and Release then ease the gain itself.',
              'RMS measures a fixed short average. Attack and Release ease the gain, not that average. The average is not the Attack knob.',
              'Opto puts Attack and Release on the level itself, and the gain follows at once. The deeper the reduction already is, the slower the attack and the longer the release.',
            ],
          },
        ],
      },
    ],
  }),

  link: infoDoc({
    name: 'Link',
    lead: 'Chooses which of the two detector channels sets the gain. On Stereo, both sides still receive that same gain.',
    meta: [
      { label: 'DAW name', value: 'Link' },
      { label: 'Parameter ID', value: '12' },
      { label: 'Stored range', value: '0…2. The buttons send Max 0, Avg 1, Mid 2.' },
      { label: 'Default', value: '0 (Max)' },
    ],
    sections: [
      {
        heading: 'Which one, and why',
        blocks: [
          {
            ul: [
              'Max follows the louder side. A peak on the left pulls both sides down together, so the picture stays put. Use it when one side must not stick out on its own.',
              'Avg follows the average of both sides. One loud side pulls less hard than it would on Max, because the quieter side is in the average too.',
              'Mid follows only the centre. A loud side does not push the gain. Both sides still get the same reduction, so the wide part is turned down with the centre. It is not left uncompressed.',
            ],
          },
        ],
      },
      {
        heading: 'How to compare',
        blocks: [
          {
            p: 'Set Channel to Stereo and play something that is loud on one side only. Switch Link and watch GR. Max moves the most, Avg less, Mid only if that loud moment is also in the centre. Then listen in the speakers: the image should not wander, because both sides share one gain.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Max uses the louder of the two detector levels. Avg uses their mean. Mid uses the centre, half of left plus right.',
              'This only combines the detector. It does not give the two sides different gains.',
              'When Channel is Left, Right, Mid, or Side, both detector channels already carry that one signal, so the three Link settings behave the same.',
              'With Listen and Channel on Stereo, Max and Avg do not change the solo. Mid does: you hear the centre.',
            ],
          },
        ],
      },
    ],
  }),

  threshold: infoDoc({
    name: 'Threshold',
    lead: 'Sets how loud the signal has to get before the compressor starts turning it down.',
    meta: [
      { label: 'DAW name', value: 'Threshold' },
      { label: 'Parameter ID', value: '4' },
      { label: 'Range', value: '−60 … 0 dB' },
      { label: 'Default', value: '−20 dB' },
      { label: 'Display', value: 'One decimal place on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Lower it and the compressor catches quieter moments, not only the loud peaks. Loud and quiet sit closer together, and the GR meter leaves 0 on more of the phrase. Raise it and more of the signal is left alone. Only the louder moments move GR.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Turn it down until GR moves on the notes you want held back. Then listen through the gaps between them. If those gaps are pulled down too, and the phrase sounds flat and stuck at one level, you have gone past the notes you meant to catch.',
          },
          {
            p: 'That heavy, even level can still be what you want when the part should stay dense and upfront. Listen for whether the peaks and the quiet parts have become the same loudness. Lowering Mix blends the uncompressed signal back in if the compressed path on its own is too flat.',
          },
        ],
      },
      {
        heading: 'On the graph',
        blocks: [
          {
            p: 'The history at the top draws this level as a dashed line. Move the knob and the line moves with it. When the level the compressor is hearing rises above that line, the GR trace shows the reduction. With Knee above 0, reduction can begin a little before the line. The handle on the transfer graph sits on this same level.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'With Knee at 0, reduction starts at this level. Above it, the amount follows Ratio.',
              'With Knee above 0, reduction eases in a little below this level and reaches the full ratio a little above it. At the default Knee of 6 dB, that margin is 3 dB on either side.',
              'Ratio at 1:1 does not turn anything down, at any threshold.',
              'Attack and Release do not move this level. They change how quickly the gain follows it.',
            ],
          },
        ],
      },
      {
        heading: 'Background',
        blocks: [
          {
            link: {
              href: 'https://en.wikipedia.org/wiki/Dynamic_range_compression',
              label: 'Dynamic range compression (Wikipedia)',
              note: 'General background. It is not a specification of this compressor.',
            },
          },
        ],
      },
    ],
  }),

  ratio: infoDoc({
    name: 'Ratio',
    lead: 'Sets how much of the level above the threshold is turned down.',
    meta: [
      { label: 'DAW name', value: 'Ratio' },
      { label: 'Parameter ID', value: '5' },
      { label: 'Range', value: '1 … 20, shown as n:1' },
      { label: 'Default', value: '4:1' },
      { label: 'Display', value: 'One decimal place on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: '1:1 leaves the level alone. 2:1 means a peak that sits 2 dB over the threshold comes out about 1 dB over, once the knee is fully into the ratio. 4:1 means about 1 dB out for every 4 dB over. Higher numbers hold the loud part flatter.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Raise it while you watch GR on the notes you want held. The meter climbs further for the same peak. If those notes stop getting louder at all and the phrase sits at one stuck level, you are past a gentle hold. That even level can still be what you want. Mix can put the original back beside it.',
          },
          {
            p: 'Ratio does not move Threshold. If nothing is crossing the threshold, a higher ratio still does nothing.',
          },
        ],
      },
      {
        heading: 'On the graph',
        blocks: [
          {
            p: 'On the transfer graph this is the slope above the threshold. Steeper toward flat means a higher ratio. The history does not draw the ratio. You see it there as more GR for the same peak.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The slope applies in decibels, above the knee. Inside a soft knee the ratio eases in rather than switching on at one point.',
              'The highest setting is 20:1. It is a strong ratio, not a brick-wall limit.',
            ],
          },
        ],
      },
    ],
  }),

  attack: infoDoc({
    name: 'Attack',
    lead: 'Sets how quickly the compressor starts turning the signal down once the level crosses into compression.',
    meta: [
      { label: 'DAW name', value: 'Attack' },
      { label: 'Parameter ID', value: '7' },
      { label: 'Range', value: '0.1 … 500' },
      { label: 'Default', value: '20' },
      { label: 'Display', value: 'One decimal place. No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number catches the start of the hit. The spike is turned down with the rest of the note, and the attack can lose its snap. A higher number lets the start through, then pulls the level down. The hit stays punchy, and the peak can slip past before the gain has moved.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Loop one hit. Lower the number until the click or the stick is held with the body of the note. Raise it until that click is back and only the sustain is turned down. Watch GR: a fast attack jumps with the spike, a slow attack rises after the spike has already passed.',
          },
          {
            p: 'Double the number and the reaction is about twice as slow.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The number is a speed, not milliseconds on a clock. About a quarter of it is the time constant in real milliseconds, so 20 is around 5 ms. At the fastest end that translation gets less exact, because the reaction cannot be shorter than one sample.',
              'In Peak and RMS this eases the gain. The level itself is not slowed by Attack.',
              'In Opto this eases how fast the measured level rises, and the gain follows at once. The deeper the reduction already is, the slower that rise.',
              'It does not move Threshold, and it does not change the transfer curve. The dot on that curve does not wait for Attack. The GR meter does.',
            ],
          },
        ],
      },
    ],
  }),

  release: infoDoc({
    name: 'Release',
    lead: 'Sets how quickly the gain comes back up after the level falls.',
    meta: [
      { label: 'DAW name', value: 'Release' },
      { label: 'Parameter ID', value: '8' },
      { label: 'Range', value: '1 … 2000' },
      { label: 'Default', value: '200' },
      { label: 'Display', value: 'Whole numbers. No unit: this is not a clock time in milliseconds.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'A lower number lets the quiet part open up again quickly after a loud moment. You can hear the level move on every hit or syllable. A higher number keeps the level held down through the gap, so the phrase stays even and the next quiet note can stay quiet too.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Watch GR through a gap. If it falls to 0 and jumps again on the next note, and you hear that as a pump, the release is short for this phrase. If GR stays up through the gap and the next note never gets its level back, the release is long for this phrase. The useful region is the one where the gain has recovered by the time the next note should be open, without chattering on every peak.',
          },
          {
            p: 'Same speed scale as Attack. Double the number and the recovery is about twice as slow. PDR can make a deep reduction slower than this number, without changing the knob.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Same translation as Attack: about a quarter of the number is the time constant in milliseconds, and it is not a clock time. At the fastest end that gets less exact.',
              'In Peak and RMS this eases the gain on the way back up. In Opto it eases the measured level on the way down, and a deeper reduction makes that slower still.',
              'It does not move the transfer curve. The history GR line shows this recovery. Makeup and Mix are not in that line.',
            ],
          },
        ],
      },
    ],
  }),

  pdr: infoDoc({
    name: 'PDR',
    lead: 'Makes a deep reduction let go more slowly than a light one, using the same Release setting.',
    meta: [
      { label: 'DAW name', value: 'PDR' },
      { label: 'Parameter ID', value: '13' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '0 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 % the release is only the Release knob, whatever just happened. Turn it up and a big hit recovers more slowly than a small one. The small moments stay closer to the Release you set. The big ones stay held a little longer, so they do not bounce back as hard.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Set Release so the small moments recover the way you want. If a loud hit then snaps back too fast, raise PDR and listen only to that recovery. If the loud hit stays ducked well into the next phrase, PDR is past the point where it is only smoothing the big moments.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The release time scale is multiplied by 1 + PDR × 4 × how deep the reduction already is. At 100 % and a deep reduction, release is about five times the Release number. At 0 % the multiplier is 1.',
              'It does not change Attack. Opto already slows the attack on its own when the reduction is deep.',
              '“How deep” is the gain reduction that is already happening, not a separate analysis of the phrase.',
            ],
          },
        ],
      },
    ],
  }),

  knee: infoDoc({
    name: 'Knee',
    lead: 'Rounds the point where compression starts, instead of a hard corner at the threshold.',
    meta: [
      { label: 'DAW name', value: 'Knee' },
      { label: 'Parameter ID', value: '6' },
      { label: 'Range', value: '0 … 24 dB' },
      { label: 'Default', value: '6 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'At 0 the compressor is either off or fully at the ratio, with the change at the threshold. Raise it and the level eases into compression instead of stepping into it. The start is less obvious. Some reduction is already happening before the signal looks like it has reached the threshold.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If you can hear the compressor switch on at one level, raise Knee until that switch disappears and the phrase just gets denser. If GR is moving on notes that are still well under the dashed threshold line, and you wanted those notes left alone, the knee is wide for that threshold. Lower it, or raise the threshold, until the quiet notes sit at 0 on the GR meter again.',
          },
        ],
      },
      {
        heading: 'On the graph',
        blocks: [
          {
            p: 'The transfer graph rounds the corner by this amount. The history still draws Threshold as one dashed line. With Knee above 0, reduction can begin before the level reaches that line.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The width is centred on Threshold. At the default of 6 dB, reduction begins about 3 dB below it and the full ratio is reached about 3 dB above it.',
              'At 0 the corner is hard: nothing until the threshold, then the ratio.',
            ],
          },
        ],
      },
    ],
  }),

  makeup: infoDoc({
    name: 'Makeup',
    lead: 'Turns the compressed signal back up, so you can compare it with the original at a similar loudness.',
    meta: [
      { label: 'DAW name', value: 'Makeup' },
      { label: 'Parameter ID', value: '9' },
      { label: 'Range', value: '0 … 24 dB' },
      { label: 'Default', value: '0 dB' },
      { label: 'Display', value: 'Two decimal places on the knob.' },
    ],
    sections: [
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Compression makes the loud moments quieter, so the whole part can sound smaller. Raise Makeup until Bypass is no longer an obvious jump in loudness. Then judge whether the compression helped, not which one is simply louder.',
          },
          {
            p: 'If the peaks you just turned down are back up near where they started, or past them, Makeup has replaced the reduction with level. The GR meter does not show this gain. It still shows only the reduction.',
          },
        ],
      },
      {
        heading: 'On the graph',
        blocks: [
          {
            p: 'The transfer curve shifts up by this amount, and the dot includes it. The history at the top does not. That picture stays the level before Makeup, so you can still see the reduction on its own.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'It is applied only on the compressed path, after the gain reduction. Mix at 0 % means you do not hear it.',
              'Bypass forces the header In and Out gains to unity as well. Makeup is not a substitute for those.',
            ],
          },
        ],
      },
    ],
  }),

  mix: infoDoc({
    name: 'Mix',
    lead: 'Blends the compressed signal with the original. 100 % is fully compressed.',
    meta: [
      { label: 'DAW name', value: 'Mix' },
      { label: 'Parameter ID', value: '10' },
      { label: 'Range', value: '0 … 100 %. Stored as 0…1.' },
      { label: 'Default', value: '100 %' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Lower it and the original comes back beside the compressed signal, on the path Channel selected. The peaks of the original return, and some of the density of the compressed path stays. At 0 % that path is fully original. At 100 % it is fully compressed, including Makeup.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Set the compressor until the compressed path is as even as you want, then lower Mix until the start of the notes is back. If the part is then almost the same as Bypass, Mix is low enough that you have mostly undone the compressor. The GR meter still shows the reduction inside the compressed path, even when Mix is low and you barely hear it.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The blend is linear: compressed times Mix, plus original times the rest. It is not an equal-power crossfade.',
              'On Left or Right, only that side is blended. The other side stays original.',
              'The history does not show Mix. It shows the level after gain reduction and before this blend.',
            ],
          },
        ],
      },
    ],
  }),

  gr: infoDoc({
    name: 'GR',
    lead: 'Shows how many decibels the compressor is turning the signal down right now. It is a meter, not a control, and it cannot be automated.',
    sections: [
      {
        heading: 'How to read it',
        blocks: [
          {
            p: '0 means nothing is being turned down. A higher number means more reduction. The scale runs up to 60 dB, with marks at 1, 3, 6, and 12.',
          },
          {
            p: 'A short jump on a hit means only that hit was caught. A number that stays up through the quiet gaps means the level is still held down between the loud moments. If it never leaves 0, Threshold is still above what the compressor is hearing.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The meter follows the current reduction. It does not keep a peak, and it does not fall on its own after the reduction has already let go. Full bypass forces it to 0.',
          },
        ],
      },
    ],
  }),

  history: infoDoc({
    name: 'History',
    lead: 'Shows the last 8 seconds of the level the compressor is working on, and how far it is turning that level down.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'One fill is the level before gain reduction. The other is the level after it. Where they separate, that gap is the reduction.',
              'The dashed line is Threshold.',
              'GR, on by default, is the gain itself. It sits at 0 dB when nothing is reduced and moves down by the amount being turned down. The GR meter beside the transfer graph shows that same amount as a positive number.',
              'Trig is off by default. Turn it on to see the level the detector is actually hearing. With the filters or an external sidechain, that can differ from the fill.',
            ],
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Lower Threshold and watch the dashed line. If the after-reduction fill goes flat while the before-reduction fill still moves, most of the phrase is being held. If GR falls to 0 in the gaps and jumps on the next hit, the release is recovering between notes.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Makeup and Mix are not in this picture. It is the selected path after gain reduction and before those two.',
              '0 dB stays at the top. The bottom of the scale follows the level, in 6 dB steps, and does not go below −60 dB.',
              'Full bypass draws no reduction: the gain line stays at 0 dB.',
            ],
          },
        ],
      },
    ],
  }),

  transfer: infoDoc({
    name: 'Transfer',
    lead: 'Shows the compressor’s working curve: how loud the detector hears the signal, and the level that comes out of the curve.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            ul: [
              'Across is the detector level. Up is the level after the curve and Makeup.',
              'The corner is Threshold. The slope above it is Ratio. Knee rounds that corner. Makeup shifts the whole result up.',
              'The dot is where the detector level sits on that curve right now. On the flat part, nothing is being reduced. On the bent part, it is.',
            ],
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Play the phrase and watch the dot. If it stays on the flat line, Threshold is still above what the detector hears. Drag the corner down until the dot spends time on the slope for the notes you want held, and still returns to the flat line in the gaps you want left alone.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'The line is drawn from Threshold, Ratio, Knee, and Makeup. The handles edit Threshold and Ratio.',
              'The dot uses the curve itself, including Makeup. It does not wait for Attack and Release. In Peak and RMS the GR meter can still be catching up, so the meter and the dot can disagree for a moment.',
              'While Bypass has finished fading, the dot sits on the diagonal: input level in, the same level out.',
            ],
          },
        ],
      },
    ],
  }),
} as const;

/** Detector FrequencyRange copy. The widget falls back to shared text for any key left out. */
export const compressorDetectorInfo: FrequencyRangeInfo = {
  chart: infoDoc({
    name: 'Detector filter',
    lead: 'Shows the filter in front of the compressor’s detector. It does not filter the sound you hear, unless Listen is on.',
    sections: [
      {
        heading: 'What you see',
        blocks: [
          {
            p: 'The line is the high-pass and low-pass the detector is using. With both slopes on Off the line is flat: the detector hears the full signal. A dip on the left means lows are being ignored. A dip on the right means highs are being ignored.',
          },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            p: 'Turn Listen on and shape this until the solo is the thing that should push the compressor. Then turn Listen off. If the line cuts away most of the band and GR barely moves, the detector has too little left to follow.',
          },
        ],
      },
    ],
  }),

  hpMode: infoDoc({
    name: 'High-pass slope',
    lead: 'Sets how steeply the lows are removed from what the compressor listens to.',
    meta: [
      { label: 'DAW name', value: 'HP Mode' },
      { label: 'Parameter ID', value: '16' },
      {
        label: 'Stored range',
        value: '0…4. The buttons send Off 0, 12 dB 1, 24 dB 2, 36 dB 3, 48 dB 4.',
      },
      { label: 'Default', value: '0 (Off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Off means the detector hears the lows. A steeper slope ignores bass more sharply, so a kick or a rumble pushes the gain less, and the mids and highs push it more. This does not take bass out of the sound you hear. Listen is how you hear the difference.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If the compressor ducks on every kick and you wanted it to follow the rest of the phrase, raise the slope and check with Listen that the kick is quieter in the solo. If the solo then loses the weight you actually wanted to follow, the slope is steeper than that job needs.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Off is a wire: the High-pass Hz knob does nothing.',
              '12, 24, 36, and 48 dB/oct are one to four filter stages. Each stage is a Butterworth high-pass.',
              'This filter is only in the detector, so the 36 dB slope is available. It is not a path that has to sum flat with the dry signal.',
            ],
          },
        ],
      },
    ],
  }),

  hipass: infoDoc({
    name: 'High-pass',
    lead: 'Sets the frequency where the detector starts to ignore the lows.',
    meta: [
      { label: 'DAW name', value: 'Highpass' },
      { label: 'Parameter ID', value: '14' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '120 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Higher means more of the low end is left out of the detector. The compressor reacts less to kick, bass, and rumble, and more to what is above this frequency. With the slope on Off, this frequency does nothing.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Turn the slope on, then move this while Listen is on. Stop when the solo has lost the low end you do not want pushing the gain, and still contains the notes you do. If GR no longer moves on the part you meant to catch, the cutoff is above that part.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The high-pass runs before the low-pass. The two frequencies are independent. If this sits above the low-pass, the band the detector hears can be very small.',
          },
        ],
      },
    ],
  }),

  lopass: infoDoc({
    name: 'Low-pass',
    lead: 'Sets the frequency where the detector starts to ignore the highs.',
    meta: [
      { label: 'DAW name', value: 'Lowpass' },
      { label: 'Parameter ID', value: '15' },
      { label: 'Range', value: '20 … 20 000 Hz' },
      { label: 'Default', value: '5 000 Hz' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Lower means more of the top is left out of the detector. Cymbals, hiss, and bright consonants push the gain less. With the slope on Off, this frequency does nothing.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'Turn the slope on and Listen. Lower this until the brightness you do not want is gone from the solo, and the body you do want is still there. If the solo becomes a dull thump and GR ignores the phrase, the cutoff is below the energy you meant to follow.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            p: 'The low-pass runs after the high-pass. It does not filter the output unless Listen is on.',
          },
        ],
      },
    ],
  }),

  lpMode: infoDoc({
    name: 'Low-pass slope',
    lead: 'Sets how steeply the highs are removed from what the compressor listens to.',
    meta: [
      { label: 'DAW name', value: 'LP Mode' },
      { label: 'Parameter ID', value: '17' },
      {
        label: 'Stored range',
        value: '0…4. The buttons send Off 0, 12 dB 1, 24 dB 2, 36 dB 3, 48 dB 4.',
      },
      { label: 'Default', value: '0 (Off)' },
    ],
    sections: [
      {
        heading: 'What you hear',
        blocks: [
          {
            p: 'Off means the detector hears the highs. A steeper slope ignores them more sharply. The output is unchanged until you turn Listen on.',
          },
        ],
      },
      {
        heading: 'How to set it',
        blocks: [
          {
            p: 'If bright hits are pulling GR and you wanted the compressor to follow the body of the sound, raise the slope and confirm with Listen. If the solo then loses the top of the part you meant to catch, ease the slope back.',
          },
        ],
      },
      {
        heading: 'In detail',
        blocks: [
          {
            ul: [
              'Off is a wire: the Low-pass Hz knob does nothing.',
              '12, 24, 36, and 48 dB/oct are one to four Butterworth low-pass stages, detector only.',
            ],
          },
        ],
      },
    ],
  }),
};
