import { Router } from "express";
import { getQrCode, getStore, setHours, setStatus, updateStore } from "../controllers/store.controller.js";
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from "../controllers/category.controller.js";
import { exportMenu, importMenu } from "../controllers/menu.controller.js";
import { createUploadSignature } from "../controllers/upload.controller.js";
import {
  createProduct,
  deleteProduct,
  duplicateProduct,
  getProduct,
  listProducts,
  reorderProducts,
  setProductAvailability,
  updateProduct,
} from "../controllers/product.controller.js";
import {
  createOptionGroup,
  deleteOptionGroup,
  getOptionGroup,
  listOptionGroups,
  setOptionAvailability,
  updateOptionGroup,
} from "../controllers/optionGroup.controller.js";
import {
  createManualOrder,
  getOrder,
  getOrderTicket,
  listOrders,
  updateOrderNotes,
  updateOrderStatus,
} from "../controllers/order.controller.js";
import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from "../controllers/coupon.controller.js";
import { listOwnerReviews, updateReview } from "../controllers/review.controller.js";
import { updateReviewSchema } from "../schemas/review.schema.js";
import { authRequired, requirePermission, requireRole } from "../middlewares/auth.middleware.js";
import { requireOwnerCommerce } from "../middlewares/commerce.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
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
  listOrdersQuery,
  manualOrderSchema,
  orderNotesSchema,
  ticketQuery,
  updateOrderStatusSchema,
} from "../schemas/order.schema.js";
import { createCouponSchema, updateCouponSchema } from "../schemas/coupon.schema.js";
import { getOwnerSubscription, getReports } from "../controllers/business.controller.js";
import { reportsQuery } from "../schemas/business.schema.js";
import {
  getAssistant,
  getConversation,
  listConversations,
  previewSpeech,
  releaseConversation,
  sendSimulatorAudio,
  sendSimulatorMessage,
  sendStaffMessage,
  takeOverConversation,
  updateAssistant,
} from "../controllers/assistant.controller.js";
import {
  conversationsQuery,
  simulatorAudioSchema,
  speechSchema,
  simulatorMessageSchema,
  staffMessageSchema,
  updateAssistantSchema,
} from "../schemas/assistant.schema.js";

const router = Router();
const can = requirePermission;

// Todo /api/owner: dueño o empleado con sesión y con su local activo en req.commerce.
// Cada ruta declara el permiso que necesita (src/lib/permissions.js).
router.use(authRequired, requireRole("owner", "staff"), requireOwnerCommerce);

router.get("/store", can("store:read"), getStore);
router.get("/subscription", can("store:write"), getOwnerSubscription);
router.get("/reports", can("store:write"), validate({ query: reportsQuery }), getReports);
router.patch("/store", can("store:write"), validate({ body: updateStoreSchema }), updateStore);
router.put("/store/hours", can("store:write"), validate({ body: hoursSchema }), setHours);
router.put("/store/status", can("store:open"), validate({ body: storeStatusSchema }), setStatus);
router.get("/store/qr", can("store:read"), validate({ query: qrQuery }), getQrCode);

router.get("/categories", can("menu:read"), listCategories);
router.post("/categories", can("menu:write"), validate({ body: createCategorySchema }), createCategory);
router.patch("/categories/reorder", can("menu:write"), validate({ body: reorderSchema }), reorderCategories);
router.patch(
  "/categories/:id",
  can("menu:write"),
  validate({ params: idParams, body: updateCategorySchema }),
  updateCategory
);
router.delete("/categories/:id", can("menu:write"), validate({ params: idParams }), deleteCategory);

router.get("/products", can("menu:read"), validate({ query: listProductsQuery }), listProducts);
router.post("/products", can("menu:write"), validate({ body: createProductSchema }), createProduct);
router.patch("/products/reorder", can("menu:write"), validate({ body: reorderProductsSchema }), reorderProducts);
router.get("/products/:id", can("menu:read"), validate({ params: idParams }), getProduct);
router.patch("/products/:id", can("menu:write"), validate({ params: idParams, body: updateProductSchema }), updateProduct);
router.patch(
  "/products/:id/availability",
  can("menu:availability"),
  validate({ params: idParams, body: availabilitySchema }),
  setProductAvailability
);
router.post("/products/:id/duplicate", can("menu:write"), validate({ params: idParams }), duplicateProduct);
router.delete("/products/:id", can("menu:write"), validate({ params: idParams }), deleteProduct);

router.get("/option-groups", can("menu:read"), listOptionGroups);
router.post("/option-groups", can("menu:write"), validate({ body: createOptionGroupSchema }), createOptionGroup);
router.get("/option-groups/:id", can("menu:read"), validate({ params: idParams }), getOptionGroup);
router.patch(
  "/option-groups/:id",
  can("menu:write"),
  validate({ params: idParams, body: updateOptionGroupSchema }),
  updateOptionGroup
);
router.delete("/option-groups/:id", can("menu:write"), validate({ params: idParams }), deleteOptionGroup);
router.patch(
  "/option-groups/:id/options/:optionId",
  can("menu:availability"),
  validate({ params: optionParams, body: availabilitySchema }),
  setOptionAvailability
);

router.get("/menu/export", can("menu:read"), exportMenu);
router.post("/menu/import", can("menu:write"), validate({ body: importMenuSchema }), importMenu);

router.post("/uploads/signature", can("menu:write"), validate({ body: uploadSignatureSchema }), createUploadSignature);

router.get("/orders", can("orders:read"), validate({ query: listOrdersQuery }), listOrders);
router.post("/orders", can("orders:manual"), validate({ body: manualOrderSchema }), createManualOrder);
router.get("/orders/:id", can("orders:read"), validate({ params: idParams }), getOrder);
router.get("/orders/:id/ticket", can("orders:read"), validate({ params: idParams, query: ticketQuery }), getOrderTicket);
router.patch("/orders/:id/notes", can("orders:write"), validate({ params: idParams, body: orderNotesSchema }), updateOrderNotes);
router.patch(
  "/orders/:id/status",
  can("orders:write"),
  validate({ params: idParams, body: updateOrderStatusSchema }),
  updateOrderStatus
);

// Reseñas: el equipo las lee; ocultarlas es del dueño.
router.get("/reviews", can("orders:read"), listOwnerReviews);
router.patch("/reviews/:id", can("store:write"), validate({ params: idParams, body: updateReviewSchema }), updateReview);

router.get("/coupons", can("coupons:manage"), listCoupons);
router.post("/coupons", can("coupons:manage"), validate({ body: createCouponSchema }), createCoupon);
router.patch("/coupons/:id", can("coupons:manage"), validate({ params: idParams, body: updateCouponSchema }), updateCoupon);
router.delete("/coupons/:id", can("coupons:manage"), validate({ params: idParams }), deleteCoupon);

// Asistente con IA: configurarlo y probarlo es del dueño; el equipo ve y atiende las conversaciones.
router.get("/assistant", can("store:write"), getAssistant);
router.patch("/assistant", can("store:write"), validate({ body: updateAssistantSchema }), updateAssistant);
router.post("/assistant/simulator", can("store:write"), validate({ body: simulatorMessageSchema }), sendSimulatorMessage);
router.post("/assistant/simulator/audio", can("store:write"), validate({ body: simulatorAudioSchema }), sendSimulatorAudio);
router.post("/assistant/speech", can("orders:read"), validate({ body: speechSchema }), previewSpeech);
router.get("/assistant/conversations", can("orders:read"), validate({ query: conversationsQuery }), listConversations);
router.get("/assistant/conversations/:id", can("orders:read"), validate({ params: idParams }), getConversation);
router.post("/assistant/conversations/:id/takeover", can("orders:write"), validate({ params: idParams }), takeOverConversation);
router.post("/assistant/conversations/:id/release", can("orders:write"), validate({ params: idParams }), releaseConversation);
router.post(
  "/assistant/conversations/:id/messages",
  can("orders:write"),
  validate({ params: idParams, body: staffMessageSchema }),
  sendStaffMessage
);

export default router;
