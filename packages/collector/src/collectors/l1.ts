import { InboxAbi } from "@aztec/l1-artifacts/InboxAbi";
import type { NewToken } from "@turnstile-portal/api-common/schema";
import { ITokenPortalABI } from "@turnstile-portal/l1-artifacts-abi";
import { createPublicClient, erc20Abi, getAbiItem, http, type PublicClient } from "viem";
import { anvil, mainnet, sepolia } from "viem/chains";
import { normalizeL1Address } from "../utils/address.js";

const MESSAGE_SENT_EVENT = getAbiItem({ abi: InboxAbi, name: "MessageSent" });
const REGISTERED_EVENT = getAbiItem({ abi: ITokenPortalABI, name: "Registered" });

// Helper function to get chain by network name
function getChainByNetwork(network: "mainnet" | "sepolia" | "sandbox") {
  switch (network) {
    case "mainnet":
      return mainnet;
    case "sepolia":
      return sepolia;
    case "sandbox":
      return anvil;
    default:
      console.warn(`Unknown network "${network}", defaulting to anvil`);
      return anvil;
  }
}

export interface L1CollectorConfig {
  rpcUrl: string;
  portalAddress: `0x${string}`;
  inboxAddress: `0x${string}`;
  startBlock?: number;
  chunkSize?: number;
  network?: "mainnet" | "sepolia" | "sandbox";
}

export class L1Collector {
  private publicClient: PublicClient;
  private config: Required<L1CollectorConfig>;

  constructor(config: L1CollectorConfig) {
    this.config = {
      startBlock: 0,
      chunkSize: 1000,
      network: "sepolia",
      ...config,
    };

    const chain = getChainByNetwork(this.config.network);
    this.publicClient = createPublicClient({
      chain,
      transport: http(this.config.rpcUrl),
    });
  }

  async getL1TokenRegistrations(fromBlock: number, toBlock: number): Promise<NewToken[]> {
    console.log(`Scanning L1 blocks ${fromBlock} to ${toBlock} for Registered events`);

    const portalLogsPromise = this.publicClient.getLogs({
      address: this.config.portalAddress,
      event: REGISTERED_EVENT,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });

    const inboxLogsPromise = this.publicClient.getLogs({
      address: this.config.inboxAddress,
      event: MESSAGE_SENT_EVENT,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });

    const [portalLogs, inboxLogs] = await Promise.all([portalLogsPromise, inboxLogsPromise]);

    const inboxLogsByTxHash = new Map<string, (typeof inboxLogs)[0]>();
    for (const inboxLog of inboxLogs) {
      inboxLogsByTxHash.set(inboxLog.transactionHash, inboxLog);
    }

    const registrations: NewToken[] = [];

    for (const portalLog of portalLogs) {
      const correlatedInboxLog = inboxLogsByTxHash.get(portalLog.transactionHash);

      if (!correlatedInboxLog) {
        console.warn(`No correlated inbox log found for portal registration in tx ${portalLog.transactionHash}`);
        continue;
      }

      if (portalLog.eventName !== "Registered" || !portalLog.args.token) {
        continue;
      }

      const tokenAddress = portalLog.args.token;
      const [name, symbol, decimals] = await Promise.all([
        this.publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "name",
        }),
        this.publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "symbol",
        }),
        this.publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "decimals",
        }),
      ]);

      registrations.push({
        symbol,
        name,
        decimals: Number(decimals),
        l1Address: normalizeL1Address(tokenAddress),
        l1RegistrationBlock: Number(portalLog.blockNumber),
        l1RegistrationTx: portalLog.transactionHash,
        l2RegistrationBlock: Number(correlatedInboxLog.args.l2BlockNumber),
      });
    }

    return registrations;
  }

  async getBlockNumber(): Promise<number> {
    return Number(await this.publicClient.getBlockNumber());
  }
}
