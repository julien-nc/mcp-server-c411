import { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CookieJar } from 'tough-cookie';
import { toStructuredSearchResult, toStructuredTorrentDetail, toTorrentComments } from './formatters.js';
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
  TorrentCommentsPage,
  TorrentDetail,
  JsonRecord,
  UserInfo,
} from './types.js';
import type { SearchSortBy, SearchSortOrder } from './schemas.js';
import { SEARCH_CATEGORY } from './schemas.js';

export class C411Client {
  private readonly client: AxiosInstance;
  private session: C411Session | null = null;
  private authPromise: Promise<AuthResult> | null = null;
  private readonly cookieJar = new CookieJar();
  private readonly baseUrl = 'https://c411.org';
  private readonly requestTimeoutMs = 10_000;
  private readonly authRetryLimit = 2;
  private readonly authRetryDelayMs = 500;
  private readonly torrentInfoMarker = Buffer.from('4:info');

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
    return this.authenticate(true);
  }

  private async authenticate(force = false): Promise<AuthResult> {
    if (!force && this.session?.authenticated) {
      return { success: true };
    }

    if (this.authPromise) {
      return this.authPromise;
    }

    const authPromise = (async () => {
      if (force) {
        this.session = null;
        await this.delay(this.authRetryDelayMs);
      }

      return this.loginInternal();
    })();

    this.authPromise = authPromise;

    try {
      return await authPromise;
    } finally {
      if (this.authPromise === authPromise) {
        this.authPromise = null;
      }
    }
  }

  private isValidTorrentFile(buffer: Buffer): boolean {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0x64 &&
      buffer[buffer.length - 1] === 0x65 &&
      buffer.includes(this.torrentInfoMarker)
    );
  }

  private async withAuthentication<T>(
    operation: () => Promise<AuthenticatedOperationResult<T>>,
    authFailureMessage: string
  ): Promise<T> {
    if (!this.session?.authenticated) {
      const loginResult = await this.authenticate(false);
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

  private async getJsonWithAuthentication<T>(
    url: string,
    referer: string,
    notFoundMessage: string,
    failurePrefix: string
  ): Promise<T> {
    return this.withAuthentication<T>(async () => {
      const response = await this.client.get<unknown>(url, {
        headers: {
          'Accept': 'application/json',
          'Referer': referer,
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
        throw new Error(notFoundMessage);
      }

      if (response.status >= 400) {
        const errorMessage = getErrorMessageFromResponse(
          response.data,
          contentType
        ) || `HTTP ${response.status}`;
        throw new Error(`${failurePrefix} - ${errorMessage}`);
      }

      return {
        type: 'success',
        value: response.data as T,
      };
    }, 'Unable to authenticate. Check C411_USERNAME and C411_PASSWORD environment variables.');
  }

  async login(): Promise<AuthResult> {
    return this.authenticate(false);
  }

  async getCurrentUser(): Promise<UserInfo> {
    try {
      return await this.withAuthentication<UserInfo>(async () => {
        const response = await this.client.get<AuthStateResponse>('/api/auth/me', {
          headers: {
            'Accept': 'application/json',
            'Referer': `${this.baseUrl}/`,
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
          throw new Error(`User info lookup failed - ${errorMessage}`);
        }

        const userRecord = response.data?.user && typeof response.data.user === 'object'
          ? response.data.user as JsonRecord
          : null;

        const user: UserInfo = {
          authenticated: response.data?.authenticated,
          emailVerificationRequired: response.data?.emailVerificationRequired,
          ...(userRecord ? {
            id: typeof userRecord.id === 'number' ? userRecord.id : undefined,
            username: typeof userRecord.username === 'string' ? userRecord.username : undefined,
            roles: Array.isArray(userRecord.roles)
              ? userRecord.roles.filter((role): role is string => typeof role === 'string')
              : undefined,
            badge: userRecord.badge && typeof userRecord.badge === 'object'
              ? userRecord.badge as UserInfo['badge']
              : undefined,
            email: typeof userRecord.email === 'string' ? userRecord.email : undefined,
            emailVerified: typeof userRecord.emailVerified === 'boolean' ? userRecord.emailVerified : undefined,
            reputation: typeof userRecord.reputation === 'number' ? userRecord.reputation : undefined,
            warnings: typeof userRecord.warnings === 'number' ? userRecord.warnings : undefined,
            isWarned: typeof userRecord.isWarned === 'boolean' ? userRecord.isWarned : undefined,
            isDonor: typeof userRecord.isDonor === 'boolean' ? userRecord.isDonor : undefined,
            isFreeleech: typeof userRecord.isFreeleech === 'boolean' ? userRecord.isFreeleech : undefined,
            isPersonalFreeleech: typeof userRecord.isPersonalFreeleech === 'boolean' ? userRecord.isPersonalFreeleech : undefined,
            showXxxContent: typeof userRecord.showXxxContent === 'boolean' ? userRecord.showXxxContent : undefined,
            theme: typeof userRecord.theme === 'string' ? userRecord.theme : undefined,
            torrentViewPreference: typeof userRecord.torrentViewPreference === 'string' ? userRecord.torrentViewPreference : undefined,
            slotProfilePreference: typeof userRecord.slotProfilePreference === 'string' || userRecord.slotProfilePreference === null
              ? userRecord.slotProfilePreference as string | null
              : undefined,
            avatar: typeof userRecord.avatar === 'string' || userRecord.avatar === null
              ? userRecord.avatar as string | null
              : undefined,
            uploaded: typeof userRecord.uploaded === 'number' ? userRecord.uploaded : undefined,
            downloaded: typeof userRecord.downloaded === 'number' ? userRecord.downloaded : undefined,
            uploadCredit: typeof userRecord.uploadCredit === 'number' ? userRecord.uploadCredit : undefined,
            downloadCredit: typeof userRecord.downloadCredit === 'number' ? userRecord.downloadCredit : undefined,
            ratio: typeof userRecord.ratio === 'number' ? userRecord.ratio : undefined,
            canDownload: typeof userRecord.canDownload === 'boolean' ? userRecord.canDownload : undefined,
            minRatioForDownload: typeof userRecord.minRatioForDownload === 'number' ? userRecord.minRatioForDownload : undefined,
            ratioWarning: typeof userRecord.ratioWarning === 'number' || userRecord.ratioWarning === null
              ? userRecord.ratioWarning as number | null
              : undefined,
            createdAt: typeof userRecord.createdAt === 'string' ? userRecord.createdAt : undefined,
            validatedUploadsCount: typeof userRecord.validatedUploadsCount === 'number' ? userRecord.validatedUploadsCount : undefined,
            isEarlyAdopter: typeof userRecord.isEarlyAdopter === 'boolean' ? userRecord.isEarlyAdopter : undefined,
            isTeam: typeof userRecord.isTeam === 'boolean' ? userRecord.isTeam : undefined,
            teamName: typeof userRecord.teamName === 'string' || userRecord.teamName === null
              ? userRecord.teamName as string | null
              : undefined,
            uploaderBlocked: typeof userRecord.uploaderBlocked === 'boolean' ? userRecord.uploaderBlocked : undefined,
            uploaderTier: userRecord.uploaderTier && typeof userRecord.uploaderTier === 'object'
              ? userRecord.uploaderTier as UserInfo['uploaderTier']
              : undefined,
          } : {}),
        };

        return {
          type: 'success',
          value: user,
        };
      }, 'Unable to authenticate. Check C411_USERNAME and C411_PASSWORD environment variables.');
    } catch (error) {
      const message = getSafeErrorMessage(error, this.requestTimeoutMs);
      console.error(`Error fetching current user info: ${message}`);
      throw new Error(message);
    }
  }

  private async loginInternal(): Promise<AuthResult> {
    if (!this.username || !this.password) {
      this.session = null;
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
        this.session = null;
        const message = 'c411.org appears to be in maintenance mode, so authentication is temporarily unavailable.';
        console.error(message);
        return { success: false, message };
      }

      if (loginResponse.status === 401) {
        this.session = null;
        const message = 'Login failed: invalid C411 username or password.';
        console.error(message);
        return { success: false, message };
      }

      if (loginResponse.status >= 400) {
        this.session = null;
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

      this.session = null;
      const message = 'Login failed: authentication was not established after the login request.';
      console.error(message);
      return { success: false, message };
    } catch (error) {
      this.session = null;
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
    sortBy?: SearchSortBy,
    sortOrder?: SearchSortOrder,
    page = 1,
    perPage = 25,
    category?: string,
    subcat?: string
  ): Promise<SearchResultPage> {
    try {
      return await this.withAuthentication<SearchResultPage>(async () => {
        const params: Record<string, unknown> = {
          name: query,
          page,
          perPage,
          viewMode: 'flat',
        };
        if (sortBy !== undefined) {
          params.sortBy = sortBy;
          params.sortOrder = sortOrder ?? 'desc';
        }
        if (category !== undefined) {
          params.category = category;
          if (subcat !== undefined && category === SEARCH_CATEGORY.VIDEO) {
            params.subcat = subcat;
          }
        }
        const response = await this.client.get<C411ApiListResponse<unknown>>('/api/torrents', {
          params,
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
      const message = getSafeErrorMessage(error, this.requestTimeoutMs);
      console.error(`Error searching c411.org: ${message}`);
      throw new Error(message);
    }
  }

  async getCurrentUserUploads(page = 1, perPage = 100): Promise<SearchResultPage> {
    try {
      const user = await this.getCurrentUser();
      const username = user.username?.trim();

      if (!username) {
        throw new Error('Current user info did not include a username.');
      }

      return await this.withAuthentication<SearchResultPage>(async () => {
        const response = await this.client.get<C411ApiListResponse<unknown>>('/api/torrents', {
          params: {
            page,
            perPage,
            uploader: username,
            viewMode: 'flat',
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
          throw new Error(`Uploaded torrents lookup failed - ${errorMessage}`);
        }

        const rawResults = Array.isArray(response.data?.data) ? response.data.data : [];
        const results = rawResults
          .map((item) => toStructuredSearchResult(item))
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        return {
          type: 'success',
          value: {
            query: `uploader:${username}`,
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
      const message = getSafeErrorMessage(error, this.requestTimeoutMs);
      console.error(`Error fetching current user uploads: ${message}`);
      throw new Error(message);
    }
  }

  async getTorrentInfo(infoHash: string): Promise<TorrentDetail> {
    if (!infoHash || !/^[a-fA-F0-9]{40}$/.test(infoHash)) {
      throw new Error('Invalid infoHash. Must be a 40-character hex string.');
    }

    try {
      const referer = `${this.baseUrl}/torrents/${infoHash}`;
      const torrentResponse = await this.getJsonWithAuthentication<unknown>(
        `/api/torrents/${infoHash}`,
        referer,
        'Torrent not found.',
        'Torrent lookup failed'
      );

      const detail = toStructuredTorrentDetail(torrentResponse);
      if (!detail) {
        throw new Error('Torrent lookup returned an unexpected response format.');
      }

      return detail;
    } catch (error) {
      const message = getSafeErrorMessage(error, this.requestTimeoutMs);
      console.error(`Error fetching torrent info: ${message}`);
      throw new Error(message);
    }
  }

  async getTorrentComments(infoHash: string, page = 1, limit = 20): Promise<TorrentCommentsPage> {
    if (!infoHash || !/^[a-fA-F0-9]{40}$/.test(infoHash)) {
      throw new Error('Invalid infoHash. Must be a 40-character hex string.');
    }

    try {
      const referer = `${this.baseUrl}/torrents/${infoHash}`;
      const response = await this.getJsonWithAuthentication<C411ApiListResponse<unknown>>(
        `/api/torrents/${infoHash}/comments?page=${page}&limit=${limit}`,
        referer,
        'Torrent comments not found.',
        'Torrent comments lookup failed'
      );

      const comments = toTorrentComments(response?.data);
      return {
        infoHash,
        page,
        limit,
        ...(response?.meta?.total !== undefined ? { total: response.meta.total } : {}),
        ...(response?.meta?.totalPages !== undefined ? { totalPages: response.meta.totalPages } : {}),
        resultCount: comments.length,
        comments,
      };
    } catch (error) {
      const message = getSafeErrorMessage(error, this.requestTimeoutMs);
      console.error(`Error fetching torrent comments: ${message}`);
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

        if (!this.isValidTorrentFile(buffer)) {
          const errorMessage = getErrorMessageFromResponse(response.data, contentType);
          const responseDescription = errorMessage
            ? `Unexpected download response: ${errorMessage}`
            : `Unexpected download response with content type ${contentType ?? 'unknown'}`;

          return {
            type: 'success',
            value: {
              success: false,
              error: `${responseDescription}. The payload does not look like a valid .torrent file.`,
            },
          };
        }

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
      const message = getSafeErrorMessage(error, this.requestTimeoutMs);
      console.error(`Error downloading torrent: ${message}`);
      return { success: false, error: message };
    }
  }
}
