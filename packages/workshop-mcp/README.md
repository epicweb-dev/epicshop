# @epic-web/workshop-mcp

An MCP (Model Context Protocol) server intended for use inside Epic Workshop
repositories.

It’s designed to help learners while working through workshop exercises. In most
workshops, the learner’s work-in-progress lives in the `playground` directory.

## Install / run

You typically run this via `npx` from your AI assistant’s MCP configuration:

```bash
npx -y @epic-web/workshop-mcp
```

## Example configuration

### Claude Desktop / compatible clients

Add a server entry (shape varies slightly by client):

```json
{
	"mcpServers": {
		"epicshop": {
			"command": "npx",
			"args": ["-y", "@epic-web/workshop-mcp"]
		}
	}
}
```

## Notes

- The server communicates over **stdio**.
- If you’re using this inside a workshop repo, run your editor/assistant with
  the workshop as the working directory so the server can find the right files.
- Do not put unexpanded shell placeholders (like `$1` / `$2`) in MCP `args` or
  tool arguments. Clients that leave those literal will fail validation with a
  configuration guidance error.

## Documentation

- Repo docs: `https://github.com/epicweb-dev/epicshop/tree/main/docs`

## License

GPL-3.0-only.
