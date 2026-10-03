---
name: revisar-backend
description: Revisar los cambios del backend de app-pedidos antes de commitear. Corre los tests y chequeos automáticos, aplica las reglas del proyecto (aislamiento entre locales, roles, plata en centavos, validación, errores, secretos) sobre git diff y reporta problemas con archivo:línea sin arreglarlos. Usala siempre que pidan revisar, auditar o chequear cambios del backend, o antes de un commit o PR ("revisá antes de commitear", "¿está bien lo que hice?", "chequeá el diff", "¿puedo hacer commit?", "revisá la seguridad del backend"). No es para escribir endpoints (nuevo-endpoint) ni para probarlos contra el servidor (probar-backend).
---

# Revisar el backend

Buscá lo que haría daño en producción: un dueño que ve datos de otro local, un cliente que se da un rol o cambia un precio, un secreto que entra a git, un 500 que muestra detalles internos. Reportá, pero no arregles nada sin preguntar: el usuario decide qué entra en el commit.

## 1. Juntá los cambios
Desde la raíz del backend:
```bash
git status --short
git diff HEAD --name-status
git ls-files --others --exclude-standard
```
Leé el diff de cada archivo (`git diff HEAD -- <archivo>`) y los archivos nuevos enteros. Leé también el archivo completo alrededor de cada cambio, porque un `findById` sin filtro de local puede estar tres líneas arriba de lo que cambió.

## 2. Chequeos automáticos
```bash
npm test
# .env agregado o modificado en staging. Tiene que salir vacío.
git diff --cached --name-status | grep -E '^[AM][[:space:]]+(.*/)?\.env$'
# Secretos o process.env impreso, en líneas agregadas y en archivos nuevos. Tiene que salir vacío.
git diff HEAD | grep -nE '^\+.*(mongodb(\+srv)?://|cloudinary://[0-9]+:[A-Za-z0-9_-]{10,}@|JWT_SECRET[[:space:]]*=[[:space:]]*[^[:space:]]|console\.log\(.*process\.env)'
git ls-files --others --exclude-standard -z | xargs -0 -r grep -nE '(mongodb(\+srv)?://|cloudinary://[0-9]+:[A-Za-z0-9_-]{10,}@|JWT_SECRET[[:space:]]*=[[:space:]]*[^[:space:]])'
# Sintaxis de los .js cambiados o nuevos.
for f in $(git diff HEAD --name-only --diff-filter=AM -- '*.js') $(git ls-files --others --exclude-standard -- '*.js'); do node --check "$f" && echo "ok $f"; done
```

## 3. Checklist, archivo por archivo
**Permisos**
- Cada ruta nueva está bajo el router correcto: `/api/public` (sin sesión), `/api/owner` (owner o staff con local activo) o `/api/admin` (superadmin).
- Cada ruta de `/api/owner` declara su permiso con `can(...)`, y el permiso tiene sentido para `staff` (un empleado no cambia precios, configuración ni equipo).
- Una ruta pública nueva necesita un motivo: ver el menú o crear un pedido, sí; leer o cambiar pedidos, no.
- El rol sale de `req.user`, nunca del body.

**Aislamiento entre locales**
- Toda consulta de `/api/owner` filtra por `req.commerce._id`, también en update y delete.
- Nada de `findById(id)` seguido de modificar sin chequear el local.
- Los ids que llegan en el body (categoría, grupos de opciones, productos) se verifican contra el local antes de guardarlos.
- Hay un test de aislamiento: el dueño de otro local recibe 404.

**Entrada**
- Toda ruta con params, query o body usa `validate(...)` y el controlador lee solo `req.valid`.
- Lo que escribe varios documentos que tienen que quedar coherentes va en una transacción.
- Un id inválido o un body inválido da 400, nunca 500.

**Plata**
- Precios y totales en centavos enteros. Los totales se calculan en el servidor con precios de la base.

**Respuestas y errores**
- Ninguna respuesta incluye `passwordHash`, `tokenVersion` ni `orderCounter`.
- Los errores se lanzan con `AppError` (code en inglés, mensaje en pt-BR); nada de `res.status(500).json(err.message)`.
- No se loguean bodies ni datos personales; nada de `console.log` en `src/` (se usa `req.log` o `logger`).
- Los cambios de precio, configuración o equipo, las cancelaciones y las acciones del superadmin quedan en la auditoría (`audit(...)`).

**Otros**
- Textos para el usuario final en portugués de Brasil.
- Imports relativos con `.js`; `config` en vez de `process.env`; `returnDocument: "after"` en vez de `new: true`.
- Rutas fijas antes que `/:id`.
- Las URLs de imagen pasan por `checkImageUrl` (si no, un dueño podría guardar imágenes de otro local o de cualquier sitio).
- Los textos traducibles se guardan sin pisar los otros campos de `translations`.
- `docs/api.md` refleja los endpoints cambiados. Cada endpoint nuevo está en `src/docs/operations.js`, en el recorrido de `tests/api/contract.test.js` y en `docs/openapi.json` (`npm run openapi`); si no, `npm test` falla.

## 4. Reporte
Usá esta forma:
```
## Revisión del backend
**Veredicto:** listo para commitear | corregir antes de commitear

### Problemas
1. [grave | medio | menor] archivo:línea — qué pasa y qué puede provocar. Cómo arreglarlo, en una línea.

### Chequeos automáticos
Tests, .env, secretos y sintaxis: ok, o qué falló.

### Para probar
Endpoints cambiados que conviene probar contra el servidor con la skill probar-backend.
```
Grave es lo que expone datos de otro local, deja escalar de rol, filtra un secreto o permite cambiar un precio. Si no hay problemas, decilo en una línea, sin rellenar.

Al final, preguntale al usuario si quiere que arregles algo. No hagas commit.
