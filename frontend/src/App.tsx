import { GoogleOAuthProvider } from "@react-oauth/google";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import { AppRoutes } from "@/routes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? "";

/** Only mounts GoogleOAuthProvider when a client ID is configured —
 * otherwise the library logs noisy warnings and the Google button
 * silently fails. The frontend gates the button on the same env var. */
function MaybeGoogleProvider({ children }: { children: ReactNode }) {
  if (!GOOGLE_CLIENT_ID) return <>{children}</>;
  return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{children}</GoogleOAuthProvider>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MaybeGoogleProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </MaybeGoogleProvider>
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          classNames: {
            toast: "!shadow-lg !border !border-slate-200",
          },
        }}
      />
    </QueryClientProvider>
  );
}
