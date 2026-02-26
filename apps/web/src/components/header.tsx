"use client";

import Link from "next/link";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
	return (
		<div className="border-b border-border">
			<div className="flex items-center justify-between px-4 py-2">
				<div className="flex items-center gap-6">
					<Link href="/dashboard" className="text-sm font-bold tracking-tight">
						Libra
					</Link>
					<nav className="flex gap-4 text-xs text-muted-foreground">
						<Link href="/dashboard" className="hover:text-foreground transition-colors">
							Dashboard
						</Link>
						<Link href="/dashboard/drive" className="hover:text-foreground transition-colors">
							Drive
						</Link>
					</nav>
				</div>
				<div className="flex items-center gap-2">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</div>
	);
}
