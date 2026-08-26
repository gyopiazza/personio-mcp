# personio-mcp

> **Note:** This is a beta product and is not affiliated with Personio in any way.

MCP server exposing Personio's public APIs as tools:

- **Recruiting** (v2): jobs, job categories, candidates, applications, stage transitions
- **Employees** (v1): list/get/create/update employees, absence balances, attribute catalog,
  profile pictures
- **Time tracking** (v2): attendance periods and projects (CRUD)
- **Absences** (v1): time-off types, day-based time-offs, hour-based absence periods
- **Documents** (v1): document categories, document uploads
- **Custom reports** (v1): report metadata, report data, column labels

The v1 attendance/project endpoints are deprecated by Personio (sunset 2027-01-31), so this
server uses their v2 successors (`/v2/attendance-periods`, `/v2/projects`). All other personnel
endpoints follow the official v1 Personnel Data API.

Base URL: `https://api.personio.de`

## Credentials

1. **OAuth2 client** — in Personio: Marketplace > Connected integrations > *Create custom
   integration* (requires Core Pro plan). Gives you `client_id` / `client_secret`. Enable the
   scopes/API resources you need:
   - Recruiting: `personio:recruiting:read` (+ write for some flows)
   - Personnel data: employee read/write, absence read/write, attendance read/write,
     project read/write, document read/write, custom report read
   Note the integration's **company ID** — it is required for all personnel-data endpoints.
2. **Recruiting token** (only needed for `personio_create_application`) — static token under
   Settings > Integrations > API Credentials. The company ID is visible at
   `https://{YOUR_COMPANY}.personio.de/configuration/api/credentials/management`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PERSONIO_CLIENT_ID` | yes | OAuth2 client ID |
| `PERSONIO_CLIENT_SECRET` | yes | OAuth2 client secret |
| `PERSONIO_COMPANY_ID` | recommended | Company ID; sent as `X-Company-ID` on all v1 personnel-data requests |
| `PERSONIO_RECRUITING_TOKEN` | for create_application | Static v1 recruiting API token |
| `PERSONIO_API_BASE_URL` | no | Override base URL (default `https://api.personio.de`) |

## Usage

```sh
npm install
npm run build
PERSONIO_CLIENT_ID=... PERSONIO_CLIENT_SECRET=... PERSONIO_COMPANY_ID=... node dist/index.js
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
        "PERSONIO_CLIENT_SECRET": "...",
        "PERSONIO_COMPANY_ID": "..."
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
PERSONIO_COMPANY_ID = "..."
# Only needed for personio_create_application:
# PERSONIO_RECRUITING_TOKEN = "..."
```

Then restart ChatGPT. Type `/mcp` in the composer to verify the server connected.

**Option B — via the UI**

1. Open **Settings**, then select **MCP servers**.
2. Select **Add server**.
3. Enter a name (e.g. `personio`), choose **STDIO**, and set the command to
   `node /path/to/personio-mcp/dist/index.js`.
4. Save, then select **Restart**.

Note: if you go through the UI, set the credentials in your shell environment so the server
can read them at startup — or prefer Option A, which keeps credentials scoped to the server entry.

## Tools

Health & recruiting:

- `personio_health_check` — verifies credentials work
- `personio_list_jobs`, `personio_get_job`
- `personio_list_job_categories`, `personio_get_job_category`
- `personio_list_candidates`, `personio_get_candidate`
- `personio_list_applications`, `personio_get_application`, `personio_list_application_stage_transitions`
- `personio_create_application` — submits an application (v1); requires the extra env vars above

Employees:

- `personio_list_employees` — offset-paginated; filter by email / updated_since / attributes[]
- `personio_get_employee`, `personio_create_employee`, `personio_update_employee`
- `personio_get_employee_absence_balance`
- `personio_list_employee_attributes` — attribute catalog incl. custom (dynamic) fields
- `personio_get_profile_picture` — returns image content; optional width

Time tracking:

- `personio_list_attendance_periods` — cursor-paginated; rich filters (person, project, dates, status)
- `personio_get_attendance_period`, `personio_create_attendance_period`,
  `personio_update_attendance_period`, `personio_delete_attendance_period`
- `personio_list_projects`, `personio_get_project`, `personio_create_project`,
  `personio_update_project`, `personio_delete_project`

Absences:

- `personio_list_time_off_types` — includes unit (day/hour) and approval requirements
- `personio_list_time_offs`, `personio_create_time_off`, `personio_get_time_off`, `personio_delete_time_off` — day-based absences
- `personio_list_absence_periods`, `personio_create_absence_period`, `personio_delete_absence_period` — hour-based absences

Documents:

- `personio_list_document_categories`
- `personio_upload_document` — multipart upload; pass text or base64 content (max 30MB)

Custom reports:

- `personio_list_custom_reports`, `personio_get_custom_report`, `personio_list_report_columns`

Notes from the Personio API:

- v2 endpoints (recruiting, attendance periods, projects) are cursor-paginated;
  tools return `pagination.next_cursor`.
- v1 personnel endpoints are offset-paginated; tools return
  `pagination.total_elements` / `pagination.next_offset`.
- Employees/applications don't expose custom attributes or tags via v2.
- Employee emails cannot be changed after creation.
- Application creation only works for currently published positions and is rate limited
  to ~100 applications/min per IP.
- Document uploads are limited to ~60 requests/min.
