import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { C411Client } from './c411-client.js';
import { downloadToolSchema, searchToolSchema } from './schemas.js';
import { textContent } from './tool-utils.js';

export function registerTools(server: McpServer, client: C411Client): void {
  server.registerTool('search_c411', {
    description: 'Search for torrents on c411.org',
    inputSchema: searchToolSchema,
  }, async (args) => {
    const results = await client.search(args.query, args.sortBy, args.sortOrder, args.page, args.perPage);
    return textContent(results.join('\n'));
  });

  server.registerTool('download_c411_torrent', {
    description: 'Download a .torrent file from c411.org by its infoHash and save it to disk.',
    inputSchema: downloadToolSchema,
  }, async (args) => {
    const result = await client.downloadTorrent(args.infoHash, args.outputDir ?? '/tmp');
    return textContent(result.success ? result.savedPath || `Saved ${result.filename}` : `Error: ${result.error}`);
  });
}
