import { MAINNET_BASE_URL, SANDBOX_BASE_URL, TESTNET_BASE_URL } from "./constants.js";
import type { paths } from "./types.js";

export type TokensResponse = paths["/tokens"]["get"]["responses"]["200"]["content"]["application/json"];
export type Token = paths["/tokens/{address}"]["get"]["responses"]["200"]["content"]["application/json"];
export type ErrorResponse = { error: string };

export interface ClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface PaginationParams {
  limit?: number;
  cursor?: number;
}

export function createSandboxClient(config?: Omit<ClientConfig, "baseUrl">) {
  return new TurnstileApiClient({ baseUrl: SANDBOX_BASE_URL, ...config });
}

export function createTestnetClient(config?: Omit<ClientConfig, "baseUrl">) {
  return new TurnstileApiClient({ baseUrl: TESTNET_BASE_URL, ...config });
}

export function createMainnetClient(config?: Omit<ClientConfig, "baseUrl">) {
  return new TurnstileApiClient({ baseUrl: MAINNET_BASE_URL, ...config });
}

export class TurnstileApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchFn: typeof fetch;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
      ...config.headers,
    };
    this.fetchFn = config.fetch || fetch;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await this.fetchFn(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = (await response.json()) as ErrorResponse;
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage);
    }

    return response.json() as Promise<T>;
  }

  private buildQueryString(params: PaginationParams | Record<string, string | number | boolean | undefined>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : "";
  }

  /**
   * Get a paginated list of all tokens
   */
  async getTokens(params?: PaginationParams): Promise<TokensResponse> {
    const queryString = this.buildQueryString(params || {});
    return this.request<TokensResponse>(`/tokens${queryString}`);
  }

  /**
   * Get a token by its L1 or L2 address
   */
  async getTokenByAddress(address: string): Promise<Token> {
    return this.request<Token>(`/tokens/${address}`);
  }

  /**
   * Get a paginated list of tokens with PROPOSED status
   */
  async getProposedTokens(params?: PaginationParams): Promise<TokensResponse> {
    const queryString = this.buildQueryString(params || {});
    return this.request<TokensResponse>(`/tokens/proposed${queryString}`);
  }

  /**
   * Get a paginated list of tokens with REJECTED status
   */
  async getRejectedTokens(params?: PaginationParams): Promise<TokensResponse> {
    const queryString = this.buildQueryString(params || {});
    return this.request<TokensResponse>(`/tokens/rejected${queryString}`);
  }

  /**
   * Get a paginated list of tokens with ACCEPTED status that are not yet fully bridged
   */
  async getAcceptedTokens(params?: PaginationParams): Promise<TokensResponse> {
    const queryString = this.buildQueryString(params || {});
    return this.request<TokensResponse>(`/tokens/accepted${queryString}`);
  }

  /**
   * Get a paginated list of fully bridged tokens (with both L1 and L2 addresses)
   */
  async getBridgedTokens(params?: PaginationParams): Promise<TokensResponse> {
    const queryString = this.buildQueryString(params || {});
    return this.request<TokensResponse>(`/tokens/bridged${queryString}`);
  }

  /**
   * Helper method to fetch all pages of a paginated endpoint
   */
  async *getAllPages<T extends TokensResponse>(
    fetcher: (params: PaginationParams) => Promise<T>,
    limit = 100,
  ): AsyncGenerator<T["data"][number], void, unknown> {
    let cursor = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await fetcher({ limit, cursor });

      for (const item of response.data) {
        yield item;
      }

      hasMore = response.pagination.hasMore;
      if (hasMore && response.pagination.nextCursor !== undefined) {
        cursor = response.pagination.nextCursor;
      } else {
        hasMore = false;
      }
    }
  }

  /**
   * Fetch all tokens (auto-paginated)
   */
  async getAllTokens(limit = 100): Promise<Token[]> {
    const tokens: Token[] = [];
    for await (const token of this.getAllPages((params) => this.getTokens(params), limit)) {
      tokens.push(token);
    }
    return tokens;
  }

  /**
   * Fetch all bridged tokens (auto-paginated)
   */
  async getAllBridgedTokens(limit = 100): Promise<Token[]> {
    const tokens: Token[] = [];
    for await (const token of this.getAllPages((params) => this.getBridgedTokens(params), limit)) {
      tokens.push(token);
    }
    return tokens;
  }

  /**
   * Fetch all proposed tokens (auto-paginated)
   */
  async getAllProposedTokens(limit = 100): Promise<Token[]> {
    const tokens: Token[] = [];
    for await (const token of this.getAllPages((params) => this.getProposedTokens(params), limit)) {
      tokens.push(token);
    }
    return tokens;
  }

  /**
   * Fetch all accepted tokens (auto-paginated)
   */
  async getAllAcceptedTokens(limit = 100): Promise<Token[]> {
    const tokens: Token[] = [];
    for await (const token of this.getAllPages((params) => this.getAcceptedTokens(params), limit)) {
      tokens.push(token);
    }
    return tokens;
  }

  /**
   * Fetch all rejected tokens (auto-paginated)
   */
  async getAllRejectedTokens(limit = 100): Promise<Token[]> {
    const tokens: Token[] = [];
    for await (const token of this.getAllPages((params) => this.getRejectedTokens(params), limit)) {
      tokens.push(token);
    }
    return tokens;
  }
}
