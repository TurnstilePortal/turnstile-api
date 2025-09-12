import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { convertDbTokenToApi, isTokenComplete, type TokenService } from "../services/token-service";
import { createPaginatedResponse, paginationSchema } from "../utils/pagination";
import { CacheControl, normalizeAddress, sendError, sendJsonResponse } from "../utils/response";

const tokenAddressSchema = z.object({
  address: z.string(),
});

export async function registerTokenRoutes(fastify: FastifyInstance, tokenService: TokenService) {
  fastify.get<{
    Querystring: { limit?: string; cursor?: string };
  }>(
    "/tokens",
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
      const { limit, cursor } = paginationSchema.parse(request.query);

      try {
        const dbTokens = await tokenService.getTokens(cursor, limit);
        const apiTokens = dbTokens.map((token) => convertDbTokenToApi(token, true));
        const response = createPaginatedResponse(apiTokens, limit, cursor, (token) => token.id || 0);

        sendJsonResponse(reply, response);
      } catch (_error) {
        fastify.log.error("Failed to query tokens");
        sendError(reply, 500, "Database error");
      }
    },
  );

  fastify.get<{
    Params: { address: string };
  }>(
    "/tokens/:address",
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
        const normalized = normalizeAddress(address);
        const dbTokens = await tokenService.getTokenByAddress(normalized);

        if (dbTokens.length === 0) {
          return sendError(reply, 404, "Token not found");
        }

        const token = convertDbTokenToApi(dbTokens[0]);
        const cacheControl = isTokenComplete(token) ? CacheControl.IMMUTABLE : CacheControl.PUBLIC_5MIN;

        sendJsonResponse(reply, token, cacheControl);
      } catch (error) {
        if (error instanceof Error && error.message.includes("Invalid address format")) {
          return sendError(reply, 400, "Invalid address format");
        }

        fastify.log.error("Failed to query token");
        sendError(reply, 500, "Database error");
      }
    },
  );

  fastify.get<{
    Querystring: { limit?: string; cursor?: string };
  }>(
    "/tokens/proposed",
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
      const { limit, cursor } = paginationSchema.parse(request.query);

      try {
        const dbTokens = await tokenService.getProposedTokens(cursor, limit);
        const apiTokens = dbTokens.map((token) => convertDbTokenToApi(token, true));
        const response = createPaginatedResponse(apiTokens, limit, cursor, (token) => token.id || 0);

        sendJsonResponse(reply, response);
      } catch (_error) {
        fastify.log.error("Failed to query proposed tokens");
        sendError(reply, 500, "Database error");
      }
    },
  );

  fastify.get<{
    Querystring: { limit?: string; cursor?: string };
  }>(
    "/tokens/rejected",
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
      const { limit, cursor } = paginationSchema.parse(request.query);

      try {
        const dbTokens = await tokenService.getRejectedTokens(cursor, limit);
        const apiTokens = dbTokens.map((token) => convertDbTokenToApi(token, true));
        const response = createPaginatedResponse(apiTokens, limit, cursor, (token) => token.id || 0);

        sendJsonResponse(reply, response);
      } catch (_error) {
        fastify.log.error("Failed to query rejected tokens");
        sendError(reply, 500, "Database error");
      }
    },
  );

  fastify.get<{
    Querystring: { limit?: string; cursor?: string };
  }>(
    "/tokens/accepted",
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
      const { limit, cursor } = paginationSchema.parse(request.query);

      try {
        const dbTokens = await tokenService.getAcceptedTokens(cursor, limit);
        const apiTokens = dbTokens.map((token) => convertDbTokenToApi(token, true));
        const response = createPaginatedResponse(apiTokens, limit, cursor, (token) => token.id || 0);

        sendJsonResponse(reply, response);
      } catch (_error) {
        fastify.log.error("Failed to query accepted tokens");
        sendError(reply, 500, "Database error");
      }
    },
  );

  fastify.get<{
    Querystring: { limit?: string; cursor?: string };
  }>(
    "/tokens/bridged",
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

      const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 1000) : 100;
      const cursor = cursorParam ? parseInt(cursorParam, 10) : 0;

      if (Number.isNaN(limit) || Number.isNaN(cursor)) {
        return sendError(reply, 400, "Invalid pagination parameters");
      }

      try {
        const dbTokens = await tokenService.getBridgedTokens(cursor, limit);
        const apiTokens = dbTokens.map((token) => convertDbTokenToApi(token, true));
        const response = createPaginatedResponse(apiTokens, limit, cursor, (token) => token.id || 0);

        sendJsonResponse(reply, response);
      } catch (_error) {
        fastify.log.error("Failed to query bridged tokens");
        sendError(reply, 500, "Database error");
      }
    },
  );
}
