#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { PersonioClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new PersonioClient(
    config.baseUrl.replace(/\/$/, ""),
    config.clientId,
    config.clientSecret,
    config.companyId,
    config.recruitingToken
  );

  const server = new McpServer({
    name: "personio-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "personio_health_check",
    {
      title: "Health check",
      description:
        "Verify that the configured Personio credentials work by listing the first job category or job.",
      inputSchema: {},
    },
    async () => {
      try {
        await client.listJobs({ limit: 1 });
        return {
          content: [{ type: "text" as const, text: "Personio credentials are valid." }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "Personio credential check failed: " +
                (err instanceof Error ? err.message : String(err)),
            },
          ],
          isError: true,
        };
      }
    }
  );

  registerAllTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
