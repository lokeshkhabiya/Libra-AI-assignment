# Libra AI

An autonomous AI research agent with a polished chat UI that takes natural-language tasks, plans multi-step execution strategies, dynamically selects tools (web search, web scraping, Google Drive retrieval, vector search), iterates on results, and returns structured answers with citations — all built from scratch without agent frameworks.

## Demo Videos

<a href="https://youtu.be/NVqorjcmXyo" target="_blank">
  <img src="https://img.youtube.com/vi/NVqorjcmXyo/maxresdefault.jpg" width="560" alt="Libra AI Demo Video 1">
</a>

<a href="https://youtu.be/vR_Bs_w1t1c" target="_blank">
  <img src="https://img.youtube.com/vi/vR_Bs_w1t1c/maxresdefault.jpg" width="560" alt="Libra AI Demo Video 2">
</a>

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Express](https://img.shields.io/badge/Express-4.x-green)
![Bun](https://img.shields.io/badge/Runtime-Bun-f472b6)
![Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-ef4444)

---

## Table of Contents

- [Requirements Checklist](#requirements-checklist)
- [High-Level Architecture](#high-level-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Agent Architecture (Deep Dive)](#agent-architecture-deep-dive)
  - [Agent Loop Overview](#agent-loop-overview)
  - [Phase 1: Planning](#phase-1-planning)
  - [Phase 2: Execution Loop](#phase-2-execution-loop)
  - [Phase 3: Observation](#phase-3-observation)
  - [Phase 4: Finalization](#phase-4-finalization)
  - [LLM Integration](#llm-integration)
  - [Output Parsing & Validation](#output-parsing--validation)
- [Tools](#tools)
  - [web_search](#web_search)
  - [web_scrape](#web_scrape)
  - [vector_search](#vector_search)
  - [drive_retrieve](#drive_retrieve)
- [Google Drive Integration](#google-drive-integration)
  - [OAuth Flow](#oauth-flow)
  - [Sync Pipeline](#sync-pipeline)
  - [Ingestion Pipeline](#ingestion-pipeline)
- [Vector Database & Embeddings](#vector-database--embeddings)
- [Real-Time Streaming (SSE)](#real-time-streaming-sse)
- [Background Job System](#background-job-system)
- [Authentication](#authentication)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Frontend Architecture](#frontend-architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)

---

## Requirements Checklist

| Requirement | Status | Implementation |
|---|---|---|
| Takes a natural-language task | Done | Chat input bar sends prompt to `POST /api/tasks`, creates `AgentTask` |
| Autonomously plans steps and executes them | Done | Planner LLM generates `AgentPlanStep[]`, runner loop executes sequentially |
| Chooses tools dynamically | Done | LLM selects from 4 registered tools based on task context |
| Iterates by feeding tool outputs back into the LLM | Done | Observer receives each tool result, decides `continue / replan / finalize` |
| Stops when finished or step limit reached | Done | Observer triggers `finalize`; hard ceiling via `maxSteps` (default 12) |
| Returns structured result with citations/sources | Done | Finalizer produces Markdown answer + deduplicated `CitationInput[]` |
| Google Drive OAuth connection | Done | Full OAuth 2.0 flow with encrypted token storage (AES-256) |
| One-time + incremental ingestion | Done | Full sync + Changes API incremental sync with content-hash dedup |
| Similarity search over Drive content | Done | Pinecone vector search via `vector_search` tool during agent execution |
| No agent frameworks (LangChain, Vercel AI SDK, etc.) | Done | Agent loop, planning, tool orchestration, output parsing all hand-written |
| LLM provider SDK allowed | Done | Uses OpenAI SDK for chat completions and embeddings |
| Polished UI/UX | Done | Real-time streaming, step progress, plan visualization, citation panel |

---

## High-Level Architecture

```mermaid
graph TB
    subgraph Client ["Frontend (Next.js)"]
        UI[Chat UI]
        DS[Drive Dashboard]
        ZS[Zustand Stores]
    end

    subgraph Server ["API Server (Express)"]
        AUTH[Auth Middleware]
        TC[Tasks Controller]
        DC[Drive Controller]
        TE[Task Events<br/>Redis Pub/Sub]
    end

    subgraph Worker ["Worker Process (BullMQ)"]
        ARW[Agent Run Worker]
        DSW[Drive Sync Worker]
        DIW[Drive Ingest Worker]
    end

    subgraph Agent ["Agent Engine"]
        PL[Planner]
        RL[Runner Loop]
        OB[Observer]
        FN[Finalizer]
        T1[web_search]
        T2[web_scrape]
        T3[vector_search]
        T4[drive_retrieve]
    end

    subgraph External ["External Services"]
        OAI[OpenAI API]
        PC[Pinecone]
        GD[Google Drive API]
        FC[Firecrawl API]
    end

    subgraph Data ["Data Layer"]
        PG[(PostgreSQL)]
        RD[(Redis)]
    end

    UI -->|POST /api/tasks| TC
    UI -->|SSE /api/tasks/:id/stream| TE
    DS -->|OAuth + Sync| DC

    TC -->|Enqueue job| RD
    DC -->|Enqueue job| RD

    RD -->|Dequeue| ARW
    RD -->|Dequeue| DSW
    RD -->|Dequeue| DIW

    ARW --> PL
    PL --> RL
    RL --> OB
    OB -->|continue/replan| RL
    OB -->|finalize| FN
    RL --> T1 & T2 & T3 & T4

    T1 & T2 -->|Search/Scrape| FC
    T3 -->|Query vectors| PC
    T4 -->|Fetch file| GD

    PL & OB & FN -->|JSON completions| OAI
    DIW -->|Embeddings| OAI
    DIW -->|Upsert vectors| PC
    DSW -->|List files| GD

    ARW -->|Publish events| TE
    TE -->|SSE stream| UI

    TC & DC & ARW & DSW & DIW --> PG
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | **Bun** | Package manager, script runner, fast JS runtime |
| Monorepo | **Turborepo** | Build orchestration, task caching, dependency graph |
| Frontend | **Next.js 14** | React framework with App Router |
| UI | **shadcn/ui + Tailwind CSS** | Component library + utility-first styling |
| State | **Zustand** | Lightweight state management (chat, auth, drive stores) |
| Backend | **Express** | REST API server |
| Auth | **Better Auth** | Email/password + Google OAuth with Prisma adapter |
| ORM | **Prisma** | Type-safe PostgreSQL client with migrations |
| Database | **PostgreSQL** | Primary relational data store |
| Queue | **BullMQ + Redis** | Background job processing and pub/sub events |
| Vector DB | **Pinecone** | Semantic similarity search with per-user namespaces |
| Embeddings | **OpenAI** (`text-embedding-3-small`) | Document and query embeddings |
| LLM | **OpenAI** (`gpt-5.2`) | Agent planning, observation, and finalization |
| Web Tools | **Firecrawl API** | Web search and web scraping |
| Drive | **Google APIs** | Drive OAuth, file listing, content export |
| Validation | **Zod** | Runtime schema validation for LLM outputs |
| Encryption | **AES-256** | OAuth token encryption at rest |

---

## Project Structure

```
libra-ai/
├── apps/
│   ├── web/                          # Next.js frontend
│   │   └── src/
│   │       ├── app/                  # Pages & layouts
│   │       │   ├── page.tsx          # Root redirect (auth check)
│   │       │   ├── login/            # Sign in / sign up
│   │       │   └── dashboard/        # Main app shell
│   │       │       ├── dashboard.tsx # Orchestrator component
│   │       │       └── drive/        # Drive management page
│   │       ├── components/
│   │       │   ├── chat/             # Message list, assistant msg, step progress, citations
│   │       │   ├── chat-input-bar.tsx
│   │       │   ├── citation-panel.tsx    # PDF/text viewer side panel
│   │       │   ├── drive-connect-*.tsx   # OAuth connect UI
│   │       │   ├── drive-file-picker.tsx # Google Picker + fallback table
│   │       │   ├── drive-file-list.tsx   # Indexed files table
│   │       │   ├── task-sidebar.tsx      # Task history sidebar
│   │       │   └── ui/                   # shadcn/ui primitives
│   │       ├── lib/
│   │       │   ├── chat-store.ts     # Zustand: messages, SSE, steps, citations
│   │       │   ├── drive-store.ts    # Zustand: drive connection status
│   │       │   ├── auth-store.ts     # Zustand: session state
│   │       │   ├── auth-client.ts    # Better Auth React client
│   │       │   └── api/              # Typed API client functions
│   │       │       ├── agent.ts      # Task CRUD + SSE streaming
│   │       │       └── drive.ts      # Drive status, sync, files, picker
│   │       └── hooks/
│   │           └── use-mobile.ts
│   │
│   ├── server/                       # Express API server
│   │   └── src/
│   │       ├── index.ts              # App entry, CORS, routes, shutdown
│   │       ├── agent/                # ← Core agent engine
│   │       │   ├── runner.ts         # Main agent loop orchestrator
│   │       │   ├── planner.ts        # Plan / Observe / Finalize LLM calls
│   │       │   ├── prompts.ts        # System & user prompt builders
│   │       │   ├── output-parser.ts  # Zod schemas for LLM output validation
│   │       │   ├── types.ts          # AgentEvent, AgentPlanStep, etc.
│   │       │   ├── llm.ts           # OpenAI JSON completion wrapper
│   │       │   ├── context.ts        # AgentContext factory (abort, emit)
│   │       │   ├── logger.ts         # Structured logger with task prefixes
│   │       │   └── tools/
│   │       │       ├── registry.ts   # Tool registration & lookup
│   │       │       ├── types.ts      # ToolDefinition, ToolResult interfaces
│   │       │       ├── web-search.ts # Firecrawl search integration
│   │       │       ├── web-scrape.ts # Firecrawl scrape integration
│   │       │       ├── vector-search.ts  # Pinecone similarity search
│   │       │       └── drive-retrieve.ts # Google Drive file content retrieval
│   │       ├── controllers/
│   │       │   ├── tasks.controller.ts   # Create, list, get, stream, cancel
│   │       │   ├── drive.controller.ts   # OAuth, sync, files, disconnect
│   │       │   └── drive-picker-utils.ts # Google Picker file selection
│   │       ├── routers/
│   │       │   ├── tasks.router.ts
│   │       │   └── drive.router.ts
│   │       ├── middleware/
│   │       │   ├── auth.ts           # Session validation guard
│   │       │   └── error.ts          # Error response handler
│   │       └── services/
│   │           └── task-events.ts    # Redis pub/sub for SSE
│   │
│   └── worker/                       # BullMQ worker process
│       └── src/
│           ├── index.ts              # Worker entry + auto-sync scheduler
│           ├── workers/
│           │   ├── agent-run.worker.ts   # Runs agent loop per task
│           │   ├── drive-sync.worker.ts  # Lists + reconciles Drive files
│           │   └── drive-ingest.worker.ts # Extract → chunk → embed → upsert
│           └── services/
│               ├── task-events.ts        # Redis pub/sub (worker side)
│               └── drive/
│                   ├── sync.ts           # Full + incremental sync logic
│                   ├── sync-decision.ts  # New/modified/deleted detection
│                   ├── ingest.ts         # Per-file ingestion pipeline
│                   ├── extract.ts        # Text extraction (Docs/PDF/text)
│                   ├── chunk.ts          # Token-aware text chunking
│                   ├── google-client.ts  # Authorized Drive client helper
│                   ├── retrieval.ts      # Drive file content retrieval
│                   └── auto-sync.ts      # Periodic sync scheduler
│
├── packages/
│   ├── auth/        # Better Auth config (Prisma adapter, providers)
│   ├── db/          # Prisma schema, generated client, PostgreSQL connection
│   ├── env/         # Validated environment schemas (server + web)
│   ├── queue/       # BullMQ queue definitions + Redis connection
│   ├── vector/      # OpenAI embedding helpers (batch, retry, backoff)
│   ├── drive-core/  # Drive OAuth, Pinecone service, token encryption, errors
│   └── config/      # Shared TypeScript base config
│
├── turbo.json       # Turborepo pipeline config
├── package.json     # Root workspace config
└── requirements/
    └── req.md       # Original assignment requirements
```

---

## Agent Architecture (Deep Dive)

The agent is a custom-built autonomous execution engine with no framework dependencies. It follows a **Plan → Execute → Observe → Finalize** architecture with dynamic replanning.

### Agent Loop Overview

```mermaid
flowchart TD
    START([User submits task]) --> LOAD[Load task from DB<br/>Set status → RUNNING]
    LOAD --> PLAN[PLANNER<br/>Generate execution plan]
    PLAN --> EMIT_PLAN[Emit 'plan' SSE event<br/>Persist PLAN step to DB]
    EMIT_PLAN --> CHECK{Pending steps<br/>remaining?}

    CHECK -->|Yes| ABORT{Abort signal<br/>received?}
    CHECK -->|No| FINAL

    ABORT -->|Yes| CANCEL[Set status → CANCELED]
    ABORT -->|No| TOOL[EXECUTE TOOL<br/>Run next planned step]

    TOOL --> EMIT_STEP[Emit 'step:complete' SSE<br/>Persist TOOL step to DB]
    EMIT_STEP --> COLLECT[Collect evidence +<br/>citations from result]
    COLLECT --> LIMIT{stepsCompleted<br/>≥ maxSteps?}

    LIMIT -->|Yes| FINAL
    LIMIT -->|No| OBSERVE[OBSERVER<br/>Evaluate progress]

    OBSERVE --> EMIT_OBS[Emit 'observe' SSE event<br/>Persist OBSERVE step to DB]
    EMIT_OBS --> DECISION{Observer<br/>action?}

    DECISION -->|continue| CHECK
    DECISION -->|replan| APPEND[Append new steps<br/>to pending queue]
    DECISION -->|finalize| FINAL
    APPEND --> CHECK

    FINAL[FINALIZER<br/>Synthesize answer from evidence] --> PERSIST[Persist result + citations<br/>Set status → COMPLETED]
    PERSIST --> EMIT_DONE[Emit 'complete' SSE event]
    EMIT_DONE --> END([Done])

    style PLAN fill:#818cf8,color:#fff
    style OBSERVE fill:#f59e0b,color:#fff
    style FINAL fill:#10b981,color:#fff
    style TOOL fill:#3b82f6,color:#fff
```

### Phase 1: Planning

**File:** `apps/server/src/agent/planner.ts` → `createInitialPlan()`

The planner is the first LLM call in the agent loop. It receives:
- The user's natural-language task prompt
- Available tools with their JSON schemas
- A list of the user's indexed Drive files (for context)
- The hard step limit (`maxSteps`)

The LLM produces a structured JSON plan:

```json
{
  "steps": [
    {
      "description": "Search for recent news about quantum computing",
      "toolName": "web_search",
      "toolInput": { "query": "quantum computing breakthroughs 2025" }
    },
    {
      "description": "Scrape the top result for detailed content",
      "toolName": "web_scrape",
      "toolInput": { "url": "..." }
    }
  ]
}
```

**Key design decisions:**
- The planner prompt explicitly instructs the LLM to use the **minimum** number of steps (not fill up to `maxSteps`)
- Simple queries target 1-3 steps; moderate research 3-5; complex analysis 5-7
- The planner sees indexed Drive files to decide whether `vector_search` / `drive_retrieve` are useful
- Output is validated through a Zod schema (`plannerSchema`) with strict constraints

### Phase 2: Execution Loop

**File:** `apps/server/src/agent/runner.ts` → `runAgentTask()`

The runner processes `pendingPlanSteps` one at a time:

1. **Dequeue** the next `AgentPlanStep` from the pending queue
2. **Look up** the tool from the registry by `toolName`
3. **Execute** the tool with `tool.execute(toolInput, ctx)`
4. **Persist** the step result to PostgreSQL (`AgentStep` record)
5. **Emit** SSE events (`step:start`, `step:complete`)
6. **Collect** evidence summaries and citations from the tool result
7. **Increment** `stepsCompleted` counter

Each tool execution is wrapped in error handling — if a tool throws, the step is marked `FAILED` and the agent continues to the observer.

```mermaid
sequenceDiagram
    participant R as Runner
    participant Reg as Tool Registry
    participant T as Tool
    participant DB as PostgreSQL
    participant SSE as SSE Stream

    R->>Reg: getTool(toolName)
    Reg-->>R: ToolDefinition
    R->>DB: Create AgentStep (RUNNING)
    R->>SSE: Emit step:start
    R->>T: execute(toolInput, ctx)
    T-->>R: ToolResult {success, data, citations}
    R->>DB: Update AgentStep (COMPLETED/FAILED)
    R->>SSE: Emit step:complete
    R->>R: Collect evidence + citations
```

### Phase 3: Observation

**File:** `apps/server/src/agent/planner.ts` → `observeAfterStep()`

After **every** tool execution, the Observer LLM evaluates progress and decides the next action:

| Action | Meaning | Effect |
|---|---|---|
| `continue` | Remaining plan is still valid | Proceed to next pending step |
| `replan` | Current path is insufficient | Append new `AgentPlanStep[]` to the pending queue |
| `finalize` | Sufficient evidence gathered | Break out of loop, go to finalizer |

The observer receives:
- Original task prompt
- Recent step summaries (sliding window of last 6)
- Last executed step + its result
- Remaining planned steps

```json
{
  "action": "replan",
  "reasoning": "The web search didn't find specific data. Need to check the user's Drive documents.",
  "nextSteps": [
    {
      "description": "Search Drive for quarterly reports",
      "toolName": "vector_search",
      "toolInput": { "query": "quarterly report Q3 2024" }
    }
  ]
}
```

**Replanning** is the key mechanism that makes the agent adaptive — if initial web research fails, the observer can pivot to Drive documents, or add more specific search queries.

### Phase 4: Finalization

**File:** `apps/server/src/agent/planner.ts` → `finalizeAgentOutput()`

The finalizer synthesizes all gathered evidence into a structured response:

```json
{
  "summary": "Concise one-line summary",
  "answerMarkdown": "## Full Answer\n\nDetailed markdown response...",
  "confidence": "high",
  "citations": [
    {
      "sourceType": "WEB",
      "title": "Article Title",
      "sourceUrl": "https://...",
      "excerpt": "Relevant excerpt...",
      "rank": 1
    },
    {
      "sourceType": "DRIVE",
      "title": "Q3 Report.docx",
      "driveFileId": "abc123",
      "rank": 2,
      "score": 0.89
    }
  ]
}
```

The finalizer prompt instructs the LLM to use proper Markdown formatting (headings, bold, code blocks, tables, blockquotes) for rich rendering in the UI.

**Fallback:** If the finalizer LLM call fails, a `fallbackFinalResult()` constructs a basic response from the raw evidence.

### LLM Integration

**File:** `apps/server/src/agent/llm.ts`

All LLM calls go through a single `createJsonCompletion()` wrapper:

- Uses OpenAI's `response_format: { type: "json_object" }` for guaranteed JSON output
- Model: `gpt-5.2` (configurable per task)
- Temperature: `0.2` (low for deterministic planning)
- Structured logging of token usage, latency, and finish reasons
- Abort signal support for task cancellation

### Output Parsing & Validation

**File:** `apps/server/src/agent/output-parser.ts`

Every LLM response is validated through Zod schemas before use:

- **`plannerSchema`** — validates `steps[]` with tool name enum, description constraints, and input records
- **`observerSchema`** — validates action enum, reasoning, and optional `nextSteps[]`
- **`finalizerSchema`** — validates summary, markdown answer, confidence level, and citation array
- **Preprocessor** for observer output handles malformed `nextSteps` (strings instead of objects, missing descriptions)

This ensures the agent never crashes on unexpected LLM output.

---

## Tools

All tools are registered in `apps/server/src/agent/tools/registry.ts` and implement the `ToolDefinition` interface:

```typescript
type ToolDefinition = {
  name: AgentToolName;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  execute: (input: Record<string, unknown>, ctx: AgentContext) => Promise<ToolResult>;
};

type ToolResult = {
  success: boolean;
  data: unknown;
  citations?: CitationInput[];
  truncated?: boolean;
};
```

### web_search

**File:** `apps/server/src/agent/tools/web-search.ts`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | string | required | Search query |
| `numResults` | number | 5 | Results to return (1-10) |

- Calls Firecrawl API (`/v2/search`) for organic search results
- Returns top results with title, URL, snippet, and position
- Generates `WEB` citations with rank metadata

### web_scrape

**File:** `apps/server/src/agent/tools/web-scrape.ts`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | string | required | URL to scrape |
| `maxChars` | number | 6000 | Character limit (500-20000) |

- Calls Firecrawl API (`/v2/scrape`) to extract markdown content
- Truncates output if exceeding `maxChars`
- Generates `WEB` citation with title, URL, and excerpt

### vector_search

**File:** `apps/server/src/agent/tools/vector-search.ts`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | string | required | Semantic search query |
| `topK` | number | 5 | Number of results (1-10) |

- Queries the user's Pinecone namespace (`user_{userId}`)
- Returns matching document chunks with similarity scores
- Filters out chunks from deleted files
- Generates `DRIVE` citations with score and metadata

### drive_retrieve

**File:** `apps/server/src/agent/tools/drive-retrieve.ts`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `driveFileId` | string | required | Internal Drive file ID |
| `maxChars` | number | 10000 | Character limit (1000-50000) |

- Retrieves full text content from indexed Drive files
- Supports Google Docs (exported as text), PDFs (from indexed chunks), text/markdown
- Uses OAuth-authenticated Drive client with automatic token refresh
- Generates `DRIVE` citation with web view link

---

## Google Drive Integration

### OAuth Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant BE as Backend
    participant G as Google OAuth

    U->>FE: Click "Connect Google Drive"
    FE->>BE: GET /api/drive/connect?returnTo=/dashboard
    BE->>BE: Generate HMAC-signed state token<br/>(userId + nonce + 10min expiry)
    BE-->>FE: Redirect to Google consent URL
    FE->>G: User authorizes scopes<br/>(drive.readonly, drive.metadata.readonly)
    G-->>BE: GET /api/drive/callback?code=...&state=...
    BE->>BE: Verify state token (HMAC + expiry)
    BE->>G: Exchange code for tokens
    G-->>BE: access_token + refresh_token
    BE->>BE: Encrypt tokens (AES-256)<br/>Fetch Google profile email
    BE->>DB: Upsert DriveConnection record
    BE-->>FE: Redirect to returnTo?connected=1
    FE->>U: Show "Connected" status
```

**Security features:**
- State tokens are HMAC-SHA256 signed with `BETTER_AUTH_SECRET`
- 10-minute expiry with nonce for CSRF protection
- OAuth tokens encrypted at rest with `DRIVE_TOKEN_ENCRYPTION_KEY`
- Automatic token refresh when expiring within 5 minutes

### Sync Pipeline

```mermaid
flowchart LR
    TRIGGER([User clicks Sync<br/>or auto-sync timer]) --> ENQUEUE[Enqueue<br/>drive.sync job]
    ENQUEUE --> WORKER[Drive Sync Worker]

    WORKER --> FULL{Has sync<br/>cursor?}
    FULL -->|No| FULL_SYNC[Full Sync<br/>List all files via Drive API]
    FULL -->|Yes| INCR_SYNC[Incremental Sync<br/>Changes API with cursor]
    INCR_SYNC -->|410 Gone| FULL_SYNC

    FULL_SYNC --> RECONCILE
    INCR_SYNC --> RECONCILE

    RECONCILE[Sync Decision Engine<br/>Compare Google vs DB state] --> NEW[New files<br/>→ Create DriveFile]
    RECONCILE --> MODIFIED[Modified files<br/>→ Update contentHash]
    RECONCILE --> DELETED[Deleted files<br/>→ Soft delete]

    NEW & MODIFIED --> INGEST_Q[Enqueue<br/>drive.ingest jobs]

    style RECONCILE fill:#818cf8,color:#fff
```

**Sync types:**
- **Full sync**: Lists all files from Google Drive matching supported MIME types, compares against DB state
- **Incremental sync**: Uses Google Drive Changes API with stored `syncCursor` to fetch only delta changes
- **Auto-sync**: Periodic scheduler runs incremental syncs at configurable intervals
- **Content hash**: Uses `md5Checksum` or `modifiedTime` to detect actual file changes

### Ingestion Pipeline

```mermaid
flowchart TD
    JOB([drive.ingest job]) --> EXTRACT[Extract Text]

    EXTRACT --> DOCS[Google Docs<br/>Export as text/plain]
    EXTRACT --> PDF[PDFs<br/>Download binary]
    EXTRACT --> TXT[Text/Markdown<br/>Download directly]

    DOCS & PDF & TXT --> NORMALIZE[Normalize Text<br/>Remove null bytes,<br/>collapse whitespace]

    NORMALIZE --> CHUNK[Chunk Text<br/>~500 tokens per chunk<br/>50 token overlap]

    CHUNK --> EMBED[Generate Embeddings<br/>OpenAI text-embedding-3-small<br/>Batch size: 96]

    EMBED --> UPSERT[Upsert to Pinecone]

    UPSERT --> DB_UPDATE[Update Database records]

    style EXTRACT fill:#818cf8,color:#fff
    style CHUNK fill:#f59e0b,color:#fff
    style EMBED fill:#3b82f6,color:#fff
    style UPSERT fill:#10b981,color:#fff
```

**Chunking strategy:**
- Target chunk size: ~500 tokens
- Overlap: 50 tokens between adjacent chunks
- Splits by paragraphs first, then by token count
- Token estimation via whitespace splitting

**Embedding:**
- Model: `text-embedding-3-small`
- Batch processing: 96 texts per API call
- Retry logic with exponential backoff (up to 4 attempts)
- Handles rate limits (429) and server errors (500-504)

**Vector IDs:** Deterministic format `drive_{driveFileId}_{chunkIndex}` enables deduplication on re-ingestion.

---

## Vector Database & Embeddings

```mermaid
flowchart LR
    subgraph Ingestion
        FILE[Drive File] --> CHUNKS[Text Chunks]
        CHUNKS --> EMB[OpenAI Embeddings]
        EMB --> VEC[Vectors + Metadata]
    end

    subgraph Pinecone
        VEC --> NS[Namespace: user_abc123]
        NS --> IDX[(Pinecone Index)]
    end

    subgraph Query
        Q[Agent query] --> QEMB[Query Embedding]
        QEMB --> IDX
        IDX --> RES[Top-K Results<br/>with scores]
    end
```

**Pinecone integration features:**
- **Dual mode support**: Auto-detects index type at startup
  - **Vector mode**: Pre-computed embeddings upserted as dense vectors
  - **Integrated mode**: Pinecone handles embedding internally with `bge-reranker-v2-m3`
- **Per-user namespaces**: `user_{userId}` isolation
- **Batch upsert**: Automatic batching for large document sets
- **Metadata**: Each vector stores `driveFileId`, `googleFileId`, `fileName`, `mimeType`, `chunkIndex`, `userId`

---

## Real-Time Streaming (SSE)

The agent streams execution progress to the frontend in real-time using Server-Sent Events over Redis Pub/Sub.

```mermaid
sequenceDiagram
    participant FE as Frontend (EventSource)
    participant API as API Server
    participant Redis as Redis Pub/Sub
    participant Worker as Worker Process
    participant Agent as Agent Engine

    FE->>API: GET /api/tasks/:id/stream
    API->>API: Set headers (text/event-stream)
    API->>FE: Replay existing steps (catch-up)
    API->>Redis: Subscribe to task:{taskId}

    Worker->>Agent: Run agent loop
    Agent->>Worker: plan event
    Worker->>Redis: Publish plan
    Redis->>API: Forward event
    API->>FE: data: {"type":"plan", "steps":[...]}

    Agent->>Worker: step:start event
    Worker->>Redis: Publish step:start
    Redis->>API: Forward event
    API->>FE: data: {"type":"step:start", ...}

    Agent->>Worker: step:complete event
    Worker->>Redis: Publish step:complete
    Redis->>API: Forward event
    API->>FE: data: {"type":"step:complete", ...}

    Agent->>Worker: observe event
    Worker->>Redis: Publish observe
    Redis->>API: Forward event
    API->>FE: data: {"type":"observe", "action":"continue", ...}

    Agent->>Worker: complete event
    Worker->>Redis: Publish complete
    Redis->>API: Forward event
    API->>FE: data: {"type":"complete", "result":{...}}
```

**SSE Event Types:**

| Event | Payload | When |
|---|---|---|
| `plan` | `{ steps: AgentPlanStep[] }` | After planner generates execution plan |
| `step:start` | `{ stepNumber, planStepIndex, toolName, description }` | Before each tool execution |
| `step:complete` | `{ stepNumber, planStepIndex, toolName, success, summary }` | After each tool execution |
| `observe` | `{ action, reasoning, appendedSteps }` | After observer evaluates each step |
| `complete` | `{ result: FinalizerOutput }` | Final answer ready |
| `error` | `{ message }` | Agent failed or was canceled |

**Resilience:**
- 15-second heartbeat keeps connections alive
- Client-side reconnection on disconnect
- Fallback JSON fetch if stream ends prematurely
- Step replay on reconnect (catch-up mechanism)

---

## Background Job System

```mermaid
flowchart TB
    subgraph Queues ["BullMQ Queues (Redis)"]
        AQ[agentRunQueue<br/>agent.run jobs]
        SQ[driveSyncQueue<br/>drive.sync jobs]
        IQ[driveIngestQueue<br/>drive.ingest jobs]
    end

    subgraph Workers ["Worker Process"]
        AW[Agent Run Worker<br/>concurrency: 2]
        SW[Drive Sync Worker<br/>concurrency: 2]
        IW[Drive Ingest Worker<br/>concurrency: 2]
    end

    AQ --> AW
    SQ --> SW
    IQ --> IW

    SW -->|Enqueues per-file jobs| IQ

    AW -->|Publishes events| REDIS[(Redis Pub/Sub)]

    style AQ fill:#3b82f6,color:#fff
    style SQ fill:#10b981,color:#fff
    style IQ fill:#f59e0b,color:#fff
```

**Job configuration:**
- Retry: 3 attempts with exponential backoff (1500ms base delay)
- Cleanup: Remove completed jobs after 1s, failed after 5s
- Duplicate prevention: Sync jobs check for existing queued jobs per connection
- Graceful shutdown on SIGINT/SIGTERM

---

## Authentication

**Package:** `packages/auth/`

Uses **Better Auth** with Prisma adapter for PostgreSQL:

- **Email/password** sign up and sign in
- **Google OAuth** social login (shared Google OAuth app with Drive)
- Session-based authentication with secure cookies
- `requireAuth` middleware on all API routes extracts `user.id` from session

**Frontend auth flow:**
- `AuthSessionBridge` component subscribes to Better Auth client
- Syncs session state to Zustand `authStore`
- Root page redirects based on auth status
- All API calls include credentials (`fetch` with `credentials: "include"`)

---

## Database Schema

```mermaid
erDiagram
    User ||--o{ Session : has
    User ||--o{ Account : has
    User ||--o{ AgentTask : creates
    User ||--o{ DriveConnection : connects
    User ||--o{ DriveFile : owns

    AgentTask ||--o{ AgentStep : contains
    AgentTask ||--o{ TaskCitation : has

    DriveConnection ||--o{ DriveFile : syncs
    DriveFile ||--o{ DriveChunk : "chunked into"
    DriveFile ||--o{ TaskCitation : "cited by"

    User {
        string id PK
        string email
        string name
        boolean emailVerified
    }

    AgentTask {
        string id PK
        string userId FK
        string title
        string prompt
        string model
        enum status "QUEUED|RUNNING|COMPLETED|FAILED|CANCELED"
        int maxSteps
        int stepsCompleted
        json resultJson
        string errorMessage
    }

    AgentStep {
        string id PK
        string taskId FK
        int stepNumber
        enum kind "PLAN|TOOL|OBSERVE|FINALIZE"
        enum status "PENDING|RUNNING|COMPLETED|FAILED|SKIPPED"
        string toolName
        json input
        json output
        string summary
    }

    TaskCitation {
        string id PK
        string taskId FK
        string stepId FK
        enum sourceType "WEB|DRIVE"
        string title
        string sourceUrl
        string excerpt
        string driveFileId FK
        int rank
        float score
        json metadata
    }

    DriveConnection {
        string id PK
        string userId FK
        enum provider "GOOGLE_DRIVE"
        enum status "CONNECTED|EXPIRED|REVOKED"
        string googleAccountEmail
        string encryptedAccessToken
        string encryptedRefreshToken
        string syncCursor
        datetime lastSyncedAt
    }

    DriveFile {
        string id PK
        string userId FK
        string connectionId FK
        string googleFileId
        string name
        string mimeType
        string webViewLink
        string contentHash
        enum indexStatus "PENDING|INDEXED|FAILED|SKIPPED"
        int chunkCount
        boolean isDeleted
    }

    DriveChunk {
        string id PK
        string driveFileId FK
        int chunkIndex
        text content
        int tokenCount
        string namespace
        string vectorId
        string embeddingModel
    }
```

---

## API Reference

### Task Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tasks` | Create a new agent task |
| `GET` | `/api/tasks` | List tasks (paginated, filterable by status) |
| `GET` | `/api/tasks/:id` | Get task detail with steps and citations |
| `GET` | `/api/tasks/:id/stream` | SSE stream for real-time execution progress |
| `POST` | `/api/tasks/:id/cancel` | Cancel a running task |

### Drive Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/drive/connect` | Initiate Google Drive OAuth flow |
| `GET` | `/api/drive/callback` | Handle OAuth callback |
| `GET` | `/api/drive/status` | Get connection status + file counts |
| `GET` | `/api/drive/picker-token` | Get access token for Google Picker UI |
| `POST` | `/api/drive/picker-select` | Ingest files selected via Picker |
| `POST` | `/api/drive/sync` | Trigger sync (supports `forceFullSync`) |
| `GET` | `/api/drive/files` | List indexed files (paginated, filterable) |
| `GET` | `/api/drive/files/:fileId/content` | Download file content for citation viewer |
| `DELETE` | `/api/drive/disconnect` | Revoke tokens + clear all Drive data |

### Auth Endpoints

| Method | Path | Description |
|---|---|---|
| `*` | `/api/auth/*` | Better Auth handlers (sign in, sign up, session, OAuth) |

All endpoints except auth require a valid session (enforced by `requireAuth` middleware).

---

## Frontend Architecture

### State Management

Three Zustand stores manage all client state:

```mermaid
flowchart LR
    subgraph Stores
        CS[Chat Store]
        DS[Drive Store]
        AS[Auth Store]
    end

    subgraph Components
        CHAT[Chat UI]
        DRIVE[Drive Dashboard]
        HEADER[Header and Auth]
    end

    CS --> CHAT
    DS --> DRIVE
    DS --> CHAT
    AS --> HEADER
    AS --> CHAT
```

### Chat Store (`chat-store.ts`)

The chat store is the most complex piece (~758 lines), managing:

- **Message lifecycle**: pending → streaming → complete/error
- **SSE stream attachment**: `attachTaskStream()` connects to EventSource, parses events
- **Planned steps**: Todo-list UI from `plan` events with status tracking
- **Execution steps**: Real-time tool progress with input/output data
- **Observer log**: Reasoning entries from each observation step
- **Citations**: Aggregated from final result, linked to source files/URLs
- **Task management**: Create, list, select, cancel tasks
- **File attachments**: Temporary file IDs attached to prompts

### UI Components

```mermaid
flowchart TD
    SHELL[DashboardShell] --> SIDEBAR[TaskSidebar]
    SHELL --> HEADER[Header]
    SHELL --> MESSAGES[ChatMessageList]
    SHELL --> INPUT[ChatInputBar]
    SHELL --> CITPANEL[CitationPanel]
    SHELL --> PICKER[DriveFilePicker]
    SHELL --> CONNECT[DriveConnectDialog]

    MESSAGES --> USERMSG[UserMessage]
    MESSAGES --> ASTMSG[AssistantMessage]

    ASTMSG --> STEPS[StepProgress]
    ASTMSG --> CITLIST[CitationList]

    STEPS --> PLAN_VIEW[Execution Plan]
    STEPS --> LIVE_VIEW[Live Execution]
```

**Key UI features:**
- **Step Progress**: Displays planned steps as a checklist, live execution with tool icons, and observer reasoning interleaved
- **Markdown Rendering**: `react-markdown` with `remark-gfm` for rich formatted answers
- **Citation Panel**: Side drawer with PDF viewer (`react-pdf`) and plain text viewer
- **Google Picker**: Native Google Drive file picker with fallback table of indexed files
- **Auto-scroll**: Chat scrolls to bottom on new messages
- **Responsive**: Mobile task switcher tabs, collapsible sidebar

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime
- PostgreSQL database
- Redis instance
- [Pinecone](https://pinecone.io) account with an index
- [OpenAI](https://platform.openai.com) API key
- [Google Cloud Console](https://console.cloud.google.com) project with Drive API enabled
- [Firecrawl](https://firecrawl.dev) API key

### Installation

```bash
# Clone and install dependencies
git clone <repo-url>
cd libra-ai
bun install
```

### Environment Setup

Create `.env` files in each app directory (see [Environment Variables](#environment-variables) below).

### Database Setup

```bash
# Run migrations
bun run db:migrate

# Or push schema directly (development)
bun run db:push
```

### Start Development

```bash
# Start all apps (web + server + worker)
bun run dev
```

- **Web:** [http://localhost:3001](http://localhost:3001)
- **API:** [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

### Server (`apps/server/.env`)

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/libra
REDIS_URL=redis://localhost:6379
BETTER_AUTH_SECRET=your-32-char-secret
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3001
OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX=your-index-name
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3000/api/drive/callback
DRIVE_TOKEN_ENCRYPTION_KEY=your-32-char-encryption-key
NODE_ENV=development
```

### Worker (`apps/worker/.env`)

Same as server (shares the same environment).

### Web (`apps/web/.env`)

```env
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_API_KEY=AIza...
```

---

## Available Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start all apps in development mode |
| `bun run dev:web` | Start only the Next.js frontend |
| `bun run dev:server` | Start only the Express API server |
| `bun run dev:worker` | Start only the BullMQ worker |
| `bun run build` | Build all apps |
| `bun run check-types` | TypeScript type check across all packages |
| `bun run db:migrate` | Run pending Prisma migrations |
| `bun run db:push` | Push schema changes without migrations |
| `bun run db:generate` | Regenerate Prisma client |
| `bun run db:studio` | Open Prisma Studio |
