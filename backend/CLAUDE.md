# app-pedidos · backend

API de app-pedidos: pedidos online para restaurantes de ciudades chicas del sur de Brasil (empieza en Quaraí, RS). Cada local tiene su menú con link propio; el cliente pide sin cuenta y el pedido se abre en el WhatsApp del local. Muchos locales comparten la misma base, así que el aislamiento entre locales es lo más importante. El front está al lado, en `../client` (React + Vite + TS; los tipos de la API salen de `docs/openapi.json` con `npm run api:types`).

## Comandos
- `npm install`
- `npm run dev`: nodemon (solo mira `src/`), puerto 4000. Solo escucha después de conectar a Mongo.
- `npm test`: Vitest + supertest contra un MongoDB en memoria (replica set, por las transacciones); nunca toca Atlas.
- `npm run openapi`: regenera `docs/openapi.json` desde `src/docs/operations.js`. Correlo después de tocar endpoints o respuestas.
- `npm run create-superadmin -- <email> <contraseña> [nombre]`: crea la cuenta de la plataforma o le cambia la contraseña.
- `npm run seed -- <email> <contraseña> <whatsapp>`: crea o rehace el local de demo `/burger-demo`. Escribe en Atlas.

Documentación: `docs/api.md` (para humanos) y `docs/openapi.json` (generado; el front saca sus tipos de ahí).

## Stack
Node 24, Express 5, Mongoose 9, Zod 4, jsonwebtoken, bcryptjs 3, helmet, express-rate-limit, pino, node-cron, ESM. MongoDB Atlas, base `app-pedidos` (`src/db.js`). Variables: ver `.env.example`; `src/config.js` las valida al arrancar.

## Estructura
- `src/index.js` conecta, levanta, arranca los jobs y cierra ordenado con SIGTERM. `src/app.js` exporta `createApp()` (los tests la usan sin levantar el servidor) y `createApiRouters()`.
- `src/routes/` → `src/middlewares/` → `src/controllers/` → `src/models/`. Schemas Zod de entrada en `src/schemas/` (helpers en `common.schema.js`) y de respuesta en `responses.schema.js`. Lógica pura en `src/services/`, utilidades en `src/lib/`, jobs en `src/jobs/`, registro del OpenAPI en `src/docs/`.
- `scripts/`: tareas de consola. `tests/unit/` (lógica pura) y `tests/api/` (endpoints); helpers en `tests/helpers.js`.

Recorrido: ruta → `authRequired` → `requireRole` / `requireOwnerCommerce` (en `/api/owner`) → `requirePermission` → `validate` → controlador.

Rutas: `/api/auth` (sesión), `/api/public` (cliente, sin sesión), `/api/owner` (panel del local), `/api/admin` (plataforma).

## Datos
- `users` (superadmin | owner | staff) y `commerces` (el local: presentación, horarios y override manual, entrega fija o por barrio, pagos, programación).
- Si un local está abierto se calcula, no se guarda: `getOpeningStatus()` en `src/services/opening.service.js` (horario semanal + excepciones + override, en hora de Brasil). Las fechas locales se manejan con `src/lib/dates.js`.
- `categories` (con horario opcional), `products` (promoción con vigencia, etiquetas, destacado, stock opcional) y `optiongroups` (regla de precio sum/max/average, cantidad máxima por opción): el menú. Los grupos de opciones son del local y se comparten entre productos. Todo tiene `translations.es` opcional (el menú público acepta `?lang=es`).
- Precios del menú en `src/services/pricing.service.js` (precio vigente, costo de un grupo, "a partir de"); import/export CSV en `src/services/menuImport.service.js` y `src/lib/csv.js`.
- Imágenes: Cloudinary con subida firmada (`src/lib/cloudinary.js`). Con `CLOUDINARY_URL`, las URLs guardadas tienen que ser de la carpeta del local (`checkImageUrl`).
- `orders`: copian nombres y precios al momento del pedido. Número correlativo por local. Tienen canal (online o cargado en el panel), idioma, cupón, horario programado, link de seguimiento (`trackingToken`), motivo de cancelación y notas internas. Se crean con `placeOrder` en `src/controllers/order.controller.js`, en una transacción (stock, cupón y contador).
- `coupons`: por local; `uses` se incrementa en la transacción del pedido y se libera al cancelar. Reglas en `src/services/coupon.service.js`.
- Servicios de pedidos: `scheduling.service.js` (franjas de pedidos programados), `ticket.service.js` (comanda 58/80 mm), `whatsapp.service.js` (mensaje en pt-BR o es), `orderStatus.js` (transiciones; delivery pasa por `out_for_delivery`).
- `auditlogs` (180 días) y `joblocks`.
- Asistente con IA (`src/services/assistant/`): `assistants` (configuración por local), `conversations` y `conversationmessages`. La IA va detrás de `getAiProvider()` (`ai.js`; los tests ponen una falsa con `setAiProvider`, nunca la real). Toma pedidos con las herramientas de `tools.js`, que usan `quoteOrder`/`placeOrder` de `src/services/orderPlacement.service.js` (el mismo cálculo que el menú). `placeOrder` recibe `origin`: `customer` (menú y asistente) o `panel`. WhatsApp (Cloud API) en `whatsapp.js`/`whatsappCloud.js` (tests: `setWhatsappClient`, `flushReplies`, `settleWebhooks`); audios con Whisper local (`whisper.js`, tests: `setTranscriber`) y voz local (`mms.js`, tests: `setSpeaker`), los dos con el ffmpeg incluido (`ffmpeg.js`).
- Todo lo que es de un local tiene el campo `commerce`.

## Sesión, roles y permisos
- `superadmin` (la plataforma), `owner` (dueño) y `staff` (empleado). `User.commerce` es el local de owner y staff. No hay registro público.
- Login: JWT `{ sub, v }` de 7 días en la cookie httpOnly `token`. `authRequired` carga el usuario en cada request y corta si está inactivo o si `v` ≠ `tokenVersion`. Deja `req.user = { id, role, commerce }`.
- Permisos por rol en `src/lib/permissions.js`. Cada ruta declara el suyo con `requirePermission("menu:write")`; un permiso mal escrito rompe al arrancar.
- `requireOwnerCommerce` deja el local en `req.commerce` y corta si está suspendido.

## Convenciones
- Errores: `throw` de un `AppError` (`src/lib/errors.js`), code en inglés y mensaje en pt-BR. Sin try/catch: Express 5 lleva los errores async al `errorHandler`.
- Entrada: `validate({ params, query, body })` deja lo validado en `req.valid`; los controladores leen solo de ahí.
- Respuestas: el id es `_id` y no hay `__v`. `passwordHash`, `tokenVersion` y `orderCounter` nunca salen.
- **Endpoint nuevo o respuesta que cambia:** registralo en `src/docs/operations.js` con su schema de respuesta, corré `npm run openapi` y sumalo a `tests/api/contract.test.js`. Los tests fallan si el registro no coincide con las rutas, si una respuesta no cumple su schema o si `openapi.json` quedó viejo.
- Auditoría: `audit(req, { action, entity, changes })` (`src/lib/audit.js`) en cambios de precio, configuración, equipo, cancelaciones y acciones del superadmin.
- Transacciones: lo que toca varios documentos va en `mongoose.connection.transaction(async (session) => ...)`, pasando `session` a cada operación.
- Logs: `req.log` en requests y `logger` (`src/lib/logger.js`) fuera de ellas; nunca `console.log` en `src/`.
- Jobs: se agregan a `JOBS` en `src/jobs/index.js` (cron en hora de Brasil, con lock en la base).

## Reglas
- **Aislamiento entre locales:** en `/api/owner` toda consulta filtra por `req.commerce._id`, también en update y delete. Un id que llegue en el body se verifica contra ese local.
- **Roles y permisos:** el rol nunca lo manda el cliente; cada ruta del panel declara su permiso.
- **Plata:** centavos enteros (BRL). El total de un pedido lo calcula el servidor con los precios de la base.
- **Errores:** al cliente, un mensaje genérico; el detalle solo en el log.
- **Secretos:** nunca en el código ni en git. Nunca imprimir `MONGO_URI` ni `JWT_SECRET`.
- **Logs:** nunca bodies, cookies ni headers: tienen datos personales y la sesión.
- **Idioma:** los textos que ve el usuario final, en portugués de Brasil.

## Trampas
- ESM: los imports relativos llevan `.js`.
- Express 5: `req.query` es de solo lectura (usá `req.valid.query`).
- Mongoose 9: `returnDocument: "after"` en vez de `new: true`. `Model.create([doc], { session })` con array cuando va en una transacción.
- `Model.create()` devuelve el documento con los campos `select: false` cargados: mandalo con `res.json` (pasa por el transform) o armá la respuesta a mano.
- En un router, las rutas fijas (`/reorder`) van antes que `/:id`.
- Los POST, PUT, PATCH y DELETE con body que no sea `application/json` dan 415 (CSRF).

## Skills del proyecto
- `nuevo-endpoint`: agregar o cambiar rutas, modelos o controladores.
- `probar-backend`: levantar el servidor, probar con curl y manejar datos de prueba.
- `revisar-backend`: revisión antes de commitear.
