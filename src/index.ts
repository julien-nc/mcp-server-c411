import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface AuthStateResponse {
  authenticated?: boolean;
  user?: unknown;
}

interface LoginResponse {
  success?: boolean;
  message?: string;
  user?: unknown;
}

interface C411ApiListResponse<T> {
  data?: T[];
  meta?: {
    total?: number;
    page?: number;
    totalPages?: number;
    perPage?: number;
  };
}

type JsonRecord = Record<string, unknown>;

interface C411Session {
  csrfToken: string;
  authenticated: boolean;
}

const searchSortBySchema = z.enum([
  'seeders',
  'leechers',
  'size',
  'createdAd',
  'name',
  'completions',
  'comments',
  'category',
]);

const searchSortOrderSchema = z.enum(['asc', 'desc']);

type SearchSortBy = z.infer<typeof searchSortBySchema>;
type SearchSortOrder = z.infer<typeof searchSortOrderSchema>;

class MaintenanceError extends Error {
  constructor(message = 'c411.org appears to be in maintenance mode. Please try again later.') {
    super(message);
    this.name = 'MaintenanceError';
  }
}

class C411Client {
  private client: any;
  private session: C411Session | null = null;
  private readonly cookieJar: any = new CookieJar();
  private readonly baseUrl = 'https://c411.org';
  private readonly requestTimeoutMs = 10_000;
  private readonly authRetryLimit = 2;
  private readonly authRetryDelayMs = 500;
  private lastAuthError: string | null = null;

  constructor(private username?: string, private password?: string) {
    const wrappedAxios = (wrapper as any)(axios as any);

    this.client = wrappedAxios.create({
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

  private setAuthError(message: string): void {
    this.lastAuthError = message;
  }

  private clearAuthError(): void {
    this.lastAuthError = null;
  }

  private getAuthErrorMessage(fallback: string): string {
    return this.lastAuthError || fallback;
  }

  private getSafeErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data;
      const responseContentType = typeof error.response?.headers?.['content-type'] === 'string'
        ? error.response.headers['content-type']
        : undefined;
      const message =
        this.getErrorMessageFromResponse(responseData, responseContentType) || error.message;

      if (error.code === 'ECONNABORTED') {
        return `Request timed out after ${this.requestTimeoutMs}ms`;
      }

      return error.response?.status ? `HTTP ${error.response.status} - ${message}` : message;
    }

    return error instanceof Error ? error.message : 'Unknown error';
  }

  private decodeResponseBody(data: unknown): string | null {
    if (typeof data === 'string') {
      return data;
    }

    if (Buffer.isBuffer(data)) {
      return data.toString('utf8');
    }

    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString('utf8');
    }

    if (ArrayBuffer.isView(data)) {
      return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
    }

    return null;
  }

  private getErrorMessageFromResponse(data: unknown, contentType?: string): string | null {
    if (typeof data === 'object' && data !== null && !Buffer.isBuffer(data) && !ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer)) {
      return this.getString((data as JsonRecord).message);
    }

    const decodedBody = this.decodeResponseBody(data);
    if (!decodedBody) {
      return null;
    }

    const normalizedContentType = contentType?.toLowerCase() ?? '';
    const trimmedBody = decodedBody.trim();

    if (!trimmedBody) {
      return null;
    }

    if (normalizedContentType.includes('json') || /^[\[{]/.test(trimmedBody)) {
      try {
        const parsed = JSON.parse(trimmedBody) as JsonRecord;
        const jsonMessage = this.getString(parsed.message);
        if (jsonMessage) {
          return jsonMessage;
        }
      } catch {
        // Fall through to text extraction.
      }
    }

    if (normalizedContentType.includes('text') || normalizedContentType.includes('html') || !normalizedContentType) {
      const condensedBody = trimmedBody.replace(/\s+/g, ' ').slice(0, 200);
      return condensedBody || null;
    }

    return null;
  }

  private isMaintenanceMessage(message: string | null): boolean {
    if (!message) {
      return false;
    }

    const normalized = message.toLowerCase();
    return (
      normalized.includes('maintenance') ||
      normalized.includes('temporarily unavailable') ||
      normalized.includes('down for maintenance') ||
      normalized.includes('service unavailable')
    );
  }

  private isMaintenanceResponse(status: number, data: unknown, contentType?: string): boolean {
    if (status === 503) {
      return true;
    }

    return this.isMaintenanceMessage(this.getErrorMessageFromResponse(data, contentType));
  }

  private async fetchLoginCsrfToken(): Promise<string> {
    const response = await this.client.get('/login', {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': `${this.baseUrl}/login`,
      },
      responseType: 'text',
    });

    const contentType = typeof response.headers['content-type'] === 'string'
      ? response.headers['content-type']
      : undefined;

    if (this.isMaintenanceResponse(response.status, response.data, contentType)) {
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
      if (this.isMaintenanceMessage(this.getErrorMessageFromResponse(response.data, contentType))) {
        throw new MaintenanceError();
      }

      throw new Error('Unable to find the CSRF token on the login page');
    }

    return csrfToken;
  }

  private async isAuthenticated(): Promise<boolean> {
    const response = await this.client.get('/api/auth/me', {
      headers: {
        'Accept': 'application/json',
        'Referer': `${this.baseUrl}/torrents`,
      },
    });

    const contentType = typeof response.headers['content-type'] === 'string'
      ? response.headers['content-type']
      : undefined;

    if (this.isMaintenanceResponse(response.status, response.data, contentType)) {
      throw new MaintenanceError();
    }

    const data = response.data as AuthStateResponse | undefined;
    return response.status === 200 && Boolean(data?.authenticated);
  }

  private formatBytes(size: unknown): string | null {
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
      return null;
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = size;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(precision)} ${units[unitIndex]}`;
  }

  private getString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private getNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private getNestedString(record: JsonRecord, ...paths: string[][]): string | null {
    for (const path of paths) {
      let current: unknown = record;

      for (const segment of path) {
        if (!current || typeof current !== 'object' || !(segment in current)) {
          current = undefined;
          break;
        }

        current = (current as JsonRecord)[segment];
      }

      const result = this.getString(current);
      if (result) {
        return result;
      }
    }

    return null;
  }

  private getNestedNumber(record: JsonRecord, ...paths: string[][]): number | null {
    for (const path of paths) {
      let current: unknown = record;

      for (const segment of path) {
        if (!current || typeof current !== 'object' || !(segment in current)) {
          current = undefined;
          break;
        }

        current = (current as JsonRecord)[segment];
      }

      const result = this.getNumber(current);
      if (result !== null) {
        return result;
      }
    }

    return null;
  }

  private getInfoHash(record: JsonRecord): string | null {
    return this.getNestedString(
      record,
      ['infoHash'],
      ['info_hash'],
      ['hash'],
      ['attributes', 'infoHash'],
      ['attributes', 'info_hash'],
      ['attributes', 'hash']
    );
  }

  private formatTorrentResult(item: unknown): string | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as JsonRecord;
    const title = this.getNestedString(record, ['name'], ['title']);
    if (!title) {
      return null;
    }

    const parts = [`Title: ${title}`];
    const category = this.getNestedString(record, ['category', 'name']);
    const subcategory = this.getNestedString(record, ['subcategory', 'name']);
    const size = this.getNestedString(record, ['formattedSize']) ?? this.formatBytes(this.getNestedNumber(record, ['size']));
    const seeders = this.getNestedNumber(record, ['seeders']);
    const leechers = this.getNestedNumber(record, ['leechers']);
    const uploader = this.getNestedString(record, ['uploader', 'username'], ['uploader', 'name']);
    const infoHash = this.getInfoHash(record);

    if (category) {
      parts.push(`Category: ${subcategory ? `${category} / ${subcategory}` : category}`);
    }

    if (size) {
      parts.push(`Size: ${size}`);
    }

    if (seeders !== null) {
      parts.push(`Seeds: ${seeders}`);
    }

    if (leechers !== null) {
      parts.push(`Leechers: ${leechers}`);
    }

    if (uploader) {
      parts.push(`Uploader: ${uploader}`);
    }

    if (infoHash) {
      parts.push(`InfoHash: ${infoHash}`);
    }

    return parts.join(' | ');
  }

  private formatReleaseResult(item: JsonRecord): string | null {
    const title = this.getNestedString(item, ['title'], ['name']);
    if (!title) {
      return null;
    }

    const parts = [`Title: ${title}`, 'Type: release'];
    const count = Array.isArray(item.torrents) ? item.torrents.length : null;
    const seeders = this.getNestedNumber(item, ['seeders', 'total'], ['seeders']);
    const leechers = this.getNestedNumber(item, ['leechers', 'total'], ['leechers']);

    if (count !== null) {
      parts.push(`Versions: ${count}`);
    }

    if (seeders !== null) {
      parts.push(`Seeds: ${seeders}`);
    }

    if (leechers !== null) {
      parts.push(`Leechers: ${leechers}`);
    }

    return parts.join(' | ');
  }

  private formatSeriesResult(item: JsonRecord): string | null {
    const title = this.getNestedString(item, ['title'], ['name']);
    if (!title) {
      return null;
    }

    const parts = [`Title: ${title}`, 'Type: series'];
    const seasonCount = Array.isArray(item.seasons) ? item.seasons.length : null;
    const seeders = this.getNestedNumber(item, ['seeders', 'total'], ['seeders']);
    const leechers = this.getNestedNumber(item, ['leechers', 'total'], ['leechers']);

    if (seasonCount !== null) {
      parts.push(`Seasons: ${seasonCount}`);
    }

    if (seeders !== null) {
      parts.push(`Seeds: ${seeders}`);
    }

    if (leechers !== null) {
      parts.push(`Leechers: ${leechers}`);
    }

    return parts.join(' | ');
  }

  private formatSearchResult(item: unknown): string | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const record = item as JsonRecord;
    const itemType = this.getString(record.type);

    if (itemType === 'release') {
      return this.formatReleaseResult(record);
    }

    if (itemType === 'series') {
      return this.formatSeriesResult(record);
    }

    return this.formatTorrentResult(record);
  }

  async login(): Promise<boolean> {
    if (!this.username || !this.password) {
      this.setAuthError('Authentication required. Set C411_USERNAME and C411_PASSWORD environment variables.');
      console.error(this.lastAuthError);
      return false;
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

      const contentType = typeof loginResponse.headers['content-type'] === 'string'
        ? loginResponse.headers['content-type']
        : undefined;

      if (this.isMaintenanceResponse(loginResponse.status, loginResponse.data, contentType)) {
        this.setAuthError('c411.org appears to be in maintenance mode, so authentication is temporarily unavailable.');
        console.error(this.lastAuthError);
        return false;
      }

      if (loginResponse.status === 401) {
        this.setAuthError('Login failed: invalid C411 username or password.');
        console.error(this.lastAuthError);
        return false;
      }

      if (loginResponse.status >= 400) {
        const message = this.getErrorMessageFromResponse(loginResponse.data, contentType) || `HTTP ${loginResponse.status}`;
        this.setAuthError(`Login failed: ${message}`);
        console.error(this.lastAuthError);
        return false;
      }

      const authenticated = await this.isAuthenticated();

      if (authenticated) {
        this.clearAuthError();
        this.session = {
          csrfToken,
          authenticated: true,
        };
        return true;
      }

      this.setAuthError('Login failed: authentication was not established after the login request.');
      console.error(this.lastAuthError);
      return false;
    } catch (error) {
      if (error instanceof MaintenanceError) {
        this.setAuthError(error.message);
        console.error(this.lastAuthError);
        return false;
      }

      this.setAuthError(`Login error: ${this.getSafeErrorMessage(error)}`);
      console.error(this.lastAuthError);
      return false;
    }
  }

  async search(
    query: string,
    sortBy: SearchSortBy = 'seeders',
    sortOrder: SearchSortOrder = 'desc',
    page = 1,
    perPage = 25
  ): Promise<string[]> {
    if (!this.session || !this.session.authenticated) {
      const loggedIn = await this.login();
      if (!loggedIn) {
        return [`Error: ${this.getAuthErrorMessage('Unable to authenticate. Check C411_USERNAME and C411_PASSWORD environment variables.')}`];
      }
    }

    for (let attempt = 0; attempt <= this.authRetryLimit; attempt += 1) {
      try {
        const response = await this.client.get('/api/torrents', {
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

        if (response.status === 401) {
          if (attempt >= this.authRetryLimit) {
            return ['Error: Authentication expired and re-login failed after retries.'];
          }

          this.session = null;
          await this.delay(this.authRetryDelayMs);

          const loggedIn = await this.login();
          if (!loggedIn) {
            return [`Error: ${this.getAuthErrorMessage('Authentication expired and re-login failed.')}`];
          }

          continue;
        }

        if (response.status >= 400) {
          const errorMessage = this.getErrorMessageFromResponse(
            response.data,
            typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : undefined
          ) || `HTTP ${response.status}`;
          return [`Error: Search failed - ${errorMessage}`];
        }

        const searchData = response.data as C411ApiListResponse<unknown> | undefined;
        const rawResults = Array.isArray(searchData?.data) ? searchData.data : [];
        const results = rawResults
          .map((item: unknown) => this.formatSearchResult(item))
          .filter((item: string | null): item is string => Boolean(item));

        return results.length > 0 ? results : ['No results found'];
      } catch (error) {
        const message = this.getSafeErrorMessage(error);
        console.error(`Error searching c411.org: ${message}`);
        return [`Error: ${message}`];
      }
    }

    return ['Error: Authentication expired and re-login failed after retries.'];
  }

  async downloadTorrent(infoHash: string, outputDir = '/tmp'): Promise<{ success: boolean; filename?: string; savedPath?: string; error?: string }> {
    if (!this.session || !this.session.authenticated) {
      const loggedIn = await this.login();
      if (!loggedIn) {
        return { success: false, error: this.getAuthErrorMessage('Unable to authenticate. Check C411_USERNAME and C411_PASSWORD environment variables.') };
      }
    }

    if (!infoHash || !/^[a-fA-F0-9]{40}$/.test(infoHash)) {
      return { success: false, error: 'Invalid infoHash. Must be a 40-character hex string.' };
    }

    for (let attempt = 0; attempt <= this.authRetryLimit; attempt += 1) {
      try {
        const response = await this.client.get(`/api/torrents/${infoHash}/download`, {
          responseType: 'arraybuffer',
          headers: {
            'Accept': 'application/x-bittorrent, application/octet-stream, */*',
            'Referer': `${this.baseUrl}/torrents/${infoHash}`,
          },
        });

        if (response.status === 401) {
          if (attempt >= this.authRetryLimit) {
            return { success: false, error: 'Authentication expired and re-login failed after retries.' };
          }

          this.session = null;
          await this.delay(this.authRetryDelayMs);

          const loggedIn = await this.login();
          if (!loggedIn) {
            return { success: false, error: this.getAuthErrorMessage('Authentication expired and re-login failed.') };
          }

          continue;
        }

        if (response.status === 404) {
          return { success: false, error: 'Torrent not found.' };
        }

        if (response.status >= 400) {
          const errorMessage = this.getErrorMessageFromResponse(
            response.data,
            typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : undefined
          ) || `HTTP ${response.status}`;
          return { success: false, error: `Download failed - ${errorMessage}` };
        }

        const buffer = Buffer.isBuffer(response.data)
          ? response.data
          : Buffer.from(response.data as ArrayBuffer);

        const contentDisposition = response.headers['content-disposition'] as string | undefined;
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
          success: true,
          filename: safeFilename,
          savedPath,
        };
      } catch (error) {
        const message = this.getSafeErrorMessage(error);
        console.error(`Error downloading torrent: ${message}`);
        return { success: false, error: message };
      }
    }

    return { success: false, error: 'Authentication expired and re-login failed after retries.' };
  }
}

async function main() {
  const username = process.env.C411_USERNAME;
  const password = process.env.C411_PASSWORD;

  const c411Client = new C411Client(username, password);

  const server = new McpServer(
    {
      name: 'c411-search-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.registerTool('search_c411', {
    description: 'Search for torrents on c411.org',
    inputSchema: z.object({
      query: z.string().describe('Search query for torrents'),
      sortBy: searchSortBySchema.optional().default('seeders').describe('Sort criteria for the search results. Defaults to seeders.'),
      sortOrder: searchSortOrderSchema.optional().default('desc').describe('Sort order for the search results. Defaults to desc.'),
      page: z.number().int().positive().optional().default(1).describe('Result page number. Defaults to 1.'),
      perPage: z.number().int().positive().optional().default(25).describe('Number of results per page. Defaults to 25.'),
    }),
  }, async (args) => {
    const results = await c411Client.search(args.query, args.sortBy, args.sortOrder, args.page, args.perPage);
    return {
      content: [
        {
          type: 'text',
          text: results.join('\n'),
        },
      ],
    };
  });

  server.registerTool('download_c411_torrent', {
    description: 'Download a .torrent file from c411.org by its infoHash and save it to disk.',
    inputSchema: z.object({
      infoHash: z.string().length(40).describe('The 40-character hex infoHash of the torrent'),
      outputDir: z.string().optional().describe('Directory where the .torrent file should be saved. Defaults to /tmp.'),
    }),
  }, async (args) => {
    const result = await c411Client.downloadTorrent(args.infoHash, args.outputDir ?? '/tmp');
    
    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${result.error}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: result.savedPath || `Saved ${result.filename}`,
        },
      ],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('c411 MCP server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
