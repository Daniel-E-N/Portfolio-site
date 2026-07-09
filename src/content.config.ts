import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Projects live in src/content/projects/<slug>/index.md
 * Drop a new folder (index.md + assets/) in there and a page is
 * generated automatically at /portfolio/<slug>.
 *
 * Optional case-study extras (all safe to omit):
 *   snapshot: { problem, approach, outcome }  → 30-second summary block
 *   stats:    [{ value, label }]              → big result callouts
 */
const projects = defineCollection({
  loader: glob({ pattern: '*/index.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
      year: z.number(),
      collaborator: z.string().optional(),
      role: z.string().optional(),
      tags: z.array(z.string()).default([]),
      /** Accent color used for the card + case page */
      theme: z.string().default('teal'),
      /** Position on the home page (1 = first) */
      order: z.number(),
      /** "case" = written case study, "gallery" = image grid */
      type: z.enum(['case', 'gallery']).default('case'),
      status: z.string().optional(),
      cover: image(),
      coverAlt: z.string(),
      /** 30-second recruiter read: shown directly under the cover */
      snapshot: z
        .object({
          problem: z.string(),
          approach: z.string(),
          outcome: z.string(),
        })
        .optional(),
      /** Key result callouts, e.g. { value: "18 → 3", label: "onboarding steps" } */
      stats: z
        .array(z.object({ value: z.string(), label: z.string() }))
        .default([]),
      gallery: z
        .array(z.object({ src: image(), alt: z.string() }))
        .default([]),
    }),
});

export const collections = { projects };
