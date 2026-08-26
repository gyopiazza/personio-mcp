export interface Config {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  companyId?: string;
  recruitingToken?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const clientId = env.PERSONIO_CLIENT_ID;
  const clientSecret = env.PERSONIO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing required environment variables PERSONIO_CLIENT_ID and PERSONIO_CLIENT_SECRET. " +
        "Create a custom integration under Marketplace > Connected integrations in Personio to obtain them."
    );
  }

  const config: Config = {
    baseUrl: env.PERSONIO_API_BASE_URL ?? "https://api.personio.de",
    clientId,
    clientSecret,
    companyId: env.PERSONIO_COMPANY_ID,
    recruitingToken: env.PERSONIO_RECRUITING_TOKEN,
  };

  return config;
}
