import { useEffect, useState } from "react";

// La hora actual, renovada cada `intervalMs` (para "há 12 min" y los atrasos).
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
