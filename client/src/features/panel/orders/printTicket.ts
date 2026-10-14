// Imprime sin salir del panel: carga la hoja en un marco invisible y abre la ventana de
// impresión del navegador (elige la impresora térmica ahí). El papel (58 u 80 mm) es de
// cada aparato: deviceSettings.ts.
function printPage(src: string, title: string) {
  // Imprimir le pasa el foco al marco; después vuelve a donde estaba (así Esc sigue
  // cerrando el detalle del pedido).
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = src;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    previous?.focus();
    // Se saca después: algunos navegadores imprimen de forma asíncrona.
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

// La comanda de un pedido.
export const printTicket = (orderId: string, width: 58 | 80) => printPage(`/api/owner/orders/${orderId}/ticket?width=${width}`, "comanda");

// La precuenta de una mesa (todos sus pedidos y el total).
export const printBill = (tabId: string, width: 58 | 80) => printPage(`/api/owner/tabs/${tabId}/bill?width=${width}`, "conta");
