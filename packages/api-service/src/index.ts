import cors from "@fastify/cors";
import env from "@fastify/env";
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
