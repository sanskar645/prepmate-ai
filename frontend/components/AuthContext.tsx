"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken, getTokenRole, saveToken } from "@/lib/api";

interface AuthState {
  /** undefined until the first client-side read (avoids hydration flash). */
  role: string | null | undefined;
  login: (token: string) => void;
  logout: (to?: string) => void;
}

const AuthContext = createContext<AuthState>({
  role: undefined,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setRole(getTokenRole());
    const onStorage = () => setRole(getTokenRole());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = useCallback((token: string) => {
    saveToken(token);
    setRole(getTokenRole());
  }, []);

  const logout = useCallback(
    (to = "/login") => {
      clearToken();
      setRole(null);
      router.push(to);
    },
    [router]
  );

  return (
    <AuthContext.Provider value={{ role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
