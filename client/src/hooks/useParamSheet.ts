import { useLocation, useNavigate, useSearchParams } from "react-router";

// Una hoja que se abre con un parámetro de la dirección (?pedido=<id>): el botón "atrás"
// del celular la cierra en vez de salir de la página.
export function useParamSheet(name: string) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const pushed = (location.state as { sheet?: string } | null)?.sheet === name;

  return {
    value: params.get(name),
    open(value: string) {
      const next = new URLSearchParams(params);
      next.set(name, value);
      setParams(next, { state: { sheet: name } });
    },
    close() {
      if (pushed) return navigate(-1);
      const next = new URLSearchParams(params);
      next.delete(name);
      setParams(next, { replace: true });
    },
  };
}
