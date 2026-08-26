# personio-mcp

MCP server exposing Personio's **Recruiting** APIs as tools: jobs, job categories,
candidates, applications, stage transitions, plus application submission.

## Personio API background

Personio splits recruiting across two API versions:

| Version | Auth | Endpoints |
| --- | --- | --- |
| v2 | OAuth2 client credentials (`personio:recruiting:read`) | GET jobs, categories, candidates, applications, stage transitions |
| v1 | Static recruiting token + `X-Company-ID` header | POST applications |

Base URL: `https://api.personio.de`

## Credentials

1. **OAuth2 client** — in Personio: Marketplace > Connected integrations > *Create custom
   integration* (requires Core Pro plan), enable the `personio:recruiting:read` scope.
   Gives you `client_id` / `client_secret`.
2. **Recruiting token + company ID** (only needed for creating applications) — found under
   Settings > Integrations > API Credentials (recruiting API access token). The company ID is
   visible at `https://{YOUR_COMPANY}.personio.de/configuration/api/credentials/management`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PERSONIO_CLIENT_ID` | yes | OAuth2 client ID |
| `PERSONIO_CLIENT_SECRET` | yes | OAuth2 client secret |
| `PERSONIO_RECRUITING_TOKEN` | for create_application | Static v1 recruiting API token |
| `PERSONIO_COMPANY_ID` | for create_application | Personio company ID |
| `PERSONIO_API_BASE_URL` | no | Override base URL (default `https://api.personio.de`) |

## Usage

```sh
npm install
npm run build
PERSONIO_CLIENT_ID=... PERSONIO_CLIENT_SECRET=... node dist/index.js
```

### Client config (e.g. Claude Desktop / opencode)

```json
{
  "mcpServers": {
    "personio": {
      "command": "node",
      "args": ["/path/to/personio-mcp/dist/index.js"],
      "env": {
        "PERSONIO_CLIENT_ID": "...",
        "PERSONIO_CLIENT_SECRET": "..."
      }
    }
  }
}
```

### ChatGPT desktop app

The new ChatGPT desktop app supports local **STDIO** MCP servers and shares its
MCP configuration with Codex CLI and the IDE extension (stored in
`~/.codex/config.toml`). Build the server first (`npm install && npm run build`), then:

**Option A — via `config.toml` (recommended, since it lets you set env vars)**

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.personio]
command = "node"
args = ["/path/to/personio-mcp/dist/index.js"]

[mcp_servers.personio.env]
PERSONIO_CLIENT_ID = "..."
PERSONIO_CLIENT_SECRET = "..."
# Only needed for personio_create_application:
# PERSONIO_RECRUITING_TOKEN = "..."
# PERSONIO_COMPANY_ID = "..."
```

Then restart ChatGPT. Type `/mcp` in the composer to verify the server connected.

**Option B — via the UI**

1. Open **Settings**, then select **MCP servers**.
2. Select **Add server**.
3. Enter a name (e.g. `personio`), choose **STDIO**, and set the command to
   `node /path/to/personio-mcp/dist/index.js`.
4. Save, then select **Restart**.

Note: if you go through the UI, set `PERSONIO_CLIENT_ID` / `PERSONIO_CLIENT_SECRET`
in your shell environment so the server can read them at startup — or prefer
Option A, which keeps credentials scoped to the server entry.

## Tools

- `personio_health_check` — verifies credentials work
- `personio_list_jobs`, `personio_get_job`
- `personio_list_job_categories`, `personio_get_job_category`
- `personio_list_candidates`, `personio_get_candidate`
- `personio_list_applications`, `personio_get_application`, `personio_list_application_stage_transitions`
- `personio_create_application` — submits an application (v1); requires the extra env vars above

Notes from the Personio API:

- List endpoints are cursor-paginated; tools return `pagination.next_cursor`.
- Candidates/applications don't expose custom attributes or tags via v2.
- Application creation only works for currently published positions and is rate limited
  to ~20 requests/min.
