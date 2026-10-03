import { ApiError, api } from "../api/client";
import type { UploadSignature } from "../api/types";

// Sube una foto directo a Cloudinary con la firma que da el backend (la foto no pasa por
// nuestro servidor). Devuelve la URL para guardar en el producto o en el local.
export async function uploadImage(file: File, kind: "product" | "logo" | "cover"): Promise<string> {
  const signature = await api<UploadSignature>("/owner/uploads/signature", { method: "POST", body: { kind } });
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signature.apiKey);
  form.append("timestamp", String(signature.timestamp));
  form.append("signature", signature.signature);
  form.append("folder", signature.folder);
  form.append("allowed_formats", signature.allowed_formats);
  let response: Response;
  try {
    response = await fetch(signature.uploadUrl, { method: "POST", body: form });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.secure_url) throw new ApiError(response.status, "UPLOAD_FAILED", data?.error?.message ?? "");
  return data.secure_url as string;
}
