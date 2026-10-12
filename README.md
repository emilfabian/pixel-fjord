# pixel-fjord

Procedural pixel-art Norwegian fjords that follow the time of day, in one dependency-free ES module.

It's the landscape engine behind my own webapge [emilfabian.no](https://emilfabian.no).

## How it works

1. **Deterministic randomness.** A seeded Mulberry32 PRNG feeds a 1D value-noise lattice, so the same seed gives the same landscape every time.
2. **Terrain.** Fractal Brownian motion shapes the fjord walls, and ridged multifractal noise gives the far peaks their sharp edges.
3. **Time of day.** Night, dawn, day and dusk moods are cross-faded with smoothstep, so 18:40 is a real blend rather than a hard switch.
4. **Lighting.** A slope test (`top(x + 3) - top(x - 3)`) finds the faces turned towards the moon, and those get lit rock and bright snow.
5. **Water.** The mountains are mirrored row by row into the fjord, with sine-wave offsets and ripple gaps.

## The sky addon (2026-10-12)

1. **The real sun.** sunPosition() computes solar elevation and hour angle from a date and coordinates, using a low-precision ephemeris with no API and no lookup tables. Midwinter noon in Oslo peaks at 6.6°, and midsummer midnight only dips to −6.7°, so you get pale winter days and blue June nights for free.
2. **Palette.** paletteForSun() blends night, dawn, day and dusk by elevation. Twilight leans towards dawn before noon and dusk after, so there's never a hard switch.
3. **Weather.** fetchWeather() reads current conditions from Open-Meteo, classifies the WMO code, caches the result for 30 minutes and returns null on any failure. withWeather() greys the sky by cloud cover, hides the stars and turns frosty in the cold.
4. **Seasons.** In December, seasonalTheme() returns 'xmas', which doubles the warm windows along the shore and adds a festive snow flurry.

## Usage

```js
import { renderFjord } from './pixel-fjord.js';
import { fetchWeather, seasonalTheme } from './sky.js';

renderFjord(document.querySelector('canvas'), {
  date: new Date(),                 // the real sun at this moment
  weather: await fetchWeather(),    // null when offline: renders a clear sky
  theme: seasonalTheme(),           // 'xmas' in December
  seed: 2026,                       // same seed, same mountains
  scale: 4                          // CSS pixels per art pixel
});
```

The noise helpers (`mulberry32`, `valueNoise`, `fbm`, `ridged`) and `paletteAt(hour)` are exported too, so you can use them for your own procedural work

## License

MIT © Emil Eriksson
