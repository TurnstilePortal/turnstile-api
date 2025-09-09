import { L1Collector } from "../collectors/l1.js";
import { L2Collector } from "../collectors/l2.js";
import { storeL1TokenRegistrations, storeL2TokenRegistrations } from "../db.js";
import { BlockProgressService } from "./block-progress.js";

export interface CollectorServiceConfig {
  l1: ConstructorParameters<typeof L1Collector>[0];
  l2: ConstructorParameters<typeof L2Collector>[0];
  pollingInterval?: number;
}

interface ResolvedCollectorServiceConfig {
  l1: ConstructorParameters<typeof L1Collector>[0] & {
    startBlock: number;
    chunkSize: number;
  };
  l2: ConstructorParameters<typeof L2Collector>[0] & {
    startBlock: number;
    chunkSize: number;
  };
  pollingInterval: number;
}

export class CollectorService {
  private l1Collector: L1Collector;
  private l2Collector: L2Collector;
  private blockProgress = new BlockProgressService();
  private pollingInterval: number;
  private config: ResolvedCollectorServiceConfig;

  constructor(config: CollectorServiceConfig) {
    this.config = {
      l1: {
        ...config.l1,
        startBlock: config.l1.startBlock ?? 0,
        chunkSize: config.l1.chunkSize ?? 1000,
      },
      l2: {
        ...config.l2,
        startBlock: config.l2.startBlock ?? 1,
        chunkSize: config.l2.chunkSize ?? 100,
      },
      pollingInterval: config.pollingInterval ?? 30000,
    };
    this.l1Collector = new L1Collector(this.config.l1);
    this.l2Collector = new L2Collector(this.config.l2);
    this.pollingInterval = this.config.pollingInterval;
  }

  async start() {
    console.log("Starting CollectorService...");

    // Main polling loop
    while (true) {
      try {
        // Fetch and store L1 and L2 registrations
        const isCaughtUp = await this.poll();

        // Only wait if we're caught up with both chains
        if (isCaughtUp) {
          console.log(`Caught up with both chains. Waiting ${this.pollingInterval}ms before next poll...`);
          await new Promise((resolve) => setTimeout(resolve, this.pollingInterval));
        } else {
          console.log("Still catching up, polling again immediately...");
        }
      } catch (error) {
        console.error("CollectorService encountered an error:", error);
        // Always wait after an error to avoid rapid retry loops
        await new Promise((resolve) => setTimeout(resolve, this.pollingInterval));
      }
    }
  }

  public async poll(): Promise<boolean> {
    console.log("Polling for new data...");

    const [lastScannedL1Block, lastScannedL2Block] = await Promise.all([
      this.blockProgress.getLastScannedBlock("L1"),
      this.blockProgress.getLastScannedBlock("L2"),
    ]);

    // Use the configured start block if we haven't scanned any blocks yet
    const fromL1Block =
      lastScannedL1Block === 0 && this.config.l1.startBlock ? this.config.l1.startBlock : lastScannedL1Block + 1;
    const fromL2Block =
      lastScannedL2Block === 0 && this.config.l2.startBlock ? this.config.l2.startBlock : lastScannedL2Block + 1;

    const [currentL1Block, currentL2Block] = await Promise.all([
      this.l1Collector.getBlockNumber(),
      this.l2Collector.getBlockNumber(),
    ]);

    const toL1Block = Math.min(fromL1Block + this.config.l1.chunkSize - 1, currentL1Block);
    const toL2Block = Math.min(fromL2Block + this.config.l2.chunkSize - 1, currentL2Block);

    // Track if each chain is caught up
    let l1CaughtUp = fromL1Block > currentL1Block;
    let l2CaughtUp = fromL2Block > currentL2Block;

    // Skip if we're already caught up
    if (l1CaughtUp && l2CaughtUp) {
      console.log(`Already caught up - L1: ${currentL1Block}, L2: ${currentL2Block}`);
      return true;
    }

    // Process L1 if there are blocks to scan
    if (!l1CaughtUp) {
      console.log(`Scanning L1 blocks ${fromL1Block} to ${toL1Block} (current: ${currentL1Block})`);
      const l1Registrations = await this.l1Collector.getL1TokenRegistrations(fromL1Block, toL1Block);

      if (l1Registrations.length > 0) {
        console.log(`Found ${l1Registrations.length} L1 token registrations`);
        await storeL1TokenRegistrations(l1Registrations);
      }

      await this.blockProgress.updateLastScannedBlock("L1", toL1Block);

      // Check if L1 is now caught up after this scan
      l1CaughtUp = toL1Block >= currentL1Block;
    }

    // Process L2 if there are blocks to scan
    if (!l2CaughtUp) {
      console.log(`Scanning L2 blocks ${fromL2Block} to ${toL2Block} (current: ${currentL2Block})`);
      const l2Registrations = await this.l2Collector.getL2TokenRegistrations(fromL2Block, toL2Block);

      if (l2Registrations.length > 0) {
        console.log(`Found ${l2Registrations.length} L2 token registrations`);
        await storeL2TokenRegistrations(l2Registrations);
      }

      await this.blockProgress.updateLastScannedBlock("L2", toL2Block);

      // Check if L2 is now caught up after this scan
      l2CaughtUp = toL2Block >= currentL2Block;
    }

    console.log(`Polling complete. L1 caught up: ${l1CaughtUp}, L2 caught up: ${l2CaughtUp}`);

    // Return true only if both chains are caught up
    return l1CaughtUp && l2CaughtUp;
  }
}
