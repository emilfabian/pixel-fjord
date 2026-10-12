/**
 * pixel-fjord.js
 * Procedural pixel-art Norwegian fjord that follows the real sun, the weather and the season.
 *
 * Seeded value noise → fractal + ridged terrain → sun-driven palette → weather & theme layers →
 * dithered sky bands, moon-lit ridge shading, snow lines, mirrored water.
 * Same seed = same landscape, every time. Zero dependencies (pairs with ./sky.js).
 *
 * Usage:
 *   import { renderFjord } from './pixel-fjord.js';
 *   import { fetchWeather, seasonalTheme } from './sky.js';
 *   renderFjord(canvas, { date: new Date(), weather: await fetchWeather(), theme: seasonalTheme() });
 *
 * © Emil Eriksson · MIT
 */

import { sunPosition, withWeather, intensity, OSLO } from './sky.js';

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

/* ---------- Colour & light ---------- */

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

const MOODS = Object.fromEntries(Object.entries({
  night: { top: '#050b1b', mid: '#0a1631', horizon: '#17294d', far: '#0f1d3a', near: '#0a152c', snow: '#7d93b8', water: '#081329', stars: 1 },
  dawn:  { top: '#0e1c3c', mid: '#253a63', horizon: '#6a7ea4', far: '#2b3d62', near: '#1b2a4b', snow: '#b4c5dc', water: '#1a2b4e', stars: 0.25 },
  day:   { top: '#173158', mid: '#2a4c7c', horizon: '#6488b2', far: '#38547e', near: '#223a60', snow: '#cfdbea', water: '#203d66', stars: 0 },
  dusk:  { top: '#0a1430', mid: '#1b2b55', horizon: '#4d5079', far: '#1e2b4f', near: '#131e3b', snow: '#7d89ab', water: '#111c39', stars: 0.55 }
}).map(([k, m]) => [k, Object.fromEntries(Object.entries(m).map(([f, v]) => [f, typeof v === 'string' ? hex(v) : v]))]));

const blend = (a, b, t) => Object.fromEntries(Object.keys(a).map(k =>
  [k, Array.isArray(a[k]) ? mix(a[k], b[k], t) : a[k] + (b[k] - a[k]) * t]));

/**
 * Palette from the sun's real position: night below -12°, twilight around the horizon,
 * full day ~8° up. Twilight leans dawn before noon and dusk after, blending through midday.
 */
export function paletteForSun({ elevation: e, hourAngle: ha }) {
  const twilight = blend(MOODS.dawn, MOODS.dusk, ease((ha + 60) / 120));
  if (e < -4) return blend(MOODS.night, twilight, ease((e + 12) / 8));
  if (e < 0) return twilight;
  return blend(twilight, MOODS.day, ease(e / 8));
}

/** Simple clock-based palette (no location needed): 0–24 → night / dawn / day / dusk. */
const TIMELINE = [[0, 'night'], [5, 'night'], [7, 'dawn'], [10, 'day'], [16, 'day'], [18.5, 'dusk'], [21, 'night'], [24, 'night']];
export function paletteAt(hour) {
  hour = ((hour % 24) + 24) % 24;
  const i = TIMELINE.findIndex(([h], k) => hour < TIMELINE[k + 1]?.[0]);
  const [[h0, a], [h1, b]] = [TIMELINE[i], TIMELINE[i + 1]];
  return blend(MOODS[a], MOODS[b], ease((hour - h0) / (h1 - h0)));
}

/* ---------- Renderer ---------- */

/**
 * Paint a fjord into `canvas` at low resolution, then let CSS upscale it crisply.
 * @param {HTMLCanvasElement} canvas
 * @param {object}  [o]
 * @param {Date}    [o.date]     moment to light the scene for (real sun position)
 * @param {number}  [o.hour]     use a simple clock palette instead of the sun
 * @param {{lat:number, lon:number}} [o.place]  where the sun is computed (default Oslo)
 * @param {object}  [o.weather]  from sky.js fetchWeather() / weatherPreset(); null = clear
 * @param {string}  [o.theme]    'xmas' adds warm windows and festive snow
 * @param {number}  [o.seed]     landscape seed
 * @param {number}  [o.scale]    CSS pixels per art pixel
 */
export function renderFjord(canvas, { date = new Date(), hour, place = OSLO, weather = null, theme = '', seed = 2026, scale = 4 } = {}) {
  const w = Math.ceil(canvas.clientWidth / scale), h = Math.ceil(canvas.clientHeight / scale);
  canvas.width = w; canvas.height = h;
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d'), rand = mulberry32(seed);
  const base = hour != null ? paletteAt(hour) : paletteForSun(sunPosition(date, place));
  const pal = withWeather(base, weather);
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

  // Clouds: three overlapping puffs each, more of them the greyer the sky (fog draws its own banks)
  if (weather && weather.cloud >= 15 && weather.kind !== 'fog') {
    const body = mix(pal.horizon, pal.snow, .28), shade = mix(pal.mid, pal.horizon, .55), rim = mix(body, [240, 244, 250], .25);
    const cr = mulberry32(seed + 99);
    for (let n = Math.round((4 + w / 30) * weather.cloud / 100); n--;) {
      const cx0 = cr() * w, cy = Math.round(horizon * (.06 + cr() * .5)), cw = w * (.08 + cr() * .1), ch = cw * (.2 + cr() * .1);
      const puffs = [[.28 + cr() * .08, .55 + cr() * .2, .24], [.5, 1, .3], [.72 - cr() * .08, .5 + cr() * .25, .22]];
      for (let x = 0; x < cw; x++) {
        const u = x / cw, prof = Math.max(...puffs.map(([c, p, r]) => p * (1 - ((u - c) / r) ** 2)));
        const top = Math.round(ch * Math.sqrt(Math.max(0, prof)));
        if (top < 1) continue;
        const X = Math.round(cx0 + x) % w, b = cy + Math.round(ch);
        px(rgb(shade), X, b - Math.ceil(top * .45), 1, Math.ceil(top * .45));
        px(rgb(body), X, b - top, 1, Math.max(1, Math.floor(top * .55)));
        px(rgb(rim), X, b - top);
      }
    }
  }

  // Terrain: a ridged far range, and fjord walls that rise towards the edges
  const nFar = valueNoise(seed + 11), nNear = valueNoise(seed + 23), fjord = w * 0.47;
  const ranges = [
    { base: pal.far, snowLine: horizon - amp * 0.5,
      top: x => horizon - Math.round(amp * (0.22 + 0.78 * ridged(nFar, x / 34 + 4.2) ** 1.6)) },
    { base: pal.near, snowLine: horizon - amp * 0.72,
      top: x => horizon - Math.round(amp * 1.05 * (0.1 + 0.9 * Math.min(Math.abs(x - fjord) / (w / 2), 1.25) ** 1.8) * (0.6 + 0.4 * fbm(nNear, x / 20))) }
  ];
  ranges.forEach(({ base: col, snowLine, top }, r) => {
    for (let x = 0; x < w; x++) {
      const y = top(x), litFace = top(x + 3) - top(x - 3) > 1;   // slopes facing the moon (right)
      px(rgb(col), x, y, 1, horizon - y);
      if (litFace) px(rgb(mix(col, pal.horizon, 0.16)), x, y, 1, Math.round((horizon - y) * 0.4));
      if (y < snowLine) px(rgb(litFace ? mix(pal.snow, [236, 242, 250], 0.2) : mix(pal.snow, col, 0.5)), x, y, 1, Math.round((snowLine - y) * 0.6) || 1);
    }
    if (r === 0 && weather?.kind === 'fog') {                       // fog banks between the ranges
      for (let i = 0; i < 6; i++) px(rgb(mix(pal.horizon, [200, 210, 225], .25), .1 + (i % 2) * .05), 0, Math.round(horizon - amp * .35 + i * amp * .12), w, Math.round(amp * .18));
    }
  });

  // Warm windows along the shore at dusk and night — twice as many at Christmas
  const nightness = Math.max(0, 1 - pal.top[2] / 70);
  if (nightness > 0.1) {
    const lr = mulberry32(seed + 7), count = theme === 'xmas' ? 18 : 9;
    for (let i = 0; i < count; i++) {
      const x = Math.round(w * (0.3 + lr() * 0.4)), y = horizon - 1 - Math.floor(lr() * 3);
      px(rgb([240, 196, 138], 0.16 * nightness), x - 1, y - 1, 3, 3);
      px(rgb([240, 196, 138], nightness), x, y);
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

  // Precipitation, frozen mid-fall: slanted rain, or snow (also a light festive flurry at Christmas)
  const pr = mulberry32(seed + 31), wind = Math.min(1.5, (weather?.wind ?? 0) / 30);
  const wet = weather && ['rain', 'drizzle', 'storm', 'snow'].includes(weather.kind);
  const snowing = (wet && (weather.kind === 'snow' || weather.temp <= 0)) || (!wet && theme === 'xmas');
  const amount = wet ? intensity(weather.code) : snowing ? 0.35 : 0;
  if (snowing) {
    for (let i = Math.round(w * h / 90 * amount); i--;) px(rgb(mix(pal.snow, [230, 238, 248], .4), .2 + pr() * .5), Math.floor(pr() * w), Math.floor(pr() * h), pr() < .15 ? 2 : 1, pr() < .15 ? 2 : 1);
  } else if (wet) {
    const slant = .15 + wind * .35, col = mix(pal.horizon, [220, 230, 245], .45);
    for (let i = Math.round(w * h / 120 * amount); i--;) {
      const x = pr() * w, y = pr() * h, len = 3 + Math.round(pr() * 3), a = .15 + pr() * .3;
      for (let k = 0; k < len; k++) px(rgb(col, a), Math.round(x + k * slant), Math.round(y - k));
    }
  }

  return { width: w, height: h, palette: pal };
}
