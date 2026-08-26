import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PersonioClient, EmployeePayload } from "../client.js";
import { jsonContent, errorContent, imageContent } from "./util.js";

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected format yyyy-mm-dd")
  .describe('Date in "yyyy-mm-dd" format.');

const employeeFields = {
  first_name: z.string().optional().describe("Employee first name."),
  last_name: z.string().optional().describe("Employee last name."),
  preferred_name: z.string().optional().describe("Preferred name / nickname."),
  gender: z.enum(["male", "female", "diverse"]).optional().describe("Gender."),
  position: z.string().optional().describe("Job position title."),
  subcompany: z
    .string()
    .optional()
    .describe("Subcompany. Must be predefined in Personio, otherwise ignored with a meta error."),
  department: z
    .string()
    .optional()
    .describe("Department. Must be predefined in Personio, otherwise ignored with a meta error."),
  office: z
    .string()
    .optional()
    .describe("Office/workplace. Must be predefined in Personio, otherwise ignored with a meta error."),
  hire_date: dateField.optional().describe(
    "Hire date. If status is not provided it is derived from this: past -> active, future -> onboarding (create only)."
  ),
  weekly_working_hours: z.number().optional().describe("Weekly working hours, e.g. 40."),
  status: z
    .enum(["onboarding", "active", "leave", "inactive"])
    .optional()
    .describe("Employment status. Overrides the status derived from hire_date."),
  supervisor_id: z
    .number()
    .int()
    .optional()
    .describe("Employee ID of the supervisor. Send null to unset on update."),
  custom_attributes: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Custom attributes keyed by their dynamic field key (e.g. dynamic_23). Use personio_list_employee_attributes to discover keys."
    ),
};

function buildPayload(input: Record<string, unknown>): EmployeePayload {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      payload[key] = value;
    }
  }
  return payload as EmployeePayload;
}

export function registerEmployeeTools(server: McpServer, client: PersonioClient): void {
  server.registerTool(
    "personio_list_employees",
    {
      title: "List employees",
      description:
        "List company employees from the Personio personnel data API. Supports offset pagination and filtering by email or last-updated date.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().describe("Employees per page (default 200 max)."),
        offset: z.number().int().min(0).optional().describe("Offset of the first employee to return."),
        email: z.string().optional().describe("Find the employee with the given email address."),
        updated_since: z
          .string()
          .optional()
          .describe(
            "Only employees updated after this ISO 8601 datetime or YYYY-MM-DD. NOTE: when used, email/limit/offset are ignored; combine with attributes[] to also filter by which fields changed."
          ),
        attributes: z
          .array(z.string())
          .optional()
          .describe(
            "Projection of employee fields to return (e.g. ['first_name','last_name']). Also acts as a selection filter together with updated_since."
          ),
      }),
    },
    async ({ limit, offset, email, updated_since, attributes }) => {
      try {
        return jsonContent(
          await client.listEmployees({ limit, offset, email, updatedSince: updated_since, attributes })
        );
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_employee",
    {
      title: "Get employee",
      description: "Retrieve a single employee by ID, including all attribute values.",
      inputSchema: z.object({
        employee_id: z.union([z.string(), z.number()]).describe("Numeric ID of the employee."),
      }),
    },
    async ({ employee_id }) => {
      try {
        return jsonContent(await client.getEmployee(String(employee_id)));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_create_employee",
    {
      title: "Create employee",
      description:
        'Create a new employee. Email, first_name and last_name are required. Responds with the new employee\'s id.',
      inputSchema: z.object({
        email: z.string().email().describe("Employee email (required; cannot be changed later)."),
        ...employeeFields,
      }),
    },
    async (input) => {
      try {
        const { email, ...rest } = input;
        const employee = { ...buildPayload(rest), email };
        if (!employee.first_name || !employee.last_name) {
          return {
            content: [{ type: "text" as const, text: "first_name and last_name are required." }],
            isError: true,
          };
        }
        return jsonContent(await client.createEmployee(employee));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_update_employee",
    {
      title: "Update employee",
      description:
        "Update an existing employee. Only provided fields are changed; email cannot be updated.",
      inputSchema: z.object({
        employee_id: z.union([z.string(), z.number()]).describe("Numeric ID of the employee."),
        ...employeeFields,
      }),
    },
    async (input) => {
      try {
        const { employee_id, ...rest } = input;
        return jsonContent(await client.updateEmployee(String(employee_id), buildPayload(rest)));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_employee_absence_balance",
    {
      title: "Get employee absence balance",
      description: "Retrieve the vacation/absence balance for a single employee.",
      inputSchema: z.object({
        employee_id: z.union([z.string(), z.number()]).describe("Numeric ID of the employee."),
      }),
    },
    async ({ employee_id }) => {
      try {
        return jsonContent(await client.getEmployeeAbsenceBalance(String(employee_id)));
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_list_employee_attributes",
    {
      title: "List employee attributes",
      description:
        "List all employee attributes available via the API credentials, including custom (dynamic) attributes with their keys, labels and options. Use these keys for the attributes[] filter and custom_attributes field.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonContent(await client.listEmployeeAttributes());
      } catch (err) {
        return errorContent(err);
      }
    }
  );

  server.registerTool(
    "personio_get_profile_picture",
    {
      title: "Get profile picture",
      description:
        "Fetch an employee's profile picture as an image. Requires the Profile Picture attribute to be whitelisted. Returns 404 if no picture is set.",
      inputSchema: z.object({
        employee_id: z.union([z.string(), z.number()]).describe("Numeric ID of the employee."),
        width: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Width of the image in pixels (e.g. 64, 128, 256, 512). Omit for original size."),
      }),
    },
    async ({ employee_id, width }) => {
      try {
        const pic = await client.getEmployeeProfilePicture(String(employee_id), width);
        return imageContent(pic.data, pic.mimeType);
      } catch (err) {
        return errorContent(err);
      }
    }
  );
}
