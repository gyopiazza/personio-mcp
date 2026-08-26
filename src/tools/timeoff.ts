import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PersonioClient } from "../client.js";
import { jsonContent, errorContent } from "./util.js";

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('Date in "yyyy-mm-dd" format.');

const listFilterShape = {
  start_date: dateField.optional().describe("Only absences intersecting from this date (inclusive)."),
  end_date: dateField.optional().describe("Only absences intersecting until this date (inclusive)."),
  updated_from: z
    .string()
    .optional()
    .describe("Only absences created/modified on or after this date."),
  updated_to: z.string().optional().describe("Only absences created/modified until this date."),
  employee_ids: z.array(z.union([z.string(), z.number()])).optional().describe("Filter by employee ID(s)."),
  limit: z.number().int().min(1).max(200).optional().describe("Records per page (default 200)."),
  offset: z.number().int().min(0).optional().describe("Offset of the first record to return."),
};

export function registerTimeOffTools(server: McpServer, client: PersonioClient): void {
  server.registerTool(
    "personio_list_time_off_types",
    {
      title: "List time-off types",
      description:
        "List configured absence types ('Paid vacation', 'Home office', ...), including their unit (day/hour), category and whether approval is required.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    },
    async ({ limit, offset }) => {
      try {
        return jsonContent(await client.listTimeOffTypes({ limit, offset }));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_list_time_offs",
    {
      title: "List time-offs (day-based)",
      description:
        "List absence periods for absence types tracked in days. Offset-paginated; filterable by date range and employees.",
      inputSchema: z.object(listFilterShape),
    },
    async ({ start_date, end_date, updated_from, updated_to, employee_ids, limit, offset }) => {
      try {
        return jsonContent(
          await client.listTimeOffs({
            start_date,
            end_date,
            updated_from,
            updated_to,
            employee_ids: employee_ids?.map((id) => Number(id)),
            limit,
            offset,
          })
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  const createTimeOffShape = {
    employee_id: z.number().int().positive().describe("Employee ID the absence is created for."),
    time_off_type_id: z
      .number()
      .int()
      .positive()
      .describe("ID of a day-based time-off type (see personio_list_time_off_types)."),
    half_day_start: z.boolean().optional().describe("Whether the start date is a half-day off."),
    half_day_end: z.boolean().optional().describe("Whether the end date is a half-day off."),
    comment: z.string().optional().describe("Optional comment."),
    skip_approval: z
      .boolean()
      .optional()
      .describe("Default true. If false, the approval flow for the type is triggered."),
  };

  server.registerTool(
    "personio_create_time_off",
    {
      title: "Create time-off (day-based)",
      description: 'Create an absence period for a day-based absence type, e.g. vacation.',
      inputSchema: z.object({
        ...createTimeOffShape,
        start_date: dateField.describe("First day of the absence."),
        end_date: dateField.describe("Last day of the absence."),
      }),
    },
    async ({ employee_id, time_off_type_id, start_date, end_date, half_day_start, half_day_end, comment, skip_approval }) => {
      try {
        return jsonContent(
          await client.createTimeOff({
            employee_id,
            time_off_type_id,
            start_date,
            end_date,
            half_day_start,
            half_day_end,
            comment,
            skip_approval,
          })
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_time_off",
    {
      title: "Get time-off (day-based)",
      description: "Retrieve a single day-based absence period by ID.",
      inputSchema: z.object({
        time_off_id: z.union([z.string(), z.number()]).describe("ID of the absence period."),
      }),
    },
    async ({ time_off_id }) => {
      try {
        return jsonContent(await client.getTimeOff(String(time_off_id)));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_delete_time_off",
    {
      title: "Delete time-off (day-based)",
      description: "Permanently delete a day-based absence period by ID.",
      inputSchema: z.object({
        time_off_id: z.union([z.string(), z.number()]).describe("ID of the absence period to delete."),
      }),
    },
    async ({ time_off_id }) => {
      try {
        return jsonContent(await client.deleteTimeOff(String(time_off_id)));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_list_absence_periods",
    {
      title: "List absence periods (hour-based)",
      description:
        "List absence periods for absence types tracked in hours. Offset-paginated; filterable by date range, employees and types.",
      inputSchema: z.object({
        ...listFilterShape,
        absence_type_ids: z
          .array(z.union([z.string(), z.number()]))
          .optional()
          .describe("Filter by hour-based absence type ID(s)."),
        absence_period_ids: z
          .array(z.string())
          .optional()
          .describe("Filter by specific absence period UUID(s)."),
      }),
    },
    async ({
      start_date,
      end_date,
      updated_from,
      updated_to,
      employee_ids,
      absence_type_ids,
      absence_period_ids,
      limit,
      offset,
    }) => {
      try {
        return jsonContent(
          await client.listAbsencePeriods({
            start_date,
            end_date,
            updated_from,
            updated_to,
            employee_ids: employee_ids?.map((id) => Number(id)),
            absence_type_ids: absence_type_ids?.map((id) => Number(id)),
            absence_period_ids,
            limit,
            offset,
          })
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_create_absence_period",
    {
      title: "Create absence period (hour-based)",
      description:
        "Create an hourly absence period (e.g. home office hours). For single partial days provide start_time/end_time (HH:mm). Not supported for types requiring certificates.",
      inputSchema: z.object({
        employee_id: z.number().int().positive().describe("Employee ID the absence is created for."),
        time_off_type_id: z
          .number()
          .int()
          .positive()
          .describe("ID of an hour-based time-off type (see personio_list_time_off_types)."),
        start_date: dateField.describe("Absence start date."),
        end_date: dateField.describe("Absence end date."),
        start_time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional()
          .describe("Start time HH:mm; required only for same-day partial absences."),
        end_time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional()
          .describe("End time HH:mm; required only for same-day partial absences."),
        half_day_start: z.boolean().optional().describe("Half-day off at the start (multi-day absences only)."),
        half_day_end: z.boolean().optional().describe("Half-day off at the end (multi-day absences only)."),
        comment: z.string().optional().describe("Optional comment."),
        skip_approval: z.boolean().optional().describe("Default true. If false, triggers the approval flow."),
      }),
    },
    async (input) => {
      try {
        const { employee_id, time_off_type_id, start_date, end_date, ...optional } = input;
        return jsonContent(
          await client.createAbsencePeriod({
            employee_id,
            time_off_type_id,
            start_date,
            end_date,
            start_time: optional.start_time,
            end_time: optional.end_time,
            half_day_start: optional.half_day_start,
            half_day_end: optional.half_day_end,
            comment: optional.comment,
            skip_approval: optional.skip_approval,
          })
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_delete_absence_period",
    {
      title: "Delete absence period (hour-based)",
      description: "Permanently delete an hour-based absence period by ID.",
      inputSchema: z.object({
        absence_period_id: z.string().describe("UUID of the absence period to delete."),
      }),
    },
    async ({ absence_period_id }) => {
      try {
        return jsonContent(await client.deleteAbsencePeriod(absence_period_id));
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}
