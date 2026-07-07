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

## Other places to edit

- **Home intro / About / Contact text** → `src/pages/index.astro`, `about.astro`, `contact.astro`
- **Colors, type, spacing** → `src/styles/global.css` (all design tokens at the top)
- **Header/footer links** → `src/components/Header.astro`, `Footer.astro`
- **CV button** → put your CV at `public/cv.pdf` (the header button links there)

## Deploy (free)

Push this folder to a GitHub repo, then import it on [Netlify](https://netlify.com) or [Vercel](https://vercel.com) — both auto-detect Astro. Point your domain (daniel-epler-nunez.com) at it, and old Squarespace URLs like `/portfolio/smartcooktop` are redirected automatically (see `astro.config.mjs`).

## Preview without installing

The sibling `preview/` folder contains a static snapshot of the design — open `preview/index.html` in a browser. It's for review only; the Astro project in this folder is the real site.
