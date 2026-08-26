import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PersonioClient } from "../client.js";
import { jsonContent, errorContent } from "./util.js";

const projectDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('Date in "yyyy-mm-dd" format.');

const includeField = z
  .array(
    z.enum([
      "tracked_minutes",
      "sub_projects_tracked_minutes",
      "sub_projects_count",
      "tracked_periods_count",
    ])
  )
  .optional()
  .describe("Additional stats to include in the response (off by default for performance).");

const topLevelOnlyFields = {
  cost_center_id: z.string().optional().nullable(),
  assigned_to_all: z
    .boolean()
    .optional()
    .describe("Assign the project to all employees. Not allowed on sub projects."),
  billable: z.boolean().optional().describe("Mark the project as billable. Not allowed on sub projects."),
  client_name: z.string().max(255).optional().nullable().describe("Client name. Not allowed on sub projects."),
  project_type: z
    .string()
    .max(255)
    .optional()
    .nullable()
    .describe("Free-text project type, e.g. External. Not allowed on sub projects."),
};

function topLevelFieldsToPayload(input: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const mapping: Array<[string, string]> = [
    ["cost_center_id", "cost_center"],
    ["assigned_to_all", "assigned_to_all"],
    ["billable", "billable"],
    ["client_name", "client_name"],
    ["project_type", "project_type"],
  ];
  for (const [inputKey, payloadKey] of mapping) {
    if (Object.prototype.hasOwnProperty.call(input, inputKey)) {
      const value = input[inputKey];
      payload[payloadKey] =
        payloadKey === "cost_center" && value !== null && value !== undefined
          ? { id: value }
          : value;
    }
  }
  return payload;
}

export function registerProjectTools(server: McpServer, client: PersonioClient): void {
  server.registerTool(
    "personio_list_projects",
    {
      title: "List projects",
      description:
        "List attendance projects. Cursor-paginated; filterable by id/name/code/parent/status.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().describe("Max projects per page (default 200)."),
        cursor: z.string().optional().describe("Cursor from a previous call's pagination.next_cursor."),
        ids: z.array(z.union([z.string(), z.number()])).optional().describe("Filter by project ID(s)."),
        names: z.array(z.string()).optional().describe("Filter by exact project name(s)."),
        project_codes: z.array(z.string()).optional().describe("Filter by project code(s)."),
        parent_project_ids: z
          .array(z.union([z.string(), z.number()]))
          .optional()
          .describe("Filter by parent project ID(s)."),
        status: z.enum(["ACTIVE", "ARCHIVED"]).optional().describe("Filter by status."),
        top_level_only: z
          .boolean()
          .optional()
          .describe("Only return projects without a parent project."),
        include: includeField,
      }),
    },
    async ({ limit, cursor, ids, names, project_codes, parent_project_ids, status, top_level_only, include }) => {
      try {
        return jsonContent(
          await client.listProjects({
            limit,
            cursor,
            ids: ids?.map(String),
            names,
            project_codes,
            parent_project_ids: parent_project_ids?.map(String),
            status,
            top_level_only,
            include,
          })
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_project",
    {
      title: "Get project",
      description: "Retrieve a single attendance project by ID.",
      inputSchema: z.object({
        project_id: z.union([z.string(), z.number()]).describe("ID of the project."),
        include: includeField,
      }),
    },
    async ({ project_id, include }) => {
      try {
        return jsonContent(await client.getProject(String(project_id), include));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_create_project",
    {
      title: "Create project",
      description:
        "Create an attendance project. Name and status are required. Sub projects (parent_project set) cannot have cost_center, assigned_to_all, billable, client_name or project_type.",
      inputSchema: z.object({
        name: z.string().min(1).max(255).describe("Unique name of the project."),
        status: z.enum(["ACTIVE", "ARCHIVED"]).describe("Status of the project."),
        project_code: z
          .string()
          .optional()
          .nullable()
          .describe("Optional unique reference code, e.g. PRJ-1234."),
        description: z.string().max(1000).optional().describe("Optional description."),
        parent_project_id: z
          .union([z.string(), z.number()])
          .optional()
          .nullable()
          .describe("Parent project ID to make this a sub project (max one nesting level)."),
        start_date: projectDate.optional().nullable().describe("Optional inclusive start date."),
        end_date: projectDate.optional().nullable().describe("Optional exclusive end date."),
        ...topLevelOnlyFields,
      }),
    },
    async (input) => {
      try {
        const { name, status, project_code, description, parent_project_id, start_date, end_date, ...rest } =
          input;
        return jsonContent(
          await client.createProject({
            name,
            status,
            ...(project_code !== undefined ? { project_code } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(Object.prototype.hasOwnProperty.call(input, "parent_project_id")
              ? { parent_project: parent_project_id ? { id: String(parent_project_id) } : null }
              : {}),
            ...(start_date !== undefined ? { start: { date: start_date } } : {}),
            ...(end_date !== undefined ? { end: { date: end_date } } : {}),
            ...topLevelFieldsToPayload(rest),
          })
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_update_project",
    {
      title: "Update project",
      description: "Update an existing attendance project. Only provided fields are changed.",
      inputSchema: z.object({
        project_id: z.union([z.string(), z.number()]).describe("ID of the project to update."),
        name: z.string().min(1).max(255).optional(),
        status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
        project_code: z.string().optional().nullable(),
        description: z.string().max(1000).optional().nullable(),
        start_date: projectDate.optional().nullable(),
        end_date: projectDate.optional().nullable(),
        ...topLevelOnlyFields,
      }),
    },
    async (input) => {
      try {
        const { project_id, name, status, project_code, description, start_date, end_date, ...rest } = input;
        const payload: Record<string, unknown> = {};
        if (name !== undefined) payload.name = name;
        if (status !== undefined) payload.status = status;
        if (project_code !== undefined) payload.project_code = project_code;
        if (description !== undefined) payload.description = description;
        if (start_date !== undefined) payload.start = { date: start_date };
        if (end_date !== undefined) payload.end = { date: end_date };
        Object.assign(payload, topLevelFieldsToPayload(rest));
        return jsonContent(await client.updateProject(String(project_id), payload));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_delete_project",
    {
      title: "Delete project",
      description: "Permanently delete an attendance project by ID.",
      inputSchema: z.object({
        project_id: z.union([z.string(), z.number()]).describe("ID of the project to delete."),
      }),
    },
    async ({ project_id }) => {
      try {
        return jsonContent(await client.deleteProject(String(project_id)));
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}
