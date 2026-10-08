/**
 * pixel-fjord.js
 * Procedural pixel-art Norwegian fjord that follows the time of day.
 *
 * Seeded value noise → fractal + ridged terrain → time-interpolated palette →
 * dithered sky bands, moon-lit ridge shading, snow lines, mirrored water.
 * Same seed = same landscape, every time. Zero dependencies.
 *
 * Usage:
 *   import { renderFjord } from './pixel-fjord.js';
 *   renderFjord(document.querySelector('canvas'), { hour: 22.5, seed: 2026, scale: 4 });
 *
 * © Emil Eriksson · MIT
 */

/* ---------- Deterministic randomness ---------- */

/** Mulberry32: tiny, fast, seedable PRNG (returns floats in [0, 1)). */
export const mulberry32 = seed => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 1D value noise with smoothstep interpolation over a 512-entry lattice. */
export const valueNoise = seed => {
  const rand = mulberry32(seed), lattice = Float32Array.from({ length: 512 }, rand);
  return x => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lattice[i & 511] + (lattice[(i + 1) & 511] - lattice[i & 511]) * u;
  };
};

/** Sum octaves of a noise function. `shape` remaps each octave (identity = fBm, ridge = peaks). */
const octaves = (noise, x, count, shape) => {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < count; o++, amp *= 0.5, freq *= 2.03) {
    sum += amp * shape(noise(x * freq)); norm += amp;
  }
  return sum / norm;
};
export const fbm = (noise, x, count = 4) => octaves(noise, x, count, v => v);
export const ridged = (noise, x, count = 4) => octaves(noise, x, count, v => 1 - Math.abs(v * 2 - 1));

/* ---------- Colour & time ---------- */

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const smooth = t => t * t * (3 - 2 * t);

const MOODS = {
  night: { top: '#050b1b', mid: '#0a1631', horizon: '#17294d', far: '#0f1d3a', near: '#0a152c', snow: '#7d93b8', water: '#081329', stars: 1 },
  dawn:  { top: '#0e1c3c', mid: '#253a63', horizon: '#6a7ea4', far: '#2b3d62', near: '#1b2a4b', snow: '#b4c5dc', water: '#1a2b4e', stars: 0.25 },
  day:   { top: '#173158', mid: '#2a4c7c', horizon: '#6488b2', far: '#38547e', near: '#223a60', snow: '#cfdbea', water: '#203d66', stars: 0 },
  dusk:  { top: '#0a1430', mid: '#1b2b55', horizon: '#4d5079', far: '#1e2b4f', near: '#131e3b', snow: '#7d89ab', water: '#111c39', stars: 0.55 }
};
const TIMELINE = [[0, 'night'], [5, 'night'], [7, 'dawn'], [10, 'day'], [16, 'day'], [18.5, 'dusk'], [21, 'night'], [24, 'night']];

/** Blend the two moods surrounding `hour` (0–24) with a smoothstep cross-fade. */
export function paletteAt(hour) {
  hour = ((hour % 24) + 24) % 24;
  const i = TIMELINE.findIndex(([h], k) => hour < TIMELINE[k + 1]?.[0]);
  const [[h0, a], [h1, b]] = [TIMELINE[i], TIMELINE[i + 1]];
  const t = smooth((hour - h0) / (h1 - h0));
  return Object.fromEntries(Object.keys(MOODS[a]).map(k => {
    const [x, y] = [MOODS[a][k], MOODS[b][k]];
    return [k, typeof x === 'string' ? mix(hex(x), hex(y), t) : x + (y - x) * t];
  }));
}

/* ---------- Renderer ---------- */

/**
 * Paint a fjord into `canvas` at low resolution, then let CSS upscale it crisply.
 * @param {HTMLCanvasElement} canvas
 * @param {{hour?: number, seed?: number, scale?: number}} [options]
 */
export function renderFjord(canvas, { hour = new Date().getHours(), seed = 2026, scale = 4 } = {}) {
  const w = Math.ceil(canvas.clientWidth / scale), h = Math.ceil(canvas.clientHeight / scale);
  canvas.width = w; canvas.height = h;
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d'), pal = paletteAt(hour), rand = mulberry32(seed);
  const horizon = Math.round(h * 0.68), amp = Math.min(h * 0.27, w * 0.34);
  const px = (c, x, y, ww = 1, hh = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); };

  // Sky: stepped bands with a checkerboard dither row between each step
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1), y0 = Math.round((i * horizon) / steps), y1 = Math.round(((i + 1) * horizon) / steps);
    const col = t < 0.55 ? mix(pal.top, pal.mid, t / 0.55) : mix(pal.mid, pal.horizon, (t - 0.55) / 0.45);
    px(rgb(col), 0, y0, w, y1 - y0);
    if (i) for (let x = y0 & 1; x < w; x += 2) px(rgb(mix(col, pal.top, 0.15)), x, y0);
  }
  for (let i = 0; i < (w * horizon) / 150 * pal.stars; i++) {
    px(rgb([214, 226, 246], 0.3 + rand() * 0.7), Math.floor(rand() * w), Math.floor(rand() ** 1.35 * (horizon - 6)));
  }

  // Terrain: a ridged far range, and fjord walls that rise towards the edges
  const nFar = valueNoise(seed + 11), nNear = valueNoise(seed + 23), fjord = w * 0.47;
  const ranges = [
    { base: pal.far, snowLine: horizon - amp * 0.5,
      top: x => horizon - Math.round(amp * (0.22 + 0.78 * ridged(nFar, x / 34 + 4.2) ** 1.6)) },
    { base: pal.near, snowLine: horizon - amp * 0.72,
      top: x => horizon - Math.round(amp * 1.05 * (0.1 + 0.9 * Math.min(Math.abs(x - fjord) / (w / 2), 1.25) ** 1.8) * (0.6 + 0.4 * fbm(nNear, x / 20))) }
  ];
  for (const { base, snowLine, top } of ranges) {
    for (let x = 0; x < w; x++) {
      const y = top(x), litFace = top(x + 3) - top(x - 3) > 1;   // slopes facing the moon (right)
      px(rgb(base), x, y, 1, horizon - y);
      if (litFace) px(rgb(mix(base, pal.horizon, 0.16)), x, y, 1, Math.round((horizon - y) * 0.4));
      if (y < snowLine) px(rgb(litFace ? mix(pal.snow, [236, 242, 250], 0.2) : mix(pal.snow, base, 0.5)), x, y, 1, Math.round((snowLine - y) * 0.6) || 1);
    }
  }

  // Water: mirror the mountains into the fjord, then darken and break it into ripples
  const water = h - horizon;
  px(rgb(pal.water), 0, horizon, w, water);
  ctx.save();
  ctx.globalAlpha = 0.45;
  for (let r = 0; r < water; r++) {
    if (r > 2 && Math.sin(r * 1.7) > 0.82) continue;                  // ripple gaps
    const dx = Math.round(Math.sin(r * 0.45) * Math.min(2, 0.4 + r * 0.05));
    ctx.drawImage(canvas, 0, horizon - 1 - r, w, 1, dx, horizon + r, w, 1);
  }
  ctx.restore();

  return { width: w, height: h, palette: pal };
}
