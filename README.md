# Haiti History — an interactive timeline of Haitian history

A histography.io-inspired visual timeline of Haiti: five centuries of history as a
field of glowing lights. Free, open, no accounts. **Phase 0 prototype.**

**Live:** https://wysterdesir.github.io/Haiti_History/

Research + full architecture rationale:
`OneDrive\Documents\Claude\Projects\HaitiPAM\TIMELINE-RESEARCH-2026-08-10.md`

## Run locally

```bash
py -m http.server 8180 --directory haiti-timeline
```

then open http://localhost:8180 — or use the `haiti-timeline` entry in
`.claude/launch.json`. (Must be served over HTTP; `file://` blocks `fetch`.)

## What's in Phase 0

- **Canvas 2D dot field** — 121 curated seed events, category-colored glowing dots
  stacked per time bucket, twinkle animation, additive glow. No frameworks, no build step.
- **Navigation** — drag to pan (with momentum), scroll/pinch to zoom, era rail
  (Ayiti → Jodi a), minimap with draggable window, "Chans · Lucky" random jump,
  cursor year readout, category filter chips.
- **Reading without leaving** — hover tooltip → click card (with Wikipedia thumbnail)
  → slide-over reader panel:
  - events matched to **HaitiPAM** posts render the **full article** in-site via the
    public WordPress API (`public-api.wordpress.com/wp/v2/sites/haitipam.com`);
  - other events show the **Wikipedia summary** (REST `page/summary`, CORS-open)
    with CC BY-SA 4.0 attribution and a link out;
  - ← / → step chronologically through events; Esc closes.
- **Mobile** — pointer events, pinch zoom, devicePixelRatio-scaled canvas,
  bottom-sheet cards. (Dedicated vertical-scroll story mode is Phase 2.)

## Data status — read before publishing

`events.json` is a **Phase 0 seed drafted from general knowledge**. Before public
launch (Phase 1), every event must be cross-checked against ≥1 independent source
(Britannica / history.state.gov / scholarly chronologies) and get a `sources` field.
Events marked `"c": true` are circa. Blurbs are licensed CC BY-SA 4.0 to stay
Wikipedia-compatible.

## Roadmap (see research doc for full detail)

- **Phase 1** — grow to ~600 events with per-event sources; GitHub Action bake
  pipeline (multi-language summaries, image credits); deploy to GitHub Pages.
- **Phase 2** — exponential time-bar, search, "Jodi a nan istwa" (today in history),
  sound design, phone vertical-scroll mode.
- **Phase 3** — scrollytelling story arcs, Revolution map sync (Leaflet),
  IIIF deep-zoom primary sources (LOC/Gallica), archive.org embeds, EN/FR/HT toggle.
