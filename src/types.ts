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

export interface DownloadResult {
  success: boolean;
  filename?: string;
  savedPath?: string;
  error?: string;
}
