# @weond/mcp-server

This is the MCP server for [Weond](https://weond.com). Plug it into Claude, Cursor, Windsurf or any other MCP client and you can ask your assistant to look at your projects, read build logs, ship a deploy or roll one back, without leaving the chat.

Full guide: https://docs.weond.com/mcp

## Setup

You need Node 20 or newer and a personal access token. Create one in Weond under Workspace Settings, Access Tokens.

Add this to your client's MCP config (Claude Desktop, Cursor and Windsurf all use the same shape):

```json
{
  "mcpServers": {
    "weond": {
      "command": "npx",
      "args": ["-y", "@weond/mcp-server"],
      "env": {
        "WEOND_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

Claude Code users can do it in one line:

```bash
claude mcp add weond --env WEOND_API_TOKEN=your-token-here -- npx -y @weond/mcp-server
```

`WEOND_API_URL` defaults to `https://api.weond.com`. Only override it if you run your own instance. Plain `http://` is accepted for localhost only.

## What it can do

| Tool | What it does |
| --- | --- |
| `weond_whoami` | Checks which account your token belongs to |
| `weond_list_workspaces` | Lists the workspaces you can reach |
| `weond_list_projects` | Projects in a workspace with recent deploys, env keys and domains |
| `weond_get_deployment_logs` | Build and runtime logs for a deployment |
| `weond_queue_deployment` | Starts a new deploy for a project and branch |
| `weond_redeploy` | Redeploys an existing deployment |
| `weond_rollback_deployment` | Rolls back to an earlier deployment |
| `weond_set_env_var` | Sets an encrypted env var for the environments you pick |
| `weond_delete_env_var` | Removes an env var |
| `weond_list_plugins` | Plugins connected to the workspace and where they are bound |
| `weond_bind_plugin` | Links a connected plugin (Supabase, Upstash Redis, Resend, Sentry) to projects |

## A few notes on safety

- The token only ever goes to the Weond API. Secret values are masked in tool output.
- Use a token scoped to one workspace if you can, and revoke it from Settings when you are done with it.
- Env vars are write-only by design. The server can set and delete them, not read them back.

## Development

```bash
git clone https://github.com/weondhq/mcp.git
cd mcp
npm test
```

## License

MIT
