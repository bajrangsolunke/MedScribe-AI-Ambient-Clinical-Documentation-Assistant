import { useEffect } from "react";

import { useAuthStore } from "@/store/auth";

export function useAuth() {
  const { token, user, isHydrated, hydrate, login, register, loginWithGoogle, logout } =
    useAuthStore();

  useEffect(() => {
    if (!isHydrated) {
      void hydrate();
    }
  }, [isHydrated, hydrate]);

  return {
    token,
    user,
    isAuthenticated: token !== null,
    isHydrated,
    login,
    register,
    loginWithGoogle,
    logout,
  };
}
