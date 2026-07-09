#!/usr/bin/env node
/**
 * Portfolio CMS — local only.
 *
 * `npm run cms` from the project root → http://localhost:4322
 *  - Create projects by dragging in a folder of materials
 *  - Edit projects with a structured, visual GUI (details, cover / gallery /
 *    per-section images, skill chips, label + claim headings, Markdown toolbar
 *    with live preview) — advanced/raw mode always available as a fallback
 *
 * The UI lives in tools/cms.html (plain HTML, loaded at runtime).
 * Zero dependencies — plain Node (18+). Never part of the public build.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PORT = 4322;
const ROOT = process.cwd();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS = path.join(ROOT, 'src', 'content', 'projects');
const PUBLIC_DIR = path.join(ROOT, 'public');
// Outside the project root: the Astro dev server must never see trashed projects
const TRASH = path.join(os.homedir(), '.portfolio-cms-trash');

if (!fs.existsSync(PROJECTS)) {
  console.error('✗ Run this from the project root (src/content/projects not found).');
  process.exit(1);
}

let BASE = '';
try {
  const m = fs.readFileSync(path.join(ROOT, 'astro.config.mjs'), 'utf8').match(/base:\s*['"]([^'"]+)['"]/);
  if (m) BASE = m[1];
} catch {}

const HTML = fs.readFileSync(path.join(HERE, 'cms.html'), 'utf8');

/* ---------------- helpers ---------------- */

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
const VID_EXT = new Set(['.mp4', '.webm', '.mov']);
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };

const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

const safeName = (s) => slugify(path.basename(s, path.extname(s))) + path.extname(s).toLowerCase();

const humanize = (file) =>
  path.basename(file, path.extname(file)).replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const yamlStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const unquote = (s) => {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return s;
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 400 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const inProjects = (p) => path.resolve(p).startsWith(path.resolve(PROJECTS) + path.sep);

/** rename, falling back to copy+delete when source/dest are on different volumes */
function moveSafe(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
}


/* ---------------- markdown <-> structured ---------------- */

/** Parses the constrained frontmatter this site uses (see content.config.ts). */
function parseProject(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new Error('no frontmatter found');
  const fmLines = m[1].split(/\r?\n/);
  const body = raw.slice(m[0].length);

  const meta = { tags: [], gallery: [], snapshot: null };
  let ctx = null; // 'snapshot' | 'gallery'
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    if (!line.trim()) continue;
    const top = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (top) {
      ctx = null;
      const [, key, valRaw] = top;
      const val = valRaw.trim();
      if (key === 'snapshot') { meta.snapshot = { problem: '', approach: '', outcome: '' }; ctx = 'snapshot'; continue; }
      if (key === 'gallery') { ctx = 'gallery'; continue; }
      if (key === 'tags') {
        const arr = val.match(/^\[(.*)\]$/);
        meta.tags = arr && arr[1].trim() ? arr[1].split(/,(?![^"]*"(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => unquote(x)) : [];
        continue;
      }
      meta[key] = unquote(val);
      continue;
    }
    if (ctx === 'snapshot') {
      const sm = line.match(/^\s+(problem|approach|outcome):\s*(.*)$/);
      if (sm) meta.snapshot[sm[1]] = unquote(sm[2]);
    } else if (ctx === 'gallery') {
      const gs = line.match(/^\s+-\s+src:\s*(.*)$/);
      const ga = line.match(/^\s+alt:\s*(.*)$/);
      if (gs) meta.gallery.push({ file: unquote(gs[1]).replace(/^\.\/assets\//, ''), alt: '' });
      else if (ga && meta.gallery.length) meta.gallery[meta.gallery.length - 1].alt = unquote(ga[1]);
    }
  }
  meta.cover = (meta.cover || '').replace(/^\.\/assets\//, '');
  meta.year = Number(meta.year) || '';
  meta.order = Number(meta.order) || 99;
  if (meta.snapshot && !meta.snapshot.problem && !meta.snapshot.approach && !meta.snapshot.outcome) meta.snapshot = null;

  /* body → sections on "## " headings */
  const sections = [];
  const parts = body.split(/^## /m);
  const intro = parts.shift().trim();
  if (intro) sections.push({ heading: '', body: intro });
  for (const p of parts) {
    const nl = p.indexOf('\n');
    sections.push({
      heading: (nl === -1 ? p : p.slice(0, nl)).trim(),
      body: (nl === -1 ? '' : p.slice(nl + 1)).trim(),
    });
  }
  return { meta, sections };
}

function serializeProject(meta, sections) {
  const L = ['---'];
  L.push(`title: ${yamlStr(meta.title)}`);
  L.push(`summary: ${yamlStr(meta.summary || '')}`);
  L.push(`year: ${Number(meta.year) || new Date().getFullYear()}`);
  if (meta.collaborator) L.push(`collaborator: ${yamlStr(meta.collaborator)}`);
  if (meta.role) L.push(`role: ${yamlStr(meta.role)}`);
  L.push(`tags: [${(meta.tags || []).filter(Boolean).map(yamlStr).join(', ')}]`);
  L.push(`theme: ${yamlStr(meta.theme || 'teal')}`);
  L.push(`order: ${Number(meta.order) || 99}`);
  L.push(`type: ${yamlStr(meta.type || 'case')}`);
  if (meta.status) L.push(`status: ${yamlStr(meta.status)}`);
  L.push(`cover: "./assets/${meta.cover}"`);
  L.push(`coverAlt: ${yamlStr(meta.coverAlt || humanize(meta.cover || ''))}`);
  const s = meta.snapshot;
  if (s && (s.problem || s.approach || s.outcome)) {
    L.push('snapshot:');
    L.push(`  problem: ${yamlStr(s.problem || '')}`);
    L.push(`  approach: ${yamlStr(s.approach || '')}`);
    L.push(`  outcome: ${yamlStr(s.outcome || '')}`);
  }
  if ((meta.gallery || []).length) {
    L.push('gallery:');
    for (const g of meta.gallery) {
      L.push(`  - src: "./assets/${g.file}"`);
      L.push(`    alt: ${yamlStr(g.alt || humanize(g.file))}`);
    }
  } else {
    L.push('gallery: []');
  }
  L.push('---', '');

  const body = (sections || [])
    .map((sec) => (sec.heading ? `## ${sec.heading}\n\n${sec.body.trim()}` : sec.body.trim()))
    .filter(Boolean)
    .join('\n\n');
  return L.join('\n') + body + '\n';
}

const claimPara = (claim) => `<p class="section-claim">${String(claim).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;

function skeletonSections(bodyImages, videoUrls) {
  const defs = [
    ['Challenge', 'TODO: state the problem as a claim', 'TODO: 2–4 sentences. What was broken or missing, for whom, and why did it matter? Bold the key question.'],
    ['Research', 'TODO: the main insight', 'TODO: what you did (interviews, observation, desk research) and the 1–2 findings that set the design constraint. End with the decision it produced.'],
    ['Prototyping', 'TODO: what you built', 'TODO: what you made and iterated on. Keep it under 80 words; let images carry the detail.'],
    ['Testing', 'TODO: what the test showed', 'TODO: who tested it, how, and the concrete feedback that shaped the final design.'],
    ['Outcome & reflection', '', 'TODO: the result, what it taught you, and what you would do next.'],
  ];
  const imgs = [...bodyImages];
  const per = Math.ceil(imgs.length / defs.length) || 0;
  return defs.map(([heading, claim, text], idx) => {
    let body = claim ? claimPara(claim) + '\n\n' + text : text;
    for (let k = 0; k < per; k++) {
      const img = imgs.shift();
      if (!img) break;
      body += `\n\n![${humanize(img)}](./assets/${img})\n\n*TODO: caption for ${humanize(img).toLowerCase()}.*`;
    }
    if (idx === defs.length - 1) {
      for (const v of videoUrls) body += `\n\n<video controls preload="metadata" src="${v}" style="width:100%; border-radius: 18px;"></video>`;
    }
    return { heading, body };
  });
}

const listAssets = (slug) => {
  const dir = path.join(PROJECTS, slug, 'assets');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => IMG_EXT.has(path.extname(f).toLowerCase())) : [];
};

function frontmatterField(raw, key) {
  const m = raw.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?\\s*$`, 'm'));
  return m ? m[1].trim() : '';
}

/** Suggestions for the skill-chip autocomplete: project tags + about + cv skills. */
function collectSkills() {
  const set = new Set();
  try {
    for (const d of fs.readdirSync(PROJECTS, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const idx = path.join(PROJECTS, d.name, 'index.md');
      if (!fs.existsSync(idx)) continue;
      const raw = fs.readFileSync(idx, 'utf8');
      const m = raw.match(/^tags:\s*\[(.*)\]\s*$/m);
      if (m) for (const t of m[1].split(',')) { const v = unquote(t.trim()); if (v) set.add(v); }
    }
  } catch {}
  try {
    const about = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'about.astro'), 'utf8');
    const ul = about.match(/<ul class="skills">([\s\S]*?)<\/ul>/);
    if (ul) for (const li of ul[1].matchAll(/<li>([^<]+)<\/li>/g)) set.add(li[1].trim());
  } catch {}
  try {
    const cv = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'cv.astro'), 'utf8');
    const a = cv.indexOf('skillGroups');
    const b = cv.indexOf('const projects');
    const slice = a > -1 && b > a ? cv.slice(a, b) : cv;
    for (const m of slice.matchAll(/label:\s*'([^']+)'/g)) set.add(m[1].trim());
  } catch {}
  return [...set].filter(Boolean).sort((x, y) => x.localeCompare(y));
}

function listProjects() {
  return fs.readdirSync(PROJECTS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PROJECTS, d.name, 'index.md')))
    .map((d) => {
      const raw = fs.readFileSync(path.join(PROJECTS, d.name, 'index.md'), 'utf8');
      return {
        slug: d.name,
        title: frontmatterField(raw, 'title') || d.name,
        year: frontmatterField(raw, 'year'),
        order: Number(frontmatterField(raw, 'order') || 999),
        theme: frontmatterField(raw, 'theme') || 'teal',
        type: frontmatterField(raw, 'type') || 'case',
        cover: frontmatterField(raw, 'cover').replace(/^\.\/assets\//, ''),
        assets: listAssets(d.name).length,
      };
    })
    .sort((a, b) => a.order - b.order);
}

/* ---------------- accents palette (CMS-only reuse library) ---------------- */
const ACCENTS_FILE = path.join(HERE, 'accents.json');
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function readAccents() { try { return JSON.parse(fs.readFileSync(ACCENTS_FILE, 'utf8')); } catch { return []; } }

/** In-place update of scalar frontmatter fields — leaves the rest of the file byte-for-byte. */
function patchFields(slug, fields) {
  const file = path.join(PROJECTS, slug, 'index.md');
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (!m) throw new Error('no frontmatter');
  let fm = m[0];
  const setLine = (key, line) => { const re = new RegExp(`^${key}:.*$`, 'm'); if (re.test(fm)) fm = fm.replace(re, line); };
  if (fields.title != null) setLine('title', `title: ${yamlStr(fields.title)}`);
  if (fields.year != null) setLine('year', `year: ${Number(fields.year) || new Date().getFullYear()}`);
  if (fields.order != null) setLine('order', `order: ${Number(fields.order) || 99}`);
  if (fields.theme != null) setLine('theme', `theme: ${yamlStr(fields.theme)}`);
  if (fields.cover != null) setLine('cover', `cover: "./assets/${fields.cover}"`);
  if (fields.coverAlt != null) setLine('coverAlt', `coverAlt: ${yamlStr(fields.coverAlt)}`);
  fs.writeFileSync(file, raw.replace(m[0], fm));
}

/* ---------------- server ---------------- */

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'GET' && u.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(HTML);
    }

    /* serve asset thumbnails */
    const asset = u.pathname.match(/^\/assets\/([a-z0-9-]+)\/([^/]+)$/);
    if (req.method === 'GET' && asset) {
      const f = path.join(PROJECTS, asset[1], 'assets', decodeURIComponent(asset[2]));
      if (!inProjects(f) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'max-age=60' });
      return res.end(fs.readFileSync(f));
    }

    if (req.method === 'GET' && u.pathname === '/api/projects') {
      return json(res, 200, { base: BASE, projects: listProjects() });
    }

    if (req.method === 'GET' && u.pathname === '/api/skills') {
      return json(res, 200, { skills: collectSkills() });
    }

    if (u.pathname === '/api/accents') {
      if (req.method === 'GET') return json(res, 200, { accents: readAccents() });
      if (req.method === 'PUT') {
        const { accents } = JSON.parse(await readBody(req));
        const clean = (accents || [])
          .filter((a) => a && a.name && HEX_RE.test(a.color))
          .map((a) => ({ name: String(a.name).slice(0, 40), color: a.color }));
        fs.writeFileSync(ACCENTS_FILE, JSON.stringify(clean, null, 2));
        return json(res, 200, { ok: true, accents: clean });
      }
    }

    /* patch scalar frontmatter fields (quick edits + reorder) */
    const fieldsM = u.pathname.match(/^\/api\/project\/([a-z0-9-]+)\/fields$/);
    if (req.method === 'PATCH' && fieldsM) {
      const slug = fieldsM[1];
      const file = path.join(PROJECTS, slug, 'index.md');
      if (!inProjects(file) || !fs.existsSync(file)) return json(res, 404, { error: 'not found' });
      patchFields(slug, JSON.parse(await readBody(req)));
      return json(res, 200, { ok: true });
    }

    /* parsed project (GUI editor) */
    const parsed = u.pathname.match(/^\/api\/project\/([a-z0-9-]+)\/parsed$/);
    if (parsed) {
      const slug = parsed[1];
      const file = path.join(PROJECTS, slug, 'index.md');
      if (!inProjects(file) || !fs.existsSync(file)) return json(res, 404, { error: 'not found' });

      if (req.method === 'GET') {
        try {
          const { meta, sections } = parseProject(fs.readFileSync(file, 'utf8'));
          return json(res, 200, { meta, sections, assets: listAssets(slug) });
        } catch (e) {
          return json(res, 422, { error: 'could not parse — use raw mode', detail: String(e.message) });
        }
      }
      if (req.method === 'PUT') {
        const { meta, sections } = JSON.parse(await readBody(req));
        if (!meta?.title || !meta?.cover) return json(res, 400, { error: 'title and cover are required' });
        fs.writeFileSync(file, serializeProject(meta, sections));
        return json(res, 200, { ok: true });
      }
    }

    /* upload extra assets to an existing project */
    const upload = u.pathname.match(/^\/api\/project\/([a-z0-9-]+)\/assets$/);
    if (req.method === 'POST' && upload) {
      const slug = upload[1];
      const dir = path.join(PROJECTS, slug, 'assets');
      if (!inProjects(dir) || !fs.existsSync(path.join(PROJECTS, slug, 'index.md'))) return json(res, 404, { error: 'not found' });
      fs.mkdirSync(dir, { recursive: true });
      const { files } = JSON.parse(await readBody(req));
      const added = [];
      for (const f of files || []) {
        const name = safeName(f.name);
        if (!IMG_EXT.has(path.extname(name))) continue;
        fs.writeFileSync(path.join(dir, name), Buffer.from(f.dataBase64, 'base64'));
        added.push(name);
      }
      return json(res, 200, { ok: true, added, assets: listAssets(slug) });
    }

    /* delete one asset (only when unreferenced) */
    const delAsset = u.pathname.match(/^\/api\/project\/([a-z0-9-]+)\/asset\/([^/]+)$/);
    if (req.method === 'DELETE' && delAsset) {
      const slug = delAsset[1];
      const name = decodeURIComponent(delAsset[2]);
      const f = path.join(PROJECTS, slug, 'assets', name);
      if (!inProjects(f) || !fs.existsSync(f)) return json(res, 404, { error: 'not found' });
      const raw = fs.readFileSync(path.join(PROJECTS, slug, 'index.md'), 'utf8');
      if (raw.includes(name)) return json(res, 409, { error: 'asset is referenced in the project — remove it from the text/cover/gallery first' });
      fs.mkdirSync(TRASH, { recursive: true });
      moveSafe(f, path.join(TRASH, `${slug}-${Date.now()}-${name}`));
      return json(res, 200, { ok: true, assets: listAssets(slug) });
    }

    /* raw fallback + delete project */
    const single = u.pathname.match(/^\/api\/project\/([a-z0-9-]+)$/);
    if (single) {
      const dir = path.join(PROJECTS, single[1]);
      if (!inProjects(dir) || !fs.existsSync(path.join(dir, 'index.md'))) return json(res, 404, { error: 'not found' });

      if (req.method === 'GET') {
        return json(res, 200, { raw: fs.readFileSync(path.join(dir, 'index.md'), 'utf8'), assets: listAssets(single[1]) });
      }
      if (req.method === 'PUT') {
        const { raw } = JSON.parse(await readBody(req));
        if (typeof raw !== 'string' || !raw.startsWith('---')) return json(res, 400, { error: 'invalid content' });
        fs.writeFileSync(path.join(dir, 'index.md'), raw);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        fs.mkdirSync(TRASH, { recursive: true });
        const dest = path.join(TRASH, `${single[1]}-${Date.now()}`);
        moveSafe(dir, dest);
        return json(res, 200, { ok: true, trashedTo: dest });
      }
    }

    if (req.method === 'POST' && u.pathname === '/api/create') {
      const { meta, files } = JSON.parse(await readBody(req));
      if (!meta?.title || !meta?.cover) return json(res, 400, { error: 'title and cover image are required' });

      const slug = slugify(meta.slug || meta.title);
      const dir = path.join(PROJECTS, slug);
      if (fs.existsSync(dir)) return json(res, 409, { error: `project "${slug}" already exists` });
      const assetsDir = path.join(dir, 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });

      const videoUrls = [];
      const written = [];
      for (const f of files || []) {
        const name = safeName(f.name);
        const ext = path.extname(name);
        const buf = Buffer.from(f.dataBase64, 'base64');
        if (IMG_EXT.has(ext)) { fs.writeFileSync(path.join(assetsDir, name), buf); written.push(name); }
        else if (VID_EXT.has(ext)) {
          const vd = path.join(PUBLIC_DIR, 'projects', slug);
          fs.mkdirSync(vd, { recursive: true });
          fs.writeFileSync(path.join(vd, name), buf);
          videoUrls.push(`${BASE}/projects/${slug}/${name}`);
        }
      }

      const used = new Set([meta.cover, ...(meta.gallery || []).map((g) => g.file)]);
      const bodyImages = written.filter((n) => !used.has(n));
      let sections;
      if ((meta.body || '').trim()) {
        sections = parseBodyToSections(meta.body);
        if (videoUrls.length) {
          const last = sections[sections.length - 1] || (sections.push({ heading: '', body: '' }), sections[sections.length - 1]);
          last.body += '\n\n' + videoUrls.map((v) => `<video controls preload="metadata" src="${v}" style="width:100%; border-radius: 18px;"></video>`).join('\n\n');
        }
      } else {
        sections = skeletonSections(bodyImages, videoUrls);
      }
      fs.writeFileSync(path.join(dir, 'index.md'), serializeProject({ ...meta, type: 'case' }, sections));

      return json(res, 200, { ok: true, slug, images: written.length, videos: videoUrls.length, preview: `http://localhost:4321${BASE}/portfolio/${slug}` });
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

function parseBodyToSections(body) {
  const sections = [];
  const parts = String(body).split(/^## /m);
  const intro = parts.shift().trim();
  if (intro) sections.push({ heading: '', body: intro });
  for (const p of parts) {
    const nl = p.indexOf('\n');
    sections.push({ heading: (nl === -1 ? p : p.slice(0, nl)).trim(), body: (nl === -1 ? '' : p.slice(nl + 1)).trim() });
  }
  return sections;
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Portfolio CMS  →  http://localhost:${PORT}\n  (local only — nothing is exposed publicly)\n`);
});
