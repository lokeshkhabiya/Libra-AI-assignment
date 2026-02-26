"use client";

import { HardDrive } from "lucide-react";

import DriveConnectButton from "@/components/drive-connect-button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function DriveConnectDialog({
	open,
	onSkip,
}: {
	open: boolean;
	onSkip: () => void;
}) {
	return (
		<Dialog open={open}>
			<DialogContent showCloseButton={false} className="sm:max-w-md">
				<DialogHeader>
					<div className="flex items-center gap-2.5">
						<div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
							<HardDrive className="size-4 text-primary" />
						</div>
						<DialogTitle>Connect Google Drive</DialogTitle>
					</div>
					<DialogDescription className="pt-1">
						Connect your Google Drive to search and reference your documents, PDFs, and
						text files when asking questions.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2 pt-2">
					<DriveConnectButton connected={false} returnTo="/dashboard" />
					<Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
						Skip for now
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
