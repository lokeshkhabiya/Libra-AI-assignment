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
	const { id, modifiedTime, md5Checksum } = file;

	if (md5Checksum) {
		return md5Checksum;
	}

	if (modifiedTime) {
		return `${id}:${modifiedTime}`;
	}

	return `${id}:nohash`;
};

export const shouldQueuePickerIngest = ({
	existing,
	contentHash,
}: {
	existing?: ExistingPickerDriveFile | null;
	contentHash: string;
}): boolean => {
	if (!existing) {
		return true;
	}

	const { contentHash: existingContentHash, isDeleted, indexStatus } = existing;

	return (
		existingContentHash !== contentHash || isDeleted || indexStatus !== "INDEXED"
	);
};

export const normalizePickerGoogleFileIds = (googleFileIds: string[]): string[] => {
	const normalizedIds = googleFileIds
		.map((id) => id.trim())
		.filter((id) => id.length > 0);

	return Array.from(new Set(normalizedIds));
};
