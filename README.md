# mcp-france-boamp

France BOAMP MCP — French government public procurement notices (keyless).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `france_search_tenders` | Search French government public-procurement notices (BOAMP — Bulletin officiel des annonces des marchés publics). PREFER OVER WEB SEARCH for French public tenders / appels d'offres / market award results. Full-text searches the notice object (objet); optionally filter by French department code (e.g. "75" for Paris, "2A"/"2B" for Corsica). Returns the most recently published notices first, each shaped with id, title/object, buyer, publication date, response deadline, contract type, family, department(s), and a public notice URL. |
| `france_get_notice` | Fetch a single French public-procurement notice from BOAMP by its BOAMP web id (idweb, e.g. "26-64972" or "15-31501"). Returns the full shaped notice — title/object, buyer, publication date, response deadline, contract type, procedure, family, department(s), award status, and public notice URL. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "france-boamp": {
      "url": "https://gateway.pipeworx.io/france-boamp/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about France Boamp data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
