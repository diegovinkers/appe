// Un WhatsApp guardado (+5555999991234) como se lee: "+55 55 99999-1234" o "+598 99 123 456".
// Cualquier otro número (o uno escrito a mano) queda como está.
export function formatPhone(phone: string) {
  const br = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(phone);
  if (br) return `+55 ${br[1]} ${br[2]}-${br[3]}`;
  const uy = /^\+598(\d{2})(\d{3})(\d{3})$/.exec(phone);
  if (uy) return `+598 ${uy[1]} ${uy[2]} ${uy[3]}`;
  return phone;
}
