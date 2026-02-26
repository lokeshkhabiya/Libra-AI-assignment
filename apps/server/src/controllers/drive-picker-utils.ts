export type ExistingPickerDriveFile = {
	contentHash: string | null;
	isDeleted: boolean;
	indexStatus: "PENDING" | "INDEXED" | "FAILED" | "SKIPPED";
};

export const buildDriveFileContentHash = (file: {
	id: string;
	modifiedTime?: string | null;
	md5Checksum?: string | null;
}): string => {
	if (file.md5Checksum) {
		return file.md5Checksum;
	}

	if (file.modifiedTime) {
		return `${file.id}:${file.modifiedTime}`;
	}

	return `${file.id}:nohash`;
};

export const shouldQueuePickerIngest = (params: {
	existing?: ExistingPickerDriveFile | null;
	contentHash: string;
}): boolean => {
	const existing = params.existing;
	if (!existing) {
		return true;
	}

	return (
		existing.contentHash !== params.contentHash ||
		existing.isDeleted ||
		existing.indexStatus !== "INDEXED"
	);
};

export const normalizePickerGoogleFileIds = (googleFileIds: string[]): string[] => {
	return Array.from(
		new Set(
			googleFileIds
				.map((value) => value.trim())
				.filter((value) => value.length > 0),
		),
	);
};
