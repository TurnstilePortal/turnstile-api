import { InboxAbi } from "@aztec/l1-artifacts/InboxAbi";
import type { NewToken } from "@turnstile-portal/api-common/schema";
import { IAllowListABI, ITokenPortalABI } from "@turnstile-portal/l1-artifacts-abi";
import { createPublicClient, erc20Abi, getAbiItem, http, type PublicClient } from "viem";
import { anvil, mainnet, sepolia } from "viem/chains";
import { normalizeL1Address } from "../utils/address.js";
import { allowListStatusNumberToString } from "../utils/l1.js";

const MESSAGE_SENT_EVENT = getAbiItem({ abi: InboxAbi, name: "MessageSent" });
const REGISTERED_EVENT = getAbiItem({ abi: ITokenPortalABI, name: "Registered" });
const ALLOW_LIST_STATUS_UPDATED_EVENT = getAbiItem({ abi: IAllowListABI, name: "StatusUpdated" });

// Helper function to get chain by network name
function getChainByNetwork(network: string) {
  switch (network) {
    case "mainnet":
      return mainnet;
    case "sepolia":
    case "testnet":
      return sepolia;
    case "sandbox":
      return anvil;
    default:
      console.warn(`Unknown network "${network}", using undefined`);
      return undefined;
  }
}

export interface L1CollectorConfig {
  rpcUrl: string;
  portalAddress: `0x${string}`;
  allowListAddress: `0x${string}`;
  inboxAddress: `0x${string}`;
  startBlock?: number;
  chunkSize?: number;
  network: string;
}

export class L1Collector {
  private publicClient: PublicClient;
  private config: Required<L1CollectorConfig>;

  constructor(config: L1CollectorConfig) {
    this.config = {
      startBlock: 0,
      chunkSize: 1000,
      ...config,
    };

    const chain = getChainByNetwork(this.config.network);
    this.publicClient = createPublicClient({
      chain,
      transport: http(this.config.rpcUrl),
    });
  }

  async getL1TokenAllowListEvents(fromBlock: number, toBlock: number): Promise<NewToken[]> {
    console.log(`Scanning L1 blocks ${fromBlock} to ${toBlock} for Proposed events`);

    const allowListLogs = await this.publicClient.getLogs({
      address: this.config.allowListAddress,
      event: ALLOW_LIST_STATUS_UPDATED_EVENT,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });

    const allowListTokens: NewToken[] = [];

    for (const log of allowListLogs) {
      if (log.eventName !== "StatusUpdated" || !log.args.addr || !log.args.status) {
        console.warn(
          `Skipping invalid allowList StatusUpdated log in tx ${log.transactionHash} with args ${JSON.stringify(log.args)}`,
        );
        continue;
      }

      const l1AllowListStatus = allowListStatusNumberToString(log.args.status);
      let resolution = false;

      if (l1AllowListStatus === "ACCEPTED" || l1AllowListStatus === "REJECTED") {
        resolution = true;
      }

      allowListTokens.push({
        l1AllowListStatus: allowListStatusNumberToString(log.args.status ?? 0),
        l1AllowListProposalTx: resolution ? undefined : log.transactionHash,
        l1AllowListResolutionTx: resolution ? log.transactionHash : undefined,
        l1Address: normalizeL1Address(log.args.addr),
      });
    }

    return allowListTokens;
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
