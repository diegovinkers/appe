// Cliente de la API: mismo origen (en desarrollo, el proxy de Vite manda /api al backend),
// cookie de sesión incluida y errores con el `code` estable del backend.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function api<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const { method = "GET", body } = options;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // El texto para mostrar sale del diccionario según el código (ver errorText en i18n).
    throw new ApiError(0, "NETWORK_ERROR", "");
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(response.status, error?.code ?? "UNKNOWN", error?.message ?? "", error?.details);
  }
  return data as T;
}
