import { ALLOWED_FORMATS, folderFor, requireCloudinary, signParams } from "../lib/cloudinary.js";

// Firma una subida a Cloudinary. El navegador manda el archivo directo a `uploadUrl`
// (multipart) con file, api_key, timestamp, folder, allowed_formats y signature;
// la URL que devuelve Cloudinary (secure_url) se guarda después en el local o el producto.
export const createUploadSignature = (req, res) => {
  const cloudinary = requireCloudinary();
  const params = {
    allowed_formats: ALLOWED_FORMATS,
    folder: folderFor(req.commerce._id, req.valid.body.kind),
    timestamp: Math.floor(Date.now() / 1000),
  };
  res.json({
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`,
    cloudName: cloudinary.cloudName,
    apiKey: cloudinary.apiKey,
    ...params,
    signature: signParams(params, cloudinary.apiSecret),
  });
};
