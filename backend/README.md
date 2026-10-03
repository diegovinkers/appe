# app-pedidos · API

Backend de app-pedidos: cada restaurante tiene su link de menú, el cliente pide sin cuenta y el pedido se abre en el WhatsApp del local. El dueño maneja menú y pedidos desde un panel.

Node 24 · Express 5 · MongoDB (Mongoose 9) · Zod 4. La referencia de endpoints está en [docs/api.md](docs/api.md).

## Levantarlo desde cero

1. Instalá Node 24 o más nuevo.
2. `npm install`
3. Copiá `.env.example` como `.env` y completá:
   - `MONGO_URI`: la URI de tu cluster de MongoDB Atlas. En Atlas → Network Access, permití la IP de tu PC.
   - `JWT_SECRET`: 32+ caracteres aleatorios. Para generar uno: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
4. `npm test`: tiene que dar todo en verde. No usa Atlas; la primera vez descarga un MongoDB de prueba.
5. `npm run dev`: la API queda en `http://localhost:4000` (probá `http://localhost:4000/api/health`).
6. Creá tu cuenta de superadmin: `npm run create-superadmin -- vos@email.com "una-contraseña-larga"`.
7. Opcional, el local de demo para mostrar a los restaurantes: `npm run seed -- dueno@email.com "otra-contraseña" "55 99999-8888"`. El WhatsApp tiene que ser tuyo: los pedidos de prueba se mandan a ese número. El menú queda en `/api/public/stores/burger-demo`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática (nodemon). |
| `npm start` | Servidor sin recarga (producción). |
| `npm test` | Tests con Vitest contra un MongoDB en memoria. |
| `npm run create-superadmin -- <email> <contraseña> [nombre]` | Crea el superadmin o le cambia la contraseña. |
| `npm run seed -- <email> <contraseña> <whatsapp>` | Crea o rehace el local de demo `/burger-demo`. |

## En producción

- `NODE_ENV=production`: la cookie de sesión pasa a ser `secure` (solo HTTPS).
- `CORS_ORIGIN`: el dominio del front. Lo ideal es servir el front y la API desde el mismo dominio.
- `TRUST_PROXY=1` si hay un proxy delante (Render, Railway, Nginx), para que el rate limit vea la IP real.
