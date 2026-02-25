import type { NextFunction, Request, Response } from "express";

import { ApiError } from "@libra-ai/drive-core";

export { ApiError };

export const errorHandler = (
	error: unknown,
	_req: Request,
	res: Response,
	_next: NextFunction,
) => {
	if (error instanceof ApiError) {
		res.status(error.statusCode).json({
			error: error.code,
			message: error.message,
		});
		return;
	}

	if (error instanceof Error) {
		res.status(500).json({
			error: "INTERNAL_SERVER_ERROR",
			message: error.message,
		});
		return;
	}

	res.status(500).json({
		error: "INTERNAL_SERVER_ERROR",
		message: "An unexpected error occurred",
	});
};
