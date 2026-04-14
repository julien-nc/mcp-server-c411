import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { C411Client } from './c411-client.js';
import { formatStructuredSearchResult, formatStructuredTorrentCommentsPage, formatStructuredTorrentDetail, formatStructuredUserInfo } from './formatters.js';
import { downloadToolOutputSchema, downloadToolSchema, myUploadsToolOutputSchema, myUploadsToolSchema, searchToolOutputSchema, searchToolSchema, torrentCommentsToolOutputSchema, torrentCommentsToolSchema, torrentInfoToolOutputSchema, torrentInfoToolSchema, userInfoToolOutputSchema, userInfoToolSchema, SEARCH_CATEGORY } from './schemas.js';
import { errorContent, textWithStructuredContent } from './tool-utils.js';

function validateSearchLikeArgs(args: { query?: string; category?: string; subcat?: string; page: number; perPage: number }) {
  if (args.subcat !== undefined && args.category !== SEARCH_CATEGORY.VIDEO) {
    return {
      message: 'subcat can only be set when category is 1 (video)',
      structuredContent: {
        ...(args.query !== undefined ? { query: args.query } : {}),
        page: args.page,
        perPage: args.perPage,
        resultCount: 0,
        results: [],
        error: 'subcat can only be set when category is 1 (video)',
      },
    };
  }

  if (args.subcat !== undefined && args.category === undefined) {
    return {
      message: 'subcat can only be set when category is specified',
      structuredContent: {
        ...(args.query !== undefined ? { query: args.query } : {}),
        page: args.page,
        perPage: args.perPage,
        resultCount: 0,
        results: [],
        error: 'subcat can only be set when category is specified',
      },
    };
  }

  return null;
}

export function registerTools(server: McpServer, client: C411Client): void {
  server.registerTool('search_c411', {
    description: 'Search for torrents on c411.org',
    inputSchema: searchToolSchema,
    outputSchema: searchToolOutputSchema,
  }, async (args) => {
    const validationError = validateSearchLikeArgs(args);
    if (validationError) {
      return errorContent(validationError.message, validationError.structuredContent);
    }
    try {
      const results = await client.search(args.query, args.sortBy, args.sortOrder, args.page, args.perPage, args.category, args.subcat);
      const text = results.results.length > 0
        ? results.results.map((item) => formatStructuredSearchResult(item)).join('\n')
        : 'No results found';

      return textWithStructuredContent(text, results);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      return errorContent(message, {
        query: args.query,
        page: args.page,
        perPage: args.perPage,
        resultCount: 0,
        results: [],
        error: message,
      });
    }
  });

  server.registerTool('download_c411_torrent', {
    description: 'Download a .torrent file from c411.org by its infoHash and save it to disk.',
    inputSchema: downloadToolSchema,
    outputSchema: downloadToolOutputSchema,
  }, async (args) => {
    const result = await client.downloadTorrent(args.infoHash, args.outputDir ?? '/tmp');
    return result.success
      ? textWithStructuredContent(result.savedPath || `Saved ${result.filename}`, {
        success: true,
        filename: result.filename || `${args.infoHash}.torrent`,
        savedPath: result.savedPath || `Saved ${result.filename}`,
      })
      : errorContent(result.error || 'Download failed', {
        success: false,
        ...(result.filename ? { filename: result.filename } : {}),
        ...(result.savedPath ? { savedPath: result.savedPath } : {}),
        error: result.error || 'Download failed',
      });
  });

  server.registerTool('get_c411_torrent_info', {
    description: 'Get detailed metadata for a c411.org torrent by its infoHash.',
    inputSchema: torrentInfoToolSchema,
    outputSchema: torrentInfoToolOutputSchema,
  }, async (args) => {
    try {
      const detail = await client.getTorrentInfo(args.infoHash);
      return textWithStructuredContent(formatStructuredTorrentDetail(detail), {
        success: true,
        ...detail,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Torrent lookup failed';
      return errorContent(message, {
        success: false,
        infoHash: args.infoHash,
        error: message,
      });
    }
  });

  server.registerTool('get_c411_torrent_comments', {
    description: 'Get comments for a c411.org torrent by its infoHash.',
    inputSchema: torrentCommentsToolSchema,
    outputSchema: torrentCommentsToolOutputSchema,
  }, async (args) => {
    try {
      const commentsPage = await client.getTorrentComments(args.infoHash, args.page, args.limit);
      return textWithStructuredContent(formatStructuredTorrentCommentsPage(commentsPage), commentsPage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Torrent comments lookup failed';
      return errorContent(message, {
        infoHash: args.infoHash,
        page: args.page,
        limit: args.limit,
        resultCount: 0,
        comments: [],
        error: message,
      });
    }
  });

  server.registerTool('get_c411_user_info', {
    description: 'Get the current authenticated user info from c411.org.',
    inputSchema: userInfoToolSchema,
    outputSchema: userInfoToolOutputSchema,
  }, async () => {
    try {
      const user = await client.getCurrentUser();
      return textWithStructuredContent(formatStructuredUserInfo(user), user);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'User info lookup failed';
      return errorContent(message, {
        error: message,
      });
    }
  });

  server.registerTool('list_my_c411_uploads', {
    description: 'List torrents uploaded by the current authenticated c411.org user.',
    inputSchema: myUploadsToolSchema,
    outputSchema: myUploadsToolOutputSchema,
  }, async (args) => {
    const validationError = validateSearchLikeArgs(args);
    if (validationError) {
      return errorContent(validationError.message, validationError.structuredContent);
    }

    try {
      const results = await client.getCurrentUserUploads(args.query, args.sortBy, args.sortOrder, args.page, args.perPage, args.category, args.subcat);
      const text = results.results.length > 0
        ? results.results.map((item) => formatStructuredSearchResult(item)).join('\n')
        : 'No uploads found';

      return textWithStructuredContent(text, results);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Uploaded torrents lookup failed';
      return errorContent(message, {
        ...(args.query !== undefined ? { query: args.query } : {}),
        page: args.page,
        perPage: args.perPage,
        resultCount: 0,
        results: [],
        error: message,
      });
    }
  });
}
