# Tarea: que el panel aproveche mejor la pantalla (más compacto en la PC)

Sos un agente de programación trabajando en appe (`client/`: React 19, Vite, TypeScript, Tailwind 4). appe es la plataforma donde los comercios reciben y manejan sus pedidos (menú online, panel, asistente de WhatsApp).

## El problema
El dueño usa el panel en la PC y siente que al 100% todo es demasiado grande: botones, campos, letras, márgenes y tarjetas ocupan mucho lugar y entra poca información por pantalla. Con el zoom del navegador al 67% le gusta mucho más cómo se ve. Quiere ese aprovechamiento del espacio **sin tener que tocar el zoom**, y con aspecto de producto profesional, no de app hecha "a lo grande" por las dudas.

## Cómo está hoy (verificalo, gana el código)
- `client/src/styles.css`: `html { font-size: 16px }`, tipografía Atkinson Hyperlegible Next, colores como tokens en `@theme` y tema oscuro en `html[data-theme="dark"]`.
- `client/src/components/ui.tsx`: botones e inputs del panel con `h-11` (44 px) y `px-4`; `Field` con la etiqueta en negrita arriba.
- Las clases más repetidas en `features/` y `components/`: `rounded-xl` (~108), `p-4` (~79), `h-11` (~51), `text-lg` (~37), `py-3`, `min-h-11`, `space-y-5`, `rounded-2xl`, `h-12`, `p-6`. Los tamaños están escritos a mano en cada pantalla: no hay una escala de densidad central.
- Tailwind 4 mide espaciados y tamaños en `rem`, así que dependen del `font-size` raíz.

## Qué queremos
1. **Panel en la PC (desde `lg`, ~1024 px): compacto.** Más filas de pedidos, más columnas en el espacio de trabajo, formularios de Configurações que entren sin tanto scroll. Como referencia, algo entre el 75% y el 85% del tamaño actual; el 67% literal deja letras demasiado chicas para un mostrador con mala luz. Elegí el punto con capturas, no a ojo.
2. **Celular y tablet: como ahora.** Ahí se usa con el dedo: los controles siguen teniendo al menos 44 px de alto.
3. **El menú público (lo que ve el cliente final, `features/menu/`) y el seguimiento (`features/tracking/`) no se achican** en el celular. En la PC, revisá si conviene un ancho máximo o una grilla mejor, pero sin achicar letras.
4. **Una sola escala, no parches.** Nada de `zoom` ni `transform: scale` sobre la página. Opciones a evaluar y elegir con justificación:
   - bajar el `font-size` raíz en el panel desde `lg` (todo lo que está en `rem` se ajusta solo) y corregir lo que quede raro;
   - o tokens de densidad (`--control-h`, `--gap`, `--pad`, tamaños de texto) que usen `ui.tsx` y las pantallas, con un valor para la PC y otro para el dedo.
   Lo que elijas tiene que aplicar solo al panel (`/painel`, `/plataforma`), no al menú público.
5. **Opción para el que la prefiera grande:** en la configuración de este aparato (donde ya están el sonido y la impresión, `features/panel/orders/deviceSettings.ts`), "Tamanho da tela: Compacto (padrão no computador) · Confortável". Se guarda por aparato. En el celular no se muestra.
6. **Aprovechar el espacio, no solo achicar:**
   - Reducir márgenes y rellenos sobrantes: tarjetas dentro de tarjetas, `p-6` donde alcanza `p-4`/`p-3`, separaciones de `space-y-5` entre campos que podrían ir de a dos columnas.
   - Formularios de Configurações en 2 columnas en la PC cuando los campos son cortos (horarios, tiempos, montos).
   - Títulos de página más discretos (hoy `text-2xl`/`text-xl`): la jerarquía se marca con peso y color, no con tamaño gigante.
   - Textos de ayuda: uno por sección, no uno por campo, cuando repiten lo obvio.
   - Lista de pedidos y tablas: filas más bajas, la información secundaria en una línea con texto chico y color tenue.

## Límites
- **Legibilidad:** texto normal nunca por debajo de 13 px en la PC; contraste igual o mejor que hoy (los tokens de color no cambian salvo que haga falta para contraste).
- **Accesibilidad:** foco visible, objetivos de clic de al menos 32 px en la PC y 44 px en el celular, nada que dependa solo del hover.
- **Sin romper:** el espacio de trabajo de pedidos (`OrdersWorkspace.tsx`, paneles movibles), el salón (`salon/FloorPlan.tsx`), las comandas impresas (no se tocan) y el tema oscuro.
- **No es un rediseño:** misma estructura, mismos colores, misma tipografía. Si ves algo que convendría rediseñar, anotalo en el resumen, no lo hagas.

## Cómo trabajar
1. **Antes de tocar nada:** capturas del panel al 100% en 1366×768 y 1920×1080 (Início, Pedidos con el espacio de trabajo, un formulario de Configurações, Cardápio › Produtos) y en un celular (390 px). Guardalas fuera del repo.
2. Proponé el enfoque (raíz `rem` o tokens), el tamaño objetivo y la lista de pantallas a ajustar, con capturas de una pantalla de prueba antes/después. **Frená y esperá aprobación** antes de aplicarlo a todo.
3. Con el visto bueno: un commit para la escala base (`styles.css`, `ui.tsx`, ajuste de aparato) y después un commit por área (Pedidos, Início, Configurações, Cardápio, resto).
4. Después de cada área: capturas de nuevo en las tres medidas y en tema claro y oscuro. Revisá que no haya texto cortado, scroll horizontal ni botones encimados.
5. `npx tsc --noEmit`, `npx vitest run` y `npm run build` en verde antes de cada commit. Textos nuevos en `pt-BR.ts` y `es.ts` con las mismas claves; el español con voseo.

## Qué entregar
- El panel compacto en la PC y como hoy en el celular.
- El ajuste "Compacto / Confortável" por aparato.
- Un resumen corto con: el enfoque elegido y por qué, el tamaño final (en px de texto y alto de controles), capturas antes/después de 3 pantallas, y lo que convendría rediseñar más adelante.
