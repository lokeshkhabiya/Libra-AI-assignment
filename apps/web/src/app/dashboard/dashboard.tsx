"use client";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard({ session }: { session: typeof authClient.$Infer.Session }) {
	return (
		<div className="container mx-auto max-w-4xl px-4 py-6">
			<Card>
				<CardHeader>
					<CardTitle>Welcome, {session.user.name}</CardTitle>
					<CardDescription>
						Connect Google Drive to start indexing Docs/PDF/Text for vector retrieval.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button nativeButton={false} render={<Link href="/dashboard/drive" />}>
						Open Drive Settings
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
