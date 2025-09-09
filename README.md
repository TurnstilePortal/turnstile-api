# Turnstile API

Token bridge system for Ethereum L1 and Aztec L2 networks.

## Architecture

Monorepo with three packages:

- **`packages/api`** - REST API server (Fastify)
  - `/api/v1/tokens` - List all tokens, with optional `limit` and `offset`
  - `/api/v1/tokens/:address` - Get a token by its L1 or L2 address
  - `/api/v1/tokens/bridged` - List all tokens that have been bridged and have complete metadata. This endpoint uses cursor-based pagination with `limit` and `cursor` query parameters.
  - `/health` - Health check endpoint.
  - `/ready` - Readiness check endpoint, including a database connection check.
- **`packages/collector`** - Blockchain data collectors for L1/L2
- **`packages/common`** - Shared database schema (Drizzle ORM) and client

Database schema is defined in `packages/common/src/schema.ts`. See [packages/common/README.md](packages/common/README.md) for migration workflow.

## Setup

```bash
# Install dependencies
pnpm install

# Set up database
cd packages/common
pnpm migrate
```

## Development

```bash
# Run API server
cd packages/api
pnpm dev

# Run collector
cd packages/collector
pnpm dev

# Run tests
pnpm test          # All packages
pnpm test:watch    # Watch mode
pnpm coverage      # Coverage report
```

## Environment Variables

Create `.env` file with:
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - API server port (default: 8080)

Additional environment files for different networks:
- `.env.sandbox`
- `.env.testnet`
- `.env.mainnet`
