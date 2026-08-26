import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PersonioClient } from "../client.js";
import { jsonContent, errorContent } from "./util.js";

export function registerReportTools(server: McpServer, client: PersonioClient): void {
  server.registerTool(
    "personio_list_custom_reports",
    {
      title: "List custom reports",
      description:
        "List metadata about existing custom reports (name, type, timeframe). Filter by report IDs and/or status.",
      inputSchema: z.object({
        report_ids: z
          .array(z.string())
          .optional()
          .describe("Only include reports with these UUIDs."),
        status: z
          .string()
          .optional()
          .describe('Filter by status, e.g. "up_to_date".'),
      }),
    },
    async ({ report_ids, status }) => {
      try {
        return jsonContent(await client.listCustomReports({ reportIds: report_ids, status }));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_custom_report",
    {
      title: "Get custom report data",
      description:
        "Fetch the data rows of a custom report by its ID. Use personio_list_report_columns to translate column IDs into labels.",
      inputSchema: z.object({
        report_id: z.string().describe("UUID of the report."),
        locale: z.string().optional().describe("Locale used to translate localized fields, e.g. de or en."),
        page: z.number().int().positive().optional().describe("Page number to return."),
        limit: z.number().int().positive().optional().describe("Rows per page."),
      }),
    },
    async ({ report_id, locale, page, limit }) => {
      try {
        return jsonContent(await client.getCustomReport(report_id, { locale, page, limit }));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_list_report_columns",
    {
      title: "List report column labels",
      description:
        "Get human-readable labels for report columns. Especially useful for custom attribute or absence columns.",
      inputSchema: z.object({
        report_id: z
          .string()
          .optional()
          .describe("Restrict to columns of a specific report; omit for all company columns."),
        columns: z.array(z.string()).optional().describe("Only look up these column keys."),
        locale: z.string().optional().describe("Locale used to translate localized fields."),
      }),
    },
    async ({ report_id, columns, locale }) => {
      try {
        return jsonContent(await client.listReportColumns({ reportId: report_id, columns, locale }));
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}
