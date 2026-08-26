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
  cursor?: string;
}

export interface PageInfo {
  has_more: boolean;
  next_cursor?: string;
}

export interface ListResult<T> {
  data: T[];
  pagination: PageInfo;
}

interface MetaLinks {
  self?: { href?: string };
  next?: { href?: string };
}

interface ListEnvelope<T> {
  _data: T[];
  _meta?: { links?: MetaLinks };
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

  async listJobs(params: PaginationInput = {}): Promise<ListResult<unknown>> {
    return this.list("/v2/recruiting/jobs", params);
  }

  async getJob(jobId: string): Promise<unknown> {
    return this.v2Get(`/v2/recruiting/jobs/${encodeURIComponent(jobId)}`);
  }

  async listCategories(): Promise<unknown> {
    const token = await this.tokens.getToken();
    const res = await fetch(`${this.baseUrl}/v2/recruiting/categories`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return this.parseResponse(res);
  }

  async getCategory(categoryId: string): Promise<unknown> {
    const token = await this.tokens.getToken();
    const res = await fetch(
      `${this.baseUrl}/v2/recruiting/categories/${encodeURIComponent(categoryId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return this.parseResponse(res);
  }

  async listCandidates(
    params: PaginationInput = {}
  ): Promise<ListResult<unknown>> {
    return this.list("/v2/recruiting/candidates", params);
  }

  async getCandidate(candidateId: string): Promise<unknown> {
    return this.v2Get(`/v2/recruiting/candidates/${encodeURIComponent(candidateId)}`);
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
    const qs = search.toString();
    return this.list(`/v2/recruiting/applications${qs ? "?" + qs : ""}`, {});
  }

  async getApplication(applicationId: string): Promise<unknown> {
    return this.v2Get(`/v2/recruiting/applications/${encodeURIComponent(applicationId)}`);
  }

  async listStageTransitions(applicationId: string): Promise<unknown> {
    const token = await this.tokens.getToken();
    const res = await fetch(
      `${this.baseUrl}/v2/recruiting/applications/${encodeURIComponent(applicationId)}/stage-transitions`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return this.parseResponse(res);
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

  private async v2Get(path: string): Promise<unknown> {
    const token = await this.tokens.getToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if ((res.status === 401 || res.status === 403) && path.startsWith("/v2/")) {
      this.tokens.invalidate();
      const fresh = await this.tokens.getToken();
      const retry = await fetch(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${fresh}` },
      });
      return this.parseResponse(retry);
    }
    return this.parseResponse(res);
  }

  private async list(
    path: string,
    params: PaginationInput
  ): Promise<ListResult<unknown>> {
    const search = new URLSearchParams();
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();

    const envelope = (await this.v2Get(`${path}${qs ? "?" + qs : ""}`)) as ListEnvelope<unknown>;
    if (!envelope || !Array.isArray(envelope._data)) {
      return { data: [], pagination: { has_more: false } };
    }
    return {
      data: envelope._data,
      pagination: extractNextCursor(envelope),
    };
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
}
