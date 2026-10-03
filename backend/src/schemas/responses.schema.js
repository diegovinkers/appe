// Forma exacta de las respuestas de la API. Son estrictas a propósito: los tests de
// contrato validan las respuestas reales contra estos schemas, así el OpenAPI que usa
// el front no puede quedar desactualizado sin que falle un test.
import { z } from "zod";
import { COMMERCE_STATUSES, DELIVERY_MODES, OVERRIDE_MODES, PAYMENT_METHODS, SLOT_MINUTES } from "../models/commerce.model.js";
import { WEEKDAYS } from "../services/opening.service.js";
import { COUPON_TYPES } from "../models/coupon.model.js";
import { PRICING_RULES } from "../models/optionGroup.model.js";
import { ORDER_CHANNELS, ORDER_LOCALES } from "../models/order.model.js";
import { PRODUCT_TAGS } from "../models/product.model.js";
import { ROLES } from "../models/user.model.js";
import { CONVERSATION_CHANNELS, CONVERSATION_STATUSES } from "../models/conversation.model.js";
import { MESSAGE_KINDS, MESSAGE_ROLES } from "../models/conversationMessage.model.js";
import { ORDER_STATUSES } from "../services/orderStatus.js";

const id = z.string().regex(/^[a-f\d]{24}$/i);
const date = z.iso.datetime();
const cents = z.number().int().min(0);
const timestamps = { createdAt: date, updatedAt: date };

export const errorResponse = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});

export const healthResponse = z.strictObject({ ok: z.boolean() });

export const sessionResponse = z.strictObject({
  user: z.strictObject({
    _id: id,
    name: z.string(),
    email: z.string(),
    role: z.enum(ROLES),
    commerce: z
      .strictObject({ _id: id, name: z.string(), slug: z.string(), status: z.enum(COMMERCE_STATUSES) })
      .nullable(),
  }),
});

const fulfillment = z.strictObject({ delivery: z.boolean(), pickup: z.boolean() });
const interval = z.strictObject({ open: z.string(), close: z.string() });
const weekly = z.strictObject(Object.fromEntries(WEEKDAYS.map((day) => [day, z.array(interval)])));
const hourException = z.strictObject({ date: z.string(), closed: z.boolean(), intervals: z.array(interval), note: z.string() });
const estimates = z.strictObject({
  deliveryMin: z.number().int(),
  deliveryMax: z.number().int(),
  pickupMin: z.number().int(),
  pickupMax: z.number().int(),
});
const scheduling = z.strictObject({
  enabled: z.boolean(),
  minLeadMinutes: z.number().int(),
  maxDaysAhead: z.number().int(),
  slotMinutes: z.literal(SLOT_MINUTES),
});
const deliveryZoneFields = {
  _id: id,
  name: z.string(),
  feeCents: cents,
  minOrderCents: cents.nullable(),
  estimateMin: z.number().int().nullable(),
  estimateMax: z.number().int().nullable(),
};

// El local como lo ve el dueño (y el superadmin).
export const store = z.strictObject({
  _id: id,
  name: z.string(),
  slug: z.string(),
  status: z.enum(COMMERCE_STATUSES),
  description: z.string(),
  about: z.string(),
  notice: z.string(),
  logoUrl: z.string(),
  coverUrl: z.string(),
  instagram: z.string(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  whatsapp: z.string(),
  address: z.string(),
  hours: z.strictObject({ weekly, exceptions: z.array(hourException) }),
  override: z.strictObject({ mode: z.enum(OVERRIDE_MODES), until: date.nullable(), message: z.string() }).nullable(),
  fulfillment,
  estimates,
  deliveryMode: z.enum(DELIVERY_MODES),
  deliveryFeeCents: cents,
  deliveryZones: z.array(z.strictObject({ ...deliveryZoneFields, active: z.boolean() })),
  freeDeliveryFromCents: cents.nullable(),
  minOrderCents: cents,
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)),
  pixKey: z.string(),
  scheduling,
  translations: z.strictObject({
    es: z.strictObject({ description: z.string(), about: z.string(), notice: z.string() }),
  }),
  ...timestamps,
});

// Estado de apertura calculado (horario + override manual).
export const opening = z.strictObject({
  status: z.enum(["open", "closed", "paused"]),
  acceptingOrders: z.boolean(),
  closesAt: date.nullable(),
  nextOpenAt: date.nullable(),
  pausedUntil: date.nullable(),
  message: z.string(),
  source: z.enum(["schedule", "override"]),
});

export const ownerStoreResponse = z.strictObject({ store, opening, storeUrl: z.string() });

export const user = z.strictObject({
  _id: id,
  name: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  commerce: id.optional(),
  active: z.boolean(),
  ...timestamps,
});

const nameTranslation = z.strictObject({ es: z.strictObject({ name: z.string() }) });
const categorySchedule = z.strictObject({ days: z.array(z.enum(WEEKDAYS)), from: z.string(), to: z.string() });

export const category = z.strictObject({
  _id: id,
  commerce: id,
  name: z.string(),
  position: z.number().int(),
  active: z.boolean(),
  schedule: categorySchedule.nullable(),
  translations: nameTranslation,
  ...timestamps,
});

export const product = z.strictObject({
  _id: id,
  commerce: id,
  category: id,
  name: z.string(),
  description: z.string(),
  priceCents: cents,
  promoPriceCents: cents.nullable(),
  promoStartsAt: date.nullable(),
  promoEndsAt: date.nullable(),
  imageUrl: z.string(),
  tags: z.array(z.enum(PRODUCT_TAGS)),
  featured: z.boolean(),
  available: z.boolean(),
  trackStock: z.boolean(),
  stock: z.number().int(),
  position: z.number().int(),
  optionGroups: z.array(id),
  translations: z.strictObject({ es: z.strictObject({ name: z.string(), description: z.string() }) }),
  ...timestamps,
});

const option = z.strictObject({
  _id: id,
  name: z.string(),
  priceCents: cents,
  maxQuantity: z.number().int(),
  available: z.boolean(),
  translations: nameTranslation,
});

export const optionGroup = z.strictObject({
  _id: id,
  commerce: id,
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  pricing: z.enum(PRICING_RULES),
  options: z.array(option),
  translations: nameTranslation,
  ...timestamps,
});

const orderItem = z.strictObject({
  product: id,
  name: z.string(),
  unitPriceCents: cents,
  quantity: z.number().int(),
  options: z.array(
    z.strictObject({
      groupId: id,
      optionId: id,
      group: z.string(),
      pricing: z.enum(PRICING_RULES),
      name: z.string(),
      priceCents: cents,
      quantity: z.number().int(),
    })
  ),
  optionsCents: cents,
  notes: z.string(),
  totalCents: cents,
  stockTracked: z.boolean(),
});

const estimatedMinutes = z.strictObject({ min: z.number().int(), max: z.number().int() }).optional();

const couponSnapshot = z.strictObject({ code: z.string(), type: z.enum(COUPON_TYPES), value: z.number().int() }).nullable();

const orderTotals = {
  items: z.array(orderItem),
  subtotalCents: cents,
  discountCents: cents,
  coupon: couponSnapshot,
  deliveryFeeCents: cents,
  totalCents: cents,
};

// El pedido como lo ve el panel.
export const order = z.strictObject({
  _id: id,
  commerce: id,
  account: id.nullable().optional(),
  conversation: id.nullable().optional(),
  number: z.number().int(),
  clientOrderId: z.string(),
  trackingToken: z.string().optional(),
  channel: z.enum(ORDER_CHANNELS),
  acquisitionSource: z.enum(["direct", "directory", "unknown"]).optional(),
  locale: z.enum(ORDER_LOCALES),
  scheduledFor: date.nullable(),
  cancelReason: z.string(),
  internalNotes: z.string(),
  customer: z.strictObject({ name: z.string(), phone: z.string() }),
  fulfillment: z.enum(["delivery", "pickup"]),
  address: z
    .strictObject({
      street: z.string(),
      number: z.string(),
      neighborhood: z.string(),
      zoneId: id.optional(),
      reference: z.string(),
    })
    .optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  changeForCents: cents.nullable(),
  notes: z.string(),
  ...orderTotals,
  estimatedMinutes,
  status: z.enum(ORDER_STATUSES),
  statusHistory: z.array(
    z.strictObject({ status: z.enum(ORDER_STATUSES), at: date, by: id.optional(), reason: z.string().optional() })
  ),
  ...timestamps,
});

export const manualOrderResponse = z.strictObject({ order, trackingUrl: z.string().nullable() });

export const coupon = z.strictObject({
  _id: id,
  commerce: id,
  code: z.string(),
  type: z.enum(COUPON_TYPES),
  value: z.number().int(),
  minOrderCents: cents,
  startsAt: date.nullable(),
  endsAt: date.nullable(),
  maxUses: z.number().int().nullable(),
  maxUsesPerCustomer: z.number().int().nullable(),
  uses: z.number().int(),
  active: z.boolean(),
  description: z.string(),
  ...timestamps,
});

export const validateCouponResponse = z.strictObject({
  coupon: z.strictObject({
    code: z.string(),
    type: z.enum(COUPON_TYPES),
    value: z.number().int(),
    minOrderCents: cents,
  }),
});

export const slotsResponse = z.strictObject({
  enabled: z.boolean(),
  slotMinutes: z.number().int(),
  slots: z.array(date),
});

// Cuenta del cliente (el que compra).
const customerAddress = z.strictObject({
  _id: id,
  label: z.string(),
  street: z.string(),
  number: z.string(),
  neighborhood: z.string(),
  reference: z.string(),
});
const customer = z.strictObject({
  _id: id,
  name: z.string(),
  phone: z.string(),
  locale: z.enum(ORDER_LOCALES),
  addresses: z.array(customerAddress),
  createdAt: date,
});
export const customerResponse = z.strictObject({ customer });
export const customerSessionResponse = z.strictObject({ customer, linkedOrders: z.number().int() });
export const linkedOrdersResponse = z.strictObject({ linkedOrders: z.number().int() });
export const customerOrdersResponse = z.strictObject({
  orders: z.array(
    z.strictObject({
      _id: id,
      number: z.number().int(),
      status: z.enum(ORDER_STATUSES),
      fulfillment: z.enum(["delivery", "pickup"]),
      totalCents: cents,
      itemsCount: z.number().int(),
      createdAt: date,
      trackingToken: z.string().nullable(),
      store: z.strictObject({ name: z.string(), slug: z.string(), logoUrl: z.string(), primaryColor: z.string() }),
    })
  ),
});

// Reseñas: nota promedio (null si no hay) y cantidad de reseñas visibles.
const rating = z.strictObject({ average: z.number().min(1).max(5).nullable(), count: z.number().int() });

const publicReview = z.strictObject({ rating: z.number().int(), comment: z.string(), customerName: z.string(), createdAt: date });

const ownerReview = z.strictObject({
  _id: id,
  order: id,
  orderNumber: z.number().int(),
  rating: z.number().int(),
  comment: z.string(),
  customerName: z.string(),
  hidden: z.boolean(),
  createdAt: date,
});

export const createReviewResponse = z.strictObject({ review: publicReview });
export const publicReviewsResponse = z.strictObject({ rating, reviews: z.array(publicReview) });
export const ownerReviewsResponse = z.strictObject({ rating, reviews: z.array(ownerReview) });
export const ownerReviewResponse = z.strictObject({ review: ownerReview });

// Seguimiento del pedido para el cliente (sin teléfono ni dirección completa).
export const trackingResponse = z.strictObject({
  store: z.strictObject({
    name: z.string(),
    slug: z.string(),
    whatsapp: z.string(),
    logoUrl: z.string(),
    primaryColor: z.string(),
    secondaryColor: z.string(),
  }),
  order: z.strictObject({
    number: z.number().int(),
    status: z.enum(ORDER_STATUSES),
    statusHistory: z.array(z.strictObject({ status: z.enum(ORDER_STATUSES), at: date })),
    fulfillment: z.enum(["delivery", "pickup"]),
    neighborhood: z.string().nullable(),
    customerName: z.string(),
    scheduledFor: date.nullable(),
    estimatedMinutes,
    eta: z.strictObject({ from: date, to: date }).nullable(),
    items: z.array(
      z.strictObject({
        name: z.string(),
        quantity: z.number().int(),
        options: z.array(z.strictObject({ name: z.string(), quantity: z.number().int() })),
        notes: z.string(),
        totalCents: cents,
      })
    ),
    subtotalCents: cents,
    discountCents: cents,
    deliveryFeeCents: cents,
    totalCents: cents,
    paymentMethod: z.enum(PAYMENT_METHODS),
    createdAt: date,
  }),
  // La reseña del cliente, si ya opinó, y si todavía puede hacerlo.
  review: publicReview.nullable(),
  canReview: z.boolean(),
});

// Lo que recibe el cliente al crear el pedido.
export const orderReceiptResponse = z.strictObject({
  order: z.strictObject({
    _id: id,
    number: z.number().int(),
    status: z.enum(ORDER_STATUSES),
    fulfillment: z.enum(["delivery", "pickup"]),
    paymentMethod: z.enum(PAYMENT_METHODS),
    changeForCents: cents.nullable(),
    ...orderTotals,
    estimatedMinutes,
    scheduledFor: date.nullable(),
    createdAt: date,
  }),
  trackingUrl: z.string().nullable(),
  whatsapp: z.strictObject({ message: z.string(), url: z.string() }),
});

// Directorio público: lo justo para la tarjeta de cada local (sin WhatsApp ni datos de pago).
export const publicStoresResponse = z.strictObject({
  stores: z.array(
    z.strictObject({
      name: z.string(),
      slug: z.string(),
      description: z.string(),
      logoUrl: z.string(),
      coverUrl: z.string(),
      primaryColor: z.string(),
      address: z.string(),
      isOpen: z.boolean(),
      opening: opening.omit({ acceptingOrders: true, source: true }),
      fulfillment,
      estimates,
      rating,
    })
  ),
});

export const publicStoreResponse = z.strictObject({
  store: z.strictObject({
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    logoUrl: z.string(),
    about: z.string(),
    notice: z.string(),
    coverUrl: z.string(),
    instagram: z.string(),
    primaryColor: z.string(),
    secondaryColor: z.string(),
    isOpen: z.boolean(),
    opening: opening.omit({ acceptingOrders: true, source: true }),
    hours: z.strictObject({ weekly, upcomingExceptions: z.array(hourException) }),
    address: z.string(),
    whatsapp: z.string(),
    fulfillment,
    estimates,
    deliveryMode: z.enum(DELIVERY_MODES),
    deliveryFeeCents: cents,
    deliveryZones: z.array(z.strictObject(deliveryZoneFields)),
    freeDeliveryFromCents: cents.nullable(),
    minOrderCents: cents,
    paymentMethods: z.array(z.enum(PAYMENT_METHODS)),
    pixKey: z.string(),
    scheduling,
    rating,
  }),
  featuredProductIds: z.array(id),
  categories: z.array(
    z.strictObject({
      _id: id,
      name: z.string(),
      availableNow: z.boolean(),
      schedule: categorySchedule.nullable(),
      products: z.array(
        z.strictObject({
          _id: id,
          name: z.string(),
          description: z.string(),
          priceCents: cents,
          promoPriceCents: cents.nullable(),
          fromPriceCents: cents.nullable(),
          imageUrl: z.string(),
          tags: z.array(z.enum(PRODUCT_TAGS)),
          available: z.boolean(),
          optionGroups: z.array(id),
        })
      ),
    })
  ),
  optionGroups: z.array(
    z.strictObject({
      _id: id,
      name: z.string(),
      minSelect: z.number().int(),
      maxSelect: z.number().int(),
      pricing: z.enum(PRICING_RULES),
      options: z.array(
        z.strictObject({
          _id: id,
          name: z.string(),
          priceCents: cents,
          maxQuantity: z.number().int(),
          available: z.boolean(),
        })
      ),
    })
  ),
});

export const uploadSignatureResponse = z.strictObject({
  uploadUrl: z.string(),
  cloudName: z.string(),
  apiKey: z.string(),
  allowed_formats: z.string(),
  folder: z.string(),
  timestamp: z.number().int(),
  signature: z.string(),
});

export const importMenuResponse = z.strictObject({
  dryRun: z.boolean(),
  summary: z.strictObject({
    categoriesCreated: z.number().int(),
    productsCreated: z.number().int(),
    productsUpdated: z.number().int(),
  }),
  errors: z.array(z.strictObject({ line: z.number().int(), message: z.string() })),
});

export const auditEntry = z.strictObject({
  _id: id,
  commerce: id.optional(),
  actor: z.strictObject({ user: id.optional(), role: z.string().optional() }),
  action: z.string(),
  entity: z.strictObject({ type: z.string(), id: id.optional() }).optional(),
  changes: z.unknown().optional(),
  createdAt: date,
});

// Envoltorios: los recursos siempre vienen dentro de un objeto.
export const wrap = (key, schema) => z.strictObject({ [key]: schema });
export const wrapList = (key, schema) => z.strictObject({ [key]: z.array(schema) });

// Asistente con IA. El costo va en millonésimos de dólar (1_000_000 = US$ 1).
const aiUsage = z.strictObject({
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheWriteTokens: z.number().int(),
  cacheReadTokens: z.number().int(),
  costMicros: z.number().int(),
});

export const assistantSettingsResponse = z.strictObject({
  assistant: z.strictObject({
    enabled: z.boolean(),
    phoneNumberId: z.string().nullable(),
    monthlyBudgetUsdCents: z.number().int(),
    voiceReplies: z.boolean(),
    model: z.string(),
    available: z.strictObject({ ai: z.boolean(), whatsapp: z.boolean(), transcription: z.boolean(), voice: z.boolean() }),
    month: z.strictObject({ month: z.string(), costMicros: z.number().int(), conversations: z.number().int(), orders: z.number().int() }),
  }),
});

export const conversation = z.strictObject({
  _id: id,
  channel: z.enum(CONVERSATION_CHANNELS),
  customer: z.strictObject({ phone: z.string(), name: z.string() }),
  locale: z.enum(ORDER_LOCALES),
  status: z.enum(CONVERSATION_STATUSES),
  handoff: z.strictObject({ reason: z.string(), at: date }).nullable(),
  testMode: z.boolean(),
  orders: z.array(id),
  lastCustomerMessageAt: date.nullable(),
  lastMessageAt: date,
  preview: z.string(),
  lastRole: z.enum(MESSAGE_ROLES).nullable(),
  usage: aiUsage,
  ...timestamps,
});

export const conversationMessage = z.strictObject({
  _id: id,
  role: z.enum(MESSAGE_ROLES),
  kind: z.enum(MESSAGE_KINDS),
  text: z.string(),
  delivery: z.enum(["pending", "sent", "failed"]).nullable(),
  toolCalls: z.array(z.strictObject({ name: z.string(), input: z.unknown(), output: z.unknown() })),
  model: z.string().nullable(),
  usage: aiUsage.nullable(),
  createdAt: date,
});

export const conversationThreadResponse = z.strictObject({ conversation, messages: z.array(conversationMessage) });
export const staffMessageResponse = z.strictObject({ conversation, message: conversationMessage });
