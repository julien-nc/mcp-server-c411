import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { C411Client } from './c411-client.js';
import { registerTools } from './register-tools.js';

async function main() {
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

  registerTools(
    server,
    new C411Client(process.env.C411_USERNAME, process.env.C411_PASSWORD)
  );

  await server.connect(new StdioServerTransport());
  console.error('c411 MCP server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
