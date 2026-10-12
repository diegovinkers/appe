# Conectar el asistente a WhatsApp

Guía para probar el asistente con tu celular, usando el **número de prueba gratis** que da Meta. Tardás unos 20 minutos.

Antes, probalo en el panel (**Assistente → Testar**). Para eso alcanza con la clave de Claude (`ANTHROPIC_API_KEY`) en `backend/.env`.

## Probar el servicio publicado en Render

Para probar desde tu celular, no hace falta poner tu número personal como número del comercio. Usa el número de prueba que entrega Meta y agrega tu celular como destinatario permitido. Así le escribís desde WhatsApp a la cuenta de prueba de Fronteiriço Burger sin migrar tu línea.

En Render, agrega estas variables al servicio del backend y vuelve a desplegar:

| Variable | Valor |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso de la cuenta/número de WhatsApp en Meta. No lo pongas en Vercel ni en el navegador. |
| `WHATSAPP_APP_SECRET` | Clave secreta de la app de Meta. |
| `WHATSAPP_VERIFY_TOKEN` | Secreto que inventas tú; debe coincidir exactamente con el token que escribes al configurar el webhook. |
| `WHATSAPP_GRAPH_VERSION` | Opcional; si se omite, el backend usa `v23.0`. |

En la configuración del webhook de Meta usa esta URL de callback:

`https://appe-l99l.onrender.com/api/whatsapp/webhook`

Verifica y guarda el webhook, y suscribe el campo `messages`. Después, en la app, administración debe activar manualmente `Member Plus` para Fronteiriço Burger con estado activo y una fecha de vencimiento futura. El dueño entra a **Asistente → Configurar**, pega el `Phone number ID` del número de prueba y activa **Atender por WhatsApp**.

El flujo de prueba seguro es: escribe desde tu celular agregado a la lista **To** de Meta; confirma que el chat aparece en **Asistente → Conversaciones**; toma el control, responde desde la app y confirma que llegó a WhatsApp. Para probar pedidos, completa una conversación y confirma explícitamente el resumen antes de revisar **Pedidos nuevos**.

No compartas aquí claves, tokens, códigos de verificación ni capturas donde se vean. Si Meta exige registrar o migrar un número, detente antes de hacerlo con tu línea personal y revisa la alternativa de número de prueba.

## Qué vas a necesitar
- Una cuenta de Facebook.
- El backend corriendo en tu PC (`npm run dev`, puerto 4000).
- `cloudflared`, un programa gratis que le da a tu PC una dirección `https` para que Meta le pueda mandar los mensajes. En Windows se instala con `winget install --id Cloudflare.cloudflared`.

Los tokens y claves de estos pasos van **solo** en `backend/.env`. No los pegues en chats, capturas ni commits.

## 1. Crear la app en Meta
1. Entrá a [developers.facebook.com](https://developers.facebook.com) → **Mis apps** → **Crear app**.
2. Elegí el caso de uso de **WhatsApp** ("Conectarte con clientes a través de WhatsApp").
3. Cuando te pida un portfolio comercial (Business), creá uno con el nombre del proyecto.
4. Entrá al panel de la app → **WhatsApp** → **Configuración de la API** (API Setup).

## 2. Número de prueba y tu celular
En **Configuración de la API**:
1. Arriba vas a ver el **número de prueba** de Meta. Anotá el **Identificador del número de teléfono** (Phone number ID): es un número largo, lo vas a cargar en el panel.
2. En **Para** (To), agregá **tu celular** y confirmalo con el código que te llega por WhatsApp.
   - Con el número de prueba, el asistente solo puede contestarle a los teléfonos que agregues acá (hasta 5).
3. Tocá **Generar token de acceso**. Ese es el `WHATSAPP_ACCESS_TOKEN`.
   - Este token **dura 24 horas**. Para uno que no vence, mirá el paso 7.

## 3. Las claves en el `.env`
1. En el panel de la app → **Configuración de la app** → **Básica** → **Clave secreta de la app** → **Mostrar**. Esa es el `WHATSAPP_APP_SECRET`.
2. Inventá una palabra secreta cualquiera, por ejemplo `quarai-2026-bot`. Ese es el `WHATSAPP_VERIFY_TOKEN`; en el paso 5 la vas a escribir igual en Meta.
3. Agregá esto a `backend/.env`:
   ```
   WHATSAPP_ACCESS_TOKEN=el token del paso 2
   WHATSAPP_APP_SECRET=la clave secreta de la app
   WHATSAPP_VERIFY_TOKEN=tu palabra secreta
   ```
4. Reiniciá el backend (cortá `npm run dev` y volvelo a correr).

## 4. Abrir el túnel
En otra terminal:
```
cloudflared tunnel --url http://localhost:4000
```
Aparece una dirección como `https://algo-al-azar.trycloudflare.com`. Dejá esa terminal abierta mientras probás.

La dirección **cambia cada vez** que lo abrís. Si lo cerrás y lo volvés a abrir, repetí el paso 5 con la dirección nueva.

## 5. El webhook en Meta
1. En el panel de la app → **WhatsApp** → **Configuración** → **Webhook** → **Editar**.
2. **URL de devolución de llamada**: `https://algo-al-azar.trycloudflare.com/api/whatsapp/webhook` (con la dirección de tu túnel).
3. **Token de verificación**: tu palabra secreta del paso 3.
4. **Verificar y guardar**. Si falla, fijate que el backend esté corriendo, el túnel abierto y la palabra sea exactamente la misma.
5. En **Campos del webhook**, tocá **Suscribirse** en **messages**.

## 6. Prender el asistente en el panel
1. Entrá al panel como dueño → **Assistente** → **Configurar**.
2. En **ID do número na Meta**, pegá el identificador del paso 2.
3. Prendé **Atender no WhatsApp** y tocá **Salvar**.
4. Desde tu celular, escribile "oi" al número de prueba. El asistente contesta en unos segundos.
5. En **Assistente → Conversas** ves la conversación. Desde ahí la podés tomar vos y contestar a mano.

## 7. Un token que no vence
El token del paso 2 dura 24 horas. Para uno permanente:
1. [business.facebook.com](https://business.facebook.com) → **Configuración** → **Usuarios** → **Usuarios del sistema** → **Agregar**, con rol **Administrador**.
2. **Asignar activos**: la app (control total) y la cuenta de WhatsApp.
3. **Generar token**. Elegí la app, sin vencimiento, con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
4. Reemplazá `WHATSAPP_ACCESS_TOKEN` en el `.env` y reiniciá el backend.

## Audios
Para que el asistente entienda audios, agregá `TRANSCRIPTION_PROVIDER=local` al `.env`.
- Los pasa a texto en tu PC, gratis.
- La primera vez baja el modelo, unos 80 MB, así que ese primer audio tarda.
- Un audio de 10 segundos tarda unos 5 segundos en una PC común. Con `WHISPER_MODEL=onnx-community/whisper-small` entiende mejor los audios con ruido, pero tarda unas 3 veces más.

Sin esto, el asistente le pide al cliente que escriba. Con la transcripción prendida también podés probar audios en el simulador del panel: grabando con el micrófono o subiendo un archivo.

## Contestar con voz
Con `VOICE_PROVIDER=local` en el `.env`, el asistente puede contestar también con una nota de voz cuando el cliente manda audio. Se prende por local en **Configurar → Responder também com áudio**.
- La voz se genera en tu PC, gratis. Baja la primera vez unos 110 MB por idioma y tarda unos 2 o 3 segundos por respuesta.
- Suena algo robótica, pero se entiende. En **Testar** y en **Conversas** podés tocar **Ouvir** en cualquier respuesta para escuchar cómo sale.
- Solo las respuestas cortas van con voz; el resumen del pedido va siempre por escrito.

## Reglas de WhatsApp que conviene saber
- **24 horas:** solo se le puede escribir al cliente hasta 24 h después de su último mensaje. Pasado eso, WhatsApp exige plantillas aprobadas por Meta, que todavía no están hechas. Pasa lo mismo con los avisos de estado del pedido y las respuestas desde el panel.
- **Costo:** contestar dentro de esas 24 h es gratis en WhatsApp. El único costo es el de Claude; el gasto del mes está en **Configurar**.
- **Número real:** para usar el número de un local, Meta pide verificar la empresa (CNPJ o RUT, dirección y sitio web) y aprobar el nombre que ve el cliente. Eso se hace en WhatsApp Manager, no en este proyecto.

## Si algo no anda
| Qué pasa | Qué revisar |
|---|---|
| Meta dice que no pudo verificar el webhook | Backend corriendo, túnel abierto, URL terminada en `/api/whatsapp/webhook`, misma palabra secreta. |
| Escribís y no pasa nada | Suscripción a **messages**, el ID del número en el panel, **Atender no WhatsApp** prendido, tu celular agregado en **Para**. |
| En el log del backend aparece `401` en `/api/whatsapp/webhook` | El `WHATSAPP_APP_SECRET` no es el de esta app. |
| Llega el mensaje pero el asistente no contesta | En **Conversas**: si dice "Precisa de uma pessoa", la conversación está con una persona; devolvela al asistente. Revisá también el tope de gasto y la clave de Claude. |
| Dejó de contestar al otro día | Venció el token de 24 horas: generá otro o hacé el paso 7. |
