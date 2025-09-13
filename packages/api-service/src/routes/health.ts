import type { FastifyInstance } from "fastify";
import { healthResponseSchema, readyResponseSchema, unavailableResponseSchema, zodToJsonSchema } from "../schemas";
import type { TokenService } from "../services/token-service";
import { CacheControl, sendJsonResponse } from "../utils/response";

export async function registerHealthRoutes(fastify: FastifyInstance, tokenService: TokenService) {
  fastify.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Health check",
        description: "Check if the service is healthy",
        response: {
          200: zodToJsonSchema(healthResponseSchema),
        },
      },
    },
    async (_request, reply) => {
      sendJsonResponse(reply, { status: "healthy" }, CacheControl.NO_CACHE);
    },
  );

  fastify.get(
    "/ready",
    {
      schema: {
        tags: ["Health"],
        summary: "Readiness check",
        description: "Check if the service is ready (including database connectivity)",
        response: {
          200: zodToJsonSchema(readyResponseSchema),
          503: zodToJsonSchema(unavailableResponseSchema),
        },
      },
    },
    async (_request, reply) => {
      try {
        await tokenService.testConnection();
        sendJsonResponse(reply, { status: "ready" }, CacheControl.NO_CACHE);
      } catch (_error) {
        fastify.log.error("Database connection failed");
        reply.code(503);
        sendJsonResponse(
          reply,
          {
            status: "unavailable",
            error: "Database connection failed",
          },
          CacheControl.NO_CACHE,
        );
      }
    },
  );
}
