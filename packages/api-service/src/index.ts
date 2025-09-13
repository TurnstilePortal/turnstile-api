import cors from "@fastify/cors";
import env from "@fastify/env";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { createDbClient } from "@turnstile-portal/api-common";
import Fastify from "fastify";
import { registerHealthRoutes } from "./routes/health";
import { registerTokenRoutes } from "./routes/tokens";
import { TokenService } from "./services/token-service";

async function createServer() {
  const fastify = Fastify({
    logger: true,
  });

  // Register plugins
  await fastify.register(env, {
    schema: {
      type: "object",
      required: ["DATABASE_URL"],
      properties: {
        DATABASE_URL: { type: "string" },
        PORT: { type: "string", default: "8080" },
      },
    },
  });

  await fastify.register(cors, {
    origin: true,
  });

  // Register Swagger for OpenAPI documentation
  await fastify.register(swagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Turnstile API",
        description: "Token bridge system for Ethereum L1 and Aztec L2 networks",
        version: "1.0.0",
      },
      servers: [
        {
          url: process.env.API_BASE_URL || "http://localhost:8080",
          description: process.env.NODE_ENV === "production" ? "Production server" : "Development server",
        },
      ],
      tags: [
        { name: "Health", description: "Health and readiness checks" },
        { name: "Tokens", description: "Token operations" },
      ],
      components: {
        securitySchemes: {},
      },
    },
  });

  // Register Swagger UI
  await fastify.register(swaggerUi, {
    routePrefix: "/documentation",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
    staticCSP: true,
    transformSpecificationClone: true,
  });

  // Create database client
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const db = createDbClient(databaseUrl);
  const tokenService = new TokenService(db);

  // Register routes
  await registerTokenRoutes(fastify, tokenService);
  await registerHealthRoutes(fastify, tokenService);

  // Generate OpenAPI spec file if requested
  if (process.env.GENERATE_OPENAPI === "true") {
    await fastify.ready();
    const spec = fastify.swagger();
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const specPath = path.join(process.cwd(), "openapi.generated.json");
    await fs.writeFile(specPath, JSON.stringify(spec, null, 2));
    console.log(`OpenAPI spec generated at: ${specPath}`);
    process.exit(0);
  }

  return fastify;
}

async function start() {
  try {
    const fastify = await createServer();

    const port = parseInt(process.env.PORT || "8080", 10);
    const host = "0.0.0.0";

    await fastify.listen({ port, host });
    console.log(`Server running on http://${host}:${port}`);
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

// Start the server
start();
