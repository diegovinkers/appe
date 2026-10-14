import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ApiError } from "./api/client";
import { router } from "./app/router";
import { expiredSession, markPanelExpired } from "./auth/expiry";
import { sessionKey } from "./auth/session";
import { forgetCustomer } from "./features/account/account";
import "./styles.css";

// La sesión venció en medio del uso (pasaron los días, cambió la contraseña, el dueño
// desactivó al empleado). En el panel se vuelve a entrar y después se sigue donde estaba;
// en la cuenta del cliente solo se cierra la cuenta.
function onSessionError(error: unknown) {
  const kind = expiredSession(error);
  if (kind === "customer") return forgetCustomer(queryClient);
  if (kind !== "panel") return;
  // Sin sesión, el guard del panel lleva a /entrar con el aviso y la página donde estaba.
  markPanelExpired();
  queryClient.setQueryData(sessionKey, null);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onSessionError }),
  mutationCache: new MutationCache({ onError: onSessionError }),
  defaultOptions: {
    queries: {
      // Con datos móviles se reintenta lo que falla por red o por el servidor, no lo que el backend rechazó.
      retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
