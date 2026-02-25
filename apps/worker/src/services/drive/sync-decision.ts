export type ExistingDriveFileState = {
	contentHash: string | null;
	isDeleted: boolean;
	indexStatus: "PENDING" | "INDEXED" | "FAILED" | "SKIPPED";
};

export const shouldReingestSnapshot = (params: {
	forceReingest: boolean;
	snapshotContentHash: string;
	existing?: ExistingDriveFileState;
}): boolean => {
	return (
		params.forceReingest ||
		!params.existing ||
		params.existing.contentHash !== params.snapshotContentHash ||
		params.existing.isDeleted
	);
};

export const resolveSnapshotIndexStatus = (params: {
	hasChanged: boolean;
	existing?: ExistingDriveFileState;
}): ExistingDriveFileState["indexStatus"] => {
	if (params.hasChanged) {
		return "PENDING";
	}

	return params.existing?.indexStatus ?? "PENDING";
};
