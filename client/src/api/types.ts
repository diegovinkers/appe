// Tipos de las respuestas, sacados de schema.ts (generado desde el OpenAPI del backend
// con `npm run api:types`: no se edita a mano).
import type { paths } from "./schema";

type JsonResponse<Path extends keyof paths, Method extends keyof paths[Path], Status extends number = 200> =
  paths[Path][Method] extends { responses: { [S in Status]: { content: { "application/json": infer Body } } } }
    ? Body
    : never;

export type SessionResponse = JsonResponse<"/api/auth/me", "get">;
export type SessionUser = SessionResponse["user"];
export type Role = SessionUser["role"];

export type OwnerStoreResponse = JsonResponse<"/api/owner/store", "get">;
export type OwnerStore = OwnerStoreResponse["store"];
export type Opening = OwnerStoreResponse["opening"];

export type OrdersResponse = JsonResponse<"/api/owner/orders", "get">;
export type Order = OrdersResponse["orders"][number];
export type OrderStatus = Order["status"];

type JsonBody<Path extends keyof paths, Method extends keyof paths[Path]> = paths[Path][Method] extends {
  requestBody: { content: { "application/json": infer Body } };
}
  ? Body
  : never;

// Menú público (lo que ve el comprador).
export type PublicStoreResponse = JsonResponse<"/api/public/stores/{slug}", "get">;
export type PublicStore = PublicStoreResponse["store"];
export type PublicCategory = PublicStoreResponse["categories"][number];
export type PublicProduct = PublicCategory["products"][number];
export type PublicOptionGroup = PublicStoreResponse["optionGroups"][number];
export type PaymentMethod = PublicStore["paymentMethods"][number];
export type Fulfillment = keyof PublicStore["fulfillment"];

export type PublicOrderInput = JsonBody<"/api/public/stores/{slug}/orders", "post">;
export type OrderReceipt = JsonResponse<"/api/public/stores/{slug}/orders", "post", 201>;
export type CouponCheck = JsonResponse<"/api/public/stores/{slug}/coupons/validate", "post">;
export type Coupon = CouponCheck["coupon"];
export type TrackingResponse = JsonResponse<"/api/public/orders/{token}", "get">;
export type PublicStoresResponse = JsonResponse<"/api/public/stores", "get">;
export type DirectoryStore = PublicStoresResponse["stores"][number];

// Panel: pedidos y menú.
export type OrderChannel = Order["channel"];
export type OrderResponse = JsonResponse<"/api/owner/orders/{id}", "get">;
export type ManualOrderInput = JsonBody<"/api/owner/orders", "post">;
export type ManualOrderResponse = JsonResponse<"/api/owner/orders", "post", 201>;
export type Category = JsonResponse<"/api/owner/categories", "get">["categories"][number];
export type CategoryInput = JsonBody<"/api/owner/categories", "post">;
export type Product = JsonResponse<"/api/owner/products", "get">["products"][number];
export type ProductInput = JsonBody<"/api/owner/products", "post">;
export type ProductTag = Product["tags"][number];
export type OptionGroup = JsonResponse<"/api/owner/option-groups", "get">["optionGroups"][number];
export type OptionGroupInput = JsonBody<"/api/owner/option-groups", "post">;
export type ImportResult = JsonResponse<"/api/owner/menu/import", "post">;
export type UploadSignature = JsonResponse<"/api/owner/uploads/signature", "post">;

// Reseñas.
export type Rating = PublicStore["rating"];
export type PublicReview = JsonResponse<"/api/public/stores/{slug}/reviews", "get">["reviews"][number];
export type PublicReviewsResponse = JsonResponse<"/api/public/stores/{slug}/reviews", "get">;
export type OwnerReviewsResponse = JsonResponse<"/api/owner/reviews", "get">;
export type OwnerReview = OwnerReviewsResponse["reviews"][number];
export type CreateReviewResponse = JsonResponse<"/api/public/orders/{token}/review", "post", 201>;

// Cuenta del cliente.
export type CustomerResponse = JsonResponse<"/api/customer/me", "get">;
export type CustomerAccount = CustomerResponse["customer"];
export type CustomerAddress = CustomerAccount["addresses"][number];
export type CustomerSessionResponse = JsonResponse<"/api/customer/login", "post">;
export type CustomerOrdersResponse = JsonResponse<"/api/customer/orders", "get">;
export type CustomerOrder = CustomerOrdersResponse["orders"][number];

// Asistente con IA (WhatsApp).
export type AssistantResponse = JsonResponse<"/api/owner/assistant", "get">;
export type AssistantSettings = AssistantResponse["assistant"];
export type AssistantInput = JsonBody<"/api/owner/assistant", "patch">;
export type SimulatorInput = JsonBody<"/api/owner/assistant/simulator", "post">;
export type ConversationThread = JsonResponse<"/api/owner/assistant/conversations/{id}", "get">;
export type Conversation = ConversationThread["conversation"];
export type ConversationMessage = ConversationThread["messages"][number];
export type ConversationsResponse = JsonResponse<"/api/owner/assistant/conversations", "get">;
export type StaffMessageResponse = JsonResponse<"/api/owner/assistant/conversations/{id}/messages", "post", 201>;
export type SimulatorAudioInput = JsonBody<"/api/owner/assistant/simulator/audio", "post">;
