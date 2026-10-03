// Registro de todos los endpoints con sus schemas: de acá sale docs/openapi.json.
// Un test compara esta lista con las rutas reales de Express y otro valida las
// respuestas reales contra los schemas de `responses`.
// `auth`: "public" (sin sesión), "session" (cualquier usuario con sesión) o un permiso.
import { z } from "zod";
import { subscriptionInput, subscriptionPaymentInput, subscriptionResponse, reportsQuery, reportResponse } from "../schemas/business.schema.js";
import { auditQuery, createCommerceSchema, resetPasswordSchema, updateCommerceSchema } from "../schemas/admin.schema.js";
import { changePasswordSchema, loginSchema } from "../schemas/auth.schema.js";
import { idParams } from "../schemas/common.schema.js";
import {
  availabilitySchema,
  createCategorySchema,
  createOptionGroupSchema,
  createProductSchema,
  importMenuSchema,
  listProductsQuery,
  optionParams,
  reorderProductsSchema,
  reorderSchema,
  updateCategorySchema,
  updateOptionGroupSchema,
  updateProductSchema,
  uploadSignatureSchema,
} from "../schemas/menu.schema.js";
import { hoursSchema, qrQuery, storeStatusSchema, updateStoreSchema } from "../schemas/store.schema.js";
import {
  createOrderSchema,
  listOrdersQuery,
  manualOrderSchema,
  orderNotesSchema,
  ticketQuery,
  trackingParams,
  updateOrderStatusSchema,
  validateCouponSchema,
} from "../schemas/order.schema.js";
import { createCouponSchema, updateCouponSchema } from "../schemas/coupon.schema.js";
import { storeParams, storeQuery } from "../schemas/public.schema.js";
import { createReviewSchema, updateReviewSchema } from "../schemas/review.schema.js";
import { customerLoginSchema, deleteCustomerSchema, linkOrdersSchema, signupSchema, updateCustomerSchema } from "../schemas/customer.schema.js";
import { conversationsQuery, simulatorAudioSchema, simulatorMessageSchema, speechSchema, staffMessageSchema, updateAssistantSchema } from "../schemas/assistant.schema.js";
import { webhookBody, webhookVerifyQuery } from "../schemas/whatsapp.schema.js";
import {
  auditEntry,
  category,
  coupon,
  manualOrderResponse,
  slotsResponse,
  trackingResponse,
  validateCouponResponse,
  healthResponse,
  importMenuResponse,
  optionGroup,
  order,
  ownerStoreResponse,
  orderReceiptResponse,
  product,
  publicStoreResponse,
  publicStoresResponse,
  createReviewResponse,
  customerResponse,
  customerSessionResponse,
  linkedOrdersResponse,
  customerOrdersResponse,
  publicReviewsResponse,
  ownerReviewsResponse,
  ownerReviewResponse,
  sessionResponse,
  store,
  uploadSignatureResponse,
  user,
  wrap,
  wrapList,
  assistantSettingsResponse,
  conversation,
  conversationThreadResponse,
  staffMessageResponse,
} from "../schemas/responses.schema.js";

const NO_CONTENT = null;
// Respuesta que no es JSON (ej. una imagen).
const binary = (...types) => ({ binary: types });

const adminCommerce = store.extend({
  owners: z.array(z.strictObject({ _id: z.string(), name: z.string(), email: z.string(), active: z.boolean() })),
});

export const operations = [
  { method: "get", path: "/api/admin/commerces/:id/subscription", tag: "Plataforma", summary: "Consultar assinatura", auth: "platform:manage", params: idParams, responses: { 200: subscriptionResponse } },
  { method: "put", path: "/api/admin/commerces/:id/subscription", tag: "Plataforma", summary: "Configurar assinatura", auth: "platform:manage", params: idParams, body: subscriptionInput, responses: { 200: subscriptionResponse } },
  { method: "post", path: "/api/admin/commerces/:id/subscription/payments", tag: "Plataforma", summary: "Registrar pagamento manual", auth: "platform:manage", params: idParams, body: subscriptionPaymentInput, responses: { 200: subscriptionResponse, 201: subscriptionResponse } },
  { method: "get", path: "/api/owner/subscription", tag: "Local", summary: "Minha assinatura", auth: "store:write", responses: { 200: subscriptionResponse } },
  { method: "get", path: "/api/owner/reports", tag: "Local", summary: "Relatório de pedidos concluídos", auth: "store:write", query: reportsQuery, responses: { 200: reportResponse } },
  // Salud
  { method: "get", path: "/api/health", tag: "Salud", summary: "Estado de la API y de la base", auth: "public", responses: { 200: healthResponse, 503: healthResponse } },

  // Sesión
  { method: "post", path: "/api/auth/login", tag: "Sesión", summary: "Iniciar sesión (pone la cookie)", auth: "public", body: loginSchema, responses: { 200: sessionResponse } },
  { method: "post", path: "/api/auth/logout", tag: "Sesión", summary: "Cerrar sesión", auth: "public", responses: { 204: NO_CONTENT } },
  { method: "get", path: "/api/auth/me", tag: "Sesión", summary: "Usuario de la sesión actual", auth: "session", responses: { 200: sessionResponse } },
  { method: "patch", path: "/api/auth/password", tag: "Sesión", summary: "Cambiar la contraseña (cierra las otras sesiones)", auth: "session", body: changePasswordSchema, responses: { 204: NO_CONTENT } },

  // Cliente final
  { method: "get", path: "/api/public/stores", tag: "Cliente", summary: "Locales activos para el directorio (primero los abiertos)", auth: "public", query: storeQuery, responses: { 200: publicStoresResponse } },
  { method: "get", path: "/api/public/stores/:slug", tag: "Cliente", summary: "Local y menú completo (?lang=es para español)", auth: "public", params: storeParams, query: storeQuery, responses: { 200: publicStoreResponse } },
  { method: "get", path: "/api/public/stores/:slug/slots", tag: "Cliente", summary: "Horarios disponibles para programar un pedido", auth: "public", params: storeParams, responses: { 200: slotsResponse } },
  { method: "post", path: "/api/public/stores/:slug/coupons/validate", tag: "Cliente", summary: "Validar un cupón antes de pedir", auth: "public", params: storeParams, body: validateCouponSchema, responses: { 200: validateCouponResponse } },
  { method: "get", path: "/api/public/stores/:slug/reviews", tag: "Cliente", summary: "Reseñas visibles del local y su nota promedio", auth: "public", params: storeParams, responses: { 200: publicReviewsResponse } },
  { method: "post", path: "/api/public/orders/:token/review", tag: "Cliente", summary: "Reseñar un pedido entregado (una vez, hasta 30 días después)", auth: "public", params: trackingParams, body: createReviewSchema, responses: { 201: createReviewResponse } },
  { method: "get", path: "/api/public/orders/:token", tag: "Cliente", summary: "Seguimiento del pedido (link del cliente)", auth: "public", params: trackingParams, responses: { 200: trackingResponse } },
  { method: "post", path: "/api/public/stores/:slug/orders", tag: "Cliente", summary: "Crear un pedido (200 si es un reenvío del mismo clientOrderId)", auth: "public", params: storeParams, body: createOrderSchema, responses: { 201: orderReceiptResponse, 200: orderReceiptResponse } },

  // Cuenta del cliente
  { method: "post", path: "/api/customer/signup", tag: "Cliente: cuenta", summary: "Crear la cuenta con lo mínimo y entrar (asocia pedidos de este aparato del mismo teléfono)", auth: "public", body: signupSchema, responses: { 201: customerSessionResponse } },
  { method: "post", path: "/api/customer/login", tag: "Cliente: cuenta", summary: "Entrar con WhatsApp y contraseña", auth: "public", body: customerLoginSchema, responses: { 200: customerSessionResponse } },
  { method: "post", path: "/api/customer/logout", tag: "Cliente: cuenta", summary: "Salir", auth: "public", responses: { 204: NO_CONTENT } },
  { method: "get", path: "/api/customer/me", tag: "Cliente: cuenta", summary: "Datos y direcciones guardadas", auth: "customer", responses: { 200: customerResponse } },
  { method: "patch", path: "/api/customer/me", tag: "Cliente: cuenta", summary: "Cambiar nombre, idioma o direcciones", auth: "customer", body: updateCustomerSchema, responses: { 200: customerResponse } },
  { method: "post", path: "/api/customer/me/delete", tag: "Cliente: cuenta", summary: "Borrar la cuenta (pide la contraseña)", auth: "customer", body: deleteCustomerSchema, responses: { 204: NO_CONTENT } },
  { method: "get", path: "/api/customer/orders", tag: "Cliente: cuenta", summary: "Meus pedidos, en todos los locales", auth: "customer", responses: { 200: customerOrdersResponse } },
  { method: "post", path: "/api/customer/orders/link", tag: "Cliente: cuenta", summary: "Asociar pedidos hechos desde este aparato", auth: "customer", body: linkOrdersSchema, responses: { 200: linkedOrdersResponse } },

  // Panel: reseñas
  { method: "get", path: "/api/owner/reviews", tag: "Panel: pedidos", summary: "Reseñas del local (también las ocultas) y su nota", auth: "orders:read", responses: { 200: ownerReviewsResponse } },
  { method: "patch", path: "/api/owner/reviews/:id", tag: "Panel: pedidos", summary: "Ocultar o volver a mostrar una reseña en el menú", auth: "store:write", params: idParams, body: updateReviewSchema, responses: { 200: ownerReviewResponse } },

  // Panel: local
  { method: "get", path: "/api/owner/store", tag: "Panel: local", summary: "Datos del local, estado de apertura y link del menú", auth: "store:read", responses: { 200: ownerStoreResponse } },
  { method: "patch", path: "/api/owner/store", tag: "Panel: local", summary: "Cambiar datos, entrega, barrios, pagos y tiempos", auth: "store:write", body: updateStoreSchema, responses: { 200: ownerStoreResponse } },
  { method: "put", path: "/api/owner/store/hours", tag: "Panel: local", summary: "Reemplazar horario semanal y excepciones", auth: "store:write", body: hoursSchema, responses: { 200: ownerStoreResponse } },
  { method: "put", path: "/api/owner/store/status", tag: "Panel: local", summary: "Abrir, cerrar o pausar a mano, o volver al horario", auth: "store:open", body: storeStatusSchema, responses: { 200: ownerStoreResponse } },
  { method: "get", path: "/api/owner/store/qr", tag: "Panel: local", summary: "QR del link del menú (PNG o SVG)", auth: "store:read", query: qrQuery, responses: { 200: binary("image/png", "image/svg+xml") } },

  // Panel: menú
  { method: "get", path: "/api/owner/categories", tag: "Panel: menú", summary: "Categorías en orden", auth: "menu:read", responses: { 200: wrapList("categories", category) } },
  { method: "post", path: "/api/owner/categories", tag: "Panel: menú", summary: "Crear categoría", auth: "menu:write", body: createCategorySchema, responses: { 201: wrap("category", category) } },
  { method: "patch", path: "/api/owner/categories/reorder", tag: "Panel: menú", summary: "Reordenar categorías", auth: "menu:write", body: reorderSchema, responses: { 200: wrapList("categories", category) } },
  { method: "patch", path: "/api/owner/categories/:id", tag: "Panel: menú", summary: "Editar categoría", auth: "menu:write", params: idParams, body: updateCategorySchema, responses: { 200: wrap("category", category) } },
  { method: "delete", path: "/api/owner/categories/:id", tag: "Panel: menú", summary: "Borrar categoría vacía", auth: "menu:write", params: idParams, responses: { 204: NO_CONTENT } },
  { method: "get", path: "/api/owner/products", tag: "Panel: menú", summary: "Productos en orden", auth: "menu:read", query: listProductsQuery, responses: { 200: wrapList("products", product) } },
  { method: "post", path: "/api/owner/products", tag: "Panel: menú", summary: "Crear producto", auth: "menu:write", body: createProductSchema, responses: { 201: wrap("product", product) } },
  { method: "patch", path: "/api/owner/products/reorder", tag: "Panel: menú", summary: "Reordenar productos de una categoría", auth: "menu:write", body: reorderProductsSchema, responses: { 200: wrapList("products", product) } },
  { method: "get", path: "/api/owner/products/:id", tag: "Panel: menú", summary: "Un producto", auth: "menu:read", params: idParams, responses: { 200: wrap("product", product) } },
  { method: "patch", path: "/api/owner/products/:id", tag: "Panel: menú", summary: "Editar producto", auth: "menu:write", params: idParams, body: updateProductSchema, responses: { 200: wrap("product", product) } },
  { method: "patch", path: "/api/owner/products/:id/availability", tag: "Panel: menú", summary: "Marcar producto disponible o agotado", auth: "menu:availability", params: idParams, body: availabilitySchema, responses: { 200: wrap("product", product) } },
  { method: "post", path: "/api/owner/products/:id/duplicate", tag: "Panel: menú", summary: "Duplicar producto (al final de su categoría)", auth: "menu:write", params: idParams, responses: { 201: wrap("product", product) } },
  { method: "delete", path: "/api/owner/products/:id", tag: "Panel: menú", summary: "Borrar producto", auth: "menu:write", params: idParams, responses: { 204: NO_CONTENT } },
  { method: "get", path: "/api/owner/option-groups", tag: "Panel: menú", summary: "Grupos de opciones", auth: "menu:read", responses: { 200: wrapList("optionGroups", optionGroup) } },
  { method: "post", path: "/api/owner/option-groups", tag: "Panel: menú", summary: "Crear grupo de opciones", auth: "menu:write", body: createOptionGroupSchema, responses: { 201: wrap("optionGroup", optionGroup) } },
  { method: "get", path: "/api/owner/option-groups/:id", tag: "Panel: menú", summary: "Un grupo de opciones", auth: "menu:read", params: idParams, responses: { 200: wrap("optionGroup", optionGroup) } },
  { method: "patch", path: "/api/owner/option-groups/:id", tag: "Panel: menú", summary: "Editar grupo (options reemplaza la lista)", auth: "menu:write", params: idParams, body: updateOptionGroupSchema, responses: { 200: wrap("optionGroup", optionGroup) } },
  { method: "delete", path: "/api/owner/option-groups/:id", tag: "Panel: menú", summary: "Borrar grupo (lo saca de los productos)", auth: "menu:write", params: idParams, responses: { 204: NO_CONTENT } },
  { method: "patch", path: "/api/owner/option-groups/:id/options/:optionId", tag: "Panel: menú", summary: "Marcar opción disponible o agotada", auth: "menu:availability", params: optionParams, body: availabilitySchema, responses: { 200: wrap("optionGroup", optionGroup) } },

  { method: "get", path: "/api/owner/menu/export", tag: "Panel: menú", summary: "Planilla CSV del menú", auth: "menu:read", responses: { 200: binary("text/csv") } },
  { method: "post", path: "/api/owner/menu/import", tag: "Panel: menú", summary: "Importar planilla CSV (dryRun por defecto)", auth: "menu:write", body: importMenuSchema, responses: { 200: importMenuResponse } },
  { method: "post", path: "/api/owner/uploads/signature", tag: "Panel: menú", summary: "Firma para subir una imagen a Cloudinary", auth: "menu:write", body: uploadSignatureSchema, responses: { 200: uploadSignatureResponse } },

  // Panel: pedidos
  { method: "get", path: "/api/owner/orders", tag: "Panel: pedidos", summary: "Pedidos del día (o cambios desde updatedSince)", auth: "orders:read", query: listOrdersQuery, responses: { 200: z.strictObject({ orders: z.array(order), serverTime: z.iso.datetime() }) } },
  { method: "post", path: "/api/owner/orders", tag: "Panel: pedidos", summary: "Cargar un pedido que llegó por teléfono, WhatsApp o en el mostrador", auth: "orders:manual", body: manualOrderSchema, responses: { 201: manualOrderResponse, 200: manualOrderResponse } },
  { method: "get", path: "/api/owner/orders/:id/ticket", tag: "Panel: pedidos", summary: "Comanda para imprimir (HTML o texto, 58 u 80 mm)", auth: "orders:read", params: idParams, query: ticketQuery, responses: { 200: binary("text/html", "text/plain") } },
  { method: "patch", path: "/api/owner/orders/:id/notes", tag: "Panel: pedidos", summary: "Notas internas del pedido", auth: "orders:write", params: idParams, body: orderNotesSchema, responses: { 200: wrap("order", order) } },
  { method: "get", path: "/api/owner/orders/:id", tag: "Panel: pedidos", summary: "Un pedido", auth: "orders:read", params: idParams, responses: { 200: wrap("order", order) } },
  { method: "patch", path: "/api/owner/orders/:id/status", tag: "Panel: pedidos", summary: "Cambiar el estado", auth: "orders:write", params: idParams, body: updateOrderStatusSchema, responses: { 200: wrap("order", order) } },

  // Panel: asistente con IA
  { method: "get", path: "/api/owner/assistant", tag: "Panel: asistente", summary: "Configuración del asistente y gasto del mes", auth: "store:write", responses: { 200: assistantSettingsResponse } },
  { method: "patch", path: "/api/owner/assistant", tag: "Panel: asistente", summary: "Activar, número de WhatsApp, tope de gasto y voz", auth: "store:write", body: updateAssistantSchema, responses: { 200: assistantSettingsResponse } },
  { method: "post", path: "/api/owner/assistant/simulator", tag: "Panel: asistente", summary: "Escribirle al asistente como un cliente (contesta en la respuesta)", auth: "store:write", body: simulatorMessageSchema, responses: { 201: conversationThreadResponse } },
  { method: "post", path: "/api/owner/assistant/simulator/audio", tag: "Panel: asistente", summary: "Lo mismo con una nota de voz en base64 (se transcribe)", auth: "store:write", body: simulatorAudioSchema, responses: { 201: conversationThreadResponse } },
  { method: "post", path: "/api/owner/assistant/speech", tag: "Panel: asistente", summary: "Una respuesta en voz, para escuchar cómo suena (OGG/Opus)", auth: "orders:read", body: speechSchema, responses: { 200: binary("audio/ogg") } },
  { method: "get", path: "/api/owner/assistant/conversations", tag: "Panel: asistente", summary: "Conversaciones, las más recientes primero", auth: "orders:read", query: conversationsQuery, responses: { 200: wrapList("conversations", conversation) } },
  { method: "get", path: "/api/owner/assistant/conversations/:id", tag: "Panel: asistente", summary: "Una conversación con sus mensajes", auth: "orders:read", params: idParams, responses: { 200: conversationThreadResponse } },
  { method: "post", path: "/api/owner/assistant/conversations/:id/takeover", tag: "Panel: asistente", summary: "Atenderla una persona (el asistente deja de contestar)", auth: "orders:write", params: idParams, responses: { 200: wrap("conversation", conversation) } },
  { method: "post", path: "/api/owner/assistant/conversations/:id/release", tag: "Panel: asistente", summary: "Devolverla al asistente", auth: "orders:write", params: idParams, responses: { 200: wrap("conversation", conversation) } },
  { method: "post", path: "/api/owner/assistant/conversations/:id/messages", tag: "Panel: asistente", summary: "Escribirle al cliente desde el panel", auth: "orders:write", params: idParams, body: staffMessageSchema, responses: { 201: staffMessageResponse } },

  // WhatsApp (Meta)
  { method: "get", path: "/api/whatsapp/webhook", tag: "WhatsApp", summary: "Verificación del webhook: devuelve hub.challenge si el verify token es el nuestro", auth: "public", query: webhookVerifyQuery, responses: { 200: binary("text/plain") } },
  { method: "post", path: "/api/whatsapp/webhook", tag: "WhatsApp", summary: "Mensajes de los clientes (firmados por Meta con el App Secret)", auth: "public", body: webhookBody, responses: { 200: z.strictObject({ ok: z.literal(true) }) } },

  // Panel: cupones
  { method: "get", path: "/api/owner/coupons", tag: "Panel: cupones", summary: "Cupones del local", auth: "coupons:manage", responses: { 200: wrapList("coupons", coupon) } },
  { method: "post", path: "/api/owner/coupons", tag: "Panel: cupones", summary: "Crear cupón", auth: "coupons:manage", body: createCouponSchema, responses: { 201: wrap("coupon", coupon) } },
  { method: "patch", path: "/api/owner/coupons/:id", tag: "Panel: cupones", summary: "Editar cupón", auth: "coupons:manage", params: idParams, body: updateCouponSchema, responses: { 200: wrap("coupon", coupon) } },
  { method: "delete", path: "/api/owner/coupons/:id", tag: "Panel: cupones", summary: "Borrar cupón", auth: "coupons:manage", params: idParams, responses: { 204: NO_CONTENT } },

  // Plataforma
  { method: "get", path: "/api/admin/commerces", tag: "Plataforma", summary: "Locales con sus dueños", auth: "platform:manage", responses: { 200: wrapList("commerces", adminCommerce) } },
  { method: "post", path: "/api/admin/commerces", tag: "Plataforma", summary: "Crear local y dueño", auth: "platform:manage", body: createCommerceSchema, responses: { 201: z.strictObject({ commerce: store, owner: user }) } },
  { method: "patch", path: "/api/admin/commerces/:id", tag: "Plataforma", summary: "Cambiar datos, slug o estado de un local", auth: "platform:manage", params: idParams, body: updateCommerceSchema, responses: { 200: wrap("commerce", store) } },
  { method: "patch", path: "/api/admin/users/:id/password", tag: "Plataforma", summary: "Resetear la contraseña de un dueño", auth: "platform:manage", params: idParams, body: resetPasswordSchema, responses: { 204: NO_CONTENT } },
  { method: "get", path: "/api/admin/audit", tag: "Plataforma", summary: "Registro de auditoría", auth: "platform:manage", query: auditQuery, responses: { 200: wrapList("entries", auditEntry) } },
];

export const findOperation = (method, path) =>
  operations.find((op) => op.method === method.toLowerCase() && op.path === path);
