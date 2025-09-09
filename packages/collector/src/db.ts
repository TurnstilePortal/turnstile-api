import { createDbClient, type DbClient } from "@turnstile-portal/api-common";
import type { NewToken } from "@turnstile-portal/api-common/schema";
import { tokens } from "@turnstile-portal/api-common/schema";

// Export DbClient type for other modules to use
export type { DbClient };

let db: DbClient | null = null;

export function getDatabase(): DbClient {
  if (db) return db;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  db = createDbClient(databaseUrl);
  return db;
}

export async function destroyDatabase(): Promise<void> {
  if (db) {
    const client = (db as { $client?: { end?: () => Promise<void>; ended?: boolean } }).$client;
    // Check if it's a PostgreSQL Pool that needs closing
    if (client && typeof client.end === "function" && !client.ended) {
      await client.end();
    }
    // For PGLite, no explicit close needed
    db = null;
  }
}

// For testing purposes - allows setting a custom database instance
export function setDatabase(database: DbClient | null): void {
  db = database;
}

export async function storeL1TokenRegistrations(registrations: NewToken[]): Promise<void> {
  if (registrations.length === 0) return;
  const db = getDatabase();

  for (const registration of registrations) {
    await db
      .insert(tokens)
      .values(registration)
      .onConflictDoUpdate({
        target: tokens.l1Address,
        set: {
          ...registration,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`Stored ${registrations.length} L1 token registrations.`);
}

export async function storeL2TokenRegistrations(registrations: Partial<NewToken>[]): Promise<void> {
  if (registrations.length === 0) return;
  const db = getDatabase();

  for (const registration of registrations) {
    if (!registration.l1Address) {
      console.warn("Skipping L2 registration with no L1 address", registration);
      continue;
    }
    // Use upsert to handle both new tokens (L2 found before L1) and updates (L1 already exists)
    await db
      .insert(tokens)
      .values({
        l1Address: registration.l1Address,
        l2Address: registration.l2Address,
        l2RegistrationBlock: registration.l2RegistrationBlock,
        l2RegistrationTxIndex: registration.l2RegistrationTxIndex,
        l2RegistrationLogIndex: registration.l2RegistrationLogIndex,
        // These fields will be null when L2 is found before L1
        symbol: null,
        name: null,
        decimals: null,
        l1RegistrationBlock: null,
        l1RegistrationTx: null,
      })
      .onConflictDoUpdate({
        target: tokens.l1Address,
        set: {
          l2Address: registration.l2Address,
          l2RegistrationBlock: registration.l2RegistrationBlock,
          l2RegistrationTxIndex: registration.l2RegistrationTxIndex,
          l2RegistrationLogIndex: registration.l2RegistrationLogIndex,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`Stored ${registrations.length} L2 token registrations.`);
}
