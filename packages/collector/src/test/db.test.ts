import { type NewToken, tokens } from "@turnstile-portal/api-common/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DbClient,
  destroyDatabase,
  getDatabase,
  setDatabase,
  storeL1TokenAllowListEvents,
  storeL1TokenRegistrations,
  storeL2TokenRegistrations,
} from "../db";

describe("Database Module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    await destroyDatabase();
    process.env = originalEnv;
    setDatabase(null);
  });

  describe("getDatabase", () => {
    it("should throw error when DATABASE_URL is not set", () => {
      delete process.env.DATABASE_URL;
      expect(() => getDatabase()).toThrow("DATABASE_URL environment variable is not set");
    });

    it("should create database connection when DATABASE_URL is set", () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
      const db = getDatabase();
      expect(db).toBeDefined();
      expect(db).toHaveProperty("select");
      expect(db).toHaveProperty("insert");
      expect(db).toHaveProperty("update");
      expect(db).toHaveProperty("delete");
    });

    it("should return same instance on multiple calls", () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
      const db1 = getDatabase();
      const db2 = getDatabase();
      expect(db1).toBe(db2);
    });

    it("should support different database URL formats", () => {
      const urls = [
        "postgresql://user:pass@localhost/db",
        "postgres://user:pass@localhost:5432/db",
        "postgresql://user:pass@localhost/db?sslmode=disable",
      ];

      for (const url of urls) {
        process.env.DATABASE_URL = url;
        const db = getDatabase();
        expect(db).toBeDefined();
        destroyDatabase();
      }
    });
  });

  describe("destroyDatabase", () => {
    it("should destroy database connection", async () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
      const db1 = getDatabase();
      await destroyDatabase();

      const db2 = getDatabase();
      expect(db1).not.toBe(db2);
    });

    it("should handle multiple destroy calls gracefully", async () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
      getDatabase();

      await destroyDatabase();
      await destroyDatabase();

      expect(true).toBe(true);
    });

    it("should handle destroy without initialization", async () => {
      await expect(destroyDatabase()).resolves.toBeUndefined();
    });
  });

  describe("storeL1TokenRegistrations", () => {
    it("should insert new tokens and update existing ones", async () => {
      const mockDb = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn(),
      };
      setDatabase(mockDb as unknown as DbClient);

      const registrations: NewToken[] = [
        {
          symbol: "TKN1",
          name: "Token 1",
          decimals: 18,
          l1Address: "0x123",
          l1RegistrationBlock: 1,
          l1RegistrationTx: "0xabc",
          l2RegistrationBlock: 100,
        },
      ];

      await storeL1TokenRegistrations(registrations);

      expect(mockDb.insert).toHaveBeenCalledWith(tokens);
      expect(mockDb.values).toHaveBeenCalledWith(registrations[0]);
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
    });
  });

  describe("storeL2TokenRegistrations", () => {
    it("should upsert tokens with L2 data", async () => {
      const mockDb = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn(),
      };
      setDatabase(mockDb as unknown as DbClient);

      const registrations: Partial<NewToken>[] = [
        {
          l1Address: "0x123",
          l2Address: "0x456",
          l2RegistrationBlock: 200,
        },
      ];

      await storeL2TokenRegistrations(registrations);

      expect(mockDb.insert).toHaveBeenCalledWith(tokens);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          l1Address: "0x123",
          l2Address: "0x456",
          l2RegistrationBlock: 200,
        }),
      );
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: tokens.l1Address,
        }),
      );
    });
  });

  describe("storeL1TokenAllowListEvents", () => {
    it("should insert new tokens with allowlist data", async () => {
      const mockDb = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn(),
      };
      setDatabase(mockDb as unknown as DbClient);

      const events: NewToken[] = [
        {
          l1Address: "0x123",
          l1AllowListStatus: "PROPOSED",
          l1AllowListProposalTx: "0xabc",
        },
      ];

      await storeL1TokenAllowListEvents(events);

      expect(mockDb.insert).toHaveBeenCalledWith(tokens);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          l1Address: "0x123",
          l1AllowListStatus: "PROPOSED",
          l1AllowListProposalTx: "0xabc",
          l1AllowListResolutionTx: undefined,
        }),
      );
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: tokens.l1Address,
          set: expect.objectContaining({
            l1AllowListStatus: "PROPOSED",
          }),
        }),
      );
    });

    it("should update existing tokens with allowlist data without overwriting registration data", async () => {
      const mockDb = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn(),
      };
      setDatabase(mockDb as unknown as DbClient);

      const events: NewToken[] = [
        {
          l1Address: "0x123",
          l1AllowListStatus: "ACCEPTED",
          l1AllowListResolutionTx: "0xdef",
        },
      ];

      await storeL1TokenAllowListEvents(events);

      expect(mockDb.insert).toHaveBeenCalledWith(tokens);
      expect(mockDb.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: tokens.l1Address,
          set: expect.objectContaining({
            l1AllowListStatus: "ACCEPTED",
            l1AllowListResolutionTx: "0xdef",
          }),
        }),
      );
    });
  });
});
