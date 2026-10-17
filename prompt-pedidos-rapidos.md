# Tarea: cargar pedidos más rápido, para cada forma de trabajar de un local

Sos un agente de programación trabajando en appe (`backend/` y `client/` de este repo). appe es la plataforma donde los comercios reciben y manejan sus pedidos: menú online, panel, mesas y asistente de WhatsApp.

## La idea
Cada local carga los pedidos de forma distinta, y appe tiene que servir para todas sin que lo que un local no usa le estorbe:

| Forma | Quién carga y dónde |
|---|---|
| A. Papel y caja | El mozo anota; alguien lo pasa en la PC de la caja. |
| B. Celular del mozo | Cada mozo carga desde la mesa con su cuenta de empleado. |
| C. Tablet compartida | Varios mozos usan una tablet del local. |
| D. QR en la mesa | El cliente pide solo desde su celular. |

Hoy A y B funcionan: un empleado (`staff`) ya puede cargar pedidos de mesa y cobrar (`orders:manual`, `orders:write`) desde cualquier aparato. Esta tarea las hace cómodas y agrega C y D.

## Antes de empezar
1. Leé `backend/CLAUDE.md` entero y seguí sus reglas: aislamiento entre locales, permisos por ruta, plata en centavos y calculada en el servidor, OpenAPI y contract test para cada endpoint, auditoría de cambios de configuración y textos para el usuario final en pt-BR.
2. Mirá cómo están hechos hoy:
   - el pedido nuevo del panel: `client/src/features/panel/pages/NewOrderPage.tsx` y el carrito `client/src/features/menu/cart.ts`;
   - la ficha de producto: `client/src/features/menu/ProductSheet.tsx`;
   - las mesas: `client/src/features/panel/salon/` y `backend/src/controllers/table.controller.js`;
   - la barra de abajo del celular: `client/src/features/panel/nav.ts` y `BottomBar.tsx`;
   - el equipo y la sesión: `backend/src/models/user.model.js`, `backend/src/lib/session.js` y `TeamPage.tsx`.

Si algo de este prompt no coincide con el código, gana el código: anotalo en el resumen.

## Reglas para todo
- **Opcional y con un buen valor por defecto.** Un local que no configura nada sigue trabajando como hoy.
- **Pensado para el dedo y apuro:** botones de al menos 44 px en el celular, un toque para lo frecuente y confirmación solo para lo que no se puede deshacer.
- **pt-BR y español con voseo**, con las mismas claves en `pt-BR.ts` y `es.ts`.
- **Un commit por objetivo**, con sus tests. Tests del backend con `npx vitest run --maxWorkers=2`, porque la máquina tiene poca memoria. En el client, `npx tsc --noEmit -p .`, `npx vitest run` y `npm run build` en verde.
- **Verlo andar:** levantá la demo (base en memoria y local `/burger-demo`) y probá cada objetivo con Playwright en la PC (1366×768) y el celular (390×844), en tema claro y oscuro. Mirá las capturas antes de dar algo por terminado.
- **Al terminar cada tanda:** push a `main` y un resumen corto para el dueño.

## Tanda 1: pedir rápido
1. **Agregar con un toque.** En el pedido nuevo del panel, un producto sin grupos de opciones se agrega con un toque (cantidad 1, sin notas) y queda marcado con su cantidad. Los que tienen opciones abren la ficha como hoy. Tiene que quedar a mano cómo abrir la ficha de un producto simple para ponerle una nota (por ejemplo, un botón chico al costado).
2. **"Mesas" en la barra del celular.** Si el local tiene mesas activas, la barra de abajo muestra "Mesas" y lleva directo al salón. Agotados pasa a "Mais". Sin mesas, la barra queda como hoy.
3. **Lo más pedido arriba.** Arriba de la carta del pedido nuevo, una fila con los productos más pedidos del local en los últimos 30 días (hasta 8). Necesita un endpoint del panel con `orders:read` que sume las cantidades de los pedidos no cancelados, solo del local. No aparece si hay una búsqueda escrita o si todavía no hay datos.
4. **Notas rápidas.** Cada local tiene una lista de notas rápidas, con valores por defecto en pt-BR ("Sem cebola", "Sem tomate", "Bem passado", "Ao ponto", "Para viagem"), editable en Configurações › Loja (hasta 12, de 30 caracteres). En el pedido nuevo del panel, cada producto del resumen tiene botones con esas notas: un toque la agrega o la saca de la nota del producto. También aparecen en la ficha de producto cuando se usa desde el panel.

## Tanda 2: varios mozos y el cobro
5. **Mozos con PIN.** El dueño puede crear empleados sin email, con nombre y un PIN de 4 a 6 dígitos (guardado con hash, como las contraseñas). En un aparato del local ya iniciado, "Cambiar de persona" muestra los empleados del local; se elige uno y se escribe el PIN. Cada pedido queda a nombre de quien lo tomó. Hace falta límite de intentos y el registro en la auditoría. El email y la contraseña siguen funcionando como hoy.
6. **Dividir la cuenta.** Al cerrar una mesa: partes iguales (2 a 20) o por productos. Se cobra cada parte con su forma de pago y la cuenta se cierra cuando se pagó todo. El cierre de caja cuenta cada pago por su forma.
7. **Tasa de servicio.** Opcional por local (Configurações › Salão), por defecto apagada: un porcentaje (ej. 10%). Se suma en la precuenta y al cobrar, se puede sacar en cada cuenta y aparece separada en los reportes. Se calcula en el servidor, en centavos.

## Tanda 3: los diferenciales
8. **QR por mesa.** Cada mesa tiene su QR (imprimible desde Configurações › Salão). Abre el menú del local sabiendo la mesa. El cliente pide sin entrega ni pago, y el pedido entra a la cuenta de esa mesa. El primer pedido de una mesa libre lo acepta el mozo (aviso en el panel). El local lo prende o apaga.
9. **Pantalla de cocina.** Una página del panel para una tablet en la cocina: los pedidos a preparar, en columnas por estado, con letra grande y un toque para "listo". Sirve para locales sin impresora. El mozo recibe el aviso.
10. **Sin internet, sin perder pedidos.** Si un pedido del panel no sale por falta de conexión, queda guardado en el aparato, se ve como "pendiente de enviar" y se reintenta solo, sin duplicarse (`clientOrderId`).

## Qué entregar en cada tanda
- Los objetivos funcionando, con sus tests y capturas revisadas.
- Push a `main`.
- Un resumen para el dueño: qué cambió, qué tiene que configurar el local (si algo) y qué quedó pendiente.
