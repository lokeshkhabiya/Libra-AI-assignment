import { create } from "zustand";

import { type DriveStatusResponse, getDriveStatus } from "@/lib/api/drive";

type DriveStoreState = {
	status: DriveStatusResponse | null;
	isLoading: boolean;
	fetchStatus: () => Promise<void>;
};

export const useDriveStore = create<DriveStoreState>((set) => ({
	status: null,
	isLoading: false,
	fetchStatus: async () => {
		set({ isLoading: true });
		try {
			const status = await getDriveStatus();
			set({ status, isLoading: false });
		} catch {
			set({ isLoading: false });
		}
	},
}));
