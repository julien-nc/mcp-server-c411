import { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CookieJar } from 'tough-cookie';
import { formatStructuredSearchResult, toStructuredSearchResult } from './formatters.js';
import { createHttpClient } from './http-client.js';
import {
  MaintenanceError,
  getContentType,
  getErrorMessageFromResponse,
  getResponseUrl,
  getSafeErrorMessage,
  isAuthenticationFailureResponse,
  isMaintenanceMessage,
  isMaintenanceResponse,
} from './http-response-utils.js';
import type {
  AuthResult,
  AuthStateResponse,
  AuthenticatedOperationResult,
  C411ApiListResponse,
  C411Session,
  DownloadResult,
  SearchResultPage,
} from './types.js';
import type { SearchSortBy, SearchSortOrder } from './schemas.js';

export class C411Client {
  private readonly client: AxiosInstance;
  private session: C411Session | null = null;
  private readonly cookieJar = new CookieJar();
  private readonly baseUrl = 'https://c411.org';
  private readonly requestTimeoutMs = 10_000;
  private readonly authRetryLimit = 2;
  private readonly authRetryDelayMs = 500;

  constructor(private username?: string, private password?: string) {
    this.client = createHttpClient({
      baseURL: this.baseUrl,
      timeout: this.requestTimeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html;q=0.9, */*;q=0.8',
      },
      jar: this.cookieJar,
      withCredentials: true,
      validateStatus: () => true,
    });
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchLoginCsrfToken(): Promise<string> {
    const response = await this.client.get<string>('/login', {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': `${this.baseUrl}/login`,
      },
      responseType: 'text',
    });

    const contentType = getContentType(response.headers as Record<string, unknown>);
    if (isMaintenanceResponse(response.status, response.data, contentType)) {
      throw new MaintenanceError();
    }

    if (response.status !== 200 || typeof response.data !== 'string') {
      throw new Error(`Unable to load login page (HTTP ${response.status})`);
    }

    const $ = cheerio.load(response.data);
    const csrfToken =
      $('meta[name="csrf-token"]').attr('content') ||
      $('input[name="csrf_token"]').val()?.toString() ||
      '';

    if (!csrfToken) {
      if (isMaintenanceMessage(getErrorMessageFromResponse(response.data, contentType))) {
        throw new MaintenanceError();
      }

      throw new Error('Unable to find the CSRF token on the login page');
    }

    return csrfToken;
  }

  private async isAuthenticated(): Promise<boolean> {
    const response = await this.client.get<AuthStateResponse>('/api/auth/me', {
      headers: {
        'Accept': 'application/json',
        'Referer': `${this.baseUrl}/torrents`,
      },
    });

    const contentType = getContentType(response.headers as Record<string, unknown>);
    if (isMaintenanceResponse(response.status, response.data, contentType)) {
      throw new MaintenanceError();
    }

    return response.status === 200 && Boolean(response.data?.authenticated);
  }

  private async reauthenticate(): Promise<AuthResult> {
    this.session = null;
    await this.delay(this.authRetryDelayMs);
    return this.login();
  }

  private async withAuthentication<T>(
    operation: () => Promise<AuthenticatedOperationResult<T>>,
    authFailureMessage: string
  ): Promise<T> {
    if (!this.session?.authenticated) {
      const loginResult = await this.login();
      if (!loginResult.success) {
        throw new Error(loginResult.message || authFailureMessage);
      }
    }

    for (let attempt = 0; attempt <= this.authRetryLimit; attempt += 1) {
      const result = await operation();
      if (result.type === 'success') {
        return result.value;
      }

      if (attempt >= this.authRetryLimit) {
        throw new Error('Authentication expired and re-login failed after retries.');
      }

      const loginResult = await this.reauthenticate();
      if (!loginResult.success) {
        throw new Error(loginResult.message || 'Authentication expired and re-login failed.');
      }
    }

    throw new Error('Authentication expired and re-login failed after retries.');
  }

  async login(): Promise<AuthResult> {
    if (!this.username || !this.password) {
      const message = 'Authentication required. Set C411_USERNAME and C411_PASSWORD environment variables.';
      console.error(message);
      return { success: false, message };
    }

    try {
      const csrfToken = await this.fetchLoginCsrfToken();
      const loginResponse = await this.client.post('/api/auth/login', {
        username: this.username,
        password: this.password,
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'csrf-token': csrfToken,
          'Referer': `${this.baseUrl}/login`,
          'Origin': this.baseUrl,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      const contentType = getContentType(loginResponse.headers as Record<string, unknown>);
      if (isMaintenanceResponse(loginResponse.status, loginResponse.data, contentType)) {
        const message = 'c411.org appears to be in maintenance mode, so authentication is temporarily unavailable.';
        console.error(message);
        return { success: false, message };
      }

      if (loginResponse.status === 401) {
        const message = 'Login failed: invalid C411 username or password.';
        console.error(message);
        return { success: false, message };
      }

      if (loginResponse.status >= 400) {
        const message = `Login failed: ${getErrorMessageFromResponse(loginResponse.data, contentType) || `HTTP ${loginResponse.status}`}`;
        console.error(message);
        return { success: false, message };
      }

      const authenticated = await this.isAuthenticated();
      if (authenticated) {
        this.session = {
          csrfToken,
          authenticated: true,
        };
        return { success: true };
      }

      const message = 'Login failed: authentication was not established after the login request.';
      console.error(message);
      return { success: false, message };
    } catch (error) {
      if (error instanceof MaintenanceError) {
        console.error(error.message);
        return { success: false, message: error.message };
      }

      const message = `Login error: ${getSafeErrorMessage(error, this.requestTimeoutMs)}`;
      console.error(message);
      return { success: false, message };
    }
  }

  async search(
    query: string,
    sortBy: SearchSortBy = 'relevance',
    sortOrder: SearchSortOrder = 'desc',
    page = 1,
    perPage = 25
  ): Promise<SearchResultPage> {
    try {
      return await this.withAuthentication<SearchResultPage>(async () => {
        const response = await this.client.get<C411ApiListResponse<unknown>>('/api/torrents', {
          params: {
            name: query,
            page,
            perPage,
            sortBy,
            sortOrder,
          },
          headers: {
            'Accept': 'application/json',
            'Referer': `${this.baseUrl}/torrents`,
          },
        });

        const contentType = getContentType(response.headers as Record<string, unknown>);
        const responseUrl = getResponseUrl(response.request);

        if (isMaintenanceResponse(response.status, response.data, contentType)) {
          throw new MaintenanceError();
        }

        if (isAuthenticationFailureResponse(response.status, response.data, contentType, responseUrl)) {
          return { type: 'reauth' };
        }

        if (response.status >= 400) {
          const errorMessage = getErrorMessageFromResponse(
            response.data,
            contentType
          ) || `HTTP ${response.status}`;
          throw new Error(`Search failed - ${errorMessage}`);
        }

        const rawResults = Array.isArray(response.data?.data) ? response.data.data : [];
        const results = rawResults
          .map((item) => toStructuredSearchResult(item))
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        return {
          type: 'success',
          value: {
            query,
            page,
            perPage,
            total: response.data?.meta?.total,
            totalPages: response.data?.meta?.totalPages,
            resultCount: results.length,
            results,
          },
        };
      }, 'Unable to authenticate. Check C411_USERNAME and C411_PASSWORD environment variables.');
    } catch (error) {
      const message = error instanceof Error ? error.message : getSafeErrorMessage(error, this.requestTimeoutMs);
      console.error(`Error searching c411.org: ${message}`);
      throw new Error(message);
    }
  }

  async downloadTorrent(infoHash: string, outputDir = '/tmp'): Promise<DownloadResult> {
    if (!infoHash || !/^[a-fA-F0-9]{40}$/.test(infoHash)) {
      return { success: false, error: 'Invalid infoHash. Must be a 40-character hex string.' };
    }

    try {
      return await this.withAuthentication<DownloadResult>(async () => {
        const response = await this.client.get<ArrayBuffer>(`/api/torrents/${infoHash}/download`, {
          responseType: 'arraybuffer',
          headers: {
            'Accept': 'application/x-bittorrent, application/octet-stream, */*',
            'Referer': `${this.baseUrl}/torrents/${infoHash}`,
          },
        });

        const contentType = getContentType(response.headers as Record<string, unknown>);
        const responseUrl = getResponseUrl(response.request);

        if (isMaintenanceResponse(response.status, response.data, contentType)) {
          throw new MaintenanceError();
        }

        if (isAuthenticationFailureResponse(response.status, response.data, contentType, responseUrl)) {
          return { type: 'reauth' };
        }

        if (response.status === 404) {
          return { type: 'success', value: { success: false, error: 'Torrent not found.' } };
        }

        if (response.status >= 400) {
          const errorMessage = getErrorMessageFromResponse(
            response.data,
            contentType
          ) || `HTTP ${response.status}`;
          return { type: 'success', value: { success: false, error: `Download failed - ${errorMessage}` } };
        }

        const buffer = Buffer.isBuffer(response.data)
          ? response.data
          : Buffer.from(response.data);

        const contentDisposition = typeof response.headers['content-disposition'] === 'string'
          ? response.headers['content-disposition']
          : undefined;
        let filename = `${infoHash}.torrent`;
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match && match[1]) {
            filename = match[1].replace(/['"]/g, '').trim();
          }
        }

        const safeFilename = path.basename(filename) || `${infoHash}.torrent`;
        const resolvedOutputDir = path.resolve(outputDir);
        const savedPath = path.join(resolvedOutputDir, safeFilename);

        await mkdir(resolvedOutputDir, { recursive: true });
        await writeFile(savedPath, buffer);

        return {
          type: 'success',
          value: {
            success: true,
            filename: safeFilename,
            savedPath,
          },
        };
      }, 'Unable to authenticate. Check C411_USERNAME and C411_PASSWORD environment variables.');
    } catch (error) {
      const message = error instanceof Error ? error.message : getSafeErrorMessage(error, this.requestTimeoutMs);
      console.error(`Error downloading torrent: ${message}`);
      return { success: false, error: message };
    }
  }
}
