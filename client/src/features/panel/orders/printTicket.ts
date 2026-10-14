// Imprime la comanda sin salir del panel: la carga en un marco invisible y abre la
// ventana de impresión del navegador (elige la impresora térmica ahí). El papel (58 u 80 mm)
// es de cada aparato: deviceSettings.ts.
export function printTicket(orderId: string, width: 58 | 80) {
  // Imprimir le pasa el foco al marco; después vuelve a donde estaba (así Esc sigue
  // cerrando el detalle del pedido).
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const frame = document.createElement("iframe");
  frame.title = "comanda";
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = `/api/owner/orders/${orderId}/ticket?width=${width}`;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    previous?.focus();
    // Se saca después: algunos navegadores imprimen de forma asíncrona.
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}
