import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PersonioClient } from "../client.js";
import { jsonContent, errorContent } from "./util.js";

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "Expected format yyyy-mm-ddThh:mm:ss (no timezone).")
  .describe('Local date-time without timezone offset, e.g. "2024-06-07T08:00:00".');

export function registerAttendanceTools(server: McpServer, client: PersonioClient): void {
  server.registerTool(
    "personio_list_attendance_periods",
    {
      title: "List attendance periods",
      description:
        "List work/break attendance periods. Cursor-paginated. Filterable by person(s), project(s), date ranges, approval status; sortable.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional().describe("Max periods per page (default 100)."),
        cursor: z.string().optional().describe("Cursor from a previous call's pagination.next_cursor."),
        person_ids: z.array(z.string()).optional().describe("Filter by person/employee ID(s)."),
        project_ids: z.array(z.string()).optional().describe("Filter by project ID(s)."),
        ids: z.array(z.string()).optional().describe("Filter by specific attendance period ID(s)."),
        status: z
          .enum(["PENDING", "CONFIRMED", "REJECTED"])
          .optional()
          .describe("Filter by approval status."),
        start_from: localDateTime.optional().describe("Periods starting at or after this date-time."),
        start_to: localDateTime.optional().describe("Periods starting at or before this date-time."),
        end_from: localDateTime.optional().describe("Periods ending at or after this date-time."),
        end_to: localDateTime.optional().describe("Periods ending at or before this date-time."),
        updated_from: z
          .string()
          .optional()
          .describe('Only periods updated at or after this UTC instant (e.g. "2024-06-07T00:00:00Z").'),
        updated_to: z
          .string()
          .optional()
          .describe('Only periods updated at or before this UTC instant (e.g. "2024-06-08T00:00:00Z").'),
        attribution_date_from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Attribution date at or after (yyyy-mm-dd)."),
        attribution_date_to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Attribution date at or before (yyyy-mm-dd)."),
        sort: z
          .string()
          .optional()
          .describe(
            "Comma-separated sort fields, prefix with '-' for descending. Allowed: person.id, start.date_time, end.date_time, updated_at, status."
          ),
      }),
    },
    async ({
      limit,
      cursor,
      person_ids,
      project_ids,
      ids,
      status,
      start_from,
      start_to,
      end_from,
      end_to,
      updated_from,
      updated_to,
      attribution_date_from,
      attribution_date_to,
      sort,
    }) => {
      try {
        return jsonContent(
          await client.listAttendancePeriods({
            limit,
            cursor,
            person_ids,
            project_ids,
            ids,
            status,
            start_from,
            start_to,
            end_from,
            end_to,
            updated_from,
            updated_to,
            attribution_date_from,
            attribution_date_to,
            sort,
          })
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_attendance_period",
    {
      title: "Get attendance period",
      description: "Retrieve a single attendance period by its UUID.",
      inputSchema: z.object({
        period_id: z.string().describe("UUID of the attendance period."),
      }),
    },
    async ({ period_id }) => {
      try {
        return jsonContent(await client.getAttendancePeriod(period_id));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  const writeFields = {
    person_id: z.string().describe("Person/employee ID the period belongs to."),
    type: z.enum(["WORK", "BREAK"]).describe("Whether this is a work or break period."),
    start_date_time: localDateTime.describe("When the period starts."),
    end_date_time: localDateTime
      .nullish()
      .describe("When the period ends. Omit/null for an open-ended period."),
    comment: z.string().max(1000).optional().describe("Optional comment (max 1000 chars)."),
    project_id: z
      .string()
      .optional()
      .describe(
        "Project ID to associate (project must be ACTIVE; not allowed for BREAK periods)."
      ),
  };

  server.registerTool(
    "personio_create_attendance_period",
    {
      title: "Create attendance period",
      description:
        "Create a work or break attendance period. Max 24h per period; breaks cannot have a project.",
      inputSchema: z.object({
        ...writeFields,
        skip_approval: z
          .boolean()
          .optional()
          .describe("If true, skip any approval flow that would otherwise be triggered."),
      }),
    },
    async ({ skip_approval, ...input }) => {
      try {
        return jsonContent(
          await client.createAttendancePeriod(
            {
              person: { id: input.person_id },
              type: input.type,
              start: { date_time: input.start_date_time },
              ...(input.end_date_time !== undefined
                ? { end: { date_time: input.end_date_time } }
                : {}),
              ...(input.comment !== undefined ? { comment: input.comment } : {}),
              ...(input.project_id ? { project: { id: input.project_id } } : {}),
            },
            skip_approval
          )
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_update_attendance_period",
    {
      title: "Update attendance period",
      description:
        "Update an existing attendance period's times, comment and/or project. Only provided fields are changed; the employee cannot be changed.",
      inputSchema: z.object({
        period_id: z.string().describe("UUID of the attendance period to update."),
        start_date_time: localDateTime.optional(),
        end_date_time: localDateTime.nullish(),
        comment: z.string().max(1000).nullish(),
        project_id: z.string().nullish(),
        skip_approval: z.boolean().optional(),
      }),
    },
    async ({ period_id, skip_approval, ...input }) => {
      try {
        const payload: Record<string, unknown> = {};
        if (input.start_date_time !== undefined) payload.start = { date_time: input.start_date_time };
        if (input.end_date_time !== undefined) payload.end = { date_time: input.end_date_time };
        if (input.comment !== undefined) payload.comment = input.comment;
        if (Object.prototype.hasOwnProperty.call(input, "project_id")) {
          payload.project = input.project_id ? { id: input.project_id } : null;
        }
        return jsonContent(await client.updateAttendancePeriod(period_id, payload, skip_approval));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_delete_attendance_period",
    {
      title: "Delete attendance period",
      description: "Permanently delete an attendance period by its UUID.",
      inputSchema: z.object({
        period_id: z.string().describe("UUID of the attendance period to delete."),
      }),
    },
    async ({ period_id }) => {
      try {
        return jsonContent(await client.deleteAttendancePeriod(period_id));
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}
