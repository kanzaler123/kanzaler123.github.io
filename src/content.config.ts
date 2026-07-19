import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const localizedText = z.object({
  en: z.string(),
  zhCN: z.string(),
});

const notes = defineCollection({
  loader: glob({ base: './src/content/notes', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: localizedText,
    summary: localizedText,
    publishedAt: z.coerce.date(),
    cover: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { notes };
