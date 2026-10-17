import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "../api/client";
import type { DeviceInfo } from "../api/types";

export const teamDeviceKey = ["team-device"] as const;

// Si este aparato es del equipo (la tablet del salón, el celular de un mozo): el local y quién
// puede entrar con PIN. null si no lo es.
async function fetchTeamDevice(): Promise<DeviceInfo | null> {
  try {
    return await api<DeviceInfo>("/auth/device");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const useTeamDevice = () => useQuery({ queryKey: teamDeviceKey, queryFn: fetchTeamDevice, staleTime: 60_000, retry: false });
