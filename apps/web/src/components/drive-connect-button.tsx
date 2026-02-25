"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDriveConnectUrl } from "@/lib/api/drive";

type DriveConnectButtonProps = {
	connected: boolean;
	busy?: boolean;
	onDisconnect?: () => Promise<void>;
};

export default function DriveConnectButton({
	connected,
	busy = false,
	onDisconnect,
}: DriveConnectButtonProps) {
	if (!connected) {
		return (
			<Button
				disabled={busy}
				onClick={() => {
					window.location.assign(getDriveConnectUrl("/dashboard/drive"));
				}}
			>
				Connect Google Drive
			</Button>
		);
	}

	return (
		<Button
			variant="destructive"
			disabled={busy}
			onClick={() => {
				void onDisconnect?.();
			}}
		>
			{busy ? <Loader2 className="size-4 animate-spin" /> : null}
			Disconnect
		</Button>
	);
}
