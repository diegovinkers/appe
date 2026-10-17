# Objetivos de personalización por local

Resultado de la búsqueda pedida en `prompt-personalizacion.md` (16/10/2026). No se tocó código.

## Resumen
- Los tres pedidos del dueño tienen base en el código, pero ninguno está resuelto: la hora de corte está fija en 05:00 y repetida en 3 lugares, la apertura manual no tiene concepto de jornada y el asistente solo se prende o se apaga.
- Hallazgo importante: **los pedidos programados ya funcionan en el servidor, pero el panel no tiene dónde activarlos.** Es el arreglo más barato de la lista.
- Lo demás fijo que vale la pena abrir: el tiempo de preparación en hora pico, los minutos para marcar un pedido como atrasado, qué avisos recibe el cliente, la identidad del bot y los permisos por empleado.
- Primero recomiendo la hora de corte por local (1), los pedidos programados (4) y el modo movimiento (5): son chicos y le sirven a la hamburguesería desde el primer día. Después, la jornada manual (2) y el horario del bot (3).
- Aviso: mientras WhatsApp siga en el sandbox de 360dialog, el bot no atiende clientes reales. Los objetivos del asistente no son urgentes para el lanzamiento, aunque conviene dejarlos diseñados.

---

## A. Jornada y horarios

### 1. Hora de corte del día, por local
- **Hoy:** el día de operación arranca a las 05:00 para todos. La hora está repetida en tres lugares que hay que mantener iguales a mano: `backend/src/lib/dates.js:64`, la agregación de reportes `backend/src/controllers/business.controller.js:42` (resta 5 horas fijas) y el client `client/src/lib/format.ts:34`. La usan la lista de pedidos (`order.controller.js:101`), Início, Reportes, las alertas y la barra de abajo.
- **Propuesta:** campo `operatingDayStart` en el local ("HH:MM", entre 00:00 y 12:00), con **05:00 por defecto**. Un solo helper en el backend la toma del local. El client la recibe con el local (`/owner/store`) y deja de tener su propia constante. Los pedidos conservan su fecha y hora reales; el corte solo decide en qué jornada se cuentan.
- **Dónde va:** Configurações › Horários, sección "Fim do dia de trabalho", al final y plegada.
- **Texto:** "Pedidos feitos antes das **05:00** contam no dia anterior. Ex.: um pedido da 01:30 de sábado entra no caixa de sexta."
- **Tamaño:** M. **Riesgo:** si el local cambia la hora, los reportes de días pasados se reagrupan. Es aceptable, pero el texto tiene que avisarlo. La agregación con `$subtract` fijo tiene que pasar a usar la hora del local.
- **Prioridad:** antes del lanzamiento.

### 2. Abrir y cerrar la jornada a mano
- **Hoy:** existe el override manual (`open` / `closed` / `paused`, `commerce.model.js:31`) y el "cartel de la puerta" (`client/src/features/panel/StoreStatusControl.tsx`). El cierre de caja es solo un cálculo dentro de Reportes: no queda guardado quién cerró, a qué hora ni con qué totales.
- **Propuesta:** un modo de jornada por local:
  - **Automático** (por defecto, como hoy): la jornada la define la hora de corte (objetivo 1).
  - **Manual:** botones "Abrir o dia" y "Fechar o dia" en el cartel de la puerta y en Início.
    - Abrir: crea una jornada (`shifts`: local, abierta por y a qué hora) y pone el local abierto.
    - Cerrar: pide confirmación, muestra el resumen de caja, avisa si hay pedidos abiertos, guarda la foto de los totales y cierra el local.
    - La lista de "hoy" es la de la jornada en curso, sin importar la fecha; los Reportes se pueden ver por jornada.
  - **Si se olvidan de cerrar:** cierre automático de seguridad a la hora de corte o X horas después del último horario de cierre, y aviso en Início ("O dia de ontem foi fechado automaticamente").
  - **Horario semanal en modo manual:** sigue mostrándose al cliente como información ("Abrimos às 20h"), pero el que abre y cierra es el botón.
- **Dónde va:** el modo, en Configurações › Horários. Los botones, en el cartel de la puerta. El historial de cierres, en Relatórios › Fechamentos.
- **Texto:** "Como começa e termina o seu dia? **Automático** pelo horário · **Manual**: você abre e fecha o dia no painel."
- **Tamaño:** L. **Riesgo:** convivencia con el override y con los pedidos programados de otra jornada; la lista de pedidos depende del modo. Necesita tests de bordes (jornada sin cerrar, dos aparatos que abren a la vez).
- **Prioridad:** después del objetivo 1. Ver preguntas 1 y 2.

### 3. Horario del asistente de IA
- **Hoy:** el asistente tiene solo `enabled` (`backend/src/models/assistant.model.js:8`). El webhook atiende si está encendido (`backend/src/services/assistant/whatsapp.js:228`). Con el local cerrado, el bot contesta igual y dice cuándo abre (`context.js:172`).
- **Propuesta:** `assistant.schedule` con tres modos:
  - **Igual à loja** (por defecto): atiende cuando el local está abierto, o siempre, como hoy. Ver pregunta 3.
  - **Mesmo horário nos dias escolhidos:** se tildan los días y se pone un horario único (20:00–23:50).
  - **Horário por dia da semana:** varios turnos por día, reutilizando el editor de Horários (copiar de otro día, aplicar a todos). Los turnos pueden cruzar la medianoche, con la misma lógica de `opening.service.js`, extraída a una función común.

  `enabled` sigue siendo el interruptor general: el switch "IA" lo apaga del todo y el horario solo actúa con el bot encendido.
- **Dónde va:** página Assistente › Configuração, sección "Horário do assistente", con una frase que resume lo elegido.
- **Texto:** "Seu assistente atende **sex e sáb, das 20:00 às 23:50**."
- **Tamaño:** M. **Riesgo:** una conversación que empieza dentro del horario y sigue después. Propuesta: el bot termina el pedido en curso si la última respuesta fue hace menos de 15 minutos.
- **Prioridad:** después del lanzamiento, porque el bot sigue en el sandbox. Igual se puede hacer apenas se apruebe.

### 4. Activar los pedidos programados (ya existen en el servidor)
- **Hoy:** el local tiene `scheduling` (activado, anticipación mínima, días máximos, franja de 15/30/60 minutos) en `commerce.model.js:124`, validado en `store.schema.js:80` y usado por el menú y el bot. **Ninguna página del panel lo muestra**, así que ningún local puede activarlo.
- **Propuesta:** sección "Pedidos agendados" con un interruptor y, al prenderlo, los tres campos. Por defecto, apagado.
- **Dónde va:** Configurações › Horários, debajo de las excepciones.
- **Texto:** "Aceitar pedidos agendados · com pelo menos **30 min** de antecedência, até **2 dias** antes, em horários de **30 em 30 min**."
- **Tamaño:** S. **Riesgo:** bajo; el backend ya está probado.
- **Prioridad:** antes del lanzamiento.

### 5. Modo movimiento: más tiempo en hora pico
- **Hoy:** los tiempos estimados son fijos (`commerce.model.js:101`) y solo se cambian desde Configurações › Entrega. Un viernes a la noche, el menú y el bot siguen prometiendo 40–60 minutos.
- **Propuesta:** en el cartel de la puerta, "Muito movimento: +15 / +30 / +45 min", con duración (hasta el fin del día o por 1 o 2 horas). Suma minutos a todos los estimados: menú, bot, previsión del pedido y cálculo de atraso. Se apaga solo.
- **Dónde va:** cartel de la puerta (permiso `store:open`, también para empleados).
- **Texto:** "Muito movimento: **+30 min** até 23:00. Os clientes veem a nova previsão."
- **Tamaño:** S–M. **Riesgo:** bajo; el tiempo extra se suma en el servidor en un solo lugar (el cálculo de `estimatedMinutes`).
- **Prioridad:** antes del lanzamiento.

## B. Pedidos y alertas

### 6. Cuándo un pedido cuenta como "sin aceptar" o atrasado
- **Hoy:** 5 minutos fijos para aceptar (`client/src/features/panel/orders/orderFlow.ts:72`). El aviso se repite cada 15 segundos (`OrderAlerts.tsx:11`).
- **Propuesta:** "Alertar se um pedido não for aceito em **5** min" (de 2 a 30) en el local, y "Repetir o som a cada **15** s" (10, 15, 30 o 60) en los ajustes de este aparato, al lado del sonido y la impresión (`deviceSettings.ts`).
- **Dónde va:** el primero, en Configurações › Loja › Pedidos (sección nueva). El segundo, en los ajustes del aparato que ya existen.
- **Tamaño:** S. **Riesgo:** bajo.
- **Prioridad:** antes del lanzamiento, porque es barato.

### 7. Qué avisos recibe el cliente por WhatsApp
- **Hoy:** a los pedidos del bot se les avisa siempre cuando están confirmados, listos (solo para retiro), en camino o cancelados (`whatsapp.js:325`), con textos fijos.
- **Propuesta:** una casilla para cada aviso. Todas tildadas por defecto, como hoy.
- **Dónde va:** Assistente › Configuração › "Avisos ao cliente", plegado.
- **Tamaño:** S. **Riesgo:** bajo.
- **Prioridad:** después.

### 8. Pasos del pedido más cortos (opcional)
- **Hoy:** todos los pedidos pasan por nuevo → confirmado → listo → (en camino) → entregado (`backend/src/services/orderStatus.js:18`). Un local chico que despacha solo puede sentir que son muchos toques.
- **Propuesta:** "Fluxo simples": aceptar y después "Entregue", saltando "pronto" y "saiu para entrega". Por defecto, el flujo completo. El backend permite la transición directa solo si el local lo activó.
- **Dónde va:** Configurações › Loja › Pedidos.
- **Tamaño:** M. **Riesgo:** medio. Los avisos al cliente, el seguimiento y el cálculo de atraso suponen los pasos intermedios. Hay que probarlo con el bot y con las mesas.
- **Prioridad:** después. Ver pregunta 7.

### 9. Aceptar pedidos automáticamente (opcional)
- **Hoy:** todo pedido entra como "novo" y alguien tiene que aceptarlo.
- **Propuesta:** "Aceitar automaticamente pedidos do cardápio e do assistente". El pedido pasa a confirmado, se imprime si el aparato tiene la impresión automática prendida y suena un aviso corto. Por defecto, apagado.
- **Tamaño:** M. **Riesgo:** medio. Un pedido aceptado que nadie vio es peor que uno sin aceptar, así que solo debería funcionar con la jornada abierta y con un aparato conectado.
- **Prioridad:** después. Ver pregunta 7.

### 10. Encabezado y pie de la comanda
- **Hoy:** la comanda (`backend/src/services/ticket.service.js`) tiene un formato fijo. El ancho y la impresión automática ya se eligen por aparato.
- **Propuesta:** "Texto no rodapé da comanda" (por ejemplo "Obrigado! @fronteiricoburger · Wi-Fi: …") y una casilla "Mostrar telefone do cliente na comanda".
- **Dónde va:** Configurações › Loja › Pedidos.
- **Tamaño:** S. **Riesgo:** bajo.
- **Prioridad:** después.

## C. Asistente de IA

### 11. Qué hace el bot fuera de su horario
- **Hoy:** no aplica, porque no hay horario (objetivo 3).
- **Propuesta:** tres opciones:
  - **Responder com uma mensagem** (por defecto): una sola vez por conversación, con un texto editable y una variable para la próxima apertura ("Estamos fechados. Abrimos {abertura}. Você pode ver o cardápio: {link}").
  - **Passar para uma pessoa:** la conversación queda en el panel sin respuesta automática.
  - **Não responder.**
- **Dónde va:** dentro de "Horário do assistente".
- **Tamaño:** S, una vez hecho el objetivo 3. **Riesgo:** bajo.
- **Prioridad:** junto con el objetivo 3.

### 12. Nombre, saludo y estilo del bot
- **Hoy:** el bot es "o atendente virtual da loja X" con un estilo único (`backend/src/services/assistant/prompt.js:4`). Los mensajes fijos (pasar a una persona, confirmar) están en `engine.js:26`.
- **Propuesta:** campos cortos, no un prompt libre:
  - nombre del asistente (por ejemplo "Fronti");
  - saludo inicial;
  - estilo: **Próximo** ("Opa! Bora pedir?") o **Formal** ("Olá, como posso ajudar?").

  Se insertan en el prompt como datos, no como instrucciones.
- **Dónde va:** Assistente › Configuração › "Personalidade".
- **Tamaño:** M. **Riesgo:** medio. Hay que probar en el simulador que el saludo personalizado no rompa el flujo de confirmación.
- **Prioridad:** después.

### 13. Indicaciones del local para el bot
- **Hoy:** el bot sabe solo lo que está en la configuración y en el menú. Lo que el local avisaría de palabra ("o xis vem sem salada por padrão", "não entregamos no bairro X depois das 23h") no tiene dónde ir.
- **Propuesta:** "Recados para o assistente": hasta 5 frases de 140 caracteres. Van en el contexto como "Observações da loja", nunca como instrucciones. Las reglas de seguridad del prompt siguen mandando.
- **Dónde va:** Assistente › Configuração.
- **Tamaño:** S–M. **Riesgo:** medio, porque es texto libre del local dentro del prompt. Hay que limitar el largo, escapar el texto y probarlo en el simulador.
- **Prioridad:** después. Ver pregunta 6.

## D. Menú y entrega

### 14. Mostrar u ocultar los productos agotados
- **Hoy:** un producto agotado sigue en el menú con la etiqueta "Esgotado" (`client/src/features/menu/ProductList.tsx:45`).
- **Propuesta:** "Produtos esgotados: **mostrar como esgotado** (por defecto) · esconder do cardápio". El bot ya los marca como [ESGOTADO] y no cambia.
- **Dónde va:** Cardápio › Disponibilidade, arriba.
- **Tamaño:** S. **Riesgo:** bajo.
- **Prioridad:** después.

### 15. Entrega y retiro con horario propio
- **Hoy:** entrega y retiro se prenden o se apagan para todo el día (`commerce.model.js:96`).
- **Propuesta:** "Entrega até **23:00**" (opcional, vacío = todo el horario del local). Pasada esa hora, el menú y el bot ofrecen solo retiro.
- **Dónde va:** Configurações › Entrega.
- **Tamaño:** M. **Riesgo:** medio; afecta al checkout, al bot y a los pedidos programados.
- **Prioridad:** después.

## E. Salón y equipo

### 16. Tasa de servicio en la mesa (10%)
- **Hoy:** la cuenta de una mesa no tiene tasa de servicio. No hay ningún campo en el backend.
- **Propuesta:** "Taxa de serviço nas mesas: **10%**" (0 = apagada, por defecto). Es opcional en cada cuenta: el mozo puede sacarla si el cliente no quiere pagarla. Va en la precuenta y en el cierre.
- **Dónde va:** Configurações › Salão.
- **Tamaño:** M. **Riesgo:** plata. Se calcula en el servidor, en centavos, y se reporta separada de las ventas.
- **Prioridad:** antes del lanzamiento solo si la hamburguesería usa mesas. Ver pregunta 5.

### 17. Permisos por empleado
- **Hoy:** dos roles fijos (`backend/src/lib/permissions.js:3`). Un empleado puede cancelar pedidos y no puede ver Reportes; no hay término medio.
- **Propuesta:** el rol sigue siendo la base y el dueño suma o quita algunos permisos por persona, con casillas: "pode cancelar pedidos", "vê relatórios e caixa", "edita preços". Para no complicar, solo esos tres.
- **Dónde va:** Configurações › Equipe › editar empleado › "Permissões", plegado.
- **Tamaño:** M. **Riesgo:** medio. `requirePermission` pasa a mirar el usuario, no solo el rol. La sesión ya recarga el usuario en cada request, así que el cambio vale enseguida.
- **Prioridad:** después.

### 18. Duraciones de la pausa
- **Hoy:** la pausa ofrece 15, 30 y 60 minutos (`client/src/i18n/pt-BR.ts:75`).
- **Propuesta:** sumar "Até o fim do dia" y "Outro…" (un tiempo elegido a mano, hasta los 7 días que ya permite el servidor, `store.controller.js:37`).
- **Tamaño:** S. **Riesgo:** bajo.
- **Prioridad:** después.

---

## Descartados
- **Entrega con precio por distancia:** necesita geolocalización paga y en una ciudad chica los barrios alcanzan.
- **Editar el prompt completo del bot:** rompe las reglas de seguridad y de confirmación. Lo cubren los objetivos 12 y 13.
- **Cuándo empieza una conversación nueva (12 h, `whatsapp.js:20`), pasos e historial de la IA:** son ajustes técnicos que ningún local va a entender.
- **Días para evaluar un pedido (30) y para guardar conversaciones (90):** el segundo es una cuestión de privacidad, no del local.
- **Motivos de cancelación personalizados:** ya existe "Outro" con texto libre.
- **Varios sonidos de alerta:** con uno fuerte alcanza; el volumen es del aparato.
- **Copias de la comanda:** el diálogo de impresión del navegador ya permite elegir cuántas.
- **Período por defecto de Reportes y tamaño de la grilla del salón:** no aportan.

## Preguntas para el dueño
1. **Jornada manual:** ¿la ofrecemos como opción al lado del modo automático, o querés que sea la única forma? *Recomiendo opción, con el automático por defecto: un local que se olvida del botón no pierde pedidos.*
2. **Si se olvidan de cerrar el día:** ¿la cerramos sola a la hora de corte y avisamos, o la dejamos abierta hasta que alguien la cierre? *Recomiendo cerrarla sola y avisar en Início.*
3. **Bot con el horario "Igual à loja":** ¿atiende solo con el local abierto (fuera de horario manda el mensaje de cerrado) o siempre, como hoy, explicando cuándo abre? *Recomiendo solo con el local abierto, que es lo que espera el dueño.*
4. **Switch "IA" del panel de WhatsApp:** ¿sigue siendo el interruptor general (apagado = nunca atiende) o un "pausar hasta la próxima franja"? *Recomiendo interruptor general, como hoy: es lo más claro.*
5. **La hamburguesería:** ¿tiene mesas y cobra 10%? ¿Acepta pedidos para más tarde? Con eso se decide si los objetivos 4 y 16 van antes del lanzamiento.
6. **Indicaciones libres para el bot (13):** ¿estás de acuerdo con un campo de texto libre, aunque sea corto? Es lo que más le sirve al local y lo que más hay que probar.
7. **Flujo simple y aceptación automática (8 y 9):** ¿los pidió algún local o es por las dudas? *Recomiendo esperar a que alguien los pida.*
8. **Orden de trabajo:** ¿empezamos por 1, 4, 5 y 6 (todos chicos, para la hamburguesería) y después 2, 3 y 11? *Es lo que recomiendo.*
