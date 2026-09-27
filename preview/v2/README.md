# NeoWorld-3 page, v2 draft

A redesigned, self-contained version of the research blog. It reuses the repo's own assets and vendored libraries; nothing here changes the current site.

**Preview:** run `python scripts/preview-server.py` from the repo root, then open http://127.0.0.1:8765/v2/

**Status:** local draft. Chapter 09 (Evidence) and parts of 06 and 10 use results from the NeoWorld-3 paper draft, which is under double-blind review. Clear them with the team before publishing. The ALOHA footage slots in chapter 10 are placeholders.

## Files

| File | What it does |
|---|---|
| `index.html` | The page: 12 chapters following the real → sim → real story |
| `v2.css` | Design tokens (dark default, light theme) and layout |
| `js/kit.js` | Shared helpers: render-on-demand three.js viewer, URDF loader, tween |
| `js/hero.js` | Hero: Scene 01 feature-edge wireframe, turns with pointer and scroll |
| `js/door.js` | 01: door 8994 as "movie set" vs simulation-ready |
| `js/anatomy.js` | 03: folding chair 100520, X-ray split view, joints, live URDF text |
| `js/refine.js` | 05: toy refinement that really runs (cross-entropy search + polish, 0.002 admission rule) |
| `js/compare.js` | 07: capture vs reconstruction wipe, drawn from the side-by-side video |
| `js/scene.js` | 07: Scene 01 glTF explorer, hover shows each part's program name |
| `js/gallery.js` | 08: all ten articulated objects |
| `js/main.js` | Theme switch, contents, scroll story, charts, ablation switch, rehearsal rule, GSAP |
| `fonts/` | Newsreader and JetBrains Mono, self-hosted (SIL OFL, licences included) |
| `lab.html` | Demos not on the page for now (door, loop, agent rules, physics check, evidence, robot, FAQ, limits). Not linked and not published. |
| `js/scene-code.js` | Formats Scene 01's construction record as code |
| `data/scene-01-record.json` | Construction record extracted from scene.glb (`scripts/extract-scene-record.py`) |
| `data/scene-01-tracks.json` | Object positions through the capture video (`scripts/track-scene-objects.py`) |
| `data/scene-01-physics-example.json` | **Example** materials, densities and friction for demonstration; not part of the reconstruction |

Libraries come from `../vendor/` (three.js r134 and loaders, GSAP 3.13 + ScrollTrigger). Assets come from `../assets/`.

## Before it can go live

- `.gitignore` only allows listed files, so `preview/v2/` and `preview/vendor/gsap*.js` must be added to it.
- `scripts/build-pages.py` must also copy `v2/`, the GSAP files, `GLTFLoader.js`, `DRACOLoader.js`, `vendor/draco/` and `studio/scenes/scene-01/scene.glb` (the images and GIFs used here are already in its list).
