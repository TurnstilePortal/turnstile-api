import type { FastifyInstance } from "fastify";
import type { TokenService } from "../services/token-service";
import { CacheControl, sendJsonResponse } from "../utils/response";

export async function registerHealthRoutes(fastify: FastifyInstance, tokenService: TokenService) {
  fastify.get("/health", async (_request, reply) => {
    sendJsonResponse(reply, { status: "healthy" }, CacheControl.NO_CACHE);
  });

  fastify.get("/ready", async (_request, reply) => {
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
  });
}
