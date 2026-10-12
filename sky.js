/**
 * sky.js
 * The real sky over a place: sun position, live weather and seasonal themes
 * Pairs with pixel-fjord.js, but every export works on its own
 *
 *   import { sunPosition, fetchWeather, seasonalTheme } from './sky.js';
 *   const sun = sunPosition(new Date());          // Oslo by default
 *   const weather = await fetchWeather();         // null if offline — always have a fallback
 *
 * © Emil Eriksson · MIT
 */

export const OSLO = { lat: 59.91, lon: 10.75 };
const RAD = Math.PI / 180;

export function sunPosition(date = new Date(), { lat, lon } = OSLO) {
  const d = date.getTime() / 864e5 + 2440587.5 - 2451545;          // days since J2000
  const g = (357.529 + 0.98560028 * d) * RAD;                       // mean anomaly
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 3.6e-7 * d) * RAD;                            // obliquity of the ecliptic
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) * 15;         // sidereal time, degrees
  const hourAngle = ((((gmst + lon - ra / RAD) % 360) + 540) % 360) - 180;
  const elevation = Math.asin(Math.sin(lat * RAD) * Math.sin(dec)
    + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(hourAngle * RAD)) / RAD;
  return { elevation, hourAngle };
}

export const seasonalTheme = (date = new Date()) => (date.getMonth() === 11 ? 'xmas' : '');

export function weatherKind(code) {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'overcast';
  if (code === 2) return 'cloudy';
  return 'clear';
}

const INTENSITY = { 51: .25, 53: .35, 55: .5, 61: .45, 63: .7, 65: 1, 71: .45, 73: .7, 75: 1, 80: .45, 81: .7, 82: 1, 85: .55, 86: 1, 95: .9 };
export const intensity = code => INTENSITY[code] ?? .6;

export const PRESETS = { clear: [0, 5], cloudy: [2, 55], overcast: [3, 100], fog: [45, 100], drizzle: [53, 90], rain: [63, 100], snow: [73, 100], storm: [95, 100] };
export function weatherPreset(name, { temp = 4, wind = 12 } = {}) {
  const [code, cloud] = PRESETS[name] ?? PRESETS.clear;
  return { temp, wind, code, cloud, kind: weatherKind(code) };
}

/**
 * Current weather from Open-Meteo
 * Cached in localStorage for `ttl` ms. Resolves to null on any failure, so callers keep a default look.
 * @returns {Promise<{temp:number, code:number, cloud:number, wind:number, kind:string} | null>}
 */
export async function fetchWeather({ lat, lon } = OSLO, { ttl = 30 * 60e3, timeout = 6000 } = {}) {
  const key = `pixel-fjord:wx:${lat},${lon}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key));
    if (cached && Date.now() - cached.at < ttl) return cached.data;
  } catch { /* storage blocked: just fetch */ }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const c = (await res.json()).current;
    const data = { temp: c.temperature_2m, code: c.weather_code, cloud: c.cloud_cover, wind: c.wind_speed_10m };
    if (![data.temp, data.code, data.cloud, data.wind].every(Number.isFinite)) return null;
    data.kind = weatherKind(data.code);
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch {}
    return data;
  } catch {
    return null;
  }
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function withWeather(palette, weather) {
  if (!weather) return palette;
  const c = weather.cloud / 100, out = { ...palette };
  const grey = ([r, g, b]) => { const l = r * .3 + g * .59 + b * .11; return [l, l + 4, l + 14].map(Math.round); };
  for (const k of ['top', 'mid', 'horizon']) out[k] = mix(palette[k], grey(palette[k]), c * .45);
  out.stars *= 1 - c * .9;
  const cold = clamp((-3 - weather.temp) / 12, 0, 1), warm = clamp((weather.temp - 18) / 10, 0, 1);
  out.horizon = mix(mix(out.horizon, [150, 175, 215], cold * .2), [190, 150, 130], warm * .15);
  out.snow = mix(out.snow, [232, 240, 252], cold * .3);
  if (weather.kind === 'fog') out.far = mix(palette.far, out.horizon, .45);
  return out;
}
