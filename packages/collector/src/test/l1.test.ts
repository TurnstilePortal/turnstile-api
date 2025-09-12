import { beforeEach, describe, expect, it, vi } from "vitest";
import { L1Collector, type L1CollectorConfig } from "../collectors/l1.js";

// Create a mock public client
const mockPublicClient = {
  getLogs: vi.fn(),
  readContract: vi.fn(),
  getBlockNumber: vi.fn(() => Promise.resolve(12345n)),
};

vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockPublicClient),
    http: vi.fn(),
  };
});

describe("L1Collector", () => {
  let collector: L1Collector;
  let mockConfig: L1CollectorConfig;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    mockConfig = {
      rpcUrl: "https://sepolia.infura.io/v3/test",
      portalAddress: "0x1234567890123456789012345678901234567890",
      inboxAddress: "0x0987654321098765432109876543210987654321",
      allowListAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      startBlock: 1000,
      chunkSize: 100,
      network: "sepolia",
    };

    collector = new L1Collector(mockConfig);
  });

  describe("constructor", () => {
    it("should initialize with default configuration", () => {
      const minimalConfig: L1CollectorConfig = {
        rpcUrl: "https://sepolia.infura.io/v3/test",
        portalAddress: "0x1234567890123456789012345678901234567890",
        inboxAddress: "0x0987654321098765432109876543210987654321",
        allowListAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        network: "sepolia",
      };

      const collector = new L1Collector(minimalConfig);
      expect(collector).toBeDefined();
    });

    it("should merge provided config with defaults", () => {
      expect(collector).toBeDefined();
    });
  });

  describe("getL1TokenRegistrations", () => {
    it("should scan for both portal and inbox events and return registrations", async () => {
      const mockPortalLogs = [
        {
          eventName: "Registered",
          args: {
            token: "0x1111111111111111111111111111111111111111",
            leaf: "0xleaf",
            tokenId: 1n,
          },
          blockNumber: 1001n,
          transactionHash: "0xtx1",
        },
      ];

      const mockInboxLogs = [
        {
          eventName: "MessageSent",
          args: {
            l2BlockNumber: 100n,
            index: 1n,
            hash: "0xhash",
            rollingHash: "0xrollinghash",
          },
          blockNumber: 1001n,
          transactionHash: "0xtx1",
        },
      ];

      mockPublicClient.getLogs.mockResolvedValueOnce(mockPortalLogs).mockResolvedValueOnce(mockInboxLogs);

      // Mock token contract calls
      mockPublicClient.readContract
        .mockResolvedValueOnce("Test Token") // name
        .mockResolvedValueOnce("TEST") // symbol
        .mockResolvedValueOnce(18); // decimals

      const registrations = await collector.getL1TokenRegistrations(1000, 1100);

      expect(mockPublicClient.getLogs).toHaveBeenCalledTimes(2);
      expect(mockPublicClient.readContract).toHaveBeenCalledTimes(3);
      expect(registrations).toHaveLength(1);
      expect(registrations[0]).toEqual({
        symbol: "TEST",
        name: "Test Token",
        decimals: 18,
        l1Address: "0x1111111111111111111111111111111111111111",
        l1RegistrationBlock: 1001,
        l1RegistrationTx: "0xtx1",
        l2RegistrationBlock: 100,
      });
    });

    it("should handle logs without correlation gracefully and return no registrations", async () => {
      const mockPortalLogs = [
        {
          eventName: "Registered",
          args: {
            token: "0x1111111111111111111111111111111111111111",
            leaf: "0xleaf",
            tokenId: 1n,
          },
          blockNumber: 1001n,
          transactionHash: "0xtx1",
        },
      ];

      const mockInboxLogs = [
        {
          eventName: "MessageSent",
          args: {
            l2BlockNumber: 100n,
            index: 1n,
            hash: "0xhash",
            rollingHash: "0xrollinghash",
          },
          blockNumber: 1001n,
          transactionHash: "0xtx2", // Different transaction hash
        },
      ];

      mockPublicClient.getLogs.mockResolvedValueOnce(mockPortalLogs).mockResolvedValueOnce(mockInboxLogs);

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const registrations = await collector.getL1TokenRegistrations(1000, 1100);

      expect(consoleSpy).toHaveBeenCalledWith("No correlated inbox log found for portal registration in tx 0xtx1");
      expect(mockPublicClient.readContract).not.toHaveBeenCalled();
      expect(registrations).toHaveLength(0);

      consoleSpy.mockRestore();
    });

    it("should handle errors during scanning", async () => {
      mockPublicClient.getLogs.mockRejectedValueOnce(new Error("RPC Error"));

      await expect(collector.getL1TokenRegistrations(1000, 1100)).rejects.toThrow("RPC Error");
    });
  });
});
