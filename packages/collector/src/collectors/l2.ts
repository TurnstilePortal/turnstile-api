import { type AztecNode, createAztecNodeClient } from "@aztec/aztec.js";
import type { NewToken } from "@turnstile-portal/api-common/schema";
import { normalizeL1Address, normalizeL2Address } from "../utils/address.js";
import { scanForRegisterEvents } from "../utils/portal-events.js";

export interface L2CollectorConfig {
  nodeUrl: string;
  portalAddress: string;
  startBlock?: number;
  chunkSize?: number;
}

export class L2Collector {
  private aztecNode: AztecNode;
  private config: Required<L2CollectorConfig>;

  constructor(config: L2CollectorConfig) {
    this.config = {
      startBlock: 1,
      chunkSize: 100,
      ...config,
    };

    this.aztecNode = createAztecNodeClient(this.config.nodeUrl);
  }

  async getL2TokenRegistrations(fromBlock: number, toBlock: number): Promise<Partial<NewToken>[]> {
    console.log(`Scanning L2 blocks ${fromBlock} to ${toBlock} for Register events`);

    const events = await scanForRegisterEvents(this.aztecNode, this.config.portalAddress, fromBlock, toBlock);

    const registrations: Partial<NewToken>[] = [];

    for (const event of events) {
      registrations.push({
        l1Address: normalizeL1Address(event.ethToken.toString()),
        l2Address: normalizeL2Address(event.aztecToken.toString()),
        l2RegistrationBlock: event.blockNumber,
        l2RegistrationTxIndex: event.txIndex,
        l2RegistrationLogIndex: event.logIndex,
      });
    }

    if (registrations.length > 0) {
      console.log(`Found ${registrations.length} L2 token registration(s)`);
    }

    return registrations;
  }

  async getBlockNumber(): Promise<number> {
    return this.aztecNode.getBlockNumber();
  }
}
