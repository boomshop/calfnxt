import assert from 'node:assert/strict';
import { importRewText } from '../src/plugins/EqualizerUI/rewImport.ts';

const text = `
Filter Settings file

Room EQ Wizard V5.31
Equaliser: Generic

Filter  1: ON  PK       Fc     64.7 Hz  Gain   -5.7 dB  Q  3.000
Filter  2: ON  LS       Fc     80.0 Hz  Gain    3.0 dB  Q  0.700
Filter  3: ON  HS 6dB   Fc   8000 Hz    Gain   -2.0 dB
Filter  4: ON  LP       Fc     80 Hz
Filter  5: ON  HPQ      Fc     30.0 Hz  Q  1.200
Filter  6: ON  LP 24dB  Fc    100 Hz
Filter  7: OFF PK       Fc    200 Hz    Gain   1.0 dB  Q  1
Filter  8: ON  NO       Fc   1000 Hz    Q  8
Filter  9: ON  None
Filter 10: ON  PA   Fc   129.1Hz (  125 +2 )   Gain -18.5dB  BW/60  4.0
Filter 11: ON  PK       Fc    500 Hz    Gain   1,5 dB  Q  2,5
`;

const result = importRewText(text);
assert.equal(result.ok, true);
assert.equal(result.bands.length, 8);
assert.equal(result.summary.includes('Notch'), true);

const [pk, ls, hs, lp, hp, lp24, pa, comma] = result.bands;
assert.deepEqual(
  [pk.type, pk.freq, pk.gain, pk.q, pk.slope],
  ['parametric', 64.7, -5.7, 3, 12],
);
assert.equal(ls.type, 'lowshelf');
assert.equal(ls.q, 0.7);
assert.equal(hs.type, 'highshelf');
assert.equal(hs.gain, -2);
assert.ok(Math.abs(hs.q - 0.707) < 1e-9);
assert.equal(lp.type, 'lowpass');
assert.equal(lp.slope, 12);
assert.equal(lp.gain, 0);
assert.equal(hp.type, 'highpass');
assert.equal(hp.q, 1.2);
assert.equal(lp24.type, 'lowpass');
assert.equal(lp24.slope, 24);
assert.equal(pa.type, 'parametric');
assert.equal(pa.freq, 129.1);
assert.equal(pa.gain, -18.5);
const bwQ = 1 / (2 * Math.sinh((Math.LN2 / 2) * (4 / 60)));
assert.ok(Math.abs(pa.q - bwQ) < 1e-9);
assert.equal(comma.gain, 1.5);
assert.equal(comma.q, 2.5);

const bwOct = importRewText(
  'Filter 1: ON PK Fc 1000 Hz Gain 0 dB BW/oct 1.0\n',
);
assert.equal(bwOct.ok, true);
assert.ok(Math.abs(bwOct.bands[0].q - Math.SQRT2) < 1e-6);

const clamped = importRewText(
  'Filter 1: ON PK Fc 10 Hz Gain 40 dB Q 80\n',
);
assert.equal(clamped.bands[0].freq, 20);
assert.equal(clamped.bands[0].gain, 36);
assert.equal(clamped.bands[0].q, 30);
assert.equal(clamped.summary.includes('limited'), true);

const lines = ['Type\tFrequency\tGain\tQ\tEnabled'];
for (let i = 0; i < 18; i++)
  lines.push(`PK\t${100 + i}\t-1\t1\tON`);
lines.push('NO\t400\t0\t4\tON');
const table = importRewText(lines.join('\n'));
assert.equal(table.ok, true);
assert.equal(table.bands.length, 16);
assert.equal(table.bands[0].freq, 100);
assert.equal(table.summary.includes('did not fit'), true);
assert.equal(table.summary.includes('Notch'), true);

const quoted = importRewText(
  '"Type","Frequency","Gain","Q"\n"LS","120","2,5","0,7"\n',
);
assert.equal(quoted.ok, true);
assert.equal(quoted.bands[0].type, 'lowshelf');
assert.equal(quoted.bands[0].freq, 120);
assert.equal(quoted.bands[0].gain, 2.5);

const empty = importRewText('Filter Settings file\nEqualiser: Generic\n');
assert.equal(empty.ok, false);

const off = importRewText('Filter 1: OFF PK Fc 100 Hz Gain 1 dB Q 1\n');
assert.equal(off.ok, false);
assert.equal(off.summary.includes('enabled'), true);

console.log('rewImport ok');
