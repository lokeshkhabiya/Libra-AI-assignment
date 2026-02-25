import { auth } from "@libra-ai/auth";
import type { NextFunction, Request, Response } from "express";

export type AuthenticatedRequest = Request & {
	auth: {
		user: {
			id: string;
			email: string;
			name: string;
		};
		session: {
			id: string;
		};
	};
};

const toWebHeaders = (req: Request): Headers => {
	const headers = new Headers();

	for (const [key, value] of Object.entries(req.headers)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(key, item);
			}
			continue;
		}

		if (typeof value === "string") {
			headers.set(key, value);
		}
	}

	return headers;
};

export const requireAuth = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const session = await auth.api.getSession({
			headers: toWebHeaders(req),
		});

		if (!session?.user || !session?.session) {
			res.status(401).json({
				error: "UNAUTHORIZED",
				message: "Authentication required",
			});
			return;
		}

		(req as AuthenticatedRequest).auth = {
			user: {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
			},
			session: {
				id: session.session.id,
			},
		};

		next();
	} catch (error) {
		next(error);
	}
};
