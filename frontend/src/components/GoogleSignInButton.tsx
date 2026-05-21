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
    // The GoogleLogin button is an iframe — its interior is owned by Google
    // for brand-compliance (we can only choose its variant). Google's
    // library caps width at ~400px even when "100%" is requested, so we
    // pass the largest allowed value and use CSS to stretch the wrapper
    // div and the iframe itself to fill the parent, matching the width
    // of the email/password inputs below.
    <div
      className={
        "w-full " +
        "[&>div]:!w-full " +
        "[&>div]:!max-w-none " +
        "[&_iframe]:!w-full " +
        "[&_iframe]:!min-w-0 " +
        "[&_iframe]:!rounded-md"
      }
    >
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
        theme="filled_black"
        size="large"
        text="continue_with"
        shape="rectangular"
        width="400"
      />
    </div>
  );
}
