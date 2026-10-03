import type { Language } from "../../../i18n";
import type { DeliveryError } from "./delivery";

type Copy = {
  title: string; description: string; fulfillment: string; delivery: string; pickup: string;
  charges: string; mode: string; fixed: string; byZone: string; fixedFee: string; minimum: string; minimumHint: string;
  freeEnabled: string; freeFrom: string; freeHint: string; moneyHint: string;
  estimates: string; estimatesHint: string; deliveryTime: string; pickupTime: string; minMinutes: string; maxMinutes: string;
  zones: string; zonesHint: string; noZones: string; addZone: string; newZone: string; name: string; fee: string;
  zoneMinimum: string; inherited: string; zoneTimes: string; active: string; remove: string; removeConfirm: string;
  save: string; saving: string; discard: string; discardConfirm: string; saved: string; unsaved: string; upToDate: string; retry: string; fixErrors: string;
  errors: Record<DeliveryError, string>;
};

const pt: Copy = {
  title: "Entrega e retirada", description: "Defina onde entregar, quanto cobrar e os prazos que seus clientes vão ver.",
  fulfillment: "Como o cliente recebe", delivery: "Aceitar pedidos para entrega", pickup: "Aceitar retirada no local",
  charges: "Taxas de entrega", mode: "Como calcular a taxa", fixed: "Taxa fixa", byZone: "Por bairro",
  fixedFee: "Taxa fixa (R$)", minimum: "Pedido mínimo para entrega (R$)", minimumHint: "Use 0 para não exigir mínimo. Não se aplica à retirada.",
  freeEnabled: "Oferecer entrega grátis a partir de um valor", freeFrom: "Entrega grátis a partir de (R$)",
  freeHint: "Considera o subtotal dos produtos, antes do cupom. Vale para todos os bairros.", moneyHint: "Ex.: 12,50. Use 0 para entrega grátis.",
  estimates: "Tempos estimados", estimatesHint: "Informe minutos, de 0 a 600. São estimativas exibidas ao cliente.",
  deliveryTime: "Entrega", pickupTime: "Retirada", minMinutes: "Mínimo (min)", maxMinutes: "Máximo (min)",
  zones: "Bairros atendidos", zonesHint: "As taxas por bairro valem quando você escolhe “Por bairro”. Desative um bairro para parar de receber pedidos nele.",
  noZones: "Nenhum bairro cadastrado. Adicione os bairros que você atende para usar taxas por bairro.",
  addZone: "Adicionar bairro", newZone: "Novo bairro", name: "Nome do bairro", fee: "Taxa (R$)", zoneMinimum: "Pedido mínimo neste bairro (R$)",
  inherited: "Deixe vazio para usar a configuração geral. Use 0 para não exigir mínimo.",
  zoneTimes: "Prazo deste bairro (opcional). Cada campo vazio usa o prazo geral de entrega.",
  active: "Bairro ativo", remove: "Remover bairro", removeConfirm: "Remover este bairro ao salvar? Para suspender temporariamente, prefira desativá-lo.",
  save: "Salvar alterações", saving: "Salvando…", discard: "Descartar", discardConfirm: "Descartar as alterações de entrega que ainda não foram salvas?",
  saved: "Configurações de entrega salvas.", unsaved: "Você tem alterações não salvas.", upToDate: "Tudo salvo.", retry: "Tentar novamente", fixErrors: "Revise os campos destacados antes de salvar.",
  errors: {
    money: "Informe um valor de 0 a 100000 com até duas casas decimais, sem separador de milhar.",
    minutes: "Informe minutos inteiros de 0 a 600.", range: "O máximo deve ser maior ou igual ao mínimo, incluindo os prazos gerais usados nos campos vazios.",
    fulfillment: "Ative a entrega, a retirada ou as duas.", activeZone: "Adicione ou ative pelo menos um bairro para usar entrega por bairro.",
    zoneName: "Informe um nome de até 60 caracteres.", duplicate: "Já existe outro bairro com este nome.", zoneLimit: "Cadastre no máximo 100 bairros.",
  },
};

const es: Copy = {
  title: "Entrega y retiro", description: "Definí dónde entregar, cuánto cobrar y los plazos que verán tus clientes.",
  fulfillment: "Cómo recibe el cliente", delivery: "Aceptar pedidos con entrega", pickup: "Aceptar retiro en el local",
  charges: "Tarifas de entrega", mode: "Cómo calcular la tarifa", fixed: "Tarifa fija", byZone: "Por barrio",
  fixedFee: "Tarifa fija (R$)", minimum: "Pedido mínimo para entrega (R$)", minimumHint: "Usá 0 para no exigir un mínimo. No se aplica al retiro.",
  freeEnabled: "Ofrecer entrega gratis a partir de un importe", freeFrom: "Entrega gratis a partir de (R$)",
  freeHint: "Se calcula sobre el subtotal de productos, antes del cupón. Se aplica a todos los barrios.", moneyHint: "Ej.: 12,50. Usá 0 para entrega gratis.",
  estimates: "Tiempos estimados", estimatesHint: "Ingresá minutos, de 0 a 600. Son estimaciones que se muestran al cliente.",
  deliveryTime: "Entrega", pickupTime: "Retiro", minMinutes: "Mínimo (min)", maxMinutes: "Máximo (min)",
  zones: "Barrios atendidos", zonesHint: "Las tarifas por barrio se aplican al elegir “Por barrio”. Desactivá un barrio para dejar de recibir pedidos allí.",
  noZones: "No hay barrios registrados. Agregá los barrios que atendés para usar tarifas por barrio.",
  addZone: "Agregar barrio", newZone: "Nuevo barrio", name: "Nombre del barrio", fee: "Tarifa (R$)", zoneMinimum: "Pedido mínimo en este barrio (R$)",
  inherited: "Dejá vacío para usar la configuración general. Usá 0 para no exigir un mínimo.",
  zoneTimes: "Plazo de este barrio (opcional). Cada campo vacío usa el plazo general de entrega.",
  active: "Barrio activo", remove: "Eliminar barrio", removeConfirm: "¿Eliminar este barrio al guardar? Para suspenderlo temporalmente, conviene desactivarlo.",
  save: "Guardar cambios", saving: "Guardando…", discard: "Descartar", discardConfirm: "¿Descartar los cambios de entrega que todavía no guardaste?",
  saved: "Configuración de entrega guardada.", unsaved: "Tenés cambios sin guardar.", upToDate: "Todo guardado.", retry: "Reintentar", fixErrors: "Revisá los campos destacados antes de guardar.",
  errors: {
    money: "Ingresá un importe de 0 a 100000 con hasta dos decimales, sin separador de miles.",
    minutes: "Ingresá minutos enteros de 0 a 600.", range: "El máximo debe ser mayor o igual al mínimo, incluidos los plazos generales usados en campos vacíos.",
    fulfillment: "Activá entrega, retiro o ambos.", activeZone: "Agregá o activá al menos un barrio para usar entrega por barrio.",
    zoneName: "Ingresá un nombre de hasta 60 caracteres.", duplicate: "Ya existe otro barrio con este nombre.", zoneLimit: "Podés registrar hasta 100 barrios.",
  },
};

export const deliveryCopy: Record<Language, Copy> = { "pt-BR": pt, es };
