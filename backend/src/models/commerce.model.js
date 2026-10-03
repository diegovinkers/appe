import mongoose from "mongoose";

export const PAYMENT_METHODS = ["cash", "pix", "card"];
export const COMMERCE_STATUSES = ["active", "suspended"];
export const OVERRIDE_MODES = ["open", "closed", "paused"];
export const DELIVERY_MODES = ["fixed", "zones"];
export const SLOT_MINUTES = [15, 30, 60];
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// Slugs que chocarían con rutas del front (entrar, painel, pedido, plataforma) o de la API.
export const RESERVED_SLUGS = [
  "admin", "api", "app", "assets", "conta", "entrar", "login", "logout", "owner", "painel", "panel", "pedido", "plataforma",
  "public", "static", "www",
];

const cents = { type: Number, default: 0, min: 0, validate: Number.isInteger };
const minutes = (value) => ({ type: Number, default: value, min: 0, validate: Number.isInteger });

// Turno de un día, en hora local: { open: "18:00", close: "02:00" } cruza la medianoche.
const intervalSchema = new mongoose.Schema({ open: String, close: String }, { _id: false });
const dayIntervals = { type: [intervalSchema], default: [] };

// Fecha puntual (feriado, evento): cerrado todo el día u otros turnos.
const exceptionSchema = new mongoose.Schema(
  { date: String, closed: Boolean, intervals: [intervalSchema], note: { type: String, default: "" } },
  { _id: false }
);

// Override manual del dueño. `until` vacío = hasta que lo cambie.
const overrideSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: OVERRIDE_MODES, required: true },
    until: { type: Date, default: null },
    message: { type: String, default: "" },
  },
  { _id: false }
);

// Barrio con tarifa propia. minOrderCents y los tiempos vacíos = los generales del local.
const deliveryZoneSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  feeCents: cents,
  minOrderCents: { type: Number, default: null },
  estimateMin: { type: Number, default: null },
  estimateMax: { type: Number, default: null },
  active: { type: Boolean, default: true },
});

const commerceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40, match: SLUG_PATTERN },
    status: { type: String, enum: COMMERCE_STATUSES, default: "active" },
    description: { type: String, trim: true, maxlength: 300, default: "" },
    about: { type: String, trim: true, maxlength: 500, default: "" },
    // Aviso destacado en el menú ("Hoje não temos batata").
    notice: { type: String, trim: true, maxlength: 140, default: "" },
    logoUrl: { type: String, trim: true, maxlength: 500, default: "" },
    coverUrl: { type: String, trim: true, maxlength: 500, default: "" },
    instagram: { type: String, trim: true, maxlength: 30, default: "" },
    primaryColor: { type: String, match: HEX_COLOR, default: "#D9480F" },
    secondaryColor: { type: String, match: HEX_COLOR, default: "#212529" },
    // E.164: +5555999998888
    whatsapp: { type: String, required: true, trim: true },
    address: { type: String, trim: true, maxlength: 200, default: "" },

    // Apertura: horario semanal + excepciones, y el override manual por encima.
    // El estado se calcula con src/services/opening.service.js.
    hours: {
      weekly: {
        sun: dayIntervals,
        mon: dayIntervals,
        tue: dayIntervals,
        wed: dayIntervals,
        thu: dayIntervals,
        fri: dayIntervals,
        sat: dayIntervals,
      },
      exceptions: { type: [exceptionSchema], default: [] },
    },
    override: { type: overrideSchema, default: null },

    fulfillment: {
      delivery: { type: Boolean, default: true },
      pickup: { type: Boolean, default: true },
    },
    // Tiempos estimados en minutos, para mostrar en el menú.
    estimates: {
      deliveryMin: minutes(40),
      deliveryMax: minutes(60),
      pickupMin: minutes(20),
      pickupMax: minutes(30),
    },
    // fixed: una tarifa para todos. zones: tarifa por barrio (el cliente elige el barrio).
    deliveryMode: { type: String, enum: DELIVERY_MODES, default: "fixed" },
    deliveryFeeCents: cents,
    deliveryZones: { type: [deliveryZoneSchema], default: [] },
    // Entrega grátis desde este subtotal. null = nunca.
    freeDeliveryFromCents: { type: Number, default: null },
    // Pedido mínimo para delivery, sobre el subtotal. 0 = sin mínimo.
    minOrderCents: cents,
    paymentMethods: { type: [{ type: String, enum: PAYMENT_METHODS }], default: ["cash", "card"] },
    pixKey: { type: String, trim: true, maxlength: 140, default: "" },

    // Pedidos programados (se usan desde la fase de pedidos completos).
    scheduling: {
      enabled: { type: Boolean, default: false },
      minLeadMinutes: minutes(30),
      maxDaysAhead: minutes(2),
      slotMinutes: { type: Number, enum: SLOT_MINUTES, default: 30 },
    },

    // Textos en español para clientes uruguayos (vacío = se muestra el portugués).
    translations: {
      es: {
        description: { type: String, default: "" },
        about: { type: String, default: "" },
        notice: { type: String, default: "" },
      },
    },

    // Numeración correlativa de pedidos del local (se incrementa de forma atómica).
    orderCounter: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.orderCounter;
        return ret;
      },
    },
  }
);

export default mongoose.models.Commerce || mongoose.model("Commerce", commerceSchema);
