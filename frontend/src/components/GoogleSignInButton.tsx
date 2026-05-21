import { GoogleLogin } from "@react-oauth/google";

import { useAuth } from "@/hooks/useAuth";

interface Props {
  onError: (message: string) => void;
  onSuccess: () => void;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? "";

/**
 * "Sign in with Google" button. Hidden entirely when no client ID is
 * configured — the email/password flow keeps working alone.
 *
 * On success: hands the Google ID token to our backend, which verifies
 * it and returns our own JWT. The auth store handles persistence.
 */
export function GoogleSignInButton({ onError, onSuccess }: Props) {
  const { loginWithGoogle } = useAuth();

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
        Google sign-in is disabled. Set <code>VITE_GOOGLE_OAUTH_CLIENT_ID</code> in
        <code> frontend/.env</code> to enable it.
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={async (cred) => {
          if (!cred.credential) {
            onError("Google returned no credential");
            return;
          }
          try {
            await loginWithGoogle(cred.credential);
            onSuccess();
          } catch (err) {
            onError(err instanceof Error ? err.message : "Google sign-in failed");
          }
        }}
        onError={() => onError("Google sign-in was cancelled or failed")}
        useOneTap={false}
        theme="outline"
        size="large"
        text="continue_with"
        shape="rectangular"
      />
    </div>
  );
}
