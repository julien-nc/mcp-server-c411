import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { C411Client } from './c411-client.js';
import { formatStructuredSearchResult } from './formatters.js';
import { downloadToolOutputSchema, downloadToolSchema, searchToolOutputSchema, searchToolSchema } from './schemas.js';
import { errorContent, textContent, textWithStructuredContent } from './tool-utils.js';

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
      return errorContent(error instanceof Error ? error.message : 'Search failed');
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
        success: true as const,
        filename: result.filename || `${args.infoHash}.torrent`,
        savedPath: result.savedPath || `Saved ${result.filename}`,
      })
      : errorContent(result.error || 'Download failed');
  });
}
