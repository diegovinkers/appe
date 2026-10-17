# Tarea: buscar qué falta para que cada local adapte la app a su forma de trabajar

Sos un agente de programación trabajando en app-pedidos (carpeta `backend/` y `client/` de este repo). **Esta tarea es solo de investigación:** al terminar entregás una lista de objetivos en un archivo y frenás. No implementes nada hasta que el dueño del proyecto apruebe la lista.

## Antes de empezar
1. Leé `backend/CLAUDE.md` entero: aislamiento entre locales, permisos, OpenAPI, plata en centavos, fechas en hora de Brasil.
2. Mirá cómo está armado el panel: `client/src/features/panel/nav.ts`, las páginas de `Configurações` (`client/src/features/panel/settings/` y `pages/`) y el i18n (`client/src/i18n/pt-BR.ts` y `es.ts`).
3. Leé los modelos `backend/src/models/commerce.model.js` y `assistant.model.js`: ahí está lo que un local ya puede configurar.

Si algo de este prompt no coincide con el código, gana el código. Anotalo en la lista.

## La idea del producto
App de pedidos para restaurantes chicos de Quaraí/RS y la frontera. El primer cliente real es una hamburguesería. Cada local trabaja distinto (abre de noche, cierra pasada la medianoche, tiene o no salón, delivery propio o solo retiro), así que **la app tiene que adaptarse al local, no al revés**.

Al mismo tiempo, quien la usa no es técnico. Por eso hay tres reglas:
- **Mejor que la opción exista a que no**, pero con un valor por defecto que funcione sin tocar nada. Un local que nunca entra a configurar tiene que andar igual que hoy.
- **Simple a primera vista:** lo de todos los días, a mano. Lo avanzado, plegado ("Mais opções") o dentro de la sección que corresponde. Nada de una pantalla gigante de ajustes.
- **Aspecto de app cara:** textos claros en pt-BR y en español con voseo, una vista previa o un ejemplo cuando ayuda ("Seu robô atende de 20:00 às 23:50"), y validaciones que expliquen el error.

## Pedidos ya identificados (investigalos primero y proponé el diseño)

### 1. El fin del día de cada local
Hoy el día de operación arranca a las 05:00 para todos (`OPERATING_DAY_START` en `backend/src/lib/dates.js`). Lo usan la lista de pedidos de hoy, los reportes y el cierre de caja.
- Que cada local elija la hora de corte. La mayoría cierra antes de medianoche y a algunos les conviene otra hora.
- Un pedido conserva siempre su fecha y hora reales: el corte solo decide en qué jornada se cuenta.
- Revisá todos los lugares que usan `operatingDayRange` / `operatingDayIn` (backend y su copia en el client) y qué pasa con los reportes de días anteriores si el local cambia la hora.

### 2. Abrir y cerrar la jornada a mano
El dueño prefiere que el local pueda marcar **"abrir el día"** y **"cerrar el día"** a mano, para no depender de una hora fija.
- Ya existe un override manual (`open` / `closed` / `paused` en `commerce.override`) y un cierre de caja en reportes. Investigá cómo se relacionan y proponé un solo concepto de **jornada** que no confunda: qué pasa si se olvidan de cerrar, si un pedido entra con la jornada cerrada, cómo se ve en Início y en Reportes.
- Proponé si conviene un modo por local: "automático por horario" (hora de corte) o "manual" (abrir y cerrar con un botón), con el automático por defecto.

### 3. Horario del asistente de IA
Hoy el asistente solo tiene `enabled` (encendido o apagado, más el switch "IA" del panel de WhatsApp). Que el local pueda programarlo:
- **Igual que el local:** atiende cuando el local está abierto (el valor por defecto que proponés).
- **Mismo horario en los días elegidos:** marca los días y un horario único (ej. abre de 20:00 a 24:00 y quiere el robot de 20:00 a 23:50).
- **Horario por día de la semana**, con varios turnos por día, como el horario del local (reutilizá su editor: copiar de otro día, aplicar a todos).
- Qué hace fuera de horario, a elección del local: no contestar, mandar un mensaje fijo editable ("Estamos fechados, abrimos às 20h") o pasar la conversación a una persona.
- Cómo interactúa con el switch manual "IA" (¿el manual manda por encima hasta la próxima franja?) y con el override del local (si el local está en pausa, ¿el robot avisa?).
- Los horarios cruzan la medianoche (20:00 a 00:30): tenelo en cuenta igual que en `opening.service.js`.

## Qué más buscar
Recorré el código buscando **decisiones fijas que deberían ser del local**. Cómo encontrarlas:
- Constantes y números mágicos en `backend/src/services/`, `backend/src/lib/`, `client/src/features/panel/` y `client/src/features/menu/` (minutos, horas, límites, umbrales, anchos, textos fijos).
- Textos que recibe el cliente (mensajes de WhatsApp en `whatsapp.service.js`, avisos del menú, seguimiento del pedido) que el local podría querer editar o apagar.
- Campos que existen en los modelos pero que el panel no deja tocar, y lo contrario.
- Comportamientos "todo o nada" que convendría poder elegir.

Áreas a revisar, como guía (no es una lista cerrada):
- **Operación:** jornada, tiempo estimado de preparación y entrega, tope de pedidos por franja, pausa automática cuando hay muchos pedidos.
- **Pedidos y alertas:** a los cuántos minutos un pedido cuenta como atrasado o sin aceptar (hoy 5 min), aceptación automática, sonido y repetición del aviso, qué estados usa el local (¿sin "en camino" si no tiene delivery?).
- **Impresión:** ancho de la comanda, impresión automática al aceptar, cuántas copias, qué datos salen en la comanda.
- **Menú público:** pedido mínimo, pedidos programados sí o no y con cuánta anticipación, mostrar u ocultar los agotados, orden de las categorías, colores o portada del local.
- **Entrega y retiro:** solo retiro, solo delivery o ambos por franja horaria; costo por distancia o por barrio.
- **Asistente:** además del horario, el tono (formal o cercano), el nombre del robot, el saludo, qué puede hacer solo y qué pasa a una persona.
- **Mensajes al cliente:** qué notificaciones de estado se mandan y con qué texto.
- **Equipo:** permisos más finos por empleado (el modelo de permisos está en `backend/src/lib/permissions.js`).
- **Reportes:** período por defecto, qué muestra Início.

Si querés comparar con productos del mercado brasileño (iFood para restaurantes, Anota AI, Goomer, Cardápio Web, Saipos), hacelo para encontrar ideas, no para copiar pantallas.

## Fuera de alcance
- Infraestructura paga (plan pago de Render, número real de WhatsApp, más mensajes): queda para más adelante.
- La API de Meta directa: la cuenta de desarrollador está restringida; WhatsApp va por 360dialog.
- Cobro automático, app nativa y logística propia.

## Qué entregar
Un archivo `OBJETIVOS-personalizacion.md` en la raíz del repo, en español con voseo, con esta estructura:

1. **Resumen** (5 líneas como máximo): qué encontraste y qué recomendás hacer primero.
2. **Objetivos**, agrupados por área y ordenados por prioridad. Cada uno con:
   - **Título** corto.
   - **Hoy:** cómo funciona, con `archivo:línea`.
   - **Propuesta:** qué podría elegir el local y cuál es el valor por defecto (el que mantiene el comportamiento actual).
   - **Dónde va en el panel:** sección de Configurações o pantalla, y si va a la vista o plegado.
   - **Ejemplo de texto** de la opción en pt-BR.
   - **Tamaño:** S (horas), M (un día), L (varios días). **Riesgo:** qué se puede romper (datos viejos, reportes, aislamiento).
   - **Prioridad:** `antes del lanzamiento` (útil para la hamburguesería ya) o `después`.
3. **Descartados:** ideas que miraste y no valen la pena, con una línea de por qué (complican más de lo que ayudan).
4. **Preguntas para el dueño:** decisiones de producto que no podés tomar solo, como máximo 8, cada una con tu recomendación.

Entre 15 y 30 objetivos. Mejor pocos y bien pensados que una lista larga de ajustes que nadie va a usar.

**Al terminar, frená.** No toques código. El dueño revisa la lista, responde las preguntas y elige qué se hace.

## Cuando se apruebe la lista (para la etapa siguiente)
Estas reglas valen para implementar después, y conviene que la propuesta ya las tenga en cuenta:
- Un objetivo por commit, con su prueba.
- Todo campo nuevo tiene un valor por defecto que mantiene el comportamiento de hoy; los locales existentes no necesitan migración manual.
- Endpoint o respuesta nueva: `src/docs/operations.js`, `npm run openapi`, `tests/api/contract.test.js` y `npm run api:types` en el client.
- Cambios de configuración auditados con `audit()`.
- Textos en `pt-BR.ts` y `es.ts` con las mismas claves; el español con voseo.
- Probalo en el celular y en la PC, con tema claro y oscuro.
