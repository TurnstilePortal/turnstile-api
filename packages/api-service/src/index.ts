import cors from "@fastify/cors";
import env from "@fastify/env";
import { createDbClient, tokens } from "@turnstile-portal/api-common";
import { and, asc, eq, gt, isNotNull, or } from "drizzle-orm";
import Fastify from "fastify";
import { z } from "zod";

// Environment schema
const _envSchema = z.object({
  DATABASE_URL: z.string(),
  PORT: z.string().default("8080"),
});

// API response types
interface Token {
  id?: number;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  l1_address?: string;
  l2_address?: string;
}

function normalizeAddress(address: string): string {
  if (!address.startsWith("0x")) {
    throw new Error("Invalid address format: must start with 0x");
  }
  return address.toLowerCase();
}

// Convert database token to API response format
function convertDbTokenToApi(dbToken: typeof tokens.$inferSelect, includeId = false): Token {
  const token: Token = {
    symbol: dbToken.symbol,
    name: dbToken.name,
    decimals: dbToken.decimals,
  };

  if (includeId) {
    token.id = dbToken.id;
  }

  if (dbToken.l1Address) {
    token.l1_address = dbToken.l1Address;
  }

  if (dbToken.l2Address) {
    token.l2_address = dbToken.l2Address;
  }

  return token;
}

// Check if token is complete (has both L1 and L2 addresses)
function isTokenComplete(token: Token): boolean {
  return token.l1_address !== undefined && token.l2_address !== undefined;
}

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

  // Query schemas for validation
  const listTokensSchema = z.object({
    limit: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return 100;
        const num = parseInt(val, 10);
        return num > 0 && num <= 1000 ? num : 100;
      }),
    offset: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return 0;
        const num = parseInt(val, 10);
        return num >= 0 ? num : 0;
      }),
  });

  const tokenAddressSchema = z.object({
    address: z.string(),
  });

  // Routes

  // GET /api/v1/tokens - List tokens with pagination
  fastify.get<{
    Querystring: { limit?: string; offset?: string };
  }>(
    "/api/v1/tokens",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string" },
            offset: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { limit, offset } = listTokensSchema.parse(request.query);

      try {
        const dbTokens = await db.select().from(tokens).orderBy(asc(tokens.symbol)).limit(limit).offset(offset);

        const apiTokens = dbTokens.map((token) => convertDbTokenToApi(token));

        reply.header("Content-Type", "application/json").header("Cache-Control", "public, max-age=300").send(apiTokens);
      } catch (_error) {
        fastify.log.error("Failed to query tokens");
        reply.code(500).send({ error: "Database error" });
      }
    },
  );

  // GET /api/v1/tokens/:address - Get token by any address
  fastify.get<{
    Params: { address: string };
  }>(
    "/api/v1/tokens/:address",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            address: { type: "string" },
          },
          required: ["address"],
        },
      },
    },
    async (request, reply) => {
      const { address } = tokenAddressSchema.parse(request.params);

      try {
        const normalizedAddress = normalizeAddress(address);

        const dbTokens = await db
          .select()
          .from(tokens)
          .where(or(eq(tokens.l1Address, normalizedAddress), eq(tokens.l2Address, normalizedAddress)));

        if (dbTokens.length === 0) {
          reply.code(404).send({ error: "Token not found" });
          return;
        }

        const token = convertDbTokenToApi(dbTokens[0]);

        // Set cache headers based on token completeness
        const cacheControl = isTokenComplete(token) ? "public, max-age=31536000, immutable" : "public, max-age=300";

        reply.header("Content-Type", "application/json").header("Cache-Control", cacheControl).send(token);
      } catch (error) {
        if (error instanceof Error && error.message.includes("Invalid address format")) {
          reply.code(400).send({ error: "Invalid address format" });
          return;
        }

        fastify.log.error("Failed to query token");
        reply.code(500).send({ error: "Database error" });
      }
    },
  );

  // GET /api/v1/tokens/bridged - List bridged tokens with cursor-based pagination
  fastify.get<{
    Querystring: { limit?: string; cursor?: string };
  }>(
    "/api/v1/tokens/bridged",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string" },
            cursor: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const limitParam = request.query.limit;
      const cursorParam = request.query.cursor;

      // Parse and validate limit
      const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 1000) : 100;

      // Parse cursor (token ID)
      const cursor = cursorParam ? parseInt(cursorParam, 10) : 0;

      if (Number.isNaN(limit) || Number.isNaN(cursor)) {
        reply.code(400).send({ error: "Invalid pagination parameters" });
        return;
      }

      try {
        // Build query with cursor-based pagination
        // Only include tokens with complete data (both addresses and metadata)
        const conditions = [
          isNotNull(tokens.l1Address),
          isNotNull(tokens.l2Address),
          isNotNull(tokens.symbol),
          isNotNull(tokens.name),
          isNotNull(tokens.decimals),
        ];

        if (cursor > 0) {
          conditions.push(gt(tokens.id, cursor));
        }

        // Get paginated results ordered by ID for consistency
        const dbTokens = await db
          .select()
          .from(tokens)
          .where(and(...conditions))
          .orderBy(asc(tokens.id))
          .limit(limit + 1); // Fetch one extra to determine if there's a next page

        // Check if there are more results
        const hasMore = dbTokens.length > limit;
        const resultTokens = hasMore ? dbTokens.slice(0, -1) : dbTokens;

        // Get the last token ID for the next cursor
        const nextCursor = resultTokens.length > 0 ? resultTokens[resultTokens.length - 1].id.toString() : null;

        const apiTokens = resultTokens.map((token) => convertDbTokenToApi(token, true));

        // Build response with pagination metadata
        const response = {
          data: apiTokens,
          pagination: {
            limit,
            cursor: cursor > 0 ? cursor.toString() : null,
            next_cursor: hasMore ? nextCursor : null,
            has_more: hasMore,
          },
        };

        reply.header("Content-Type", "application/json").header("Cache-Control", "public, max-age=300").send(response);
      } catch (_error) {
        fastify.log.error("Failed to query bridged tokens");
        reply.code(500).send({ error: "Database error" });
      }
    },
  );

  // GET /health - Health check
  fastify.get("/health", async (_request, reply) => {
    reply.header("Content-Type", "application/json").header("Cache-Control", "no-cache").send({ status: "healthy" });
  });

  // GET /ready - Readiness check with database ping
  fastify.get("/ready", async (_request, reply) => {
    try {
      // Simple query to check database connectivity
      await db.select().from(tokens).limit(1);

      reply.header("Content-Type", "application/json").header("Cache-Control", "no-cache").send({ status: "ready" });
    } catch (_error) {
      fastify.log.error("Database connection failed");
      reply.code(503).header("Content-Type", "application/json").header("Cache-Control", "no-cache").send({
        status: "unavailable",
        error: "Database connection failed",
      });
    }
  });

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
