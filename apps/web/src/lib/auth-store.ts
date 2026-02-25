import { create } from "zustand";

import { authClient } from "./auth-client";

type AuthSession = typeof authClient.$Infer.Session;
type AuthUser = AuthSession["user"];

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthStoreState = {
  session: AuthSession | null;
  user: AuthUser | null;
  status: AuthStatus;
  setAuthFromSession: (session: AuthSession) => void;
  setLoading: () => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthStoreState>((set) => ({
  session: null,
  user: null,
  status: "loading",
  setAuthFromSession: (session) =>
    set({
      session,
      user: session.user,
      status: "authenticated",
    }),
  setLoading: () =>
    set((state) => ({
      ...state,
      status: "loading",
    })),
  clearAuth: () =>
    set({
      session: null,
      user: null,
      status: "unauthenticated",
    }),
}));
