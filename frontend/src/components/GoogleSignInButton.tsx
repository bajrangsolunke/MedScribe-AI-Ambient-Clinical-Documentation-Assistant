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
    // The GoogleLogin button is an iframe whose interior pixels are owned
    // by Google for brand-compliance. We can pick its variant and pixel
    // width, but CSS overrides on the iframe are unreliable. So we just
    // pick a pixel width that matches the AuthShell card's inner content
    // width (max-w-md card = 448px minus sm:p-8 padding 64px = 384px), and
    // centre it. The result lines up flush with the email/password inputs.
    <div className="flex w-full justify-center [&_iframe]:!rounded-md">
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
        width="384"
      />
    </div>
  );
}
