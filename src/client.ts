import { TokenManager } from "./auth.js";

export class PersonioApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "PersonioApiError";
  }
}

export interface PaginationInput {
  limit?: number;
  cursor?: number | string;
}

export interface PageInfo {
  has_more: boolean;
  next_cursor?: string;
}

export interface ListResult<T> {
  data: T[];
  pagination: PageInfo;
}

export interface OffsetPageInfo extends PageInfo {
  total_elements?: number;
  current_page?: number;
  total_pages?: number;
  next_offset?: number;
}

export interface OffsetListResult<T> {
  data: T[];
  pagination: OffsetPageInfo;
}

interface MetaLinks {
  self?: { href?: string };
  next?: { href?: string };
}

interface ListEnvelope<T> {
  _data: T[];
  _meta?: { links?: MetaLinks };
}

interface V1ListEnvelope<T> {
  success?: boolean;
  data?: T[];
  metadata?: { total_elements?: number; current_page?: number; total_pages?: number };
  offset?: number;
  limit?: number;
}

function extractNextCursor(envelope: ListEnvelope<unknown>): PageInfo {
  const href = envelope._meta?.links?.next?.href;
  if (!href) {
    return { has_more: false };
  }
  try {
    const url = new URL(href);
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      return { has_more: true, next_cursor: cursor };
    }
  } catch {
    // ignore malformed link
  }
  return { has_more: true };
}

function normalizeV1List<T>(envelope: V1ListEnvelope<T>): OffsetListResult<T> {
  const data = Array.isArray(envelope.data) ? envelope.data : [];
  const meta = envelope.metadata ?? {};
  const offset = envelope.offset ?? 0;
  const total = meta.total_elements;
  let hasMore: boolean;
  if (typeof total === "number") {
    hasMore = offset + data.length < total;
  } else if (typeof meta.current_page === "number" && typeof meta.total_pages === "number") {
    hasMore = meta.current_page < meta.total_pages - 1;
  } else {
    hasMore = data.length > 0 && data.length >= (envelope.limit ?? data.length);
  }
  const pagination: OffsetPageInfo = { has_more: hasMore };
  if (typeof total === "number") pagination.total_elements = total;
  if (typeof meta.current_page === "number") pagination.current_page = meta.current_page;
  if (typeof meta.total_pages === "number") pagination.total_pages = meta.total_pages;
  if (hasMore) pagination.next_offset = offset + data.length;
  return { data, pagination };
}

function describeProblem(status: number, bodyText: string): string {
  if (!bodyText) {
    return `Personio API error (HTTP ${status})`;
  }
  try {
    const body = JSON.parse(bodyText);
    const parts: string[] = [];
    if (Array.isArray(body.errors)) {
      for (const err of body.errors) {
        if (err.title || err.detail) {
          parts.push([err.title, err.detail].filter(Boolean).join(": "));
        } else if (err.field && Array.isArray(err.errors)) {
          for (const fe of err.errors) {
            parts.push(`${err.field}: ${fe.reason}`);
          }
        }
      }
    }
    if (body.error_description) parts.push(body.error_description);
    if (body.error?.message) parts.push(body.error.message);
    if (body.detail) parts.push(body.detail);
    if (body.title) parts.push(body.title);
    if (body.message) parts.push(body.message);

    const trace = body.personio_trace_id ?? body.trace_id;
    const suffix = trace ? ` (trace_id: ${trace})` : "";
    return `Personio API error (HTTP ${status})${suffix}${
      parts.length ? ": " + parts.join("; ") : ""
    }`;
  } catch {
    return `Personio API error (HTTP ${status}): ${bodyText}`;
  }
}

type ApiVersion = "v1" | "v2";

interface RequestOptions {
  query?: URLSearchParams;
  json?: unknown;
  form?: Record<string, string>;
  multipart?: FormData;
  allowEmpty?: boolean;
  retryOnUnauthorized?: boolean;
  headers?: Record<string, string>;
}

export interface EmployeePayload {
  email?: string;
  first_name?: string;
  last_name?: string;
  preferred_name?: string;
  gender?: string;
  position?: string;
  subcompany?: string;
  department?: string;
  office?: string;
  hire_date?: string;
  weekly_working_hours?: number;
  status?: string;
  supervisor_id?: number | null;
  custom_attributes?: Record<string, unknown>;
}

export interface AttendancePeriodFilters {
  limit?: number;
  cursor?: string;
  ids?: string[];
  person_ids?: string[];
  start_from?: string;
  start_to?: string;
  end_from?: string;
  end_to?: string;
  updated_from?: string;
  updated_to?: string;
  attribution_date_from?: string;
  attribution_date_to?: string;
  project_ids?: string[];
  status?: string;
  sort?: string;
}

export interface ProjectFilters {
  limit?: number;
  cursor?: string;
  ids?: string[];
  names?: string[];
  status?: string;
  project_codes?: string[];
  parent_project_ids?: string[];
  top_level_only?: boolean;
  include?: string[];
}

export interface TimeOffFilters {
  start_date?: string;
  end_date?: string;
  updated_from?: string;
  updated_to?: string;
  employee_ids?: number[];
  limit?: number;
  offset?: number;
}

export interface AbsencePeriodFilters extends TimeOffFilters {
  absence_type_ids?: number[];
  absence_period_ids?: string[];
}

const ARRAY_KEYS = (key: string) => `${key}[]`;

export class PersonioClient {
  private readonly tokens: TokenManager;

  constructor(
    private readonly baseUrl: string,
    clientId: string,
    clientSecret: string,
    private readonly companyId?: string,
    private readonly recruitingToken?: string
  ) {
    this.tokens = new TokenManager(baseUrl, clientId, clientSecret);
  }

  // ------------------------------------------------------------------ core

  private async request(
    version: ApiVersion,
    method: string,
    path: string,
    opts: RequestOptions = {}
  ): Promise<unknown> {
    const send = async (token: string): Promise<Response> => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        ...opts.headers,
      };
      if (version === "v1" && this.companyId) {
        headers["X-Company-ID"] = this.companyId;
      }
      let body: BodyInit | undefined;
      if (opts.json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(opts.json);
      } else if (opts.form) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = new URLSearchParams(opts.form).toString();
      } else if (opts.multipart) {
        body = opts.multipart as unknown as BodyInit;
      }
      const qs = opts.query?.toString();
      return fetch(`${this.baseUrl}${path}${qs ? "?" + qs : ""}`, {
        method,
        headers,
        body,
      });
    };

    let token = await this.tokens.getToken();
    let res = await send(token);
    if ((res.status === 401 || res.status === 403) && opts.retryOnUnauthorized !== false) {
      this.tokens.invalidate();
      token = await this.tokens.getToken();
      res = await send(token);
    }
    return this.parseResponse(res, opts.allowEmpty);
  }

  private async v2List(path: string, params: PaginationInput): Promise<ListResult<unknown>> {
    const search = new URLSearchParams();
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.cursor !== undefined) search.set("cursor", String(params.cursor));
    const qs = search.toString();

    const envelope = (await this.request("v2", "GET", `${path}${qs ? "?" + qs : ""}`)) as ListEnvelope<unknown>;
    if (!envelope || !Array.isArray(envelope._data)) {
      return { data: [], pagination: { has_more: false } };
    }
    return {
      data: envelope._data,
      pagination: extractNextCursor(envelope),
    };
  }

  private v1Get(path: string, query?: URLSearchParams, opts: RequestOptions = {}): Promise<unknown> {
    return this.request("v1", "GET", path, { query, ...opts });
  }

  private async v1List<T>(path: string, query: URLSearchParams): Promise<OffsetListResult<T>> {
    const qs = query.toString();
    const envelope = (await this.request("v1", "GET", `${path}${qs ? "?" + qs : ""}`)) as V1ListEnvelope<T>;
    return normalizeV1List(envelope ?? {});
  }

  private appendAll(query: URLSearchParams, key: string, values: Array<string | number> | undefined): void {
    if (!values) return;
    for (const value of values) {
      query.append(ARRAY_KEYS(key), String(value));
    }
  }

  private async parseResponse(res: Response, allowEmpty = false): Promise<unknown> {
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new PersonioApiError(res.status, describeProblem(res.status, text));
    }
    if (!text) {
      return allowEmpty ? { success: true } : null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // ------------------------------------------------------------- recruiting

  async listJobs(params: PaginationInput = {}): Promise<ListResult<unknown>> {
    return this.v2List("/v2/recruiting/jobs", params);
  }

  async getJob(jobId: string): Promise<unknown> {
    return this.request("v2", "GET", `/v2/recruiting/jobs/${encodeURIComponent(jobId)}`);
  }

  async listCategories(): Promise<unknown> {
    return this.request("v2", "GET", "/v2/recruiting/categories");
  }

  async getCategory(categoryId: string): Promise<unknown> {
    return this.request("v2", "GET", `/v2/recruiting/categories/${encodeURIComponent(categoryId)}`);
  }

  async listCandidates(params: PaginationInput = {}): Promise<ListResult<unknown>> {
    return this.v2List("/v2/recruiting/candidates", params);
  }

  async getCandidate(candidateId: string): Promise<unknown> {
    return this.request("v2", "GET", `/v2/recruiting/candidates/${encodeURIComponent(candidateId)}`);
  }

  async listApplications(params: {
    limit?: number;
    cursor?: string;
    updatedBefore?: string;
    updatedAfter?: string;
    candidateEmail?: string;
  } = {}): Promise<ListResult<unknown>> {
    const search = new URLSearchParams();
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.cursor) search.set("cursor", params.cursor);
    if (params.updatedBefore) search.set("updated_at.lt", params.updatedBefore);
    if (params.updatedAfter) search.set("updated_at.gt", params.updatedAfter);
    if (params.candidateEmail) search.set("candidate.email", params.candidateEmail);
    return this.rawV2List(`/v2/recruiting/applications${search.size ? "?" + search.toString() : ""}`);
  }

  async getApplication(applicationId: string): Promise<unknown> {
    return this.request("v2", "GET", `/v2/recruiting/applications/${encodeURIComponent(applicationId)}`);
  }

  async listStageTransitions(applicationId: string): Promise<unknown> {
    return this.request(
      "v2",
      "GET",
      `/v2/recruiting/applications/${encodeURIComponent(applicationId)}/stage-transitions`
    );
  }

  async createApplication(payload: Record<string, unknown>): Promise<unknown> {
    if (!this.recruitingToken || !this.companyId) {
      throw new Error(
        "Creating applications requires PERSONIO_RECRUITING_TOKEN and PERSONIO_COMPANY_ID to be configured."
      );
    }
    const res = await fetch(`${this.baseUrl}/v1/recruiting/applications`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.recruitingToken}`,
        "X-Company-ID": this.companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return this.parseResponse(res, true);
  }

  // -------------------------------------------------------------- employees

  async listEmployees(params: {
    limit?: number;
    offset?: number;
    email?: string;
    updatedSince?: string;
    attributes?: string[];
  } = {}): Promise<OffsetListResult<unknown>> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    if (params.email) query.set("email", params.email);
    if (params.updatedSince) query.set("updated_since", params.updatedSince);
    this.appendAll(query, "attributes", params.attributes);
    return this.v1List("/v1/company/employees", query);
  }

  async getEmployee(employeeId: string): Promise<unknown> {
    return this.v1Get(`/v1/company/employees/${encodeURIComponent(employeeId)}`);
  }

  async createEmployee(employee: EmployeePayload): Promise<unknown> {
    return this.request("v1", "POST", "/v1/company/employees", {
      json: { employee },
    });
  }

  async updateEmployee(employeeId: string, employee: EmployeePayload): Promise<unknown> {
    return this.request("v1", "PATCH", `/v1/company/employees/${encodeURIComponent(employeeId)}`, {
      json: { employee },
    });
  }

  async getEmployeeAbsenceBalance(employeeId: string): Promise<unknown> {
    return this.v1Get(`/v1/company/employees/${encodeURIComponent(employeeId)}/absences/balance`);
  }

  async listEmployeeAttributes(): Promise<unknown> {
    return this.v1Get("/v1/company/employees/attributes");
  }

  async getEmployeeProfilePicture(
    employeeId: string,
    width?: number
  ): Promise<{ data: ArrayBuffer; mimeType: string }> {
    const suffix = width ? `/${width}` : "";
    const path = `/v1/company/employees/${encodeURIComponent(employeeId)}/profile-picture${suffix}`;
    const token = await this.tokens.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(this.companyId ? { "X-Company-ID": this.companyId } : {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new PersonioApiError(res.status, describeProblem(res.status, text));
    }
    return { data: await res.arrayBuffer(), mimeType: res.headers.get("content-type") ?? "image/png" };
  }

  // ------------------------------------------------- attendance periods (v2)

  async listAttendancePeriods(filters: AttendancePeriodFilters = {}): Promise<ListResult<unknown>> {
    const query = new URLSearchParams();
    if (filters.limit !== undefined) query.set("limit", String(filters.limit));
    if (filters.cursor) query.set("cursor", filters.cursor);
    this.appendCommaSeparated(query, "id", filters.ids);
    this.appendCommaSeparated(query, "person.id", filters.person_ids);
    this.appendCommaSeparated(query, "project.id", filters.project_ids);
    if (filters.start_from) query.set("start.date_time.gte", filters.start_from);
    if (filters.start_to) query.set("start.date_time.lte", filters.start_to);
    if (filters.end_from) query.set("end.date_time.gte", filters.end_from);
    if (filters.end_to) query.set("end.date_time.lte", filters.end_to);
    if (filters.updated_from) query.set("updated_at.gte", filters.updated_from);
    if (filters.updated_to) query.set("updated_at.lte", filters.updated_to);
    if (filters.attribution_date_from) query.set("attribution_date.gte", filters.attribution_date_from);
    if (filters.attribution_date_to) query.set("attribution_date.lte", filters.attribution_date_to);
    if (filters.status) query.set("status", filters.status);
    if (filters.sort) query.set("sort", filters.sort);
    const qs = query.toString();
    return this.rawV2List(`/v2/attendance-periods${qs ? "?" + qs : ""}`);
  }

  private appendCommaSeparated(
    query: URLSearchParams,
    key: string,
    values: Array<string | number> | undefined
  ): void {
    if (!values || values.length === 0) return;
    query.set(key, values.join(","));
  }

  private async rawV2List(path: string): Promise<ListResult<unknown>> {
    const envelope = (await this.request("v2", "GET", path)) as ListEnvelope<unknown>;
    if (!envelope || !Array.isArray(envelope._data)) {
      return { data: [], pagination: { has_more: false } };
    }
    return { data: envelope._data, pagination: extractNextCursor(envelope) };
  }

  async getAttendancePeriod(id: string): Promise<unknown> {
    return this.request("v2", "GET", `/v2/attendance-periods/${encodeURIComponent(id)}`);
  }

  async createAttendancePeriod(payload: Record<string, unknown>, skipApproval?: boolean): Promise<unknown> {
    const query = new URLSearchParams();
    if (skipApproval !== undefined) query.set("skip_approval", String(skipApproval));
    return this.request("v2", "POST", "/v2/attendance-periods", { query, json: payload });
  }

  async updateAttendancePeriod(
    id: string,
    payload: Record<string, unknown>,
    skipApproval?: boolean
  ): Promise<unknown> {
    const query = new URLSearchParams();
    if (skipApproval !== undefined) query.set("skip_approval", String(skipApproval));
    return this.request("v2", "PATCH", `/v2/attendance-periods/${encodeURIComponent(id)}`, {
      query,
      json: payload,
    });
  }

  async deleteAttendancePeriod(id: string): Promise<unknown> {
    return this.request("v2", "DELETE", `/v2/attendance-periods/${encodeURIComponent(id)}`, {
      allowEmpty: true,
    });
  }

  // --------------------------------------------------------------- projects

  async listProjects(filters: ProjectFilters = {}): Promise<ListResult<unknown>> {
    const query = new URLSearchParams();
    if (filters.limit !== undefined) query.set("limit", String(filters.limit));
    if (filters.cursor) query.set("cursor", filters.cursor);
    this.appendCommaSeparated(query, "id", filters.ids);
    this.appendCommaSeparated(query, "name", filters.names);
    this.appendCommaSeparated(query, "project_code", filters.project_codes);
    this.appendCommaSeparated(query, "parent_project.id", filters.parent_project_ids);
    if (filters.status) query.set("status", filters.status);
    if (filters.top_level_only !== undefined) query.set("top_level_only", String(filters.top_level_only));
    if (filters.include && filters.include.length > 0) query.set("include", filters.include.join(","));
    const qs = query.toString();
    return this.rawV2List(`/v2/projects${qs ? "?" + qs : ""}`);
  }

  async getProject(id: string, include?: string[]): Promise<unknown> {
    const query = new URLSearchParams();
    if (include && include.length > 0) query.set("include", include.join(","));
    return this.request("v2", "GET", `/v2/projects/${encodeURIComponent(id)}`, { query });
  }

  async createProject(payload: Record<string, unknown>): Promise<unknown> {
    return this.request("v2", "POST", "/v2/projects", { json: payload, allowEmpty: true });
  }

  async updateProject(id: string, payload: Record<string, unknown>): Promise<unknown> {
    return this.request("v2", "PATCH", `/v2/projects/${encodeURIComponent(id)}`, {
      json: payload,
      allowEmpty: true,
    });
  }

  async deleteProject(id: string): Promise<unknown> {
    return this.request("v2", "DELETE", `/v2/projects/${encodeURIComponent(id)}`, { allowEmpty: true });
  }

  // ---------------------------------------------------------------- time off

  async listTimeOffTypes(params: { limit?: number; offset?: number } = {}): Promise<OffsetListResult<unknown>> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    return this.v1List("/v1/company/time-off-types", query);
  }

  async listTimeOffs(filters: TimeOffFilters = {}): Promise<OffsetListResult<unknown>> {
    const query = this.timeOffQuery(filters);
    return this.v1List("/v1/company/time-offs", query);
  }

  async createTimeOff(payload: {
    employee_id: number;
    time_off_type_id: number;
    start_date: string;
    end_date: string;
    half_day_start?: boolean;
    half_day_end?: boolean;
    comment?: string;
    skip_approval?: boolean;
  }): Promise<unknown> {
    return this.request("v1", "POST", "/v1/company/time-offs", { form: stringifyForm(payload) });
  }

  async getTimeOff(id: string): Promise<unknown> {
    return this.v1Get(`/v1/company/time-offs/${encodeURIComponent(id)}`);
  }

  async deleteTimeOff(id: string): Promise<unknown> {
    return this.request("v1", "DELETE", `/v1/company/time-offs/${encodeURIComponent(id)}`, {
      allowEmpty: true,
    });
  }

  async listAbsencePeriods(filters: AbsencePeriodFilters = {}): Promise<OffsetListResult<unknown>> {
    const query = this.timeOffQuery(filters);
    this.appendAll(query, "absence_types", filters.absence_type_ids);
    this.appendAll(query, "absence_periods", filters.absence_period_ids);
    return this.v1List("/v1/company/absence-periods", query);
  }

  async createAbsencePeriod(payload: {
    employee_id: number;
    time_off_type_id: number;
    start_date: string;
    end_date: string;
    start_time?: string;
    end_time?: string;
    half_day_start?: boolean;
    half_day_end?: boolean;
    comment?: string;
    skip_approval?: boolean;
  }): Promise<unknown> {
    return this.request("v1", "POST", "/v1/company/absence-periods", { form: stringifyForm(payload) });
  }

  async deleteAbsencePeriod(id: string): Promise<unknown> {
    return this.request("v1", "DELETE", `/v1/company/absence-periods/${encodeURIComponent(id)}`, {
      allowEmpty: true,
    });
  }

  private timeOffQuery(filters: TimeOffFilters): URLSearchParams {
    const query = new URLSearchParams();
    if (filters.start_date) query.set("start_date", filters.start_date);
    if (filters.end_date) query.set("end_date", filters.end_date);
    if (filters.updated_from) query.set("updated_from", filters.updated_from);
    if (filters.updated_to) query.set("updated_to", filters.updated_to);
    this.appendAll(query, "employees", filters.employee_ids);
    if (filters.limit !== undefined) query.set("limit", String(filters.limit));
    if (filters.offset !== undefined) query.set("offset", String(filters.offset));
    return query;
  }

  // --------------------------------------------------------------- documents

  async listDocumentCategories(): Promise<unknown> {
    return this.v1Get("/v1/company/document-categories");
  }

  async uploadDocument(file: {
    title: string;
    employee_id: number;
    category_id: number;
    fileName: string;
    contentBase64?: string;
    contentText?: string;
    contentType?: string;
    comment?: string;
    date?: string;
  }): Promise<unknown> {
    const form = new FormData();
    form.set("title", file.title);
    form.set("employee_id", String(file.employee_id));
    form.set("category_id", String(file.category_id));
    if (file.comment !== undefined) form.set("comment", file.comment);
    if (file.date !== undefined) form.set("date", file.date);
    const buffer = file.contentBase64
      ? Buffer.from(file.contentBase64, "base64")
      : Buffer.from(file.contentText ?? "", "utf8");
    const blob = new Blob([new Uint8Array(buffer)], { type: file.contentType ?? "application/octet-stream" });
    form.append("file", blob, file.fileName);
    return this.request("v1", "POST", "/v1/company/documents", { multipart: form });
  }

  // ---------------------------------------------------------- custom reports

  async listCustomReports(params: { reportIds?: string[]; status?: string } = {}): Promise<unknown> {
    const query = new URLSearchParams();
    if (params.reportIds && params.reportIds.length > 0) query.set("report_ids", params.reportIds.join(","));
    if (params.status) query.set("status", params.status);
    return this.v1Get("/v1/company/custom-reports/reports", query);
  }

  async getCustomReport(
    reportId: string,
    params: { locale?: string; page?: number; limit?: number } = {}
  ): Promise<unknown> {
    const query = new URLSearchParams();
    if (params.locale) query.set("locale", params.locale);
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    return this.v1Get(`/v1/company/custom-reports/reports/${encodeURIComponent(reportId)}`, query);
  }

  async listReportColumns(
    params: { columns?: string[]; locale?: string; reportId?: string } = {}
  ): Promise<unknown> {
    const query = new URLSearchParams();
    if (params.columns && params.columns.length > 0) {
      for (const column of params.columns) {
        query.append("columns[]", column);
      }
    }
    if (params.locale) query.set("locale", params.locale);
    if (params.reportId) query.set("report_id", params.reportId);
    return this.v1Get("/v1/company/custom-reports/columns", query);
  }
}

function stringifyForm(payload: Record<string, unknown>): Record<string, string> {
  const form: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) {
      form[key] = String(value);
    }
  }
  return form;
}
