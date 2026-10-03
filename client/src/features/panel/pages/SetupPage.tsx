import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../../../api/client";
import type { Product } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { button } from "../../../components/ui";
import { useLanguage, useT } from "../../../i18n";
import { usePanel } from "../PanelLayout";

export function SetupPage() {
  const es = useLanguage() === "es"; const t = useT(); const { store, storeUrl } = usePanel();
  const products = useQuery({ queryKey: ["setup-products"], queryFn: () => api<{ products: Product[] }>("/owner/products") });
  const steps = [
    { ready: !!store.name && !!store.whatsapp && !!store.address, title: es ? "Datos y contacto" : "Dados e contato", to: "/painel/loja" },
    { ready: !!products.data?.products.some((p) => p.available), title: es ? "Productos disponibles" : "Produtos disponíveis", to: "/painel/cardapio/produtos" },
    { ready: Object.values(store.hours.weekly).some((day) => day.length > 0), title: es ? "Horarios semanales" : "Horários semanais", to: "/painel/loja/horarios" },
    { ready: store.fulfillment.pickup || (store.fulfillment.delivery && (store.deliveryMode === "fixed" || store.deliveryZones.some((z) => z.active))), title: es ? "Entrega o retiro" : "Entrega ou retirada", to: "/painel/loja/entrega" },
    { ready: !!store.paymentMethods.length && (!store.paymentMethods.includes("pix") || !!store.pixKey), title: es ? "Formas de pago" : "Formas de pagamento", to: "/painel/loja" },
  ];
  return <><PageHeader title={es ? "Preparar mi comercio" : "Preparar minha loja"} description={es ? "Revisá la configuración y probá el menú antes de compartirlo." : "Revise a configuração e teste o cardápio antes de compartilhar."} />
    {products.isError && <p role="alert">{t.errors.generic} <button className={button.secondary} onClick={() => void products.refetch()}>{t.errors.retry}</button></p>}
    <ul className="space-y-3">{steps.map((step) => <li key={step.title}><Link to={step.to} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"><span className="font-bold">{step.title}</span><span className={step.ready ? "text-success" : "text-ink-muted"}>{step.ready ? "✓" : es ? "Revisar →" : "Revisar →"}</span></Link></li>)}</ul>
    <div className="mt-5 flex flex-wrap gap-3"><Link to="/painel/cardapio/planilha" className={button.secondary}>{es ? "Importar menú" : "Importar cardápio"}</Link><Link to="/painel/loja/qr" className={button.secondary}>{es ? "Enlace y QR" : "Link e QR"}</Link><a className={button.primary} href={storeUrl} target="_blank" rel="noreferrer">{es ? "Probar mi menú" : "Testar meu cardápio"} ↗</a></div>
  </>;
}
