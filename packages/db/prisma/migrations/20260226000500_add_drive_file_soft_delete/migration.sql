ALTER TABLE "drive_file"
ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedAtGoogle" TIMESTAMP(3);

CREATE INDEX "drive_file_userId_isDeleted_updatedAt_idx"
ON "drive_file"("userId", "isDeleted", "updatedAt");
