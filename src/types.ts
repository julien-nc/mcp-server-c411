export interface AuthStateResponse {
  authenticated?: boolean;
  user?: unknown;
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

export interface SearchResultItem {
  [key: string]: unknown;
  title: string;
  type: 'torrent' | 'release' | 'series';
  category?: string;
  subcategory?: string;
  size?: string;
  sizeBytes?: number;
  seeders?: number;
  leechers?: number;
  uploader?: string;
  infoHash?: string;
  versionCount?: number;
  seasonCount?: number;
}

export interface SearchResultPage {
  [key: string]: unknown;
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

export type AuthResult =
  | { success: true }
  | { success: false; message: string };

export type AuthenticatedOperationResult<T> =
  | { type: 'success'; value: T }
  | { type: 'reauth' };
