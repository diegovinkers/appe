// Herramientas del asistente. El local y el cliente salen siempre de la conversación,
// del lado del servidor: la IA nunca manda ids de local ni precios. Los productos y
// opciones llegan con los códigos del menú (P12, G3-2) y se traducen a ids acá.
//
// Cada herramienta devuelve un objeto que vuelve a la IA: { ok: true, ... } o
// { ok: false, erros: [...] } con el problema explicado para contárselo al cliente.
import Order from "../../models/order.model.js";
import { AppError } from "../../lib/errors.js";
import { trackingUrl } from "../../lib/links.js";
import { formatBRL } from "../../lib/money.js";
import { createOrderSchema } from "../../schemas/order.schema.js";
import { rememberOrder } from "../customer.service.js";
import { placeOrder, quoteOrder } from "../orderPlacement.service.js";
import { buildOrderMessage } from "../whatsapp.service.js";
import { findAccount, formatWhen } from "./context.js";

const PAYMENTS = { pix: "pix", dinheiro: "cash", cartao: "card" };

export const TOOLS = [
  {
    name: "cotar_pedido",
    description:
      "Valida o pedido e calcula o total com os preços da loja, sem criar nada. Use quando tiver os produtos (com as opções obrigatórias), entrega ou retirada (com o endereço, se for entrega), a forma de pagamento e o nome. Devolve o resumo para mostrar ao cliente, ou os problemas para resolver com ele.",
    input_schema: {
      type: "object",
      properties: {
        itens: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              produto: { type: "string", description: "Código do produto no cardápio, ex. P12" },
              quantidade: { type: "integer", minimum: 1 },
              opcoes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    opcao: { type: "string", description: "Código da opção, ex. G3-2" },
                    quantidade: { type: "integer", minimum: 1, description: "Vezes a mesma opção (ex. bacon 2x). Padrão 1." },
                  },
                  required: ["opcao"],
                },
              },
              observacao: { type: "string", description: "Pedido do cliente para este item, ex. sem cebola" },
            },
            required: ["produto", "quantidade"],
          },
        },
        tipo: { type: "string", enum: ["entrega", "retirada"] },
        endereco: {
          type: "object",
          description: "Obrigatório na entrega",
          properties: {
            rua: { type: "string" },
            numero: { type: "string" },
            bairro: { type: "string" },
            referencia: { type: "string" },
          },
          required: ["rua", "numero", "bairro"],
        },
        pagamento: { type: "string", enum: ["pix", "dinheiro", "cartao"] },
        troco_para: { type: "number", description: "Só em dinheiro: para quanto levar troco, em reais. Omita se não precisa de troco." },
        nome: { type: "string", description: "Nome do cliente" },
        observacoes: { type: "string", description: "Observação geral do pedido, ex. tocar a campainha" },
        cupom: { type: "string" },
        idioma: { type: "string", enum: ["pt-BR", "es"], description: "Idioma em que o cliente está escrevendo" },
      },
      required: ["itens", "tipo", "pagamento", "nome", "idioma"],
    },
  },
  {
    name: "criar_pedido",
    description:
      "Cria de verdade o último pedido cotado. Só use depois que o cliente viu o resumo e confirmou. Devolve o número do pedido, a previsão e o link de acompanhamento.",
    input_schema: {
      type: "object",
      properties: { versao: { type: "integer", description: "A versão que cotar_pedido devolveu" } },
      required: ["versao"],
    },
  },
  {
    name: "chamar_atendente",
    description:
      "Passa a conversa para uma pessoa da loja e você para de responder neste chat. Use em reclamações, alergias, mudança ou cancelamento de pedido feito, quando o cliente pedir uma pessoa ou quando você não entender depois de duas tentativas.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", description: "Em poucas palavras, para a loja saber o que houve" } },
      required: ["motivo"],
    },
  },
];

const failure = (...erros) => ({ ok: false, erros });

// Barrio de la lista del local, sin importar mayúsculas ni acentos.
const plain = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// El error de la API, con lo que el cliente necesita saber para resolverlo.
function explain(error) {
  if (!(error instanceof AppError)) throw error;
  const details = error.details ?? {};
  const extra = [];
  if (details.minOrderCents != null) extra.push(`mínimo ${formatBRL(details.minOrderCents)}`);
  if (details.nextOpenAt) extra.push(`abre ${formatWhen(new Date(details.nextOpenAt))}`);
  if (details.pausedUntil) extra.push(`até ${formatWhen(new Date(details.pausedUntil))}`);
  return { ok: false, codigo: error.code, erros: [`${error.message}${extra.length ? ` (${extra.join(", ")})` : ""}`] };
}

async function cotarPedido(args, { store, conversation, menu }) {
  const errors = [];
  const items = (args.itens ?? []).map((item, index) => {
    const productId = menu.products.get(String(item.produto ?? "").toUpperCase());
    if (!productId) errors.push(`Item ${index + 1}: o código ${item.produto} não está no cardápio`);
    const options = (item.opcoes ?? []).flatMap((pick) => {
      const ref = menu.options.get(String(pick.opcao ?? "").toUpperCase());
      if (!ref) {
        errors.push(`Item ${index + 1}: a opção ${pick.opcao} não existe`);
        return [];
      }
      return [{ groupId: ref.groupId, optionId: ref.optionId, quantity: pick.quantidade ?? 1 }];
    });
    return { productId, quantity: item.quantidade, options, ...(item.observacao && { notes: item.observacao }) };
  });
  if (errors.length) return failure(...errors);

  const fulfillment = args.tipo === "entrega" ? "delivery" : "pickup";
  let address;
  if (fulfillment === "delivery") {
    const given = args.endereco;
    if (!given?.rua || !given?.numero || !given?.bairro) return failure("Falta o endereço de entrega: rua, número e bairro.");
    address = { street: given.rua, number: given.numero, ...(given.referencia && { reference: given.referencia }) };
    if (store.deliveryMode === "zones") {
      const zone = store.deliveryZones.find((option) => option.active && plain(option.name) === plain(given.bairro));
      if (!zone) {
        const names = store.deliveryZones.filter((option) => option.active).map((option) => option.name);
        return failure(`A loja não entrega no bairro "${given.bairro}". Bairros atendidos: ${names.join(", ")}.`);
      }
      address.zoneId = String(zone._id);
    } else {
      address.neighborhood = given.bairro;
    }
  }

  const locale = args.idioma === "es" ? "es" : "pt-BR";
  const parsed = createOrderSchema.safeParse({
    clientOrderId: "cotacao-do-assistente",
    customer: { name: args.nome, phone: conversation.customer.phone },
    fulfillment,
    ...(address && { address }),
    paymentMethod: PAYMENTS[args.pagamento],
    ...(args.pagamento === "dinheiro" && args.troco_para != null && { changeForCents: Math.round(Number(args.troco_para) * 100) }),
    ...(args.observacoes && { notes: args.observacoes }),
    items,
    ...(args.cupom && { couponCode: args.cupom }),
    locale,
  });
  if (!parsed.success) return failure(...parsed.error.issues.map((issue) => `${issue.path.join(".") || "pedido"}: ${issue.message}`));

  let quote;
  try {
    quote = await quoteOrder({ store, input: parsed.data });
  } catch (error) {
    return explain(error);
  }

  const version = conversation.draftCount + 1;
  conversation.draftCount = version;
  conversation.draft = { version, input: parsed.data, totalCents: quote.totalCents, quotedAt: new Date() };
  conversation.customer.name = parsed.data.customer.name;
  conversation.locale = locale;
  await conversation.save();

  const input = parsed.data;
  const summary = buildOrderMessage(
    {
      ...quote,
      locale,
      scheduledFor: null,
      fulfillment,
      address: address && { ...address, neighborhood: quote.zone?.name ?? address.neighborhood },
      paymentMethod: input.paymentMethod,
      notes: input.notes ?? "",
      customer: input.customer,
    },
    store,
    { title: locale === "es" ? `*Resumen del pedido — ${store.name}*` : `*Resumo do pedido — ${store.name}*` }
  );
  return {
    ok: true,
    versao: version,
    total: formatBRL(quote.totalCents),
    resumo: summary,
    proximo_passo: "Mostre o resumo e pergunte se o cliente confirma. Só chame criar_pedido depois da resposta dele.",
  };
}

async function criarPedido(args, { store, conversation }) {
  const draft = conversation.draft;
  if (!draft) return failure("Não há pedido cotado. Use cotar_pedido primeiro.");
  if (args.versao !== draft.version) {
    return failure(`A versão ${args.versao} não é a última cotada (${draft.version}). Mostre o último resumo e peça confirmação.`);
  }
  // El cliente tuvo que ver el resumen: la cotización es anterior a su último mensaje.
  if (!(conversation.lastCustomerMessageAt > draft.quotedAt)) {
    return failure("O cliente ainda não viu este resumo. Mostre o resumo e pergunte se confirma; crie o pedido só depois da resposta dele.");
  }
  const input = { ...draft.input, clientOrderId: `assistente-${conversation._id}-${draft.version}` };

  if (conversation.testMode) {
    try {
      await quoteOrder({ store, input });
    } catch (error) {
      return explain(error);
    }
    conversation.draft = null;
    await conversation.save();
    return {
      ok: true,
      numero: "TESTE",
      total: formatBRL(draft.totalCents),
      aviso: "Simulador em modo de teste: o pedido não foi criado de verdade. Responda ao cliente como se tivesse sido criado.",
    };
  }

  let order = await Order.findOne({ commerce: store._id, clientOrderId: input.clientOrderId });
  if (!order) {
    // La cuenta solo por WhatsApp: ahí el número lo confirma WhatsApp.
    const account = conversation.channel === "whatsapp" ? await findAccount(conversation.customer.phone) : null;
    try {
      order = await placeOrder({
        store,
        input,
        channel: "whatsapp",
        origin: "customer",
        account: account?._id ?? null,
        conversation: conversation._id,
      });
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.clientOrderId) {
        order = await Order.findOne({ commerce: store._id, clientOrderId: input.clientOrderId });
      } else {
        return explain(error);
      }
    }
    if (account) await rememberOrder(account._id, order).catch(() => {});
  }

  conversation.draft = null;
  conversation.orders.addToSet(order._id);
  await conversation.save();
  const estimate = order.estimatedMinutes;
  return {
    ok: true,
    numero: order.number,
    total: formatBRL(order.totalCents),
    previsao: estimate?.min != null ? `${estimate.min}–${estimate.max} min` : null,
    acompanhamento: trackingUrl(order),
  };
}

async function chamarAtendente(args, { conversation }) {
  conversation.status = "human";
  conversation.handoff = { reason: String(args.motivo ?? "").slice(0, 200) || "Pedido do assistente", at: new Date() };
  await conversation.save();
  return { ok: true, proximo_passo: "Avise o cliente que alguém da loja vai continuar a conversa por aqui." };
}

const HANDLERS = { cotar_pedido: cotarPedido, criar_pedido: criarPedido, chamar_atendente: chamarAtendente };

export async function runTool(name, args, context) {
  const handler = HANDLERS[name];
  if (!handler) return failure(`Ferramenta desconhecida: ${name}`);
  return handler(args ?? {}, context);
}
