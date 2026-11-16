const MAX_RAW_FILE_BYTES = 12 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 155000;

export function getInitials(name: string): string {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'MM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen seleccionada.'));
    };
    img.src = objectUrl;
  });
}

function renderCroppedSquareJpeg(
  img: HTMLImageElement,
  size: number,
  quality: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Tu navegador no soporta el procesamiento de imágenes.');
  }

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, size, size);

  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;
  const cropSize = Math.min(srcWidth, srcHeight);
  const sx = Math.max(0, Math.floor((srcWidth - cropSize) / 2));
  const sy = Math.max(0, Math.floor((srcHeight - cropSize) / 2));

  ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function processProfilePhotoFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido (JPG, PNG o WebP).');
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('La imagen es demasiado pesada. El límite es de 12 MB.');
  }

  const img = await loadImageFromFile(file);

  const attempts: Array<{ size: number; quality: number }> = [
    { size: 256, quality: 0.84 },
    { size: 224, quality: 0.74 },
    { size: 192, quality: 0.65 },
    { size: 160, quality: 0.56 },
  ];

  for (const attempt of attempts) {
    const dataUrl = renderCroppedSquareJpeg(img, attempt.size, attempt.quality);
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) {
      return dataUrl;
    }
  }

  throw new Error('No se pudo comprimir la foto por debajo del límite permitido.');
}
