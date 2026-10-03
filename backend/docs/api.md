# API de app-pedidos

Referencia para construir el front (React + Vite + TypeScript). Todas las rutas empiezan con `/api`.

La especificación completa, con los schemas exactos de cada request y respuesta, está en [openapi.json](openapi.json) (OpenAPI 3.1). Sirve para generar los tipos del front, por ejemplo con `npx openapi-typescript docs/openapi.json -o src/api/types.ts`. Un test garantiza que coincide con lo que la API responde de verdad.

## Convenciones

- **JSON** en requests y respuestas. Body máximo: 100 kb. Los POST, PUT, PATCH y DELETE con body tienen que mandar `Content-Type: application/json`: cualquier otro formato da `415` (protección contra CSRF).
- **Request id:** cada respuesta trae el header `X-Request-Id`. Los errores 500 lo incluyen en el body (`requestId`) para encontrar el detalle en los logs.
- **Sesión:** cookie httpOnly `token`, que pone el login y dura 7 días. Desde el front: `fetch(url, { credentials: "include" })`. En desarrollo el front tiene que estar en un origen de `CORS_ORIGIN` (por defecto `http://localhost:5173`).
- **Plata:** siempre en centavos enteros de BRL (`priceCents: 2500` = R$ 25,00). El front formatea con `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`.
- **Ids:** `_id` (24 caracteres hex). No hay `__v`.
- **Fechas:** ISO 8601 en UTC (`2026-09-27T04:48:01.868Z`).
- **Listas:** vienen dentro de un objeto (`{ "products": [...] }`) y los recursos sueltos también (`{ "product": {...} }`).
- **Teléfonos:** se aceptan como los escribe la gente ("55 99999-8888", "099 123 456") y se guardan en E.164 (`+5555999998888`). Sin código de país se asume Brasil (+55); también se aceptan números de Uruguay (+598).

### Errores

Siempre con la misma forma:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos", "details": [ ... ] } }
```

- `code`: estable, en inglés. El front decide qué mostrar según el code (así se puede traducir al español).
- `message`: texto en pt-BR, listo para mostrar al usuario.
- `details`: opcional. En `VALIDATION_ERROR` es una lista de `{ location, path, message }` (por ejemplo `{ "location": "body", "path": "customer.phone", "message": "Telefone inválido. Inclua o DDD." }`).

| Code | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body, params o query inválidos. |
| `INVALID_JSON` | 400 | El body no es JSON válido. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | El body no se mandó como `application/json`. |
| `PAYLOAD_TOO_LARGE` | 413 | Body de más de 100 kb. |
| `UNAUTHENTICATED` | 401 | Sin sesión, sesión vencida, contraseña cambiada o usuario inactivo. |
| `INVALID_CREDENTIALS` | 401 | Email o contraseña incorrectos (mismo error para los dos casos). |
| `FORBIDDEN` | 403 | El rol no alcanza. |
| `NO_COMMERCE` / `COMMERCE_SUSPENDED` | 403 | Rutas del dueño sin local, o con el local suspendido. |
| `NOT_FOUND` | 404 | No existe o es de otro local. |
| `ROUTE_NOT_FOUND` | 404 | La ruta no existe. |
| `STORE_NOT_FOUND` | 404 | Local inexistente o suspendido (rutas públicas). |
| `TOO_MANY_REQUESTS` | 429 | Rate limit: login (10 cada 15 min por IP) o pedidos (30 cada 10 min por IP). |
| `INTERNAL_ERROR` | 500 | Error inesperado; el detalle queda solo en el log del servidor. Trae `requestId`. |
| `FEATURE_DISABLED` | 503 | La función necesita un servicio externo que el servidor no tiene configurado (ej. imágenes). |

Los codes propios de cada ruta están en su sección.

## Salud

### `GET /api/health`
`200 { "ok": true }` si la base está conectada; `503 { "ok": false }` si no.

## Sesión (`/api/auth`)

### `POST /api/auth/login`
Body: `{ "email": "ana@loja.com", "password": "..." }`. Rate limit: 10 intentos cada 15 min por IP.

`200`, pone la cookie y devuelve:
```json
{
  "user": {
    "_id": "…", "name": "Ana", "email": "ana@loja.com", "role": "owner",
    "commerce": { "_id": "…", "name": "Burger Demo", "slug": "burger-demo", "status": "active" }
  }
}
```
`role` es `superadmin`, `owner` (dueño) o `staff` (empleado del local); para un superadmin, `commerce` es `null`. Errores: `INVALID_CREDENTIALS`, `TOO_MANY_REQUESTS`.

### `POST /api/auth/logout`
Borra la cookie. `204`.

### `GET /api/auth/me`
Con sesión. `200 { "user": {...} }`, igual que el login. Sirve para saber, al abrir el panel, si hay sesión y a dónde mandar al usuario.

### `PATCH /api/auth/password`
Con sesión. Body: `{ "currentPassword": "...", "newPassword": "8 o más caracteres" }`. `204`. Cierra las sesiones de los otros dispositivos; la actual sigue abierta. Error: `INVALID_PASSWORD` (400) si la actual no coincide.

## Cliente final (`/api/public`, sin sesión)

### `GET /api/public/stores/:slug`
El local y el menú entero en una sola respuesta. `404 STORE_NOT_FOUND` si no existe o está suspendido.

```json
{
  "store": {
    "name": "Burger Demo", "slug": "burger-demo", "description": "…", "about": "…", "notice": "",
    "logoUrl": "", "coverUrl": "", "instagram": "burgerdemo",
    "primaryColor": "#D9480F", "secondaryColor": "#212529",
    "isOpen": true,
    "opening": { "status": "open", "closesAt": "2026-09-27T02:30:00.000Z", "nextOpenAt": null, "pausedUntil": null, "message": "" },
    "hours": {
      "weekly": { "sun": [ { "open": "09:00", "close": "23:30" } ], "mon": [], "…": [] },
      "upcomingExceptions": [ { "date": "2026-10-12", "closed": true, "intervals": [], "note": "Feriado" } ]
    },
    "address": "Av. Brasil, 1000 — Centro, Quaraí/RS", "whatsapp": "+5555999998888",
    "fulfillment": { "delivery": true, "pickup": true },
    "estimates": { "deliveryMin": 40, "deliveryMax": 60, "pickupMin": 20, "pickupMax": 30 },
    "deliveryMode": "zones", "deliveryFeeCents": 500,
    "deliveryZones": [ { "_id": "…", "name": "Centro", "feeCents": 400, "minOrderCents": null, "estimateMin": null, "estimateMax": null } ],
    "freeDeliveryFromCents": 8000, "minOrderCents": 2000,
    "paymentMethods": ["cash", "pix", "card"], "pixKey": "+5555999998888",
    "scheduling": { "enabled": false, "minLeadMinutes": 30, "maxDaysAhead": 2, "slotMinutes": 30 }
  },
  "featuredProductIds": ["<id de X-Bacon>"],
  "categories": [
    {
      "_id": "…", "name": "Hambúrgueres", "availableNow": true, "schedule": null,
      "products": [
        { "_id": "…", "name": "X-Burger", "description": "…", "priceCents": 2500, "promoPriceCents": 2200,
          "fromPriceCents": 2200, "imageUrl": "", "tags": ["new"],
          "available": true, "optionGroups": ["<id de Ponto da carne>", "<id de Adicionais>"] }
      ]
    }
  ],
  "optionGroups": [
    { "_id": "…", "name": "Ponto da carne", "minSelect": 1, "maxSelect": 1, "pricing": "sum",
      "options": [ { "_id": "…", "name": "Ao ponto", "priceCents": 0, "maxQuantity": 1, "available": true } ] }
  ]
}
```
- `?lang=es`: nombres, descripciones y textos del local en español cuando el local los cargó; lo que no tiene traducción sale en portugués.
- Las categorías vienen en orden y sin las inactivas ni las vacías; los productos, en orden.
- **Disponibilidad:** productos y opciones que no se pueden pedir **se incluyen** con `available: false`; mostralos como "Esgotado" y no dejes elegirlos. Un producto no está disponible si:
  - lo marcaron agotado,
  - se le acabó el stock,
  - o algún grupo obligatorio no tiene opciones disponibles.
- **Horario por categoría:** `availableNow: false` significa que la categoría está fuera de su horario (`schedule`: `{ "days": ["mon", …] (vacío = todos), "from": "07:00", "to": "11:00" }`). Mostrala con "Disponível das 07:00 às 11:00" y no dejes pedir sus productos.
- **Precios:**
  - `promoPriceCents`: el precio promocional vigente ahora ("de R$ 25,00 por R$ 22,00"), o `null`.
  - `fromPriceCents`: lo mínimo que cuesta el producto con las opciones obligatorias. Si es distinto del precio (o el precio es 0, como en una pizza que se cobra por sabor), mostrá "a partir de R$ X".
- `tags`: `vegetarian`, `vegan`, `gluten_free`, `spicy`, `new` (en portugués: vegetariano, vegano, sem glúten, picante, novo).
- `featuredProductIds`: productos para la sección "Destaques" (están también dentro de su categoría).
- Cada producto referencia sus grupos por id, en el orden en que se muestran; los grupos van una sola vez en `optionGroups`.
- **Grupos de opciones:** `minSelect` y `maxSelect` cuentan unidades. `maxQuantity` es cuántas veces se puede elegir la misma opción ("2x bacon": mostrá un contador en vez de un checkbox). `pricing` dice cómo suma el grupo:
  - `sum`: cada opción suma su precio por su cantidad;
  - `max`: vale la opción más cara (pizza meio a meio);
  - `average`: vale el promedio de las elegidas.
- **Apertura:** `isOpen` dice si se puede pedir ahora. El detalle está en `opening`:
  - `status: "open"` con `closesAt` ("aberto até 23:30"; `null` si no hay hora de cierre);
  - `"closed"` con `nextOpenAt` ("abre amanhã às 18:00"; `null` si no hay horario cargado);
  - `"paused"` con `pausedUntil` y `message` (el aviso del dueño, ej. "Muitos pedidos"). Pausado significa abierto, pero sin aceptar pedidos por un rato.
  - En los tres casos mostrá el menú; solo se bloquea el pedido.
- **Horarios:** `hours.weekly` trae los turnos de cada día (`sun` … `sat`, hora de Brasil); un `close` menor que `open` termina al día siguiente (18:00–02:00) y `"24:00"` es la medianoche. `hours.upcomingExceptions` trae las fechas especiales de los próximos 14 días.
- **Entrega:** con `deliveryMode: "fixed"` la tarifa es `deliveryFeeCents` y el cliente escribe su barrio. Con `"zones"`, el cliente elige un barrio de `deliveryZones` (tarifa, mínimo y tiempo propios; `null` = los generales del local). `freeDeliveryFromCents`: entrega grátis desde ese subtotal (`null` = nunca).
- **Tiempos:** `estimates` en minutos ("Entrega em 40–60 min").
- `notice`: aviso destacado del día (mostralo arriba si no está vacío). `about`: texto "Sobre".
- `scheduling`: configuración de pedidos programados (se usa desde una próxima fase).
- `logoUrl`, `coverUrl` e `imageUrl` pueden venir vacíos: el front se tiene que ver bien sin fotos.
- La respuesta trae `ETag`: el navegador puede reusar el menú con un 304.

### `GET /api/public/stores/:slug/slots`
Franjas disponibles para un pedido programado: `{ "enabled": true, "slotMinutes": 30, "slots": ["2026-09-25T21:00:00.000Z", …] }`.
- Van desde ahora más la anticipación mínima del local hasta el último día permitido, solo en horarios en que el local abre.
- Con la programación desactivada, `enabled: false` y `slots: []`.
- Mostralas agrupadas por día, en hora de Brasil.

### `POST /api/public/stores/:slug/coupons/validate`
Body: `{ "code": "demo10", "phone"?: "55 99999-1234" }`. Si el cupón se puede usar, devuelve `{ "coupon": { "code", "type", "value", "minOrderCents" } }`. Con el teléfono, también chequea si ese cliente ya lo usó. Sirve para mostrar el descuento antes de pedir; el pedido lo vuelve a validar con el total real. Rate limit: 30 cada 10 min por IP. Errores: los de cupón de la tabla de abajo.

### `GET /api/public/orders/:token`
Seguimiento del pedido, para el link que recibe el cliente (`trackingUrl`). Devuelve `{ "store": { "name", "slug", "whatsapp", "logoUrl", "primaryColor", "secondaryColor" }, "order": {...} }`. El `order` trae:
- `number`, `status` y `statusHistory: [{ status, at }]`;
- `fulfillment`, `neighborhood` (solo el barrio) y `customerName` (solo el primer nombre);
- `scheduledFor`, `estimatedMinutes` y `eta: { from, to }`: la ventana estimada de entrega o retiro, `null` si ya terminó;
- `items` con sus opciones, totales, `paymentMethod` y `createdAt`.

No trae teléfono, dirección completa, notas internas ni el motivo de una cancelación. `404 ORDER_NOT_FOUND` si el token no existe o el local está suspendido.

### `POST /api/public/stores/:slug/orders`
Crea un pedido. Rate limit: 30 cada 10 min por IP.

```json
{
  "clientOrderId": "3b241101-e2bb-4255-8caf-4136c566a962",
  "customer": { "name": "Maria", "phone": "55 99999-1234" },
  "fulfillment": "delivery",
  "address": { "street": "Rua Brasil", "number": "123", "zoneId": "<_id del barrio>", "reference": "Perto da praça" },
  "paymentMethod": "cash",
  "changeForCents": 10000,
  "couponCode": "DEMO10",
  "scheduledFor": "2026-09-25T22:00:00.000Z",
  "locale": "pt-BR",
  "notes": "Tocar a campainha",
  "items": [
    {
      "productId": "…",
      "quantity": 2,
      "options": [ { "groupId": "…", "optionId": "…", "quantity": 2 } ],
      "notes": "sem cebola"
    }
  ]
}
```
- `clientOrderId`: generalo al abrir el checkout (`crypto.randomUUID()`) y reusalo si reintentás. Si llega repetido, la API devuelve el pedido ya creado con `200` en vez de duplicarlo. Entre 8 y 64 letras, números o guiones.
- `fulfillment`: `delivery` o `pickup`. `address` es obligatoria en delivery y se ignora en pickup. Si el local entrega por barrio, mandá `zoneId` (el nombre se toma del barrio); si la tarifa es fija, mandá `neighborhood`.
- `paymentMethod`: `cash` (dinheiro), `pix` o `card` (maquininha). `changeForCents` solo cuenta en `cash` y es opcional ("troco para quanto?").
- `items`: de 1 a 50, `quantity` de 1 a 50. Los precios no se mandan: el servidor los calcula (si vienen, se ignoran). En cada opción, `quantity` (por defecto 1) es cuántas veces se elige, hasta su `maxQuantity`.
- `couponCode` (opcional): un cupón por pedido. Descuenta del subtotal, o la tarifa de entrega si es de entrega grátis.
- `scheduledFor` (opcional): uno de los horarios de `/slots`. Un pedido programado se acepta aunque el local esté cerrado ahora, y el horario de las categorías se evalúa para ese momento.
- `locale`: `pt-BR` (por defecto) o `es`. Define el idioma de las etiquetas del mensaje de WhatsApp; los nombres de los productos quedan como en el menú, para que el local los reconozca.

`201` (o `200` si era un reenvío):
```json
{
  "order": {
    "_id": "…", "number": 12, "status": "new", "fulfillment": "delivery", "paymentMethod": "cash",
    "changeForCents": 10000,
    "items": [
      { "product": "…", "name": "X-Burger", "unitPriceCents": 2500, "quantity": 2, "notes": "sem cebola",
        "options": [ { "groupId": "…", "optionId": "…", "group": "Adicionais", "pricing": "sum", "name": "Bacon", "priceCents": 400, "quantity": 1 } ],
        "optionsCents": 400, "totalCents": 5800, "stockTracked": false }
    ],
    "subtotalCents": 5800, "deliveryFeeCents": 500, "totalCents": 6300,
    "discountCents": 580, "coupon": { "code": "DEMO10", "type": "percent", "value": 10 },
    "estimatedMinutes": { "min": 40, "max": 60 }, "scheduledFor": null, "createdAt": "…"
  },
  "trackingUrl": "https://app-pedidos.com/pedido/Xy3…",
  "whatsapp": {
    "message": "*Pedido #12 — Burger Demo*\n\n2x X-Burger — R$ 58,00\n…",
    "url": "https://wa.me/5555999998888?text=…"
  }
}
```
`estimatedMinutes` es el tiempo estimado de entrega (o de retiro) al momento del pedido; también va en el mensaje. `totalCents` = `subtotalCents − discountCents + deliveryFeeCents`. `trackingUrl` es el link de seguimiento del cliente (ruta del front `/pedido/:token`); va también al final del mensaje. Después de crear el pedido, el front abre `whatsapp.url` (`window.location.href = url`): se abre el WhatsApp del local con el mensaje escrito y el cliente lo manda. `unitPriceCents` es el precio del producto sin opciones (el promocional, si había promoción); `optionsCents`, lo que suman las opciones por unidad con la regla de cada grupo; y `totalCents` del ítem es `(unitPriceCents + optionsCents) × quantity`.

Errores propios:

| Code | HTTP | Qué mostrar |
|---|---|---|
| `STORE_CLOSED` | 409 | El local está cerrado. `details.nextOpenAt` trae la próxima apertura (o `null`). |
| `STORE_PAUSED` | 409 | El local pausó los pedidos: `message` trae el aviso del dueño y `details.pausedUntil`, hasta cuándo. |
| `DELIVERY_ZONE_NOT_AVAILABLE` | 400 | El barrio no está en la lista del local (o se desactivó): recargá el menú. |
| `PRODUCT_UNAVAILABLE` / `OPTION_UNAVAILABLE` | 409 | Algo se agotó: recargá el menú. `details.productId` (y `optionId`) dicen qué. |
| `OUT_OF_STOCK` | 409 | No hay stock suficiente: `details.available` trae cuántas unidades quedan. |
| `CATEGORY_NOT_AVAILABLE_NOW` | 409 | La categoría del producto está fuera de su horario (el mensaje dice cuál es). |
| `MIN_ORDER_NOT_REACHED` | 409 | `details.minOrderCents` trae el mínimo. |
| `PRODUCT_NOT_FOUND` / `INVALID_OPTION` | 400 | El carrito tiene algo que ya no existe: recargá el menú. |
| `OPTION_SELECTION_INVALID` | 400 | No se respetó el mínimo o el máximo de un grupo; `details` trae `groupId`, `minSelect` y `maxSelect`. |
| `FULFILLMENT_NOT_AVAILABLE` / `PAYMENT_METHOD_NOT_AVAILABLE` | 400 | Forma de entrega o de pago que el local no ofrece. |
| `INVALID_CHANGE` | 400 | El troco es menor que el total. |
| `COUPON_INVALID` | 400 | El cupón no existe o está desactivado. |
| `COUPON_EXPIRED` | 400 | Todavía no empezó o ya terminó. |
| `COUPON_MIN_ORDER` | 400 | El subtotal no llega al mínimo del cupón (`details.minOrderCents`). |
| `COUPON_EXHAUSTED` / `COUPON_ALREADY_USED` | 400 | Se acabaron los usos, o este cliente (por teléfono) ya lo usó. |
| `COUPON_NOT_APPLICABLE` | 400 | Un cupón de entrega grátis en un pedido para retirar. |
| `SCHEDULING_NOT_AVAILABLE` | 400 | El local no acepta pedidos programados. |
| `INVALID_SCHEDULE_TIME` | 400 | El horario no es una de las franjas de `/slots`: recargalas. |

## Panel del local (`/api/owner`, roles `owner` y `staff`)

Todas las rutas necesitan sesión de un dueño o empleado con su local activo: sin sesión `401`, sin el permiso `403 FORBIDDEN`, con el local suspendido `403 COMMERCE_SUSPENDED`. Todo se refiere siempre al local del usuario: un id de otro local responde `404`.

Cada ruta pide un permiso (la lista está en `src/lib/permissions.js` y en la descripción de cada operación del OpenAPI):

| Permiso | owner | staff | Qué cubre |
|---|---|---|---|
| `store:read` | ✓ | ✓ | Ver los datos del local. |
| `store:write` | ✓ | | Cambiar datos, horarios, entrega, barrios y pagos. |
| `store:open` | ✓ | ✓ | Abrir, cerrar o pausar el local. |
| `menu:read` | ✓ | ✓ | Ver el menú. |
| `menu:write` | ✓ | | Crear, editar, borrar y reordenar (incluye precios). |
| `menu:availability` | ✓ | ✓ | Marcar productos y opciones agotados o disponibles. |
| `orders:read` / `orders:write` | ✓ | ✓ | Ver pedidos, cambiar su estado, notas internas y comanda. |
| `orders:manual` | ✓ | ✓ | Cargar pedidos que llegan por teléfono, WhatsApp o en el mostrador. |
| `coupons:manage` | ✓ | | Crear y editar cupones. |

En el front, mostrá u ocultá las acciones según el `role` de `/api/auth/me`.

### Local
Las cuatro rutas que cambian el local devuelven lo mismo que `GET`: `{ "store", "opening", "storeUrl" }`.

- `GET /api/owner/store` → `{ "store": {...}, "opening": {...}, "storeUrl": "https://…/burger-demo" }`.
  - `store`: todos los campos del local (incluye `slug`, `status`, `hours`, `override` y timestamps).
  - `opening`: el estado de apertura calculado, igual que en el menú público, más `acceptingOrders` y `source` (`"schedule"` si manda el horario, `"override"` si manda el dueño).
  - `storeUrl`: el link del menú, para compartir.
- `PATCH /api/owner/store` (`store:write`). Cualquier subconjunto de:
  - **Presentación:** `name`, `description`, `about`, `notice`, `logoUrl` y `coverUrl` (URL http/https, o `""` para borrar), `instagram` (con o sin @), `primaryColor` y `secondaryColor` (`#RRGGBB`), `whatsapp`, `address`.
  - **Entrega:** `fulfillment` (`{ "delivery"?, "pickup"? }`), `estimates` (`{ "deliveryMin"?, "deliveryMax"?, "pickupMin"?, "pickupMax"? }`, en minutos), `deliveryMode` (`"fixed"` o `"zones"`), `deliveryFeeCents`, `deliveryZones`, `freeDeliveryFromCents` (`null` = nunca), `minOrderCents`.
  - **Pagos:** `paymentMethods`, `pixKey`.
  - **Programación:** `scheduling` (`{ "enabled"?, "minLeadMinutes"?, "maxDaysAhead"?, "slotMinutes"?: 15 | 30 | 60 }`).
  - **Español:** `translations` (`{ "es": { "description"?, "about"?, "notice"? } }`).
  - Los objetos (`fulfillment`, `estimates`, `scheduling`) se combinan campo por campo con lo actual.
  - `deliveryZones` reemplaza la lista entera: `[{ "_id"?, "name", "feeCents", "minOrderCents"?, "estimateMin"?, "estimateMax"?, "active"? }]`. Mandá el `_id` de los barrios que se mantienen.
  - El `slug` y el `status` los cambia solo el superadmin; los horarios y la apertura tienen sus rutas (acá se ignoran).
  - Errores (400): `NO_FULFILLMENT` si quedan las dos formas de entrega apagadas; `PIX_KEY_REQUIRED` si acepta Pix sin chave; `INVALID_ESTIMATES` si un mínimo supera al máximo; `NO_DELIVERY_ZONES` si entrega por barrio sin ningún barrio activo; `DUPLICATE_ZONE` si hay barrios con el mismo nombre; `INVALID_ZONE` si un `_id` no es de un barrio del local.
- `PUT /api/owner/store/hours` (`store:write`). Reemplaza los horarios. Las excepciones de días que ya pasaron se descartan.
  ```json
  {
    "weekly": { "mon": [], "tue": [ { "open": "18:00", "close": "23:30" } ], "fri": [ { "open": "11:00", "close": "14:30" }, { "open": "18:00", "close": "02:00" } ] },
    "exceptions": [ { "date": "2026-12-25", "closed": true, "note": "Natal" }, { "date": "2026-12-24", "intervals": [ { "open": "10:00", "close": "15:00" } ] } ]
  }
  ```
  Los días que no vienen quedan cerrados. Hasta 4 turnos por día, sin superponerse; formato `HH:MM`; `"24:00"` es la medianoche. Hasta 60 excepciones.
- `PUT /api/owner/store/status` (`store:open`, también para empleados). Apertura manual:
  - `{ "mode": "open", "until"?: "<ISO>" }`: abrir ahora (hasta esa hora, o hasta que se cambie).
  - `{ "mode": "closed", "until"?: "<ISO>" }`: cerrar ahora.
  - `{ "mode": "paused", "minutes": 20, "message"?: "Muitos pedidos, voltamos em 20 min" }`: pausar pedidos entre 5 y 240 minutos.
  - `{ "mode": "auto" }`: volver al horario.
  - Al vencer `until`, vuelve solo al horario. Error: `INVALID_UNTIL` (400) si `until` ya pasó o está a más de 7 días.
  - Para un local sin horarios cargados, el interruptor Aberto/Fechado del panel es `open`/`closed` sin `until`.
- `GET /api/owner/store/qr?format=png|svg&size=512` (`store:read`). Imagen del QR con el link del menú, para imprimir (`size` entre 128 y 2048 px; por defecto, PNG de 512).

### Categorías
- `GET /api/owner/categories` → `{ "categories": [...] }`, en orden.
- `POST /api/owner/categories` → `201 { "category" }`. Body: `{ "name", "active"?, "position"?, "schedule"?, "translations"? }`. Sin `position`, va al final.
  - `schedule`: horario de la categoría, `{ "days"?: ["mon", …] (vacío = todos), "from": "07:00", "to": "11:00" }`, o `null` para que esté siempre.
  - `translations`: `{ "es": { "name": "Desayuno" } }`.
- `PATCH /api/owner/categories/reorder` → `{ "categories" }`. Body: `{ "ids": [...] }` en el orden nuevo.
- `PATCH /api/owner/categories/:id` → `{ "category" }`. `active: false` la esconde del menú público.
- `DELETE /api/owner/categories/:id` → `204`. `409 CATEGORY_NOT_EMPTY` si tiene productos.

### Productos
- `GET /api/owner/products?category=<id>` → `{ "products": [...] }`, en orden. El filtro es opcional.
- `GET /api/owner/products/:id` → `{ "product" }`.
- `POST /api/owner/products` → `201 { "product" }`. Obligatorios: `category`, `name` y `priceCents`. Opcionales:
  - `description`, `imageUrl`, `position`, `optionGroups` (ids);
  - **Promoción:** `promoPriceCents` (menor que el precio; `null` la quita), `promoStartsAt` y `promoEndsAt` (ISO, opcionales).
  - `tags` y `featured`;
  - `available`;
  - **Stock:** `trackStock` y `stock`. Con stock controlado, cada pedido descuenta, cancelar devuelve, y en 0 el producto queda agotado solo.
  - `translations`: `{ "es": { "name"?, "description"? } }`.
  - Errores: `INVALID_PROMO` (400) si la promoción no es más barata o termina antes de empezar; `INVALID_IMAGE_URL` (400) si la imagen no se subió por el panel.
- `POST /api/owner/products/:id/duplicate` → `201 { "product" }`. Copia al final de la categoría, con " (cópia)" en el nombre y stock 0.
- `PATCH /api/owner/products/reorder` → `{ "products" }`. Body: `{ "category", "ids": [...] }`.
- `PATCH /api/owner/products/:id` → `{ "product" }`. Cualquier subconjunto de los campos (`menu:write`).
- `PATCH /api/owner/products/:id/availability` → `{ "product" }`. Body: `{ "available": false }`. Marcar agotado o disponible; lo puede hacer un empleado (`menu:availability`).
- `DELETE /api/owner/products/:id` → `204`.
- Errores: `INVALID_CATEGORY` / `INVALID_OPTION_GROUP` (400) si la categoría o algún grupo no son del local.

### Grupos de opciones
- `GET /api/owner/option-groups` → `{ "optionGroups": [...] }`.
- `GET /api/owner/option-groups/:id` → `{ "optionGroup" }`.
- `POST /api/owner/option-groups` → `201 { "optionGroup" }`. Body: `{ "name", "minSelect"? (0), "maxSelect"? (1), "pricing"? ("sum"), "options": [ { "name", "priceCents"? (0), "maxQuantity"? (1), "available"? (true), "translations"? } ], "translations"? }`.
  - `pricing`: `sum` (cada opción suma), `max` (vale la más cara: pizza meio a meio, con un producto de precio 0 y un grupo "Sabores" con mínimo 1 y máximo 2) o `average` (el promedio).
  - `maxQuantity`: cuántas veces se puede elegir la misma opción (hasta 10).
  - Límites: `minSelect` ≤ `maxSelect` ≤ unidades posibles (la suma de los `maxQuantity`).
- `PATCH /api/owner/option-groups/:id` → `{ "optionGroup" }`. `options` reemplaza la lista entera: mandá el `_id` de las opciones que se mantienen (conservan su id); las que no lo traen se crean.
- `PATCH /api/owner/option-groups/:id/options/:optionId` → `{ "optionGroup" }`. Body: `{ "available": false }`. Marca la opción agotada en todos los productos.
- `DELETE /api/owner/option-groups/:id` → `204`. Lo saca de los productos que lo usaban.

### Planilla del menú (CSV)
Para cargarle el menú rápido a un local: se exporta, se edita en Excel y se importa.
- `GET /api/owner/menu/export` (`menu:read`) → archivo `cardapio-<slug>.csv` (separado por `;`, precios con coma, UTF-8 con BOM para Excel).
  - Columnas: `categoria;produto;descricao;preco;preco_promocional;disponivel;destaque;grupos;etiquetas`.
  - `grupos` y `etiquetas` van separados por `|`.
- `POST /api/owner/menu/import` (`menu:write`). Body: `{ "csv": "<texto del archivo>", "dryRun"?: true }`. Devuelve `{ "dryRun", "summary": { "categoriesCreated", "productsCreated", "productsUpdated" }, "errors": [ { "line", "message" } ] }`.
  - **Columnas:** `categoria`, `produto` y `preco` son obligatorias; el resto, opcional.
  - **Cómo se aplica:** busca cada producto por categoría + nombre (sin importar mayúsculas). Si existe, actualiza los campos que vienen en la planilla; si no, lo crea. También crea las categorías que faltan.
  - **Grupos de opciones:** se nombran, pero no se crean: tienen que existir antes.
  - `disponivel` y `destaque`: sim/não.
  - **Probar antes:** con `dryRun` (por defecto) solo dice qué haría y lista los errores.
  - **Aplicar:** con `dryRun: false` aplica todo en una transacción. Si hay algún error, no aplica nada y responde `400 IMPORT_HAS_ERRORS` con los errores en `details`.

### Imágenes
- `POST /api/owner/uploads/signature` (`menu:write`). Body: `{ "kind": "logo" | "cover" | "product" }`. Devuelve `{ "uploadUrl", "cloudName", "apiKey", "allowed_formats", "folder", "timestamp", "signature" }`.
- Para subir, el front manda un `POST` multipart a `uploadUrl` con `file`, `api_key` (= `apiKey`), `timestamp`, `folder`, `allowed_formats` y `signature`, directo a Cloudinary (sin pasar por la API). La respuesta de Cloudinary trae `secure_url`: esa URL se guarda en `logoUrl`, `coverUrl` o `imageUrl`.
- La API solo acepta imágenes subidas así (nuestro cloud y la carpeta del local): cualquier otra da `400 INVALID_IMAGE_URL`. Si el servidor no tiene Cloudinary configurado, la firma responde `503 FEATURE_DISABLED` y se aceptan URLs https comunes.
- **Mostrar las imágenes livianas:** en la URL, después de `/upload/`, agregá transformaciones. Cloudinary las genera y las cachea:
  - producto en fila: `c_fill,w_160,h_160,f_auto,q_auto`;
  - ficha del producto: `c_limit,w_800,f_auto,q_auto`;
  - portada: `c_fill,w_1200,h_400,f_auto,q_auto`;
  - logo: `c_fill,w_200,h_200,f_auto,q_auto`.

  `f_auto` elige el formato más liviano que soporta el celular y `q_auto`, la calidad.
- Errores: `INVALID_LIMITS` (400) si `minSelect > maxSelect` o `maxSelect` supera la cantidad de opciones; `INVALID_OPTION` (400) si se manda un `_id` de opción que no es del grupo.

### Pedidos
- `GET /api/owner/orders?date=YYYY-MM-DD&status=new&updatedSince=<ISO>` → `{ "orders": [...], "serverTime": "<ISO>" }`.
  - `date`: día en hora de Brasil; por defecto, hoy. Un pedido programado aparece el día para el que está programado. Más nuevos primero; hasta 500.
  - `status`: `new`, `confirmed`, `ready`, `out_for_delivery`, `delivered` o `cancelled`.
  - `updatedSince`: solo los que cambiaron desde ese momento. **Polling del panel:** la primera vez pedí la lista sin `updatedSince`; después, cada ~10 s, pedí con `updatedSince=<serverTime de la respuesta anterior>` y mezclá por `_id`. Usá siempre el `serverTime` de la API, no el reloj de la PC.
  - **Qué trae cada pedido:**
    - Datos: `number`, `channel` (`online`, `phone`, `whatsapp` o `counter`), `locale`, `customer`, `fulfillment`, `address`, `paymentMethod`, `changeForCents`, `notes`, `items`.
    - Totales: `subtotalCents`, `discountCents`, `coupon`, `deliveryFeeCents` y `totalCents`.
    - Tiempos: `estimatedMinutes` y `scheduledFor`.
    - Estado: `status`, `statusHistory: [{ status, at, by?, reason? }]` (`by`: el usuario del panel que hizo el cambio), `cancelReason` e `internalNotes`.
    - `trackingToken` (el link del cliente es `/pedido/<trackingToken>`), `createdAt` y `updatedAt`.
    - `conversation`: si lo tomó el asistente por WhatsApp, el id de la conversación (si no, `null`).
- `GET /api/owner/orders/:id` → `{ "order" }`.
- `POST /api/owner/orders` (`orders:manual`, también empleados) → `201 { "order", "trackingUrl" }`. Carga un pedido que llegó por teléfono, WhatsApp o en el mostrador.
  - Body: como el del cliente, más `"channel": "phone" | "whatsapp" | "counter"`. En `counter` el teléfono es opcional y `clientOrderId` también (si no viene, lo genera el servidor).
  - Entra `confirmed`, aunque el local esté cerrado y sin exigir el pedido mínimo. Respeta precios, agotados, stock y cupones.
  - `scheduledFor` puede ser cualquier horario futuro, hasta 30 días.
- `PATCH /api/owner/orders/:id/status` → `{ "order" }`. Body: `{ "status": "confirmed", "estimatedMinutes"?: { "min": 20, "max": 30 }, "reason"?: "..." }`.
  - **Transiciones:**
    - delivery: `new → confirmed → ready → out_for_delivery → delivered`;
    - retiro: `new → confirmed → ready → delivered`;
    - `cancelled` desde cualquier estado que no sea final.
  - **Cancelar** exige `reason`, que queda en `cancelReason` y en el historial. Devuelve el stock y libera el uso del cupón.
  - **Tiempo estimado:** `estimatedMinutes` se puede ajustar solo al confirmar; el seguimiento del cliente lo usa para calcular su ventana de llegada.
  - `409 INVALID_STATUS_TRANSITION` si la transición no vale, o si otro dispositivo cambió el pedido antes (recargá la lista).
  - Etiquetas en pt-BR: novo, confirmado, pronto, saiu para entrega, entregue, cancelado.
- `PATCH /api/owner/orders/:id/notes` → `{ "order" }`. Body: `{ "internalNotes": "..." }` (hasta 500 caracteres). Notas del local: salen en la comanda, nunca para el cliente.
- `GET /api/owner/orders/:id/ticket?format=html|text&width=80|58` → comanda para la impresora térmica.
  - `html` (por defecto): una página lista para imprimir con Ctrl+P, con el ancho de papel fijado.
  - `text`: texto plano de 48 columnas (80 mm) o 32 (58 mm).
  - Trae todo lo que necesitan la cocina y el repartidor: cliente y teléfono, dirección completa, ítems con sus opciones, totales, pago con troco, observaciones y notas internas.

### Cupones (`coupons:manage`, solo el dueño)
- `GET /api/owner/coupons` → `{ "coupons": [...] }`, los más nuevos primero.
- `POST /api/owner/coupons` → `201 { "coupon" }`. Body:
  ```json
  { "code": "DEMO10", "type": "percent", "value": 10, "minOrderCents"?: 3000, "startsAt"?: "<ISO>", "endsAt"?: "<ISO>", "maxUses"?: 100, "maxUsesPerCustomer"?: 1, "active"?: true, "description"?: "Campanha do Instagram" }
  ```
  - **Tipos:**
    - `percent`: `value` de 1 a 100, sobre el subtotal;
    - `fixed`: `value` en centavos;
    - `free_delivery`: la entrega sale grátis, solo en delivery.
  - El código se guarda en mayúsculas y no se repite en el local.
  - `uses` cuenta los pedidos no cancelados que lo usaron. `maxUsesPerCustomer` se controla por teléfono.
  - Errores: `COUPON_CODE_TAKEN` (409) si el código ya existe; `INVALID_COUPON` (400) si el valor no corresponde al tipo o las fechas están al revés.
- `PATCH /api/owner/coupons/:id` → `{ "coupon" }`. Cualquier subconjunto de los campos; `active: false` lo pausa.
- `DELETE /api/owner/coupons/:id` → `204`. Los pedidos que lo usaron guardan su copia del código y del descuento.

### Asistente con IA
Atiende a los clientes por WhatsApp y toma pedidos con Claude (Anthropic). Sin `ANTHROPIC_API_KEY` en el `.env`, está apagado y el simulador responde `503 ASSISTANT_UNAVAILABLE`.

- `GET /api/owner/assistant` (`store:write`) → `{ "assistant" }`: `enabled`, `phoneNumberId`, `monthlyBudgetUsdCents` (centavos de dólar; por defecto 1000 = US$ 10), `voiceReplies`, `model`, `available: { ai, whatsapp, transcription, voice }` (lo configurado en el servidor) y `month: { month, costMicros, conversations, orders }` (el gasto del mes en millonésimos de dólar).
- `PATCH /api/owner/assistant` (`store:write`) → lo mismo. Body: cualquier subconjunto de `enabled`, `phoneNumberId` (el id del número en Meta; `""` lo desconecta), `monthlyBudgetUsdCents` y `voiceReplies`. `409 PHONE_NUMBER_TAKEN` si ese número ya es de otro local.
- `POST /api/owner/assistant/simulator` (`store:write`) → `201 { "conversation", "messages" }`: el local le escribe al asistente como si fuera un cliente y la respuesta viene en la misma llamada.
  - Body: `{ "text": "...", "customer": { "name", "phone" }, "locale"?: "pt-BR" | "es", "realOrders"?: false, "conversationId"?: "..." }`. Sin `conversationId` empieza una conversación nueva.
  - Con `realOrders: false` (por defecto) los pedidos se cotizan pero no se crean.
- `POST /api/owner/assistant/simulator/audio` (`store:write`) → lo mismo, con una nota de voz. Body: los mismos campos, con `"audio": "<base64>"` (OGG, WebM o MP4; hasta ~1,5 MB) en vez de `text`. Se transcribe con Whisper en el servidor (`TRANSCRIPTION_PROVIDER=local`); sin transcripción, `503 TRANSCRIPTION_UNAVAILABLE`; si no se entiende, `422 AUDIO_NOT_UNDERSTOOD`.
- `POST /api/owner/assistant/speech` (`orders:read`) → la nota de voz (`audio/ogg`) de un texto, para escuchar en el panel cómo suena una respuesta. Body: `{ "text", "locale"?: "pt-BR" | "es" }`. Sin voz en el servidor (`VOICE_PROVIDER=local`), `503 VOICE_UNAVAILABLE`.
- `GET /api/owner/assistant/conversations?channel=simulator|whatsapp&status=bot|human|closed` (`orders:read`) → `{ "conversations": [...] }`, las más recientes primero (hasta 100). Cada una: `channel`, `customer`, `locale`, `status`, `handoff: { reason, at } | null` (por qué pasó a una persona), `testMode`, `orders`, `preview`, `lastRole` (de quién es el último mensaje: si está `human` y no es `staff`, alguien del local tiene que contestar), `lastMessageAt`, `usage`.
- `GET /api/owner/assistant/conversations/:id` (`orders:read`) → `{ "conversation", "messages" }`: los últimos 200 mensajes. Cada mensaje: `role` (`customer`, `assistant` o `staff`), `kind` (`text` o `audio`, con la transcripción en `text`), `toolCalls` (qué hizo el asistente para contestar), `usage` y `delivery` (si salió por WhatsApp).
- `POST /api/owner/assistant/conversations/:id/takeover` y `/release` (`orders:write`) → `{ "conversation" }`: la atiende una persona (el asistente se calla) o vuelve al asistente. Al devolverla, si lo último es del cliente, el asistente lo contesta.
- `POST /api/owner/assistant/conversations/:id/messages` (`orders:write`) → `201 { "conversation", "message" }`. Body: `{ "text" }`. Alguien del local le escribe al cliente; la conversación pasa a `human`. En WhatsApp sale por WhatsApp (`delivery`: `sent` o `failed`); pasadas 24 h del último mensaje del cliente, `409 WHATSAPP_WINDOW_CLOSED`.

**Cómo toma un pedido:** con `cotar_pedido` valida y calcula con las mismas reglas que el menú (precios de la base, horario, mínimo, stock, cupones) y guarda esa cotización. `criar_pedido` crea exactamente lo cotizado, solo si el cliente escribió después de ver el resumen. El pedido entra `new`, con `channel: "whatsapp"` y `conversation`. Pasa a una persona (`chamar_atendente`) en reclamos, alergias o cambios de un pedido hecho; también si la IA falla, si se llegó al tope de gasto del mes o si hay demasiados mensajes en una hora. Las conversaciones se borran a los 90 días y con la cuenta del cliente.

### WhatsApp (`/api/whatsapp`, sin sesión, lo llama Meta)
Paso a paso para conectarlo: [whatsapp-bot.md](whatsapp-bot.md). Sin `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN`, responde `404`.

- `GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` → el `challenge` en texto plano si el token es `WHATSAPP_VERIFY_TOKEN`; si no, `403 INVALID_VERIFY_TOKEN`.
- `POST /api/whatsapp/webhook` → `{ "ok": true }`, solo con la firma `X-Hub-Signature-256` válida (HMAC SHA-256 del cuerpo tal como llegó, con `WHATSAPP_APP_SECRET`); si no, `401 INVALID_SIGNATURE`.
  - Contesta enseguida y procesa después. El local sale de `metadata.phone_number_id` (el `phoneNumberId` del asistente, encendido). El mismo mensaje no se procesa dos veces.
  - Mensajes seguidos se juntan (3 s) y el asistente contesta una vez. Audios: se transcriben con `TRANSCRIPTION_PROVIDER=local`; si no, se le pide texto. Otros tipos (fotos, stickers): se le pide texto.
  - El número llega sin `+` (`wa_id`) y a veces sin el 9 del celular; la cuenta y los pedidos del cliente se buscan con y sin el 9.
  - Una conversación sin mensajes del cliente por 12 h se cierra; si vuelve a escribir, empieza otra.
- Con `voiceReplies` y `VOICE_PROVIDER=local`: si el cliente habló por audio, las respuestas cortas (hasta 400 caracteres y 5 líneas) van también como nota de voz. El resumen del pedido va solo por escrito. Precios, números y horarios se leen en palabras.
- Cuando un pedido del asistente pasa a `confirmed`, `ready` (retiro), `out_for_delivery` o `cancelled`, el cliente recibe un aviso por WhatsApp si todavía está dentro de las 24 h.

## Superadmin (`/api/admin`, rol `superadmin`)

- `GET /api/admin/commerces` → `{ "commerces": [ { ...local, "owners": [ { "_id", "name", "email", "active" } ] } ] }`.
- `POST /api/admin/commerces` → `201 { "commerce", "owner" }`. Crea el local (cerrado) y su dueño:
  ```json
  {
    "commerce": { "name": "Burger Demo", "slug": "burger-demo", "whatsapp": "55 99999-8888" },
    "owner": { "name": "Ana", "email": "ana@loja.com", "password": "8 o más caracteres" }
  }
  ```
  El slug usa minúsculas, números y guiones, de 3 a 40 caracteres; hay algunos reservados (`admin`, `api`, `login`...). Errores: `SLUG_TAKEN` y `EMAIL_TAKEN` (409).
- `PATCH /api/admin/commerces/:id` → `{ "commerce" }`. Body: cualquier subconjunto de `name`, `slug`, `whatsapp` y `status` (`active` | `suspended`). Cambiar el slug rompe los links y QR que ya se compartieron. Error: `SLUG_TAKEN` (409).
- `PATCH /api/admin/users/:id/password` → `204`. Body: `{ "password" }`. Resetea la contraseña de un dueño (no de un superadmin) y cierra sus sesiones.
- `GET /api/admin/audit?commerce=<id>&action=<acción>&limit=100` → `{ "entries": [ { "_id", "commerce", "actor": { "user", "role" }, "action", "entity": { "type", "id" }, "changes", "createdAt" } ] }`. Registro de auditoría, del más nuevo al más viejo (máximo 500; se guarda 180 días). Acciones registradas: `product.created`, `product.price_changed`, `product.deleted`, `category.deleted`, `option_group.prices_changed`, `option_group.deleted`, `store.updated`, `store.hours_updated`, `store.status_changed`, `menu.imported`, `coupon.created`, `coupon.updated`, `coupon.deleted`, `order.cancelled`, `admin.commerce_created`, `admin.commerce_updated`, `admin.password_reset`. `changes` trae lo que cambió, por ejemplo `{ "priceCents": [2500, 2700] }`.
