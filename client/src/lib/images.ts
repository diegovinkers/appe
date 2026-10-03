// Las imágenes de Cloudinary se piden ya recortadas y livianas (WebP/AVIF según el
// navegador): una miniatura pesa unos pocos KB en vez de cientos.
export function cloudinaryImage(url: string, width: number, height: number): string {
  if (!url.includes("res.cloudinary.com/") || !url.includes("/image/upload/")) return url;
  return url.replace("/image/upload/", `/image/upload/c_fill,w_${width},h_${height},f_auto,q_auto/`);
}

export const cloudinaryThumb = (url: string, size: number) => cloudinaryImage(url, size, size);

// Sin recortar, solo achicada si es más ancha: para la portada, que cada pantalla encuadra
// a su manera (ancha en la PC, más alta en el celular).
export function cloudinaryFit(url: string, width: number): string {
  if (!url.includes("res.cloudinary.com/") || !url.includes("/image/upload/")) return url;
  return url.replace("/image/upload/", `/image/upload/c_limit,w_${width},f_auto,q_auto/`);
}
