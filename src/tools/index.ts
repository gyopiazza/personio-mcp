import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PersonioClient } from "../client.js";
import { registerJobTools } from "./jobs.js";
import { registerCandidateTools } from "./candidates.js";
import { registerApplicationTools } from "./applications.js";

export function registerAllTools(server: McpServer, client: PersonioClient): void {
  registerJobTools(server, client);
  registerCandidateTools(server, client);
  registerApplicationTools(server, client);
}
