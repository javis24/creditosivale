const TARGET_IMAGE_SIZE = 2.5 * 1024 * 1024;
const MAX_SOURCE_IMAGE_SIZE = 25 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2200;

export const MAX_UPLOAD_FILE_SIZE = 4 * 1024 * 1024;

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No fue posible leer la imagen seleccionada."));
    };

    image.src = objectUrl;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("No fue posible optimizar la imagen."));
        }
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Redimensiona y comprime fotografías en el navegador. El archivo original
 * nunca sale del dispositivo; solamente se envía la versión optimizada.
 */
export async function optimizeImageForUpload(file: File) {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= TARGET_IMAGE_SIZE) return file;

  if (file.size > MAX_SOURCE_IMAGE_SIZE) {
    throw new Error("La imagen original no puede pesar más de 25 MB.");
  }

  const image = await loadImage(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  let scale = Math.min(1, MAX_IMAGE_SIDE / longestSide);

  for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("No fue posible procesar la imagen.");

    // Evita fondos negros al convertir una imagen PNG transparente a JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56]) {
      const blob = await canvasToJpeg(canvas, quality);

      if (blob.size <= TARGET_IMAGE_SIZE) {
        const baseName = file.name.replace(/\.[^.]+$/, "") || "documento";
        return new File([blob], `${baseName}-optimizada.jpg`, {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }
    }

    scale *= 0.82;
  }

  throw new Error(
    "No fue posible reducir la imagen. Intenta tomar otra foto con menor resolución.",
  );
}
