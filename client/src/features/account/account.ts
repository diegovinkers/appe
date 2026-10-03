import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../../api/client";
import type { CustomerAccount, CustomerAddress, CustomerOrdersResponse, CustomerResponse, CustomerSessionResponse } from "../../api/types";

// La cuenta del cliente (el que compra). Separada de la sesión del panel.
export const customerKey = ["customer"];
const ordersKey = ["customer-orders"];

// Si este aparato alguna vez entró a una cuenta. Sin esto, ni se pregunta al servidor:
// la mayoría compra sin cuenta y así no hay una consulta de más en cada página.
const FLAG = "conta.ativa";
const flag = {
  get: () => {
    try {
      return localStorage.getItem(FLAG) === "1";
    } catch {
      return false;
    }
  },
  set: (on: boolean) => {
    try {
      if (on) localStorage.setItem(FLAG, "1");
      else localStorage.removeItem(FLAG);
    } catch {
      // Sin almacenamiento: se vuelve a entrar al recargar.
    }
  },
};

export function useCustomer() {
  return useQuery<CustomerAccount | null>({
    queryKey: customerKey,
    queryFn: async () => {
      if (!flag.get()) return null;
      try {
        return (await api<CustomerResponse>("/customer/me")).customer;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          flag.set(false);
          return null;
        }
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useCustomerOrders(enabled: boolean) {
  return useQuery({
    queryKey: ordersKey,
    queryFn: () => api<CustomerOrdersResponse>("/customer/orders").then((data) => data.orders),
    enabled,
  });
}

// Pedidos hechos desde este aparato: su link de seguimiento, para asociarlos a la cuenta.
const DEVICE_ORDERS = "pedidos.deste-aparelho";
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export function deviceOrderTokens(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DEVICE_ORDERS) ?? "[]");
    return Array.isArray(saved)
      ? saved.filter((token): token is string => typeof token === "string" && TOKEN.test(token)).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

export function rememberDeviceOrder(token: string) {
  if (!TOKEN.test(token)) return;
  try {
    localStorage.setItem(DEVICE_ORDERS, JSON.stringify([token, ...deviceOrderTokens().filter((t) => t !== token)].slice(0, 20)));
  } catch {
    // Sin almacenamiento, el pedido no se asocia solo (se puede ver igual con su link).
  }
}

type Credentials = { phone: string; password: string };
type NewAddress = Omit<CustomerAddress, "_id">;
type Signup = Credentials & { name: string; locale: "pt-BR" | "es"; address?: NewAddress };

// Entrar y crear la cuenta: la sesión queda en la cookie; acá se guarda la cuenta en caché
// y se refrescan "Meus pedidos" (se acaban de asociar los de este aparato).
function useStartSession<Body>(path: string) {
  const queryClient = useQueryClient();
  return useMutation<CustomerSessionResponse, ApiError, Body>({
    mutationFn: (body) => api<CustomerSessionResponse>(path, { method: "POST", body: { ...body, orderTokens: deviceOrderTokens() } }),
    onSuccess: ({ customer }) => {
      flag.set(true);
      queryClient.setQueryData(customerKey, customer);
      queryClient.invalidateQueries({ queryKey: ordersKey });
    },
  });
}

export const useLogin = () => useStartSession<Credentials>("/customer/login");
export const useSignup = () => useStartSession<Signup>("/customer/signup");

function useEndSession<Body>(path: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, Body>({
    mutationFn: (body) => api(path, { method: "POST", body }),
    onSuccess: () => {
      flag.set(false);
      queryClient.setQueryData(customerKey, null);
      queryClient.removeQueries({ queryKey: ordersKey });
    },
  });
}

export const useLogout = () => useEndSession<void>("/customer/logout");
export const useDeleteAccount = () => useEndSession<{ password: string }>("/customer/me/delete");

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation<CustomerResponse, ApiError, Partial<Pick<CustomerAccount, "name" | "locale" | "addresses">>>({
    mutationFn: (body) => api<CustomerResponse>("/customer/me", { method: "PATCH", body }),
    onSuccess: ({ customer }) => queryClient.setQueryData(customerKey, customer),
  });
}

// Después de pedir con la cuenta: el servidor guardó la dirección y el pedido es nuevo.
export function useRefreshAccount() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: customerKey });
    queryClient.invalidateQueries({ queryKey: ordersKey });
  };
}

// "Rua Uruguai, 640 — Centro"
export const addressLine = (address: { street: string; number: string; neighborhood: string }) =>
  `${address.street}, ${address.number} — ${address.neighborhood}`;

// "Volver" a donde estaba (?volta=/burger-demo): solo rutas propias.
// Se resuelve como lo haría el navegador: "/\otro.com" o "/\t/otro.com" también son otro sitio.
export function safeReturn(value: string | null) {
  if (!value?.startsWith("/")) return "/";
  try {
    const url = new URL(value, "https://app.invalid");
    return url.origin === "https://app.invalid" ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}
