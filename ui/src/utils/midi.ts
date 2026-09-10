import { postToHost } from './bridge';

/** UI→DSP: drop held MIDI notes (`{t:"midi",cmd:"alloff"}`). Shared by Tuner / Filter. */
export function postMidiAllOff(): void {
  postToHost({ t: 'midi', cmd: 'alloff' });
}
