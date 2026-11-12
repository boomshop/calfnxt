import { phonesGeometry, sideBounce } from './phonesLayout';
import './PhonesPlan.scss';

export interface PhonesPlanProps {
  angle: number;
  distance: number;
  live: number;
  room: number;
}

function speakerPath(
  sx: (x: number) => number,
  sz: (z: number) => number,
  spkX: number,
  spkZ: number,
): string {
  const dx = -spkX;
  const dz = -spkZ;
  const len = Math.hypot(dx, dz) || 1;
  const fx = dx / len;
  const fz = dz / len;
  const px = -fz;
  const pz = fx;
  const depth = 0.14;
  const half = 0.11;
  const frontX = spkX + fx * depth * 0.35;
  const frontZ = spkZ + fz * depth * 0.35;
  const backX = spkX - fx * depth * 0.65;
  const backZ = spkZ - fz * depth * 0.65;
  const p1 = `${sx(frontX)} ${sz(frontZ)}`;
  const p2 = `${sx(backX + px * half)} ${sz(backZ + pz * half)}`;
  const p3 = `${sx(backX - px * half)} ${sz(backZ - pz * half)}`;
  return `M ${p1} L ${p2} L ${p3} Z`;
}

export function PhonesPlan({ angle, distance, live, room }: PhonesPlanProps) {
  const g = phonesGeometry(angle, distance, live);
  const marginX = g.width * 0.1;
  const marginZ = g.length * 0.08;
  const x0 = -g.halfWidth - marginX;
  const x1 = g.halfWidth + marginX;
  const z0 = g.backZ - marginZ;
  const z1 = g.frontZ + marginZ;
  const worldW = x1 - x0;
  const worldH = z1 - z0;
  const vbW = 1000;
  const vbH = (1000 * worldH) / worldW;
  const unit = vbW / worldW;
  const sx = (x: number) => ((x - x0) / worldW) * vbW;
  const sz = (z: number) => ((z1 - z) / worldH) * vbH;

  const th = (g.angle * Math.PI) / 180;
  const arcR = g.distance * 0.28;
  const arcPx = arcR * unit;
  const axisX = sx(0);
  const axisY = sz(arcR);
  const legX = sx(Math.sin(th) * arcR);
  const legY = sz(Math.cos(th) * arcR);
  const labelR = arcR * 1.85;
  const labelTh = th * 0.5;
  const leftBounce = sideBounce(-g.spkX, g.spkZ, -g.halfWidth);
  const rightBounce = sideBounce(g.spkX, g.spkZ, g.halfWidth);
  const reflOpacity = Math.max(0, Math.min(1, room));

  const legLen = Math.hypot(g.spkX, g.spkZ) || 1;
  const nx = g.spkZ / legLen;
  const nz = -g.spkX / legLen;
  const midX = g.spkX * 0.55;
  const midZ = g.spkZ * 0.55;
  const distX = sx(midX + nx * 0.22);
  const distY = sz(midZ + nz * 0.22);

  return (
    <div className="PhonesPlan">
      <svg viewBox={`0 0 ${vbW} ${vbH}`} role="img" aria-label="Listening triangle">
        <rect
          className="room"
          x={sx(-g.halfWidth)}
          y={sz(g.frontZ)}
          width={g.width * unit}
          height={g.length * unit}
          vectorEffect="non-scaling-stroke"
        />
        <line
          className="axis"
          x1={sx(0)}
          y1={sz(g.backZ)}
          x2={sx(0)}
          y2={sz(g.frontZ)}
          vectorEffect="non-scaling-stroke"
        />
        <line
          className="gap"
          x1={sx(-g.spkX)}
          y1={sz(g.spkZ)}
          x2={sx(-g.halfWidth)}
          y2={sz(g.spkZ)}
          vectorEffect="non-scaling-stroke"
        />
        <line
          className="gap"
          x1={sx(g.spkX)}
          y1={sz(g.spkZ)}
          x2={sx(g.halfWidth)}
          y2={sz(g.spkZ)}
          vectorEffect="non-scaling-stroke"
        />
        <line
          className="base"
          x1={sx(-g.spkX)}
          y1={sz(g.spkZ)}
          x2={sx(g.spkX)}
          y2={sz(g.spkZ)}
          vectorEffect="non-scaling-stroke"
        />
        <line
          className="leg"
          x1={sx(0)}
          y1={sz(0)}
          x2={sx(-g.spkX)}
          y2={sz(g.spkZ)}
          vectorEffect="non-scaling-stroke"
        />
        <line
          className="leg"
          x1={sx(0)}
          y1={sz(0)}
          x2={sx(g.spkX)}
          y2={sz(g.spkZ)}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="arc"
          d={`M ${axisX} ${axisY} A ${arcPx} ${arcPx} 0 0 1 ${legX} ${legY}`}
          vectorEffect="non-scaling-stroke"
        />
        {reflOpacity > 0.02 && (
          <>
            <polyline
              className="refl"
              points={`${sx(-g.spkX)},${sz(g.spkZ)} ${sx(leftBounce.x)},${sz(leftBounce.z)} ${sx(0)},${sz(0)}`}
              strokeOpacity={reflOpacity}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              className="refl"
              points={`${sx(g.spkX)},${sz(g.spkZ)} ${sx(rightBounce.x)},${sz(rightBounce.z)} ${sx(0)},${sz(0)}`}
              strokeOpacity={reflOpacity}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        <path className="speaker" d={speakerPath(sx, sz, -g.spkX, g.spkZ)} />
        <path className="speaker" d={speakerPath(sx, sz, g.spkX, g.spkZ)} />
        <circle className="head" cx={sx(0)} cy={sz(0)} r={0.055 * unit} />
        <line
          className="nose"
          x1={sx(0)}
          y1={sz(0)}
          x2={sx(0)}
          y2={sz(0.12)}
          vectorEffect="non-scaling-stroke"
        />
        <text x={sx(Math.sin(labelTh) * labelR)} y={sz(Math.cos(labelTh) * labelR)} textAnchor="start">
          {`±${g.angle.toFixed(0)}°`}
        </text>
        <text x={distX} y={distY} textAnchor="start">
          {`${g.distance.toFixed(2)} m`}
        </text>
        <text x={sx(-g.halfWidth) + 10} y={sz(g.frontZ) + 22} textAnchor="start">
          {`${g.rt60.toFixed(2)} s`}
        </text>
      </svg>
    </div>
  );
}
