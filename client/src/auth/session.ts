import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "../api/client";
import type { SessionResponse, SessionUser } from "../api/types";

export const sessionKey = ["session"] as const;

// El usuario con sesión, o null si no hay sesión (401).
async function fetchSession(): Promise<SessionUser | null> {
  try {
    return (await api<SessionResponse>("/auth/me")).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const useSession = () => useQuery({ queryKey: sessionKey, queryFn: fetchSession, staleTime: 5 * 60_000 });

// A dónde va cada rol al entrar.
export const homeFor = (user: SessionUser) => (user.role === "superadmin" ? "/plataforma" : "/painel");
