# daniel-epler-nunez.com — Portfolio

A fast, static portfolio built with [Astro](https://astro.build). No database, no CMS, no backend — every project is a folder of markdown + images.

## Run it locally

```bash
npm install     # once
npm run dev     # local dev server at http://localhost:4321
npm run build   # production build → dist/
```

Requires Node 18.17+ (you have Node? check with `node --version`).

## How content works

```
src/content/projects/
  smart-temperature-probe/
    index.md        ← all text + settings for the page
    assets/         ← images used by that project
  smart-cooktop/
  hospital-bed-remote/
  focus-lamp/
  3d-modeling/
```

**To add a new project:** duplicate any project folder, rename it (the folder name becomes the URL: `/portfolio/<folder-name>`), edit `index.md`, and drop your images into its `assets/` folder. The page, home-page card, and "next project" links are all generated automatically. Images are automatically resized and optimized at build time.

### index.md anatomy

```yaml
---
title: "Project Name"
summary: "One sentence shown on the card and page header."
year: 2025
collaborator: "Company"        # optional
role: "What you did"           # optional
tags: ["UX research", "3D CAD"]
theme: "teal"                  # teal | blue | sand | dark — page accent color
order: 1                       # position on the home page
type: "case"                   # "case" = case study, "gallery" = image grid
status: "Work in progress"     # optional badge
cover: "./assets/cover.webp"
coverAlt: "Describe the cover image"
gallery:                       # optional image strip under the hero
  - src: "./assets/some-render.webp"
    alt: "Describe it"
---

## Section title
Text. Use **bold** for key insights, bullet lists for findings,
and > blockquotes for standout quotes.

![Always write alt text](./assets/photo.webp)
```

Each `##` section is numbered automatically on the page.

## The CMS (recommended way to edit everything)

```bash
npm run cms     # local CMS at http://localhost:4322 (never part of the build)
```

The CMS manages the whole site from a sidebar dashboard:

- **Pages → Home / About / Contact** — hero text, portrait, buttons, about teaser,
  CTA band, story paragraphs, skills, quick facts, photo strips, contact links.
- **Projects** — create (folder drop), edit, reorder, delete case studies (unchanged).
- **Interactive CV** — profile, focus themes, skills, experience, education, PDF (unchanged).
- **Site → Navigation & identity** — site name, logo, menu items (rename, reorder by
  drag or arrows, hide/show, add/remove, internal or external destinations).
- **Site → Footer** — footer text (`{year}` auto-updates) and links, shared site-wide.

### Where site-wide content lives

All Home / About / Contact / navigation / footer content is in **`src/data/site.json`**
(single source of truth, created 2026-07 by extracting the previously hard-coded copy
from the page files — nothing was lost, the pages now render from this file).
The pages read it via `src/lib/site.ts`; images referenced by filename resolve to
`src/assets/`. Editing `site.json` by hand works too — the CMS is just a friendlier way.

Link model everywhere: `{ kind: internal | url | email | phone, target }` —
internal paths (`/about`, `/#work`) get the base path automatically.

## Other places to edit

- **Colors, type, spacing** → `src/styles/global.css` (all design tokens at the top)
- **Case-study layout** → `src/pages/portfolio/[slug].astro`, `src/styles/case.css`
- **Pre-CMS page files** → backups from the site-CMS migration are in `tools/backup-pre-sitecms/`

## Deploy (free)

Push this folder to a GitHub repo, then import it on [Netlify](https://netlify.com) or [Vercel](https://vercel.com) — both auto-detect Astro. Point your domain (daniel-epler-nunez.com) at it, and old Squarespace URLs like `/portfolio/smartcooktop` are redirected automatically (see `astro.config.mjs`).

## Preview without installing

The sibling `preview/` folder contains a static snapshot of the design — open `preview/index.html` in a browser. It's for review only; the Astro project in this folder is the real site.
