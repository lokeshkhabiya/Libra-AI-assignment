export const DRIVE_PROVIDER = "GOOGLE_DRIVE" as const;

export const DRIVE_SCOPES = [
	"https://www.googleapis.com/auth/drive.readonly",
	"https://www.googleapis.com/auth/drive.metadata.readonly",
] as const;

export const SUPPORTED_MIME_TYPES = new Set<string>([
	"application/vnd.google-apps.document",
	"application/pdf",
	"text/plain",
	"text/markdown",
]);

export const DRIVE_NAMESPACE_PREFIX = "user_";

export const MAX_DRIVE_FILE_PAGE_SIZE = 1000;

export const FULL_SYNC_JOB_NAME = "drive.sync" as const;
export const INGEST_JOB_NAME = "drive.ingest" as const;

export const INDEX_ERROR_MESSAGE_MAX = 2000;
