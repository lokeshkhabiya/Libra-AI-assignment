-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "StepKind" AS ENUM ('PLAN', 'TOOL', 'OBSERVE', 'FINALIZE');

-- CreateEnum
CREATE TYPE "ToolName" AS ENUM ('WEB_SEARCH', 'WEB_SCRAPE', 'DRIVE_RETRIEVE', 'VECTOR_SEARCH');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('WEB', 'DRIVE');

-- CreateEnum
CREATE TYPE "DriveProvider" AS ENUM ('GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'INDEXED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "agent_task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "prompt" TEXT NOT NULL,
    "model" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "maxSteps" INTEGER NOT NULL DEFAULT 12,
    "stepsCompleted" INTEGER NOT NULL DEFAULT 0,
    "resultJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_step" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "kind" "StepKind" NOT NULL,
    "toolName" "ToolName",
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "summary" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_citation" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "stepId" TEXT,
    "sourceType" "SourceType" NOT NULL,
    "title" TEXT,
    "sourceUrl" TEXT,
    "excerpt" TEXT,
    "driveFileId" TEXT,
    "rank" INTEGER,
    "score" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_connection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "DriveProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "status" "ConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "googleAccountEmail" TEXT,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "syncCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_file" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "googleFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "webViewLink" TEXT,
    "contentHash" TEXT,
    "modifiedAtGoogle" TIMESTAMP(3),
    "lastIndexedAt" TIMESTAMP(3),
    "indexStatus" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "indexError" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_chunk" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "namespace" TEXT NOT NULL,
    "vectorId" TEXT,
    "embeddingModel" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_task_userId_createdAt_idx" ON "agent_task"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_task_status_createdAt_idx" ON "agent_task"("status", "createdAt");

-- CreateIndex
CREATE INDEX "agent_step_taskId_status_idx" ON "agent_step"("taskId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_step_taskId_stepNumber_key" ON "agent_step"("taskId", "stepNumber");

-- CreateIndex
CREATE INDEX "task_citation_taskId_rank_idx" ON "task_citation"("taskId", "rank");

-- CreateIndex
CREATE INDEX "task_citation_driveFileId_idx" ON "task_citation"("driveFileId");

-- CreateIndex
CREATE INDEX "drive_connection_status_idx" ON "drive_connection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "drive_connection_userId_provider_key" ON "drive_connection"("userId", "provider");

-- CreateIndex
CREATE INDEX "drive_file_userId_modifiedAtGoogle_idx" ON "drive_file"("userId", "modifiedAtGoogle");

-- CreateIndex
CREATE INDEX "drive_file_indexStatus_idx" ON "drive_file"("indexStatus");

-- CreateIndex
CREATE UNIQUE INDEX "drive_file_userId_googleFileId_key" ON "drive_file"("userId", "googleFileId");

-- CreateIndex
CREATE INDEX "drive_chunk_userId_namespace_idx" ON "drive_chunk"("userId", "namespace");

-- CreateIndex
CREATE INDEX "drive_chunk_driveFileId_idx" ON "drive_chunk"("driveFileId");

-- CreateIndex
CREATE UNIQUE INDEX "drive_chunk_driveFileId_chunkIndex_key" ON "drive_chunk"("driveFileId", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "drive_chunk_namespace_vectorId_key" ON "drive_chunk"("namespace", "vectorId");

-- AddForeignKey
ALTER TABLE "agent_task" ADD CONSTRAINT "agent_task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_step" ADD CONSTRAINT "agent_step_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "agent_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_citation" ADD CONSTRAINT "task_citation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "agent_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_citation" ADD CONSTRAINT "task_citation_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "agent_step"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_citation" ADD CONSTRAINT "task_citation_driveFileId_fkey" FOREIGN KEY ("driveFileId") REFERENCES "drive_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_connection" ADD CONSTRAINT "drive_connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_file" ADD CONSTRAINT "drive_file_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_file" ADD CONSTRAINT "drive_file_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "drive_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_chunk" ADD CONSTRAINT "drive_chunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drive_chunk" ADD CONSTRAINT "drive_chunk_driveFileId_fkey" FOREIGN KEY ("driveFileId") REFERENCES "drive_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;
