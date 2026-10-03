---
name: probar-backend
description: Levantar el backend de app-pedidos y probarlo contra la base real con curl (login con cookie, rutas de dueño y superadmin, menú público, pedidos), crear y borrar datos de prueba, y mirar la base de Atlas en modo lectura sin mostrar credenciales. Usala siempre que haya que probar, verificar o depurar algo del backend contra el servidor ("probá el login", "fijate si anda el endpoint", "levantá el servidor", "por qué da 500", "qué hay en la base", "bad auth", "no conecta a Mongo") y después de terminar un endpoint. Para los tests automáticos alcanza con npm test; para revisar el diff antes de commitear está revisar-backend.
---

# Probar el backend

Todo se corre desde la raíz del backend, en la terminal Bash de Claude Code. Los scripts de esta skill están en `.claude/skills/probar-backend/scripts/` y reutilizan `src/db.js`, así que se conectan a la misma base que el servidor sin que tengas que tocar el `.env`.

Los tests automáticos (`npm test`) corren contra un MongoDB en memoria. Esta skill es para verlo andar contra el servidor y la base reales.

## 1. Servidor: usar el que está o levantar uno
Fijate si ya hay algo escuchando en el puerto 4000:
```bash
netstat -ano | grep LISTENING | grep ':4000 '
```
- **Hay algo:** casi siempre es el `npm run dev` del usuario (nodemon, que se reinicia solo al guardar). Usalo y no lo apagues: no es tuyo.
- **No hay nada:** levantalo en segundo plano con `node src/index.js`. Sin nodemon, para que no se reinicie en medio de una prueba. Esperá a que responda:
  ```bash
  curl -s --retry 20 --retry-connrefused --retry-delay 1 -w '\n%{http_code}\n' http://localhost:4000/api/health
  ```
  Tiene que dar `{"ok":true}` y `200`. Si no responde, leé la salida del servidor y buscá el error en la tabla del final.
- **Necesitás otra copia sin tocar la del usuario:** `PORT=4001 node src/index.js`. La variable de la terminal le gana al `.env`.

Las variables de la shell no se conservan entre comandos: escribí la URL completa en cada llamada.

## 2. Datos de prueba
Usá solo emails `@test.local`: así se borran todos juntos sin tocar datos reales. Los usuarios se crean directo en la base:
```bash
node .claude/skills/probar-backend/scripts/crear-usuario-prueba.mjs root@test.local Prueba1234 superadmin
node .claude/skills/probar-backend/scripts/crear-usuario-prueba.mjs dueno@test.local Prueba1234 owner loja-teste
```
El segundo también crea el local `/loja-teste` (abierto, con un WhatsApp de prueba). Para un empleado del mismo local: `... staff@test.local Prueba1234 staff loja-teste`. Para probar aislamiento entre locales, creá un segundo dueño con otro slug. El menú se arma por la API (`docs/api.md`).

No uses `npm run seed` con un email `@test.local` si `/burger-demo` ya existe: el seed rehace ese local y `limpiar-prueba.mjs` borraría la demo real entera. Fijate antes con `curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/public/stores/burger-demo` (404 = no existe).

## 3. Llamadas con curl
Guardá las cookies en archivos temporales fuera del repo, uno por usuario: en la carpeta temporal (scratchpad) de la sesión si hay una; si no, en `/tmp`. `-c` guarda la cookie, `-b` la manda y `-w` agrega el código HTTP al final.
```bash
curl -s -c /tmp/cookies-dueno.txt -w '\n-> HTTP %{http_code}\n' -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"dueno@test.local","password":"Prueba1234"}'
curl -s -b /tmp/cookies-dueno.txt -w '\n-> HTTP %{http_code}\n' http://localhost:4000/api/auth/me
```
Las rutas y sus bodies están en `docs/api.md`. Para ver los headers (por ejemplo `Set-Cookie`), usá `-D -` y tapá el valor del token antes de mostrarlo.

Qué probar en cada endpoint: caso normal, sin sesión (401), rol incorrecto (403), body inválido (400, nunca 500) y, si son datos de un local, que otro dueño reciba 404.

## 4. Mirar la base (solo lectura)
```bash
node .claude/skills/probar-backend/scripts/db-resumen.mjs
```
Muestra las colecciones, cuántos documentos tiene cada una y cuántos usuarios de prueba hay. Nunca muestres la URI ni el contenido del `.env`. Si necesitás ver documentos, escribí un script en la carpeta temporal que importe `conexion.mjs` y mostrá solo los campos necesarios, nunca `passwordHash`.

## 5. Al terminar
```bash
node .claude/skills/probar-backend/scripts/limpiar-prueba.mjs
```
Borra los usuarios `@test.local`, sus locales, todo lo que cuelga de esos locales (cualquier colección con campo `commerce`) y las cuentas de clientes que solo pidieron en esos locales. Borrá también los archivos de cookies. Si levantaste un servidor, apagalo por su puerto, y solo el que levantaste vos (acá, el de 4001):
```bash
taskkill //PID $(netstat -ano | grep LISTENING | grep ':4001 ' | awk '{print $NF}' | sort -u) //F
```
En Git Bash las opciones de `taskkill` van con `//`.

## Errores comunes
| Síntoma | Qué significa |
|---|---|
| `Configuración inválida en .env:` y una lista de variables | Falta una variable o no cumple el formato (por ejemplo, `JWT_SECRET` de menos de 32 caracteres). Compará con `.env.example`. |
| `bad auth : authentication failed` al arrancar | Usuario o contraseña de Atlas mal en `MONGO_URI`. Se arregla en Atlas → Database Access. No muestres la URI. |
| Tarda unos 30 s y falla con `Could not connect to any servers in your MongoDB Atlas cluster` | La IP de esta PC no está permitida en Atlas → Network Access. |
| `EADDRINUSE: address already in use :::4000` | Ya hay un servidor en ese puerto: usalo o usá otro `PORT`. |
| 401 `UNAUTHENTICATED` | Falta la cookie, venció, cambió la contraseña o el usuario está inactivo: volvé a hacer login con `-c`. |
| 403 `FORBIDDEN` / `COMMERCE_SUSPENDED` | El rol no alcanza, o el local del dueño está suspendido. |
| 429 `TOO_MANY_REQUESTS` | Rate limit (login: 10 cada 15 min por IP). Esperá o reiniciá el servidor. |
| 415 `UNSUPPORTED_MEDIA_TYPE` | El body no se mandó como JSON: falta `-H "Content-Type: application/json"`. |
| 500 `INTERNAL_ERROR` | El detalle está en la salida del servidor: buscá el `requestId` de la respuesta (también viene en el header `X-Request-Id`). |
