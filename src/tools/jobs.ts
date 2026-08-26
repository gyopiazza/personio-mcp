import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PersonioClient } from "../client.js";
import { jsonContent, errorContent } from "./util.js";

export function registerJobTools(server: McpServer, client: PersonioClient): void {
  server.registerTool(
    "personio_list_jobs",
    {
      title: "List jobs",
      description:
        "List recruiting job positions (openings) for the company, sorted by last updated date, newest first. Supports cursor pagination.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum number of jobs to return per page."),
        cursor: z
          .string()
          .optional()
          .describe("Cursor from a previous call's pagination.next_cursor to fetch the next page."),
      }),
    },
    async ({ limit, cursor }) => {
      try {
        return jsonContent(await client.listJobs({ limit, cursor }));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_job",
    {
      title: "Get job",
      description: "Retrieve a single recruiting job position by its ID.",
      inputSchema: z.object({
        job_id: z.string().describe("The ID of the job position."),
      }),
    },
    async ({ job_id }) => {
      try {
        return jsonContent(await client.getJob(job_id));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_list_job_categories",
    {
      title: "List job categories",
      description: "List all job categories configured for recruiting.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonContent(await client.listCategories());
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_job_category",
    {
      title: "Get job category",
      description: "Retrieve a single job category by its ID.",
      inputSchema: z.object({
        category_id: z.string().describe("The ID of the job category."),
      }),
    },
    async ({ category_id }) => {
      try {
        return jsonContent(await client.getCategory(category_id));
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}
