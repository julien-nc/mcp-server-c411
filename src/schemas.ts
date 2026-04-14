import { z } from 'zod';

export const searchSortBySchema = z.enum([
  'relevance',
  'seeders',
  'leechers',
  'size',
  'createdAt',
  'name',
  'completions',
  'comments',
  'category',
]);

export const searchSortOrderSchema = z.enum(['asc', 'desc']);

export const SEARCH_CATEGORY = {
  VIDEO: '1',
  EBOOK: '2',
  AUDIO: '3',
  APPLICATIONS: '4',
  VIDEO_GAMES: '5',
  EMULATION: '6',
  GPS: '7',
  PRINTING_3D: '10',
} as const;

export const SEARCH_VIDEO_SUBCAT = {
  ANIMATION: '1',
  ANIMATION_SERIES: '2',
  CONCERT: '3',
  DOCUMENTARY: '4',
  TV_SHOW: '5',
  MOVIE: '6',
  TV_SERIES: '7',
  SHOW: '8',
  SPORT: '9',
  VIDEO_CLIPS: '10',
} as const;

export const searchCategorySchema = z.enum([
  SEARCH_CATEGORY.VIDEO,
  SEARCH_CATEGORY.EBOOK,
  SEARCH_CATEGORY.AUDIO,
  SEARCH_CATEGORY.APPLICATIONS,
  SEARCH_CATEGORY.VIDEO_GAMES,
  SEARCH_CATEGORY.EMULATION,
  SEARCH_CATEGORY.GPS,
  SEARCH_CATEGORY.PRINTING_3D,
]);

export const searchSubcatSchema = z.string().trim().min(1);

export const searchToolSchema = z.object({
  query: z.string().trim().min(1).max(200).describe('Search query for torrents'),
  category: searchCategorySchema.optional().describe('Category to filter by. Possible values: 1 (video), 2 (ebook), 3 (audio), 4 (applications), 5 (video games), 6 (emulation), 7 (GPS), 10 (3D printing). Only one value can be set.'),
  subcat: searchSubcatSchema.optional().describe('Sub-category filter. Only allowed when category is 1. Comma-separated values: 1 (animation), 2 (animation series), 3 (concert), 4 (documentary), 5 (tv show), 6 (movie), 7 (tv series), 8 (show), 9 (sport), 10 (video clips).'),
  sortBy: searchSortBySchema.optional().describe('Sort criteria for the search results. When set, sortOrder defaults to desc.'),
  sortOrder: searchSortOrderSchema.optional().describe('Sort order for the search results. Only used when sortBy is set. Defaults to desc.'),
  page: z.number().int().positive().optional().default(1).describe('Result page number. Defaults to 1.'),
  perPage: z.number().int().positive().max(100).optional().default(25).describe('Number of results per page. Defaults to 25.'),
});

export const myUploadsToolSchema = z.object({
  query: z.string().trim().min(1).max(200).optional().describe('Search query for torrents uploaded by the current user.'),
  category: searchCategorySchema.optional().describe('Category to filter by. Possible values: 1 (video), 2 (ebook), 3 (audio), 4 (applications), 5 (video games), 6 (emulation), 7 (GPS), 10 (3D printing). Only one value can be set.'),
  subcat: searchSubcatSchema.optional().describe('Sub-category filter. Only allowed when category is 1. Comma-separated values: 1 (animation), 2 (animation series), 3 (concert), 4 (documentary), 5 (tv show), 6 (movie), 7 (tv series), 8 (show), 9 (sport), 10 (video clips).'),
  sortBy: searchSortBySchema.optional().describe('Sort criteria for the search results. When set, sortOrder defaults to desc.'),
  sortOrder: searchSortOrderSchema.optional().describe('Sort order for the search results. Only used when sortBy is set. Defaults to desc.'),
  page: z.number().int().positive().optional().default(1).describe('Result page number. Defaults to 1.'),
  perPage: z.number().int().positive().max(100).optional().default(100).describe('Number of results per page. Defaults to 100.'),
});

export const searchResultItemSchema = z.object({
  title: z.string(),
  type: z.enum(['torrent', 'release', 'series']),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  language: z.string().optional(),
  size: z.string().optional(),
  sizeBytes: z.number().optional(),
  seeders: z.number().optional(),
  leechers: z.number().optional(),
  completions: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  uploader: z.string().optional(),
  infoHash: z.string().optional(),
  versionCount: z.number().optional(),
  seasonCount: z.number().optional(),
});

export const searchToolOutputSchema = z.object({
  query: z.string().optional(),
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  total: z.number().optional(),
  totalPages: z.number().optional(),
  resultCount: z.number().int().nonnegative(),
  results: z.array(searchResultItemSchema),
  error: z.string().optional(),
});

export const myUploadsToolOutputSchema = searchToolOutputSchema;

export const downloadToolSchema = z.object({
  infoHash: z.string().trim().regex(/^[a-fA-F0-9]{40}$/, 'infoHash must be a 40-character hex string').describe('The 40-character hex infoHash of the torrent'),
  outputDir: z.string().optional().describe('Directory where the .torrent file should be saved. Defaults to /tmp.'),
});

export const downloadToolOutputSchema = z.object({
  success: z.boolean(),
  filename: z.string().optional(),
  savedPath: z.string().optional(),
  error: z.string().optional(),
});

export const torrentInfoToolSchema = z.object({
  infoHash: z.string().trim().regex(/^[a-fA-F0-9]{40}$/, 'infoHash must be a 40-character hex string').describe('The 40-character hex infoHash of the torrent'),
});

export const torrentCommentsToolSchema = z.object({
  infoHash: z.string().trim().regex(/^[a-fA-F0-9]{40}$/, 'infoHash must be a 40-character hex string').describe('The 40-character hex infoHash of the torrent'),
  page: z.number().int().positive().optional().default(1).describe('Comment page number. Defaults to 1.'),
  limit: z.number().int().positive().max(100).optional().default(20).describe('Number of comments per page. Defaults to 20.'),
});

export const torrentFileEntrySchema = z.object({
  path: z.array(z.string()),
  length: z.number().nonnegative().optional(),
});

export const torrentTrustSchema = z.object({
  enabled: z.boolean().optional(),
  score: z.number().optional(),
  votesCount: z.number().int().nonnegative().optional(),
  positiveCount: z.number().int().nonnegative().optional(),
  negativeCount: z.number().int().nonnegative().optional(),
  status: z.string().optional(),
  isTested: z.boolean().optional(),
});

export const torrentTmdbSchema = z.object({
  id: z.number().optional(),
  imdbId: z.string().optional(),
  type: z.string().optional(),
  title: z.string().optional(),
  originalTitle: z.string().optional(),
  year: z.number().optional(),
  overview: z.string().optional(),
  posterUrl: z.string().optional(),
  backdropUrl: z.string().optional(),
  genres: z.array(z.string()).optional(),
  rating: z.number().optional(),
  ratingCount: z.number().int().nonnegative().optional(),
  releaseDate: z.string().optional(),
  countries: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  productionCompanies: z.array(z.string()).optional(),
  status: z.string().optional(),
  tagline: z.string().optional(),
});

export const torrentCommentAuthorSchema = z.object({
  id: z.number().optional(),
  username: z.string().optional(),
  role: z.string().optional(),
  avatar: z.string().nullable().optional(),
});

export const torrentCommentReplySchema = z.object({
  id: z.number().optional(),
  username: z.string().optional(),
  contentHtml: z.string().optional(),
});

export const torrentCommentSchema = z.object({
  id: z.number().optional(),
  contentHtml: z.string().optional(),
  contentText: z.string().optional(),
  isEdited: z.boolean().optional(),
  createdAt: z.string().optional(),
  editedAt: z.string().nullable().optional(),
  author: torrentCommentAuthorSchema.optional(),
  replyTo: torrentCommentReplySchema.optional(),
});

export const torrentInfoToolOutputSchema = z.object({
  success: z.boolean().optional(),
  title: z.string().optional(),
  infoHash: z.string(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  size: z.string().optional(),
  sizeBytes: z.number().optional(),
  seeders: z.number().optional(),
  leechers: z.number().optional(),
  completions: z.number().int().nonnegative().optional(),
  uploader: z.string().optional(),
  createdAt: z.string().optional(),
  status: z.string().optional(),
  descriptionHtml: z.string().optional(),
  isFreeleech: z.boolean().optional(),
  isExclusive: z.boolean().optional(),
  lowBitrateWarning: z.boolean().optional(),
  fileCount: z.number().int().nonnegative().optional(),
  files: z.array(torrentFileEntrySchema).optional(),
  tmdb: torrentTmdbSchema.optional(),
  trust: torrentTrustSchema.optional(),
  error: z.string().optional(),
});

export const torrentCommentsToolOutputSchema = z.object({
  infoHash: z.string(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative().optional(),
  totalPages: z.number().int().nonnegative().optional(),
  resultCount: z.number().int().nonnegative(),
  comments: z.array(torrentCommentSchema),
  error: z.string().optional(),
});

export const userInfoToolSchema = z.object({});

export const userTierSummarySchema = z.object({
  slug: z.string().optional(),
  name: z.string().optional(),
  minUploads: z.number().optional(),
  uploadsNeeded: z.number().optional(),
});

export const userBadgeSchema = z.object({
  type: z.string().optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

export const userUploaderTierSchema = z.object({
  tier: userTierSummarySchema.optional(),
  validatedUploads: z.number().optional(),
  pendingCount: z.number().optional(),
  maxPending: z.number().nullable().optional(),
  canBypassValidation: z.boolean().optional(),
  nextTier: userTierSummarySchema.optional(),
  tiersEnabled: z.boolean().optional(),
});

export const userInfoToolOutputSchema = z.object({
  authenticated: z.boolean().optional(),
  emailVerificationRequired: z.boolean().optional(),
  id: z.number().optional(),
  username: z.string().optional(),
  roles: z.array(z.string()).optional(),
  badge: userBadgeSchema.optional(),
  email: z.string().optional(),
  emailVerified: z.boolean().optional(),
  reputation: z.number().optional(),
  warnings: z.number().optional(),
  isWarned: z.boolean().optional(),
  isDonor: z.boolean().optional(),
  isFreeleech: z.boolean().optional(),
  isPersonalFreeleech: z.boolean().optional(),
  showXxxContent: z.boolean().optional(),
  theme: z.string().optional(),
  torrentViewPreference: z.string().optional(),
  slotProfilePreference: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  uploaded: z.number().optional(),
  downloaded: z.number().optional(),
  uploadCredit: z.number().optional(),
  downloadCredit: z.number().optional(),
  ratio: z.number().optional(),
  canDownload: z.boolean().optional(),
  minRatioForDownload: z.number().optional(),
  ratioWarning: z.number().nullable().optional(),
  createdAt: z.string().optional(),
  validatedUploadsCount: z.number().optional(),
  isEarlyAdopter: z.boolean().optional(),
  isTeam: z.boolean().optional(),
  teamName: z.string().nullable().optional(),
  uploaderBlocked: z.boolean().optional(),
  uploaderTier: userUploaderTierSchema.optional(),
  error: z.string().optional(),
});

export type SearchSortBy = z.infer<typeof searchSortBySchema>;
export type SearchSortOrder = z.infer<typeof searchSortOrderSchema>;
