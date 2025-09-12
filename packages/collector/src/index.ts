import "dotenv/config";
import { getNetworkConfig } from "./config/networks.js";
import { destroyDatabase } from "./db.js";
import { CollectorService } from "./services/collector-service.js";

async function main() {
  console.log("Starting blockchain collector...");

  const config = await getNetworkConfig();
  const pollingInterval = parseInt(process.env.POLLING_INTERVAL_MS || "30000", 10);

  const service = new CollectorService({
    l1: {
      rpcUrl: config.l1.rpcUrl,
      portalAddress: config.l1.portalAddress,
      inboxAddress: config.l1.inboxAddress,
      allowListAddress: config.l1.allowListAddress,
      startBlock: config.l1.startBlock,
      chunkSize: config.l1.chunkSize,
      network: config.l1.network,
    },
    l2: {
      nodeUrl: config.l2.nodeUrl,
      portalAddress: config.l2.portalAddress,
      startBlock: config.l2.startBlock,
      chunkSize: config.l2.chunkSize,
    },
    pollingInterval,
  });

  process.on("SIGINT", async () => {
    console.log("\nReceived SIGINT, shutting down gracefully...");
    await destroyDatabase();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\nReceived SIGTERM, shutting down gracefully...");
    await destroyDatabase();
    process.exit(0);
  });

  try {
    await service.start();
  } catch (error) {
    console.error("Fatal error:", error);
    await destroyDatabase();
    process.exit(1);
  }
}

main();
