# pixel-fjord

Procedural pixel-art Norwegian fjords that follow the time of day, in one dependency-free ES module.

It's the landscape engine behind my own webpge [emilfabian.no](https://emilfabian.no), extracted on its own.

## How it works

1. **Deterministic randomness.** A seeded Mulberry32 PRNG feeds a 1D value-noise lattice, so the same seed gives the same landscape every time.
2. **Terrain.** Fractal Brownian motion shapes the fjord walls, and ridged multifractal noise gives the far peaks their sharp edges.
3. **Time of day.** Night, dawn, day and dusk moods are cross-faded with smoothstep, so 18:40 is a real blend rather than a hard switch.
4. **Lighting.** A slope test (`top(x + 3) - top(x - 3)`) finds the faces turned towards the moon, and those get lit rock and bright snow.
5. **Pixel finish.** The scene is rendered at ¼ resolution with dithered sky bands, then upscaled with `image-rendering: pixelated`.
6. **Water.** The mountains are mirrored row by row into the fjord, with sine-wave offsets and ripple gaps.

## Usage

```js
import { renderFjord } from './pixel-fjord.js';

renderFjord(document.querySelector('canvas'), {
  hour: 22.5,   // 0–24, defaults to the current hour
  seed: 2026,   // same seed, same mountains
  scale: 4      // CSS pixels per art pixel
});
```

Open `demo.html` through any local server and add `?hour=7` (or `13`, `19`, `23`) to the URL to see each mood.

The noise helpers (`mulberry32`, `valueNoise`, `fbm`, `ridged`) and `paletteAt(hour)` are exported too, so you can use them for your own procedural work.

## License

MIT © Emil Eriksson
