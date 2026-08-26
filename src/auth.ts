const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export class TokenManager {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly scope?: string
  ) {}

  async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
    }
    if (!this.inflight) {
      this.inflight = this.fetchToken()
        .then((token) => {
          this.inflight = null;
          return token;
        })
        .catch((err) => {
          this.inflight = null;
          throw err;
        });
    }
    return this.inflight;
  }

  invalidate(): void {
    this.accessToken = null;
    this.expiresAt = 0;
  }

  private async fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    if (this.scope) {
      body.set("scope", this.scope);
    }

    const res = await fetch(`${this.baseUrl}/v2/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Failed to obtain access token (HTTP ${res.status}): ${text || res.statusText}`
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS;
    return data.access_token;
  }
}
