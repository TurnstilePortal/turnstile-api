# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Turnstile API is a token bridge system for Ethereum L1 and Aztec L2 networks, built as a TypeScript monorepo using pnpm workspaces.

## Architecture

The project consists of three packages:

- **`packages/api`**: REST API server using Fastify
  - Token endpoints with pagination support
  - Health and readiness checks
  - Uses Drizzle ORM for database operations

- **`packages/collector`**: Blockchain data collectors
  - Collects token data from Ethereum L1 and Aztec L2
  - CLI tool for testing collectors independently
  - Uses viem for L1 and @aztec/aztec.js for L2

- **`packages/common`**: Shared database schema and client
  - Drizzle ORM schema definitions in `src/schema.ts`
  - Database migrations managed with drizzle-kit
  - Shared types for tokens and block progress

## Key Commands

### Development
```bash
# Install dependencies (from root)
pnpm install

# Run API server
cd packages/api && pnpm dev

# Run collector
cd packages/collector && pnpm dev

# Test collector modes
cd packages/collector
pnpm test:l1   # Test L1 collector only
pnpm test:l2   # Test L2 collector only
pnpm test:both # Test both collectors
```

### Testing
```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm coverage

# Coverage UI
pnpm coverage:ui

# Run tests for specific package
cd packages/[api|collector|common] && pnpm test
```

### Code Quality
```bash
# Lint and fix
pnpm lint

# Format code
pnpm format

# Run all checks (lint + format)
pnpm check
```

### Database Operations
```bash
cd packages/common

# Generate migration from schema changes
pnpm generate

# Apply migrations to database
pnpm migrate

# Open Drizzle Studio for database inspection
pnpm studio
```

### Build
```bash
# Build all packages
pnpm build

# Build specific package
cd packages/[api|collector|common] && pnpm build
```

## Database Schema

The database uses PostgreSQL with two main tables defined in `packages/common/src/schema.ts`:

- **tokens**: Stores token information with L1/L2 addresses, metadata, and registration details
- **block_progress**: Tracks blockchain scanning state for both L1 and L2

When modifying the schema:
1. Edit `packages/common/src/schema.ts`
2. Run `pnpm generate` to create migration
3. Review generated SQL in `migrations/`
4. Run `pnpm migrate` to apply changes
5. Commit all migration files including `meta/` directory

## Code Standards

- **Formatter**: Biome with 2-space indentation, double quotes, 120 line width
- **Testing**: Vitest for all packages
- **TypeScript**: Strict mode enabled
- **Import style**: Use workspace protocol for internal packages (`workspace:^`)

## Environment Configuration

Create `.env` file with:
- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: API server port (default: 8080)

Network-specific environment files:
- `.env.sandbox`
- `.env.testnet`
- `.env.mainnet`

## API Endpoints

- `GET /api/v1/tokens` - List tokens with pagination (`limit`, `offset`)
- `GET /api/v1/tokens/:address` - Get token by L1 or L2 address
- `GET /api/v1/tokens/bridged` - List bridged tokens with cursor pagination
- `GET /health` - Health check
- `GET /ready` - Readiness check with database connection test