import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const articles = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/articles" }),
  schema: z.object({
    title: z.string(),
    titleEn: z.string(),
    catchphrase: z.string(),
    description: z.string(),
    icon: z.string(),
    category: z.string(),
    order: z.number(),
    date: z.string(),
    lastUpdated: z.string().optional(),
  }),
});

const articleDetails = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/article-details" }),
  schema: z.object({
    title: z.string(),
    parentTitle: z.string(),
    subtitle: z.string().optional(),
    description: z.string(),
  }),
});

export const collections = { articles, "article-details": articleDetails };
