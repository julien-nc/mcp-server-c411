# C411 MCP Server

An MCP (Model Context Protocol) server for searching torrents on c411.org and downloading `.torrent` files.

## Features

- Search torrents on c411.org
- Download `.torrent` files by `infoHash`
- Reuse authenticated sessions automatically
- Retry expired auth with a small delay and bounded retry count
- Distinguish missing credentials, invalid credentials, and maintenance-mode failures
- Return structured search results with titles, sizes, seed counts, and `infoHash` when available

## Installation

```bash
npm install
```

## Usage

### Running the server

The server uses stdio transport by default:

```bash
npm run dev
```

Or build and run:

```bash
npm run build
npm start
```

### Authentication

C411.org requires authentication to access torrent listings. To enable login:

1. Set the following environment variables:
   - `C411_USERNAME`: Your c411.org username
   - `C411_PASSWORD`: Your c411.org password

2. The server will automatically log in and maintain the session.

Without credentials, the server may not be able to retrieve search results.

### Auth failure behavior

The server tries to return a more specific error when authentication fails:

- Missing credentials: asks for `C411_USERNAME` and `C411_PASSWORD`
- Invalid credentials: reports that the username/password were rejected
- Maintenance mode: reports that c411.org is temporarily unavailable
- Network or timeout issues: returns a sanitized transport error without logging credentials

HTTP requests time out after 10 seconds.

### MCP Client Configuration

To use this server with an MCP client (like Claude Desktop), add to your client configuration:

```json
{
  "mcpServers": {
    "c411": {
      "command": "node",
      "args": ["/path/to/c411-mcp-server/build/index.js"],
      "env": {
        "C411_USERNAME": "your_username",
        "C411_PASSWORD": "your_password"
      }
    }
  }
}
```

## Tools

### search_c411

Search for torrents on c411.org.

**Parameters:**
- `query` (string, required): Search query
- `sortBy` (string, optional): Sort criteria. One of `relevance`, `seeders`, `leechers`, `size`, `createdAd`, `name`, `completions`, `comments`, `category`. Defaults to `relevance`.
- `sortOrder` (string, optional): Sort order. One of `asc`, `desc`. Defaults to `desc`.
- `page` (number, optional): Result page number. Defaults to `1`.
- `perPage` (number, optional): Number of results per page. Defaults to `25`.

**Returns:** List of torrent results with titles, sizes, seed counts, and `infoHash` when available.

### download_c411_torrent

Download a .torrent file from c411.org and save it to disk.

**Parameters:**
- `infoHash` (string, required): The 40-character hex infoHash of the torrent
- `outputDir` (string, optional): Directory where the `.torrent` file should be saved. Defaults to `/tmp`.

**Returns:** The full path of the saved `.torrent` file.

**Example:**
```
infoHash: "178a3516f248e45f9857abbc2cbc8a8b20f29815"
outputDir: "/tmp"
```

## Project structure

- `src/index.ts`: bootstrap only; creates the MCP server and starts stdio
- `src/c411-client.ts`: c411 auth, retries, search, and download logic
- `src/register-tools.ts`: MCP tool registration
- `src/formatters.ts`: search result formatting helpers
- `src/response-utils.ts`: response parsing and maintenance detection helpers
- `src/http-client.ts`: isolated Axios + cookie-jar setup
- `src/schemas.ts`: Zod tool schemas
- `src/types.ts`: shared TypeScript types

## Development

- `npm run dev`: Run in development mode with hot reload
- `npm run build`: Compile TypeScript to JavaScript
- `npm start`: Run the compiled server

## Notes

- This server is for personal use only
- Respect c411.org's terms of service
- Keep your credentials secure
- The scraper may need updates if the website structure changes
