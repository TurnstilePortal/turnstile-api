import { describe, expect, it, vi } from "vitest";
import { TurnstileApiClient } from "./client";

describe("TurnstileApiClient", () => {
  const mockFetch = vi.fn();
  const client = new TurnstileApiClient({
    baseUrl: "http://localhost:8080",
    fetch: mockFetch as unknown as typeof fetch,
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  describe("getHealth", () => {
    it("should fetch health status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "healthy" }),
      });

      const result = await client.getHealth();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/health",
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );
      expect(result).toEqual({ status: "healthy" });
    });
  });

  describe("getTokens", () => {
    it("should fetch tokens with pagination", async () => {
      const mockResponse = {
        data: [
          {
            id: 1,
            symbol: "USDC",
            name: "USD Coin",
            decimals: 6,
            l1_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          },
        ],
        pagination: {
          limit: 10,
          cursor: 0,
          nextCursor: 1,
          hasMore: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getTokens({ limit: 10, cursor: 0 });

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:8080/tokens?limit=10&cursor=0", expect.any(Object));
      expect(result).toEqual(mockResponse);
    });

    it("should handle empty params", async () => {
      const mockResponse = {
        data: [],
        pagination: {
          limit: 100,
          hasMore: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getTokens();

      expect(mockFetch).toHaveBeenCalledWith("http://localhost:8080/tokens", expect.any(Object));
      expect(result).toEqual(mockResponse);
    });
  });

  describe("getTokenByAddress", () => {
    it("should fetch a token by address", async () => {
      const mockToken = {
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        l1_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockToken,
      });

      const result = await client.getTokenByAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/tokens/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        expect.any(Object),
      );
      expect(result).toEqual(mockToken);
    });
  });

  describe("error handling", () => {
    it("should throw an error for non-ok responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: "Token not found" }),
      });

      await expect(client.getTokenByAddress("0x123")).rejects.toThrow("Token not found");
    });

    it("should handle JSON parse errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      await expect(client.getHealth()).rejects.toThrow("HTTP 500: Internal Server Error");
    });
  });

  describe("getAllPages", () => {
    it("should iterate through all pages", async () => {
      const page1 = {
        data: [{ id: 1, symbol: "TOKEN1", name: "Token 1", decimals: 18 }],
        pagination: { limit: 1, hasMore: true, nextCursor: 2 },
      };

      const page2 = {
        data: [{ id: 2, symbol: "TOKEN2", name: "Token 2", decimals: 18 }],
        pagination: { limit: 1, hasMore: false },
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => page1 })
        .mockResolvedValueOnce({ ok: true, json: async () => page2 });

      const tokens = [];
      for await (const token of client.getAllPages((params) => client.getTokens(params), 1)) {
        tokens.push(token);
      }

      expect(tokens).toHaveLength(2);
      expect(tokens[0].symbol).toBe("TOKEN1");
      expect(tokens[1].symbol).toBe("TOKEN2");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("getAllTokens", () => {
    it("should fetch all tokens with auto-pagination", async () => {
      const page1 = {
        data: [{ id: 1, symbol: "TOKEN1", name: "Token 1", decimals: 18 }],
        pagination: { limit: 1, hasMore: true, nextCursor: 2 },
      };

      const page2 = {
        data: [{ id: 2, symbol: "TOKEN2", name: "Token 2", decimals: 18 }],
        pagination: { limit: 1, hasMore: false },
      };

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => page1 })
        .mockResolvedValueOnce({ ok: true, json: async () => page2 });

      const tokens = await client.getAllTokens(1);

      expect(tokens).toHaveLength(2);
      expect(tokens[0].symbol).toBe("TOKEN1");
      expect(tokens[1].symbol).toBe("TOKEN2");
    });
  });
});
