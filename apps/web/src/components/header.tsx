"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { ModeToggle } from "./mode-toggle";
import UserMenu from "./user-menu";

export default function Header() {
	const pathname = usePathname();

	const navItems = [
		{ href: "/dashboard" as const, label: "Dashboard" },
		{ href: "/dashboard/drive" as const, label: "Drive" },
	];

	return (
		<header className="border-b border-border/50 bg-background/80 backdrop-blur-sm">
			<div className="flex items-center justify-between px-5 py-2.5">
				<div className="flex items-center gap-8">
					<Link href="/dashboard" className="text-sm font-semibold tracking-tight">
						Libra
					</Link>
					<nav className="flex gap-1">
						{navItems.map((item) => {
							const isActive =
								item.href === "/dashboard"
									? pathname === "/dashboard" || pathname?.startsWith("/dashboard/tasks")
									: pathname?.startsWith(item.href);
							return (
								<Link
									key={item.href}
									href={item.href}
									className={cn(
										"rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
										isActive
											? "bg-muted text-foreground"
											: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
									)}
								>
									{item.label}
								</Link>
							);
						})}
					</nav>
				</div>
				<div className="flex items-center gap-1.5">
					<ModeToggle />
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
