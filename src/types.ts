export interface AuthStateResponse {
  authenticated?: boolean;
  emailVerificationRequired?: boolean;
  user?: unknown;
}

export interface UserBadge extends JsonRecord {
  type?: string;
  label?: string;
  icon?: string;
  color?: string;
}

export interface UserTierSummary extends JsonRecord {
  slug?: string;
  name?: string;
  minUploads?: number;
  uploadsNeeded?: number;
}

export interface UserUploaderTier extends JsonRecord {
  tier?: UserTierSummary;
  validatedUploads?: number;
  pendingCount?: number;
  maxPending?: number | null;
  canBypassValidation?: boolean;
  nextTier?: UserTierSummary;
  tiersEnabled?: boolean;
}

export interface UserInfo extends JsonRecord {
  authenticated?: boolean;
  emailVerificationRequired?: boolean;
  id?: number;
  username?: string;
  roles?: string[];
  badge?: UserBadge;
  email?: string;
  emailVerified?: boolean;
  reputation?: number;
  warnings?: number;
  isWarned?: boolean;
  isDonor?: boolean;
  isFreeleech?: boolean;
  isPersonalFreeleech?: boolean;
  showXxxContent?: boolean;
  theme?: string;
  torrentViewPreference?: string;
  slotProfilePreference?: string | null;
  avatar?: string | null;
  uploaded?: number;
  downloaded?: number;
  uploadCredit?: number;
  downloadCredit?: number;
  ratio?: number;
  canDownload?: boolean;
  minRatioForDownload?: number;
  ratioWarning?: number | null;
  createdAt?: string;
  validatedUploadsCount?: number;
  isEarlyAdopter?: boolean;
  isTeam?: boolean;
  teamName?: string | null;
  uploaderBlocked?: boolean;
  uploaderTier?: UserUploaderTier;
}

export interface C411ApiListResponse<T> {
  data?: T[];
  meta?: {
    total?: number;
    page?: number;
    totalPages?: number;
    perPage?: number;
  };
}

export interface C411Session {
  csrfToken: string;
  authenticated: boolean;
}

export type JsonRecord = Record<string, unknown>;

export interface SearchResultItem extends JsonRecord {
  title: string;
  type: 'torrent' | 'release' | 'series';
  category?: string;
  subcategory?: string;
  language?: string;
  size?: string;
  sizeBytes?: number;
  seeders?: number;
  leechers?: number;
  completions?: number;
  comments?: number;
  uploader?: string;
  infoHash?: string;
  versionCount?: number;
  seasonCount?: number;
}

export interface SearchResultPage extends JsonRecord {
  query: string;
  page: number;
  perPage: number;
  total?: number;
  totalPages?: number;
  resultCount: number;
  results: SearchResultItem[];
}

export interface DownloadResult {
  success: boolean;
  filename?: string;
  savedPath?: string;
  error?: string;
}

export interface TorrentFileEntry extends JsonRecord {
  path: string[];
  length?: number;
}

export interface TorrentTrustInfo extends JsonRecord {
  enabled?: boolean;
  score?: number;
  votesCount?: number;
  positiveCount?: number;
  negativeCount?: number;
  status?: string;
  isTested?: boolean;
}

export interface TorrentTmdbInfo extends JsonRecord {
  id?: number;
  imdbId?: string;
  type?: string;
  title?: string;
  originalTitle?: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  genres?: string[];
  rating?: number;
  ratingCount?: number;
  releaseDate?: string;
  countries?: string[];
  languages?: string[];
  productionCompanies?: string[];
  status?: string;
  tagline?: string;
}

export interface TorrentCommentAuthor extends JsonRecord {
  id?: number;
  username?: string;
  role?: string;
  avatar?: string | null;
}

export interface TorrentCommentReply extends JsonRecord {
  id?: number;
  username?: string;
  contentHtml?: string;
}

export interface TorrentComment extends JsonRecord {
  id?: number;
  contentHtml?: string;
  contentText?: string;
  isEdited?: boolean;
  createdAt?: string;
  editedAt?: string | null;
  author?: TorrentCommentAuthor;
  replyTo?: TorrentCommentReply;
}

export interface TorrentCommentsPage extends JsonRecord {
  infoHash: string;
  page: number;
  limit: number;
  total?: number;
  totalPages?: number;
  resultCount: number;
  comments: TorrentComment[];
}

export interface TorrentDetail extends JsonRecord {
  title: string;
  infoHash: string;
  category?: string;
  subcategory?: string;
  size?: string;
  sizeBytes?: number;
  seeders?: number;
  leechers?: number;
  completions?: number;
  uploader?: string;
  createdAt?: string;
  status?: string;
  descriptionHtml?: string;
  isFreeleech?: boolean;
  isExclusive?: boolean;
  lowBitrateWarning?: boolean;
  fileCount: number;
  files: TorrentFileEntry[];
  tmdb?: TorrentTmdbInfo;
  trust?: TorrentTrustInfo;
}

export type AuthResult =
  | { success: true }
  | { success: false; message: string };

export type AuthenticatedOperationResult<T> =
  | { type: 'success'; value: T }
  | { type: 'reauth' };
