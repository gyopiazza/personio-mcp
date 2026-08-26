import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PersonioClient } from "../client.js";
import { jsonContent, errorContent } from "./util.js";

export function registerCandidateTools(server: McpServer, client: PersonioClient): void {
  server.registerTool(
    "personio_list_candidates",
    {
      title: "List candidates",
      description:
        "List candidates (applicants), sorted by last updated date, newest first. Note: custom attributes and tags are not returned by the Personio API. Supports cursor pagination.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum number of candidates to return per page."),
        cursor: z
          .string()
          .optional()
          .describe("Cursor from a previous call's pagination.next_cursor to fetch the next page."),
      }),
    },
    async ({ limit, cursor }) => {
      try {
        return jsonContent(await client.listCandidates({ limit, cursor }));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_candidate",
    {
      title: "Get candidate",
      description: "Retrieve a single candidate by their ID.",
      inputSchema: z.object({
        candidate_id: z.string().describe("The ID of the candidate."),
      }),
    },
    async ({ candidate_id }) => {
      try {
        return jsonContent(await client.getCandidate(candidate_id));
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}
