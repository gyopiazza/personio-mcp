import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PersonioClient } from "../client.js";
import { registerJobTools } from "./jobs.js";
import { registerCandidateTools } from "./candidates.js";
import { registerApplicationTools } from "./applications.js";
import { registerEmployeeTools } from "./employees.js";
import { registerAttendanceTools } from "./attendance.js";
import { registerProjectTools } from "./projects.js";
import { registerTimeOffTools } from "./timeoff.js";
import { registerDocumentTools } from "./documents.js";
import { registerReportTools } from "./reports.js";

export function registerAllTools(server: McpServer, client: PersonioClient): void {
  registerJobTools(server, client);
  registerCandidateTools(server, client);
  registerApplicationTools(server, client);
  registerEmployeeTools(server, client);
  registerAttendanceTools(server, client);
  registerProjectTools(server, client);
  registerTimeOffTools(server, client);
  registerDocumentTools(server, client);
  registerReportTools(server, client);
}
