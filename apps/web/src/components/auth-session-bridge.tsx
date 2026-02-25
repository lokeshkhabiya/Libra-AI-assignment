"use client";

import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { useAuthStore } from "@/lib/auth-store";

export default function AuthSessionBridge() {
	const { data: session, isPending } = authClient.useSession();
	const setLoading = useAuthStore((state) => state.setLoading);
	const setAuthFromSession = useAuthStore((state) => state.setAuthFromSession);
	const clearAuth = useAuthStore((state) => state.clearAuth);

	useEffect(() => {
		if (isPending) {
			setLoading();
			return;
		}

		if (session?.user) {
			setAuthFromSession(session);
			return;
		}

		clearAuth();
	}, [clearAuth, isPending, session, setAuthFromSession, setLoading]);

	return null;
}
