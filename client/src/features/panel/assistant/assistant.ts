import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, api } from "../../../api/client";
import type {
  AssistantInput,
  AssistantResponse,
  Conversation,
  ConversationThread,
  ConversationsResponse,
  SimulatorAudioInput,
  SimulatorInput,
  StaffMessageResponse,
} from "../../../api/types";

// Asistente con IA: configuración, simulador y conversaciones del panel.

export const assistantKey = ["owner-assistant"];
const conversationsKey = [...assistantKey, "conversations"];
const threadKey = (id: string) => [...assistantKey, "conversation", id];

export type ChannelFilter = "all" | Conversation["channel"];

export const useAssistantSettings = (enabled = true) =>
  useQuery({ queryKey: assistantKey, queryFn: () => api<AssistantResponse>("/owner/assistant"), enabled });

export function useUpdateAssistant() {
  const queryClient = useQueryClient();
  return useMutation<AssistantResponse, ApiError, AssistantInput>({
    mutationFn: (body) => api("/owner/assistant", { method: "PATCH", body }),
    onSuccess: (data) => queryClient.setQueryData(assistantKey, data),
  });
}

// Se actualiza sola: las conversaciones de WhatsApp llegan mientras el panel está abierto.
export const useConversations = (channel: ChannelFilter, { status }: { status?: Conversation["status"] } = {}) => {
  const params = new URLSearchParams();
  if (channel !== "all") params.set("channel", channel);
  if (status) params.set("status", status);
  const query = params.size ? `?${params}` : "";
  return useQuery({
    queryKey: [...conversationsKey, channel, status ?? "any"],
    queryFn: () => api<ConversationsResponse>(`/owner/assistant/conversations${query}`),
    refetchInterval: 10_000,
  });
};

export const useConversation = (id: string | null) =>
  useQuery({
    queryKey: threadKey(id ?? ""),
    queryFn: () => api<ConversationThread>(`/owner/assistant/conversations/${id}`),
    enabled: Boolean(id),
    refetchInterval: 5_000,
  });

export function useSimulator() {
  const queryClient = useQueryClient();
  return useMutation<ConversationThread, ApiError, SimulatorInput>({
    mutationFn: (body) => api("/owner/assistant/simulator", { method: "POST", body }),
    // El gasto del mes y la lista de conversaciones cambian con cada respuesta.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assistantKey }),
  });
}

// Nota de voz grabada en el panel: se transcribe en el servidor y sigue como un mensaje.
export function useSimulatorAudio() {
  const queryClient = useQueryClient();
  return useMutation<ConversationThread, ApiError, SimulatorAudioInput>({
    mutationFn: (body) => api("/owner/assistant/simulator/audio", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assistantKey }),
  });
}

export function useConversationAction() {
  const queryClient = useQueryClient();
  return useMutation<{ conversation: Conversation }, ApiError, { id: string; action: "takeover" | "release" }>({
    mutationFn: ({ id, action }) => api(`/owner/assistant/conversations/${id}/${action}`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assistantKey }),
  });
}

export function useStaffMessage() {
  const queryClient = useQueryClient();
  return useMutation<StaffMessageResponse, ApiError, { id: string; text: string }>({
    mutationFn: ({ id, text }) => api(`/owner/assistant/conversations/${id}/messages`, { method: "POST", body: { text } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assistantKey }),
  });
}

// La plata de la IA llega en millonésimos de dólar. Lo que no llega a un centavo se
// muestra con 4 decimales ("US$ 0,0042"); el resto, con 2.
export function formatUsd(micros: number) {
  const usd = micros / 1_000_000;
  const digits = usd > 0 && usd < 0.01 ? 4 : 2;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(usd);
}

// Promedio por conversación o por pedido; null si todavía no hay ninguno.
export const average = (micros: number, count: number) => (count > 0 ? Math.round(micros / count) : null);

// Alguien del local tiene que contestar: la atiende una persona y lo último no lo escribió el local.
export const needsPerson = (conversation: Pick<Conversation, "status" | "lastRole">) =>
  conversation.status === "human" && conversation.lastRole !== "staff";

// Formato de WhatsApp de una línea: *negrita* y links, en pedazos para pintarlos sin HTML.
export type Piece = { kind: "text" | "bold" | "link"; text: string };
export function whatsappPieces(line: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of line.matchAll(/\*([^*\n]+)\*|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?])/g)) {
    if (match.index > last) pieces.push({ kind: "text", text: line.slice(last, match.index) });
    pieces.push(match[1] !== undefined ? { kind: "bold", text: match[1] } : { kind: "link", text: match[2] });
    last = match.index + match[0].length;
  }
  if (last < line.length) pieces.push({ kind: "text", text: line.slice(last) });
  return pieces;
}

// El servidor acepta hasta ~1,5 MB de audio (unos minutos de nota de voz).
export const MAX_AUDIO_BYTES = 1_500_000;

// Un audio en base64, para mandarlo en el JSON.
export async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

// Cómo suena una respuesta en voz: el servidor devuelve la nota de voz (OGG/Opus).
export async function fetchSpeech(text: string, locale: string): Promise<Blob> {
  const response = await fetch("/api/owner/assistant/speech", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, locale }),
  });
  if (!response.ok) throw new Error(`voz: ${response.status}`);
  return response.blob();
}

// Cliente de prueba del simulador (un número que no es de nadie).
export const SIMULATED_CUSTOMER = { name: "Cliente teste", phone: "+55 55 99999-0001" };
