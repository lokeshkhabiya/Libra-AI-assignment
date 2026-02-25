# libra-ai

An AI-powered document assistant that connects to Google Drive, indexes your files into a vector database, and enables semantic search and retrieval-augmented generation over your personal knowledge base.

## Tech Stack

- **TypeScript** - Type safety across the full monorepo
- **Next.js** - Frontend application
- **TailwindCSS + shadcn/ui** - UI components and styling
- **Express** - Backend API server
- **Bun** - Runtime and package manager
- **Prisma** - TypeScript-first ORM
- **PostgreSQL** - Primary database
- **Better Auth** - Authentication (email/password + Google OAuth)
- **BullMQ + Redis** - Background job queue
- **Pinecone** - Vector database for semantic search
- **OpenAI** - Text embeddings
- **Turborepo** - Monorepo build orchestration

## What's Implemented

### Authentication
- Email/password sign up and sign in
- Google OAuth social login
- Session management via Better Auth
- Protected routes and API middleware

### Google Drive Integration
- OAuth 2.0 connect/disconnect flow with encrypted token storage (AES-256)
- **Full sync** — lists all supported files from Drive and upserts them to the database
- **Incremental sync** — uses the Google Drive Changes API with a cursor to process only changed files since last sync; falls back to full sync on stale cursor (HTTP 410)
- Supported file types: Google Docs, Google Sheets, Google Slides, plain text, PDF, DOCX, XLSX, CSV, Markdown

### Document Ingestion Pipeline
Each Drive file goes through an async background pipeline:
1. **Extract** — pulls raw text from the file via Drive export API
2. **Chunk** — splits text into overlapping token-aware chunks
3. **Embed** — generates embeddings via OpenAI (skipped for Pinecone integrated indexes)
4. **Upsert** — writes vectors + metadata to Pinecone and chunk records to PostgreSQL
5. **Status tracking** — each file tracks `PENDING → INDEXED / FAILED / SKIPPED` with error messages stored

### Vector Database
- Pinecone integration with automatic index mode detection at startup
- **Vector mode** — manual OpenAI embeddings upserted as dense vectors
- **Integrated mode** — Pinecone's built-in embedding + `bge-reranker-v2-m3` reranking
- Per-user namespaced indexes

### Background Workers
BullMQ workers running co-located with the Express server:
- **drive-sync worker** — processes sync jobs (full or incremental), concurrency 2
- **drive-ingest worker** — processes per-file ingestion jobs with retry (3 attempts, exponential backoff), concurrency 2
- Graceful shutdown hooks (SIGINT/SIGTERM)

### Database Schema
- `User`, `Session`, `Account`, `Verification` — managed by Better Auth
- `DriveConnection` — stores OAuth tokens (encrypted), sync cursor, connection status
- `DriveFile` — mirrors Drive file metadata with ingestion status and soft-delete support
- `DriveChunk` — stores chunked text with vector IDs and embedding model metadata
- `AgentTask`, `AgentStep`, `TaskCitation` — schema ready for the agent runner (not yet implemented)

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/*` | Better Auth handlers (sign in, sign up, session, OAuth) |
| `GET` | `/api/drive/connect` | Initiate Google Drive OAuth flow |
| `GET` | `/api/drive/callback` | Handle OAuth callback and store tokens |
| `GET` | `/api/drive/status` | Get current Drive connection status |
| `POST` | `/api/drive/sync` | Trigger a Drive sync job |
| `GET` | `/api/drive/files` | List indexed Drive files with status |
| `DELETE` | `/api/drive/disconnect` | Revoke Drive connection and clear data |

## Project Structure

```
libra-ai/
├── apps/
│   ├── web/              # Next.js frontend
│   │   └── src/
│   │       ├── app/      # Pages (dashboard, drive, login)
│   │       ├── components/  # UI components
│   │       └── lib/      # Auth client, API helpers
│   └── server/           # Express API server
│       └── src/
│           ├── controllers/  # Route handlers
│           ├── middleware/   # Auth guard, error handler
│           ├── routers/      # Express routers
│           ├── services/     # Business logic
│           │   ├── drive/    # Sync, ingest, extract, chunk, embed
│           │   ├── crypto/   # Token encryption
│           │   └── pinecone.service.ts
│           └── workers/      # BullMQ workers
├── packages/
│   ├── auth/             # Better Auth configuration
│   ├── db/               # Prisma schema and generated client
│   ├── env/              # T3 OSS validated env schemas
│   ├── queue/            # BullMQ queues, Redis connection, job types
│   ├── vector/           # Pinecone abstraction (upsert, query, search, delete)
│   └── config/           # Shared TypeScript config
```

## Getting Started

Install dependencies:

```bash
bun install
```

Set up environment variables in `apps/server/.env`:

```env
DATABASE_URL=
REDIS_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
CORS_ORIGIN=
OPENAI_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_DRIVE_REDIRECT_URI=
DRIVE_TOKEN_ENCRYPTION_KEY=
NODE_ENV=development
```

Apply the database schema:

```bash
bun run db:migrate
```

Run the development servers:

```bash
bun run dev
```

- Web: [http://localhost:3001](http://localhost:3001)
- API: [http://localhost:3000](http://localhost:3000)

## Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start all apps in development mode |
| `bun run dev:web` | Start only the web app |
| `bun run dev:server` | Start only the API server |
| `bun run build` | Build all apps |
| `bun run check-types` | TypeScript type check across all packages |
| `bun run db:migrate` | Run pending migrations |
| `bun run db:push` | Push schema changes without migrations |
| `bun run db:generate` | Regenerate Prisma client |
| `bun run db:studio` | Open Prisma Studio |

## What's Next

- Agent runner — task execution engine using `AgentTask` / `AgentStep` schema with tool use (web search, web scrape, Drive retrieval, vector search)
- Retrieval API — semantic search endpoint over indexed Drive files
- Chat UI — frontend for querying the knowledge base
