# CLAUDE.md — tasamuh-vr

Static WebXR experience (Arabic) about tolerance vs revenge. Deploys as-is to any static host.

## Stack
- A-Frame 1.5 + Three.js (loaded via CDN in `index.html`)
- Vanilla JS, no build step, no bundler
- Static deploy targets: GitHub Pages, Netlify, Vercel, Cloudflare Pages
- HTTPS is required for WebXR (Quest will refuse HTTP)

## Layout
- `index.html` — single page; loads CSS, then base JS modules in order, then `app.js`. The `?pro=1` block at the bottom conditionally loads the pro-graphics modules.
- `js/` — one module per concern, communicates via `window.<Module>` globals.
- `css/` — split by concern (variables, base, phases, components, animations, responsive).
- `assets/{sounds,voices,images,models}/` — see `js/sounds.js` and `js/speech.js` for required filenames.

## URL flags
- `?pro=1` — enables HDRI sun, post-FX (bloom/SSAO), Water2 reflections, GLTF NPCs, GPU-instanced trees. Loads the `pro-*.js` module set. Desktop only — Quest skips automatically.
- `?debug=1` — re-enables tagged dev console logs and the on-screen debug overlay (silent by default in production via the shim in `index.html` `<head>`).
- `?tier=high|mid|low` — force a quality tier in `js/quality.js` for testing without changing devices.

## Quality tiers (set in `js/quality.js`, exposed as `window.QualityTier`)
- **Quest 3 / OculusBrowser** → `low` always (mobile GPU, 90fps target per eye).
- **High** (DPR ≥ 2 AND cores ≥ 6): PCFSoft shadows, autoUpdate every frame, DPR up to 2.
- **Mid** (DPR ≥ 1.5 OR cores ≥ 4): PCF shadows, one-shot autoUpdate after world build, DPR 1.5.
- **Low**: shadows disabled, DPR capped to 1.

`pro-performance.js` defers to `window.QualityTier` for instancing thresholds, particle counts, and shadow map sizes.

## Module pairs — naming gotcha
`audio-pro.js` and `interact-pro.js` load **unconditionally** despite the `-pro` suffix. Only the modules in the `?pro=1` block at the bottom of `index.html` (`pro-graphics`, `pro-postfx`, `pro-environment`, `pro-characters`, `pro-particles`, `pro-performance`) are gated by the URL flag.

## Voice files
- `assets/voices/{male,female}/{1,2,3}.m4a` for confrontation lines.
- `assets/voices/closing.m4a` for the ending.
- `assets/voices/{forgive,revenge}_intro.mp3` and `{forgive,revenge}_{silent,equal,harder}.mp3` for branch reactions.
- Missing files fall back to Web Speech API TTS automatically (`js/speech.js` `_probe` checks each file; `_pickAvailable` returns null on miss). No manual config needed when adding new files — they're auto-detected on next load.

## Run locally
```bash
python -m http.server 8080
# then open http://localhost:8080
```
For Quest testing, expose over HTTPS (`ngrok http 8080`) or push to GitHub Pages.

## Common pitfalls
- Adding a `<script>` to `index.html`: must register A-Frame components **before** `<a-scene>` parses, but most modules are loaded *after* the scene so they hook via `addEventListener('loaded', …)`. Mirror that pattern for new modules.
- Changing `<a-scene>` `shadow=` attribute: `quality.js` flips `r.shadowMap.enabled` per tier. Don't fight it — adjust the tier logic instead.
- Adding new `console.log`: prefix with `[Tag …]` matching the regex in the `<head>` shim if you want it auto-silenced in production. Otherwise it'll always print.
