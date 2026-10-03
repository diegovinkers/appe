import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router";
import type { Role } from "../api/types";
import { FullScreenMessage, Spinner } from "../components/FullScreenMessage";
import { useT } from "../i18n";
import { can, type Permission } from "./permissions";
import { homeFor, useSession } from "./session";

// Deja pasar solo a usuarios con sesión y con uno de estos roles.
export function RequireSession({ roles }: { roles: Role[] }) {
  const t = useT();
  const { data: user, isPending, isError, refetch } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <FullScreenMessage>
        <Spinner />
      </FullScreenMessage>
    );
  }
  if (isError) {
    return (
      <FullScreenMessage
        title={t.errors.generic}
        action={
          <button type="button" onClick={() => refetch()} className="h-11 rounded-lg bg-action px-4 font-bold text-white">
            {t.errors.retry}
          </button>
        }
      />
    );
  }
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return <Outlet />;
}

// Dentro del panel: si el rol no tiene el permiso de la página, lo explica en vez de mostrarla.
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const t = useT();
  const { data: user } = useSession();
  if (!can(user?.role, permission)) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="text-ink-muted">{t.forbidden}</p>
        {/* Todos los que entran al panel pueden ver los pedidos. */}
        <Link to="/painel/pedidos" className="mt-3 inline-flex h-11 items-center font-bold underline underline-offset-4">
          {t.forbiddenBack}
        </Link>
      </div>
    );
  }
  return children;
}
