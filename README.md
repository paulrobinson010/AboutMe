# AboutMe

Self indulgent link site — a portfolio for Paul Robinson's projects:
[Treadgame](https://treadgame.com),
[CycleHUD](https://cyclehud.robbo-online.uk),
[ItsJustAGame](https://itsjustagame.robbo-online.uk) and
[DartsScorer](https://darts-scorer.robbo-online.uk).

The site is a single `index.html` plus an `assets/` folder (no build step,
no dependencies) — open it in a browser or serve it with GitHub Pages.

Brand imagery in `assets/` is pulled from each project's own repo:
logos and screenshots from `TreadGames/website`, `CycleHUD/docs`,
`itsJustAGame/docs`, and a rendered capture of the DartsScorer web app.
Accent colours mirror each product's real palette.

## Editing

- **Project links**: each project row is an `<a class="work-item">` in
  `index.html` — change the `href` there (and the matching domain tag).
- **Copy**: descriptions live in the `.desc` paragraphs; the about section is
  under `<section id="about">`.
- **Colours**: each project's accent is a CSS variable at the top of the
  stylesheet (`--c-tread`, `--c-cycle`, `--c-game`, `--c-darts`).
