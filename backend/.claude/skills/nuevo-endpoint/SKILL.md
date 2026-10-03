---
name: nuevo-endpoint
description: Agregar o cambiar un endpoint del backend de app-pedidos de punta a punta (modelo Mongoose, schema Zod, controlador, rutas, montaje en src/app.js y tests), con los chequeos de permisos, aislamiento entre locales, validación y plata en centavos. Usala siempre que haya que crear o modificar una ruta, un recurso, un modelo o un controlador del backend, aunque no digan "endpoint" ("agregá el CRUD de cupones", "nueva ruta para el resumen del día", "que el dueño pueda marcar un producto agotado", "agregale el campo instagram al local"). No es para probar ni revisar código ya escrito; para eso están probar-backend y revisar-backend.
---

# Nuevo endpoint

Este backend es multi-tenant: muchos locales comparten la misma base. El error más caro no es que algo no ande, sino que un dueño vea o toque datos de otro local, o que un cliente pague un precio que mandó él. Por eso primero se decide quién puede llamar al endpoint y recién después se escribe código.

## 1. Contrato antes de programar
Escribilo en 3-5 líneas en tu respuesta:
- Método y ruta. Van bajo `/api/public` (sin sesión), `/api/owner` (dueño) o `/api/admin` (superadmin).
- Si son datos de un local: siempre los de `req.commerce` (el del dueño con sesión) o los del slug en rutas públicas.
- Qué entra (body, params, query), qué devuelve y con qué códigos.

Si no está claro quién puede llamarlo, preguntá antes de seguir.

## 2. Modelo (si hace falta uno nuevo)
Seguí la forma de `src/models/commerce.model.js`: `timestamps: true`, `versionKey: false` y `export default mongoose.models.X || mongoose.model("X", schema)`.
- Datos de un local: campo `commerce` (ObjectId, `ref: "Commerce"`, `required: true`, `index: true`). Con ese nombre, `limpiar-prueba.mjs` de probar-backend borra los datos de prueba solo.
- Plata: número entero en centavos (`validate: Number.isInteger`). Nunca decimales: `0.1 + 0.2` no da `0.3`.
- Campos internos: `select: false` y sacalos en el transform de `toJSON`.

## 3. Schema Zod
En `src/schemas/<recurso>.schema.js`. Usá los helpers de `src/schemas/common.schema.js` (`objectId`, `idParams`, `requiredText`, `cents`, `imageUrl`, `phone`...): ya traen los mensajes en pt-BR. Los campos opcionales de un PATCH, con `.partial()` o `.optional()`.

## 4. Controlador
En `src/controllers/<recurso>.controller.js`, con la forma de los que ya existen.
- **Sin try/catch:** Express 5 manda los errores async al `errorHandler`. Para cortar, `throw` con los helpers de `src/lib/errors.js` (`notFound`, `badRequest`, `conflict`...), con `code` en inglés y mensaje en pt-BR.
- **Solo `req.valid`:** nunca leas `req.body` ni `req.query` directo, y nunca pases el body entero a `create` o `update` sin haber pasado por el schema.
- **Aislamiento:** buscá con `findOne({ _id: req.valid.params.id, commerce: req.commerce._id })`, nunca con `findById` solo, también en update y delete. Si no aparece, 404, aunque exista en otro local. Los ids que llegan en el body (una categoría, un grupo) se verifican contra `req.commerce._id` antes de guardarlos.
- **Plata:** precios y totales calculados con los precios de la base. La lógica de cálculo va en `src/services/` como funciones puras.
- **Respuestas:** `res.json(doc)` pasa por el transform de `toJSON`; si armás el objeto a mano, nunca incluyas `passwordHash` ni campos internos.
- **Varios documentos a la vez** (ej. pedido + contador + stock): en una transacción, `mongoose.connection.transaction(async (session) => ...)`, pasando `session` a cada operación. Si algo falla, nada queda a medias.
- **Auditoría:** si el endpoint cambia precios, configuración o equipo, cancela algo, o es una acción del superadmin, registralo con `audit(req, { action, entity, changes })` de `src/lib/audit.js`.
- **Logs:** `req.log.info(...)`, nunca `console.log`, y nunca datos personales.
- **Imágenes:** un campo con URL de imagen se valida con `checkImageUrl(url, req.commerce._id, campo)` de `src/lib/cloudinary.js` (solo imágenes subidas por el panel).
- **Textos traducibles:** van en `translations.es`; guardalos con `setTranslations` o `translationPaths` (`src/lib/translations.js`) para no borrar los otros idiomas, y en el menú público usá `localized(doc, campo, lang)`.
- **Códigos:** 201 al crear, 204 al borrar, 400 entrada inválida, 401 sin sesión, 403 rol incorrecto o local suspendido, 404 no existe o no es de su local, 409 conflicto de estado.

## 5. Rutas y montaje
En `src/routes/<recurso>.routes.js`, con la forma de los routers que ya existen. El de `/api/owner` ya aplica `authRequired`, `requireRole("owner", "staff")` y `requireOwnerCommerce` para todo el router. En cada ruta:
- **Permiso:** `can("menu:write")` (alias de `requirePermission`). Si hace falta un permiso nuevo, agregalo en `src/lib/permissions.js` y decidí si lo tiene `staff` (un empleado atiende pedidos y marca agotados; no toca precios, configuración ni equipo).
- **Validación:** `validate({ params, query, body })`.
- Las rutas fijas (`/reorder`) van antes que `/:id`.

Montá el router en `src/app.js` (o en el router padre). Los imports relativos llevan `.js`.

## 6. OpenAPI
Registrá el endpoint en `src/docs/operations.js` (método, ruta, permiso, schemas de entrada y de respuesta). Si la respuesta es nueva, definila en `src/schemas/responses.schema.js` con `z.strictObject`. Después corré `npm run openapi`.

## 7. Tests
En `tests/api/<recurso>.test.js`, con `tests/helpers.js` (`createCommerceWithOwner`, `createSuperadmin`, `loginAs`, `containsKey`). Como mínimo:
1. Caso normal (200 o 201).
2. Sin sesión → 401. Con rol incorrecto → 403.
3. Entrada inválida → 400, nunca 500.
4. Aislamiento: el dueño de otro local recibe 404 al leer, modificar o borrar.
5. Permisos: si `staff` no tiene el permiso, recibe 403 (`createStaff` en los helpers).
6. Contrato: sumá la llamada al recorrido de `tests/api/contract.test.js`, que valida la respuesta real contra el schema y falla si queda un endpoint sin cubrir.

Corré `npm test` hasta que todo quede en verde. Si querés verlo contra el servidor real, usá probar-backend.

## 8. Antes de commitear
Actualizá `docs/api.md` con el endpoint y corré la skill `revisar-backend`.
