import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { C411Client } from './c411-client.js';
import { formatStructuredSearchResult, formatStructuredTorrentCommentsPage, formatStructuredTorrentDetail } from './formatters.js';
import { downloadToolOutputSchema, downloadToolSchema, searchToolOutputSchema, searchToolSchema, torrentCommentsToolOutputSchema, torrentCommentsToolSchema, torrentInfoToolOutputSchema, torrentInfoToolSchema } from './schemas.js';
import { errorContent, textWithStructuredContent } from './tool-utils.js';

export function registerTools(server: McpServer, client: C411Client): void {
  server.registerTool('search_c411', {
    description: 'Search for torrents on c411.org',
    inputSchema: searchToolSchema,
    outputSchema: searchToolOutputSchema,
  }, async (args) => {
    try {
      const results = await client.search(args.query, args.sortBy, args.sortOrder, args.page, args.perPage);
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
}
