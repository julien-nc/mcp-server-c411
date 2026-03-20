import { z } from 'zod';

export const searchSortBySchema = z.enum([
  'relevance',
  'seeders',
  'leechers',
  'size',
  'createdAd',
  'name',
  'completions',
  'comments',
  'category',
]);

export const searchSortOrderSchema = z.enum(['asc', 'desc']);

export const searchToolSchema = z.object({
  query: z.string().describe('Search query for torrents'),
  sortBy: searchSortBySchema.optional().default('relevance').describe('Sort criteria for the search results. Defaults to relevance.'),
  sortOrder: searchSortOrderSchema.optional().default('desc').describe('Sort order for the search results. Defaults to desc.'),
  page: z.number().int().positive().optional().default(1).describe('Result page number. Defaults to 1.'),
  perPage: z.number().int().positive().optional().default(25).describe('Number of results per page. Defaults to 25.'),
});

export const searchResultItemSchema = z.object({
  title: z.string(),
  type: z.enum(['torrent', 'release', 'series']),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  size: z.string().optional(),
  sizeBytes: z.number().optional(),
  seeders: z.number().optional(),
  leechers: z.number().optional(),
  uploader: z.string().optional(),
  infoHash: z.string().optional(),
  versionCount: z.number().optional(),
  seasonCount: z.number().optional(),
});

export const searchToolOutputSchema = z.object({
  query: z.string(),
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  total: z.number().optional(),
  totalPages: z.number().optional(),
  resultCount: z.number().int().nonnegative(),
  results: z.array(searchResultItemSchema),
});

export const downloadToolSchema = z.object({
  infoHash: z.string().length(40).describe('The 40-character hex infoHash of the torrent'),
  outputDir: z.string().optional().describe('Directory where the .torrent file should be saved. Defaults to /tmp.'),
});

export const downloadToolOutputSchema = z.object({
  success: z.literal(true),
  filename: z.string(),
  savedPath: z.string(),
});

export type SearchSortBy = z.infer<typeof searchSortBySchema>;
export type SearchSortOrder = z.infer<typeof searchSortOrderSchema>;
