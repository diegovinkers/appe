import type { ReactNode } from "react";
import { Navigate, createBrowserRouter } from "react-router";
import { RequirePermission, RequireSession } from "../auth/guards";
import type { Permission } from "../auth/permissions";
import { AccountPage } from "../features/account/AccountPage";
import { DirectoryPage } from "../features/directory/DirectoryPage";
import { CommercialPage } from "../features/directory/CommercialPage";
import { LoginPage } from "../features/login/LoginPage";
import { MenuPage } from "../features/menu/MenuPage";
import { PanelLayout } from "../features/panel/PanelLayout";
import { AssistantPage } from "../features/panel/pages/AssistantPage";
import { CategoriesPage } from "../features/panel/pages/CategoriesPage";
import { NewOrderPage } from "../features/panel/pages/NewOrderPage";
import { OptionGroupsPage } from "../features/panel/pages/OptionGroupsPage";
import { OrdersPage } from "../features/panel/pages/OrdersPage";
import { StorePage } from "../features/panel/pages/StorePage";
import { HoursPage } from "../features/panel/pages/HoursPage";
import { DeliveryPage } from "../features/panel/pages/DeliveryPage";
import { CouponsPage } from "../features/panel/pages/CouponsPage";
import { ReportsPage } from "../features/panel/pages/ReportsPage";
import { ReviewsPage } from "../features/panel/pages/ReviewsPage";
import { SettingsPage } from "../features/panel/pages/SettingsPage";
import { PaymentsPage } from "../features/panel/pages/PaymentsPage";
import { AvailabilityPage } from "../features/panel/pages/AvailabilityPage";
import { TeamPage } from "../features/panel/pages/TeamPage";
import { MyAccountPage } from "../features/panel/pages/MyAccountPage";
import { SubscriptionPage } from "../features/panel/pages/SubscriptionPage";
import { MenuLayout } from "../features/panel/layouts/MenuLayout";
import { SettingsLayout } from "../features/panel/layouts/SettingsLayout";
import { ProductsPage } from "../features/panel/pages/ProductsPage";
import { QrPage } from "../features/panel/pages/QrPage";
import { SpreadsheetPage } from "../features/panel/pages/SpreadsheetPage";
import { PlatformPage } from "../features/platform/PlatformPage";
import { TrackingPage } from "../features/tracking/TrackingPage";

const guarded = (permission: Permission, page: ReactNode) => (
  <RequirePermission permission={permission}>{page}</RequirePermission>
);

// Las rutas del panel coinciden con el menú lateral (src/features/panel/nav.ts).
export const router = createBrowserRouter([
  // La página principal es el directorio de lojas; los dueños entran por /entrar.
  { path: "/", element: <DirectoryPage /> },
  { path: "/entrar", element: <LoginPage /> },
  { path: "/entrar/conhecer", element: <CommercialPage /> },
  {
    element: <RequireSession roles={["owner", "staff"]} />,
    children: [
      {
        path: "/painel",
        element: <PanelLayout />,
        children: [
          { index: true, element: <Navigate to="pedidos" replace /> },
          { path: "pedidos", element: guarded("orders:read", <OrdersPage />) },
          { path: "pedidos/novo", element: guarded("orders:manual", <NewOrderPage />) },
          { path: "assistente", element: guarded("orders:read", <AssistantPage />) },
          { path: "disponibilidade", element: guarded("menu:availability", <AvailabilityPage />) },
          // Minha conta: cualquiera con acceso al panel.
          { path: "conta", element: <MyAccountPage /> },
          {
            path: "cardapio",
            element: <MenuLayout />,
            children: [
              { index: true, element: <Navigate to="produtos" replace /> },
              { path: "produtos", element: guarded("menu:read", <ProductsPage />) },
              { path: "categorias", element: guarded("menu:write", <CategoriesPage />) },
              { path: "adicionais", element: guarded("menu:read", <OptionGroupsPage />) },
              { path: "planilha", element: guarded("menu:write", <SpreadsheetPage />) },
            ],
          },
          { path: "cupons", element: guarded("coupons:manage", <CouponsPage />) },
          { path: "relatorios", element: guarded("store:write", <ReportsPage />) },
          { path: "avaliacoes", element: guarded("orders:read", <ReviewsPage />) },
          {
            path: "configuracoes",
            element: <SettingsLayout />,
            children: [
              { index: true, element: guarded("store:write", <SettingsPage />) },
              { path: "loja", element: guarded("store:write", <StorePage />) },
              { path: "link-qr", element: guarded("store:read", <QrPage />) },
              { path: "horarios", element: guarded("store:write", <HoursPage />) },
              { path: "entrega", element: guarded("store:write", <DeliveryPage />) },
              { path: "pagamentos", element: guarded("store:write", <PaymentsPage />) },
              { path: "equipe", element: guarded("team:manage", <TeamPage />) },
              { path: "assinatura", element: guarded("store:write", <SubscriptionPage />) },
            ],
          },
          // Direcciones de antes de Configurações: los links guardados siguen andando.
          { path: "loja", element: <Navigate to="/painel/configuracoes/loja" replace /> },
          { path: "loja/horarios", element: <Navigate to="/painel/configuracoes/horarios" replace /> },
          { path: "loja/entrega", element: <Navigate to="/painel/configuracoes/entrega" replace /> },
          { path: "loja/qr", element: <Navigate to="/painel/configuracoes/link-qr" replace /> },
          { path: "assinatura", element: <Navigate to="/painel/configuracoes/assinatura" replace /> },
          { path: "comecar", element: <Navigate to="/painel/configuracoes" replace /> },
        ],
      },
    ],
  },
  {
    element: <RequireSession roles={["superadmin"]} />,
    children: [{ path: "/plataforma", element: <PlatformPage /> }],
  },
  // Lo público: la cuenta del que compra, el seguimiento de un pedido y el menú de cada local (/burger-demo).
  // Las rutas fijas de arriba ganan; por eso el backend reserva esos nombres como slug.
  { path: "/conta", element: <AccountPage /> },
  { path: "/pedido/:token", element: <TrackingPage /> },
  { path: "/:slug", element: <MenuPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
