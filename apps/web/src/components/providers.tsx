"use client";

import AuthSessionBridge from "./auth-session-bridge";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <AuthSessionBridge />
      {children}
      <Toaster richColors />
    </ThemeProvider>
  );
}
