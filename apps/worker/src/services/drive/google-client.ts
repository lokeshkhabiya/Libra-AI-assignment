import prisma from "@libra-ai/db";
import { ApiError, getAuthorizedDriveClient, sanitizeDbText } from "@libra-ai/drive-core";

export const getDriveClientForFile = async (params: {
	userId: string;
	driveFileId: string;
}): Promise<{
	drive: any;
	oauthClient: any;
	connection: any;
	driveFile: any;
}> => {
	const driveFileId = sanitizeDbText(params.driveFileId);
	const userId = sanitizeDbText(params.userId);

	const driveFile = await prisma.driveFile.findUnique({
		where: {
			id: driveFileId,
		},
		select: {
			id: true,
			userId: true,
			connectionId: true,
			googleFileId: true,
			name: true,
			mimeType: true,
			webViewLink: true,
			chunkCount: true,
			isDeleted: true,
		},
	});

	if (!driveFile || driveFile.userId !== userId) {
		throw new ApiError(404, "FILE_NOT_FOUND", "Drive file not found");
	}

	const client = await getAuthorizedDriveClient({
		userId,
		connectionId: driveFile.connectionId,
	});

	return {
		...client,
		driveFile,
	};
};
