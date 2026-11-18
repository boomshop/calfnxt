import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DragCapture } from '@deutschesoft/aux-widgets/src/modules/dragcapture.js';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import listenerHeadUrl from '../../images/ListenerHead.png';
import monitorSpeakerUrl from '../../images/MonitorSpeaker.png';
import { themeAccent$, themeMode$ } from '../../prefs/theme';
import {
  ANGLE_MAX,
  ANGLE_MIN,
  DISTANCE_MAX,
  DISTANCE_MIN,
  phonesGeometry,
  planReflections,
  scatterWalls,
} from './phonesLayout';
import './PhonesPlan.scss';

export interface PhonesPlanProps {
  angle: number;
  distance: number;
  live: number;
  room: number;
  scatter: number;
  onAngle?: (value: number) => void;
  onDistance?: (value: number) => void;
  beginAngle?: () => void;
  endAngle?: () => void;
  beginDistance?: () => void;
  endDistance?: () => void;
}

/** Cabinet width in the plan. The PNG is the whole box; the baffle is its bottom edge. */
const SPEAKER_WIDTH_M = 0.4 * 0.66;
const SPEAKER_ASPECT = 766 / 726;
/** Ear-to-ear width of the opaque pixels in ListenerHead.png (270 of 400). */
const HEAD_WIDTH_M = 0.18;
const HEAD_IMAGE_SCALE = 400 / 270;

/**
 * The artwork points straight down. SVG rotation is clockwise, so atan2(x, z)
 * turns that front edge toward the listener. The head artwork already faces +z.
 */
function speakerFacingDeg(spkX: number, spkZ: number): number {
  return (Math.atan2(spkX, spkZ) * 180) / Math.PI;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Half-width at a fixed distance, folded back into the Angle range. */
function angleFromHalf(half: number, distance: number): number {
  const lo = Math.sin((ANGLE_MIN * Math.PI) / 180);
  const hi = Math.sin((ANGLE_MAX * Math.PI) / 180);
  const s = clamp(half / distance, lo, hi);
  return (Math.asin(s) * 180) / Math.PI;
}

/** Metres per client pixel, from the SVG that is on screen right now. */
function clientMetres(svg: SVGSVGElement, worldW: number, vbW: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const inv = ctm.inverse();
  const origin = new DOMPoint(0, 0).matrixTransform(inv);
  const px = new DOMPoint(1, 0).matrixTransform(inv);
  const py = new DOMPoint(0, 1).matrixTransform(inv);
  const metres = worldW / vbW;
  return {
    mx: (px.x - origin.x) * metres,
    my: (py.y - origin.y) * metres,
  };
}

type GlyphKind = 'speaker' | 'head';

type PlanApi = {
  angle: number;
  distance: number;
  worldW: number;
  vbW: number;
  onAngle?: (value: number) => void;
  onDistance?: (value: number) => void;
  beginAngle?: () => void;
  endAngle?: () => void;
  beginDistance?: () => void;
  endDistance?: () => void;
};

type GlyphBind = { node: SVGImageElement; destroy: () => void };

/** DragCapture on the glyph. Horizontal cabinets set Angle, vertical head sets Distance. */
function bindGlyph(
  binds: Map<string, GlyphBind>,
  apiRef: { current: PlanApi },
  id: string,
  node: SVGImageElement | null,
  kind: GlyphKind,
  sign: number,
) {
  const prev = binds.get(id);
  if (prev?.node === node) return;
  prev?.destroy();
  binds.delete(id);
  if (!node) return;

  const capture = new DragCapture({}, { node, focus: false });
  let gesture: {
    kind: GlyphKind;
    sign: number;
    angle: number;
    distance: number;
    mx: number;
    my: number;
  } | null = null;

  capture.on('startcapture', () => {
    const api = apiRef.current;
    if (kind === 'speaker' ? !api.onAngle : !api.onDistance) return false;
    const svg = node.ownerSVGElement;
    if (!svg) return false;
    const scale = clientMetres(svg, api.worldW, api.vbW);
    if (!scale) return false;
    gesture = {
      kind,
      sign,
      angle: api.angle,
      distance: api.distance,
      mx: scale.mx,
      my: scale.my,
    };
    if (kind === 'speaker') api.beginAngle?.();
    else api.beginDistance?.();
    document.body.style.cursor = kind === 'speaker' ? 'ew-resize' : 'ns-resize';
    return true;
  });
  capture.on('movecapture', (state: unknown) => {
    if (!gesture) return;
    const moved = state as { vDistance?: () => number[] };
    const delta = moved.vDistance?.();
    if (!delta) return;
    const api = apiRef.current;
    if (gesture.kind === 'speaker') {
      const rad = (gesture.angle * Math.PI) / 180;
      const half = gesture.distance * Math.sin(rad) + gesture.sign * delta[0] * gesture.mx;
      api.onAngle?.(angleFromHalf(half, gesture.distance));
      return;
    }
    api.onDistance?.(
      clamp(gesture.distance + delta[1] * gesture.my, DISTANCE_MIN, DISTANCE_MAX),
    );
  });
  capture.on('stopcapture', () => {
    if (!gesture) return;
    const api = apiRef.current;
    if (gesture.kind === 'speaker') api.endAngle?.();
    else api.endDistance?.();
    gesture = null;
    document.body.style.cursor = '';
  });

  binds.set(id, { node, destroy: () => capture.destroy() });
}

/** Glyph body saturation in the same measure as the PNGs (chroma / max channel). */
const GLYPH_SAT = 0.6;

/** Hue and saturation of a CSS color. Glyphs are red, so hue is the rotation. */
function cssHueSat(color: string): { hue: number; sat: number } | null {
  const text = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  let r = 0;
  let g = 0;
  let b = 0;
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const rgb = /^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i.exec(text);
    if (!rgb) return null;
    r = Number(rgb[1]);
    g = Number(rgb[2]);
    b = Number(rgb[3]);
  }
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const sat = max === 0 ? 0 : d / max;
  if (d === 0) return { hue: 0, sat: 0 };
  let hue: number;
  if (max === rn) hue = ((gn - bn) / d) % 6;
  else if (max === gn) hue = (bn - rn) / d + 2;
  else hue = (rn - gn) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, sat };
}

/** Cabinet corners. The front edge is centered on the speaker point and faces the listener. */
function cabinetCorners(
  spkX: number,
  spkZ: number,
): { x: number; z: number }[] {
  const cabinetH = SPEAKER_WIDTH_M * SPEAKER_ASPECT;
  const halfW = SPEAKER_WIDTH_M / 2;
  const len = Math.hypot(spkX, spkZ) || 1;
  const ax = spkX / len;
  const az = spkZ / len;
  const px = -az;
  const pz = ax;
  const corners: { x: number; z: number }[] = [];
  for (const side of [-1, 1]) {
    corners.push({ x: spkX + px * halfW * side, z: spkZ + pz * halfW * side });
    corners.push({
      x: spkX + ax * cabinetH + px * halfW * side,
      z: spkZ + az * cabinetH + pz * halfW * side,
    });
  }
  return corners;
}

/**
 * Drawn walls. The acoustic room is the minimum; cabinets that would cross a
 * wall push that wall out so the boxes stay inside.
 */
function roomFit(g: ReturnType<typeof phonesGeometry>, scatter: number) {
  const pad = 0.04;
  const walls = scatterWalls(g, scatter);
  let left = walls.left;
  let right = walls.right;
  let front = walls.front;
  let back = walls.back;
  for (const spkX of [-g.spkX, g.spkX]) {
    for (const corner of cabinetCorners(spkX, g.spkZ)) {
      left = Math.min(left, corner.x - pad);
      right = Math.max(right, corner.x + pad);
      front = Math.max(front, corner.z + pad);
      back = Math.min(back, corner.z - pad);
    }
  }
  return {
    left,
    right,
    front,
    back,
    width: right - left,
    length: front - back,
  };
}

/** World bounds of everything drawn, so the viewBox sits on the artwork. */
function artworkBounds(
  g: ReturnType<typeof phonesGeometry>,
  box: ReturnType<typeof roomFit>,
) {
  let minX = box.left;
  let maxX = box.right;
  let minZ = box.back;
  let maxZ = box.front;
  const add = (x: number, z: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };

  const head = HEAD_WIDTH_M * HEAD_IMAGE_SCALE;
  const top = 4 / 400;
  const bot = 395 / 400;
  const left = 65 / 400;
  const right = 335 / 400;
  add(-head / 2 + left * head, head / 2 - bot * head);
  add(-head / 2 + right * head, head / 2 - top * head);

  for (const spkX of [-g.spkX, g.spkX]) {
    for (const corner of cabinetCorners(spkX, g.spkZ)) add(corner.x, corner.z);
  }

  const span = Math.max(maxX - minX, 1e-3);
  const unit = 1000 / span;
  const em = PLAN_FONT / unit;
  const advance = (text: string) => text.length * em * 0.56;
  const th = (g.angle * Math.PI) / 180;
  const labelR = g.distance * 0.28 * 1.85;
  const labelTh = th * 0.5;
  const angleText = `±${g.angle.toFixed(0)}°`;
  const ax = Math.sin(labelTh) * labelR;
  const az = Math.cos(labelTh) * labelR;
  add(ax, az + em * 1.15);
  add(ax + advance(angleText), az - em * 0.35);
  const legLen = Math.hypot(g.spkX, g.spkZ) || 1;
  const distText = `${g.distance.toFixed(2)} m`;
  const dx = g.spkX * 0.55 + (g.spkZ / legLen) * 0.22;
  const dz = g.spkZ * 0.55 + (-g.spkX / legLen) * 0.22;
  add(dx, dz + em * 1.15);
  add(dx + advance(distText), dz - em * 0.35);

  return { minX, maxX, minZ, maxZ };
}

const PLAN_FONT = 44;

function planAspect(angle: number, distance: number, live: number, scatter: number): number {
  const g = phonesGeometry(angle, distance, live);
  const bounds = artworkBounds(g, roomFit(g, scatter));
  const worldW = Math.max(bounds.maxX - bounds.minX, 1e-3);
  return (bounds.maxZ - bounds.minZ) / worldW;
}

/** Screen size of the labels at the middle of the Angle range, default triangle. */
const MEDIUM_ASPECT = planAspect((ANGLE_MIN + ANGLE_MAX) / 2, 1.2, 0.25, 0.4);

export function PhonesPlan({
  angle,
  distance,
  live,
  room,
  scatter,
  onAngle,
  onDistance,
  beginAngle,
  endAngle,
  beginDistance,
  endDistance,
}: PhonesPlanProps) {
  const g = phonesGeometry(angle, distance, live);
  const box = roomFit(g, scatter);
  const bounds = artworkBounds(g, box);
  const x0 = bounds.minX;
  const x1 = bounds.maxX;
  const z0 = bounds.minZ;
  const z1 = bounds.maxZ;
  const worldW = x1 - x0;
  const worldH = z1 - z0;
  const vbW = 1000;
  const vbH = (1000 * worldH) / worldW;
  const unit = vbW / worldW;
  // Strokes are centred on the path. A flat 2px inset keeps them inside the viewport.
  const [edge, setEdge] = useState(8);
  const [fontSize, setFontSize] = useState(PLAN_FONT);
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
  const reflections = planReflections(g, scatter);
  const reflOpacity = Math.max(0, Math.min(1, room));
  const rootRef = useRef<HTMLDivElement>(null);
  const bindsRef = useRef(new Map<string, GlyphBind>());
  const apiRef = useRef<PlanApi>({
    angle: 30,
    distance: 1.2,
    worldW: 1,
    vbW: 1000,
  });
  apiRef.current = {
    angle: g.angle,
    distance: g.distance,
    worldW,
    vbW,
    onAngle,
    onDistance,
    beginAngle,
    endAngle,
    beginDistance,
    endDistance,
  };
  const bindLeft = useCallback((node: SVGImageElement | null) => {
    bindGlyph(bindsRef.current, apiRef, 'left', node, 'speaker', -1);
  }, []);
  const bindRight = useCallback((node: SVGImageElement | null) => {
    bindGlyph(bindsRef.current, apiRef, 'right', node, 'speaker', 1);
  }, []);
  const bindHead = useCallback((node: SVGImageElement | null) => {
    bindGlyph(bindsRef.current, apiRef, 'head', node, 'head', 1);
  }, []);
  useEffect(
    () => () => {
      for (const bind of bindsRef.current.values()) bind.destroy();
      bindsRef.current.clear();
      document.body.style.cursor = '';
    },
    [],
  );
  const accent = useDynamicValueReadonly(themeAccent$, 'calfnxt');
  const mode = useDynamicValueReadonly(themeMode$, 'night');
  const [hue, setHue] = useState(336);
  const [sat, setSat] = useState(1 / GLYPH_SAT);
  useLayoutEffect(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(
      '--color-warn',
    );
    const tone = cssHueSat(raw);
    if (!tone) return;
    setHue(tone.hue);
    setSat(tone.sat / GLYPH_SAT);
  }, [accent, mode]);
  // The grid column owns the card size. The SVG letterboxes inside it.
  useLayoutEffect(() => {
    const block = rootRef.current?.closest('.block.plan');
    if (block instanceof HTMLElement) block.style.width = '';
  }, []);
  useLayoutEffect(() => {
    const svg = rootRef.current?.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) return;
    const fit = () => {
      const w = svg.clientWidth;
      const h = svg.clientHeight;
      if (w < 1 || h < 1) return;
      const guess = 2 * Math.max(vbW / w, vbH / h);
      const next = 2 * Math.max((vbW + guess * 2) / w, (vbH + guess * 2) / h);
      setEdge((prev) => (Math.abs(prev - next) < 0.25 ? prev : next));
      const pad = next * 2;
      const current = Math.min(w / (vbW + pad), h / (vbH + pad));
      const medium = Math.min(w / (vbW + pad), h / (vbW * MEDIUM_ASPECT + pad));
      if (current > 0) {
        const sized = PLAN_FONT * (medium / current);
        setFontSize((prev) => (Math.abs(prev - sized) < 0.25 ? prev : sized));
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [vbW, vbH]);

  const legLen = Math.hypot(g.spkX, g.spkZ) || 1;
  const nx = g.spkZ / legLen;
  const nz = -g.spkX / legLen;
  const midX = g.spkX * 0.55;
  const midZ = g.spkZ * 0.55;
  const distX = sx(midX + nx * 0.22);
  const distY = sz(midZ + nz * 0.22);

  return (
    <div className="PhonesPlan" ref={rootRef}>
      <svg
        viewBox={`${-edge} ${-edge} ${vbW + edge * 2} ${vbH + edge * 2}`}
        style={{ ['--plan-font' as string]: `${fontSize}px` }}
        role="img"
        aria-label="Listening triangle">
          <defs>
            <filter id="phones-glyph-hue" colorInterpolationFilters="sRGB">
              <feColorMatrix type="hueRotate" values={'' + hue} />
              <feColorMatrix type="saturate" values={'' + sat} />
            </filter>
          </defs>
          <clipPath id="phones-room-clip">
            <rect
              x={sx(box.left)}
              y={sz(box.front)}
              width={box.width * unit}
              height={box.length * unit}
            />
          </clipPath>
          <rect
            className="room"
            x={sx(box.left)}
            y={sz(box.front)}
            width={box.width * unit}
            height={box.length * unit}
            vectorEffect="non-scaling-stroke"
          />
          <line
            className="axis"
            x1={sx(0)}
            y1={sz(box.back)}
            x2={sx(0)}
            y2={sz(box.front)}
            vectorEffect="non-scaling-stroke"
          />
          <line
            className="gap"
            x1={sx(-g.spkX)}
            y1={sz(g.spkZ)}
            x2={sx(box.left)}
            y2={sz(g.spkZ)}
            vectorEffect="non-scaling-stroke"
          />
          <line
            className="gap"
            x1={sx(g.spkX)}
            y1={sz(g.spkZ)}
            x2={sx(box.right)}
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
          {reflOpacity > 0.02 &&
            reflections.map((refl) => (
              <polyline
                key={refl.key}
                className="refl"
                points={refl.points
                  .map((p) => `${sx(p.x)},${sz(p.z)}`)
                  .join(' ')}
                strokeOpacity={reflOpacity * refl.weight}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          <g clipPath="url(#phones-room-clip)" filter="url(#phones-glyph-hue)">
            {([-1, 1] as const).map((sign) => {
              const spkX = sign * g.spkX;
              const w = SPEAKER_WIDTH_M * unit;
              const h = w * SPEAKER_ASPECT;
              const cx = sx(spkX);
              const cy = sz(g.spkZ);
              const deg = speakerFacingDeg(spkX, g.spkZ);
              return (
                <image
                  key={sign}
                  ref={sign < 0 ? bindLeft : bindRight}
                  className="glyph speaker"
                  href={monitorSpeakerUrl}
                  x={cx - w / 2}
                  y={cy - h}
                  width={w}
                  height={h}
                  transform={`rotate(${deg} ${cx} ${cy})`}
                  preserveAspectRatio="none"
                  draggable={false}
                />
              );
            })}
          </g>
          <g filter="url(#phones-glyph-hue)">
            <image
              ref={bindHead}
              className="glyph head"
              href={listenerHeadUrl}
              x={sx(0) - (HEAD_WIDTH_M * HEAD_IMAGE_SCALE * unit) / 2}
              y={sz(0) - (HEAD_WIDTH_M * HEAD_IMAGE_SCALE * unit) / 2}
              width={HEAD_WIDTH_M * HEAD_IMAGE_SCALE * unit}
              height={HEAD_WIDTH_M * HEAD_IMAGE_SCALE * unit}
              preserveAspectRatio="xMidYMid meet"
              draggable={false}
            />
          </g>
          <text
            x={sx(Math.sin(labelTh) * labelR)}
            y={sz(Math.cos(labelTh) * labelR)}
            textAnchor="start">
            {`±${g.angle.toFixed(0)}°`}
          </text>
          <text x={distX} y={distY} textAnchor="start">
            {`${g.distance.toFixed(2)} m`}
          </text>
          <text
            x={sx(g.spkX * 0.5)}
            y={sz(g.spkZ) - 10}
            textAnchor="middle"
            dominantBaseline="text-after-edge">
            {`${(g.spkX * 2).toFixed(2)} m`}
          </text>
        <text x={vbW * 0.2} y={vbH * 0.8} textAnchor="start">
          {`${g.rt60.toFixed(2)} s`}
        </text>
      </svg>
    </div>
  );
}
