import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ApiError } from "./api/client";
import { router } from "./app/router";
import "./styles.css";

const queryClient = new QueryClient({
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
