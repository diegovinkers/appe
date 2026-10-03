// Link para abrir una conversación de WhatsApp con un número (wa.me solo quiere los dígitos).
export const whatsappLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;
