import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../../api/client";
import type { PublicStoreResponse } from "../../api/types";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { button } from "../../components/ui";
import { useLanguage } from "../../i18n";

function validContact(value: string | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return ["https:", "mailto:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function CommercialPage() {
  const es = useLanguage() === "es";
  const contact = validContact(import.meta.env.VITE_SALES_CONTACT_URL);
  const demoSlug = import.meta.env.VITE_DEMO_SLUG as string | undefined;
  const demo = useQuery({ queryKey: ["commercial-demo", demoSlug], enabled: !!demoSlug, retry: false, queryFn: () => api<PublicStoreResponse>(`/public/stores/${encodeURIComponent(demoSlug!)}`) });
  const features = es ? ["Menú con tu marca y enlace propio", "Pedidos directos con entrega o retiro", "Panel para aceptar y seguir pedidos", "Productos, adicionales y cupones", "QR para compartir y reportes de pedidos", "Portugués, español y tema claro u oscuro"] : ["Cardápio com sua marca e link próprio", "Pedidos diretos com entrega ou retirada", "Painel para aceitar e acompanhar pedidos", "Produtos, adicionais e cupons", "QR para compartilhar e relatórios de pedidos", "Português, espanhol e tema claro ou escuro"];
  return <div className="min-h-dvh bg-paper"><header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4"><Link to="/" className="text-xl font-bold">Serice</Link><LanguageSwitch /><Link to="/entrar" className={button.secondary}>{es ? "Entrar al panel" : "Entrar no painel"}</Link></header>
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-16"><div className="grid gap-10 md:grid-cols-[1.3fr_1fr]"><section><p className="font-bold text-success">{es ? "Para pequeños restaurantes" : "Para pequenos restaurantes"}</p><h1 className="mt-4 max-w-xl text-4xl leading-tight font-bold sm:text-5xl">{es ? "Tu menú online. Tus pedidos organizados." : "Seu cardápio online. Seus pedidos organizados."}</h1><p className="mt-5 max-w-xl text-lg text-ink-muted">{es ? "Compartí tu enlace y dejá que tus clientes elijan productos y adicionales. Recibí el pedido completo, aceptalo y acompañá su preparación desde el panel." : "Compartilhe seu link e deixe seus clientes escolherem produtos e adicionais. Receba o pedido completo, aceite e acompanhe o preparo pelo painel."}</p><ul className="mt-6 space-y-3">{features.map((feature) => <li key={feature} className="flex gap-3"><span aria-hidden className="text-success">✓</span>{feature}</li>)}</ul></section>
      <section className="h-fit space-y-5 rounded-2xl border border-line bg-surface p-6 sm:p-8"><h2 className="text-xl font-bold">{es ? "Plan Esencial" : "Plano Essencial"}</h2><p><strong className="text-4xl">R$79,90</strong><span className="text-ink-muted"> / {es ? "mes" : "mês"}</span></p><p>{es ? "Sin comisión de la plataforma por pedido. El cliente paga directamente a tu comercio." : "Sem comissão da plataforma por pedido. O cliente paga diretamente à sua loja."}</p><p className="text-sm text-ink-muted">{es ? "La entrega la organiza tu comercio. Los costos de tu máquina de tarjetas o proveedor de pagos son independientes." : "A entrega é organizada pela sua loja. Custos da sua maquininha ou provedor de pagamentos são independentes."}</p>
        {contact ? <a href={contact} className={`${button.primary} w-full`}>{es ? "Quiero contratar" : "Quero contratar"}</a> : <p className="rounded-lg bg-paper p-3 text-sm">{es ? "La contratación estará disponible próximamente." : "A contratação estará disponível em breve."}</p>}
        {demo.isSuccess && <Link to={`/${demo.data.store.slug}`} className={`${button.secondary} w-full`}>{es ? "Probar demostración" : "Testar demonstração"}</Link>}
        <Link to="/" className={`${button.quiet} w-full`}>{es ? "Explorar comercios" : "Explorar lojas"}</Link>
      </section></div>
      <section className="mt-14"><h2 className="text-2xl font-bold">{es ? "Cómo empezás" : "Como começar"}</h2><ol className="mt-5 grid gap-4 sm:grid-cols-3">{(es ? ["Configurá tu comercio, horarios y formas de pago.", "Cargá tus productos o importá el menú desde una planilla.", "Probá un pedido y compartí tu enlace y QR."] : ["Configure sua loja, horários e formas de pagamento.", "Cadastre produtos ou importe o cardápio por planilha.", "Teste um pedido e compartilhe seu link e QR."]).map((step, index) => <li key={step} className="rounded-xl border border-line bg-surface p-5"><span className="mb-3 block text-xl font-bold text-success">{index + 1}</span>{step}</li>)}</ol></section>
    </main></div>;
}
