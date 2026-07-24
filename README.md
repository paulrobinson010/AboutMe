# AboutMe

Self indulgent link site — a portfolio for Paul Robinson's projects:
[Treadgame](https://treadgame.com), CycleHUD, ItsJustAGame and DartsScorer.

The whole site is a single self-contained `index.html` (no build step, no
dependencies) — open it in a browser or serve it with GitHub Pages.

## Editing

- **Project links**: search `index.html` for `TODO` — CycleHUD, ItsJustAGame
  and DartsScorer currently point at `#` until their real URLs are added.
- **Copy**: descriptions live in the `.desc` paragraphs; the about section is
  under `<section id="about">`.
- **Colours**: each project's accent is a CSS variable at the top of the
  stylesheet (`--c-tread`, `--c-cycle`, `--c-game`, `--c-darts`).
