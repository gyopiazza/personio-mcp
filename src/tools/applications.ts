import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PersonioClient } from "../client.js";
import { jsonContent, errorContent } from "./util.js";

const phaseSchema = z
  .object({
    type: z.enum(["system", "custom"]).describe("Kind of application phase."),
    id: z
      .union([z.string(), z.number()])
      .describe(
        "Phase ID. For 'custom', the numeric phase ID. For 'system', one of: unassigned, rejected, withdrawn, offer, accepted."
      ),
  })
  .optional();

export function registerApplicationTools(server: McpServer, client: PersonioClient): void {
  server.registerTool(
    "personio_list_applications",
    {
      title: "List applications",
      description:
        "List applications, sorted by last updated date, newest first. Filterable by update time range and candidate email. Note: custom attributes and tags are not returned by the Personio API. Supports cursor pagination.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().describe("Maximum number of applications per page."),
        cursor: z.string().optional().describe("Cursor for the next page from pagination.next_cursor."),
        updated_after: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("Only applications updated after this timestamp (ISO 8601). Mutually exclusive with updated_before."),
        updated_before: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("Only applications updated before this timestamp (ISO 8601). Mutually exclusive with updated_after."),
        candidate_email: z.string().email().optional().describe("Filter by candidate email address."),
      }),
    },
    async ({ limit, cursor, updated_after, updated_before, candidate_email }) => {
      try {
        return jsonContent(
          await client.listApplications({
            limit,
            cursor,
            updatedAfter: updated_after,
            updatedBefore: updated_before,
            candidateEmail: candidate_email,
          })
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_application",
    {
      title: "Get application",
      description: "Retrieve a single application by its ID.",
      inputSchema: z.object({
        application_id: z.string().describe("The ID of the application."),
      }),
    },
    async ({ application_id }) => {
      try {
        return jsonContent(await client.getApplication(application_id));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_list_application_stage_transitions",
    {
      title: "List application stage transitions",
      description:
        "List all pipeline stage transitions for an application, ordered latest-first. Useful to reconstruct an application's history.",
      inputSchema: z.object({
        application_id: z.string().describe("The ID of the application."),
      }),
    },
    async ({ application_id }) => {
      try {
        return jsonContent(await client.listStageTransitions(application_id));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_create_application",
    {
      title: "Create application",
      description:
        "Submit a new application to a published job position. Requires PERSONIO_RECRUITING_TOKEN and PERSONIO_COMPANY_ID environment variables. Rate limited by Personio to 20 requests per minute.",
      inputSchema: z.object({
        first_name: z.string().min(1).describe("Applicant's first name(s)."),
        last_name: z.string().min(1).describe("Applicant's last name(s)."),
        email: z.string().email().describe("Applicant's email address."),
        job_position_id: z
          .union([z.string(), z.number()])
          .transform((v) => Number(v))
          .pipe(z.number().int())
          .describe("The Personio job position ID the application belongs to. The position must be currently published."),
        recruiting_channel_id: z
          .union([z.string(), z.number()])
          .transform((v) => Number(v))
          .pipe(z.number().int())
          .optional()
          .describe("ID of the recruiting channel the application was sourced from."),
        message: z.string().optional().describe("Free-text message from the applicant."),
        application_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Application date in YYYY-MM-DD format. Must not be in the future."),
        phase: phaseSchema.describe("Initial phase for the application; defaults to the category's initial phase."),
        tags: z.array(z.string()).optional().describe("Tags to associate with the application. Non-existing tags are created."),
        attributes: z
          .array(
            z.object({
              id: z
                .string()
                .describe(
                  "Attribute API name. System attributes: birthday (YYYY-MM-DD), gender (male/female/diverse/undefined), location, phone, available_from, salary_expectations. Custom ones have the form custom_attribute_N."
                ),
              value: z.string(),
            })
          )
          .optional()
          .describe("Additional applicant attributes."),
      }),
    },
    async (args) => {
      try {
        await client.createApplication(args);
        return {
          content: [
            {
              type: "text" as const,
              text: "Application created successfully.",
            },
          ],
        };
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}
