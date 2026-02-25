"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Loader from "@/components/loader";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { useAuthStore } from "@/lib/auth-store";

export default function LoginPage() {
	const router = useRouter();
	const status = useAuthStore((state) => state.status);
	const [showSignIn, setShowSignIn] = useState(true);

	useEffect(() => {
		if (status === "authenticated") {
			router.replace("/dashboard");
		}
	}, [router, status]);

	if (status !== "unauthenticated") {
		return <Loader />;
	}

	return showSignIn ? (
		<SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
	) : (
		<SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
	);
}
