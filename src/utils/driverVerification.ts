import { DriverVerificationStatus } from '../types';

export const MIN_DRIVER_AGE = 18;
export const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const MAX_RAW_DOC_FILE_BYTES = 12 * 1024 * 1024;
const MAX_DOC_DATA_URL_LENGTH = 115000;

export const VERIFICATION_STATUS_LABELS: Record<DriverVerificationStatus, string> = {
  unsubmitted: 'Documentos Pendientes',
  pending_review: 'En Revisión (12 horas)',
  approved: 'Conductor Aprobado',
  rejected: 'Solicitud Rechazada',
};

export function parseIsoDateParts(
  isoDate: string
): { year: number; month: number; day: number } | null {
  const trimmed = (isoDate || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function parseIsoDateUtcMs(isoDate: string): number | null {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return null;
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function calculateAgeFromIsoDate(
  isoDate: string,
  now: Date = new Date()
): number | null {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) return null;

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  let age = currentYear - parts.year;
  if (
    currentMonth < parts.month ||
    (currentMonth === parts.month && currentDay < parts.day)
  ) {
    age -= 1;
  }
  return age;
}

export function getMaxAdultBirthDateIso(now: Date = new Date()): string {
  const year = now.getFullYear() - MIN_DRIVER_AGE;
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function timestampToMillis(ts: unknown): number | null {
  if (!ts) return null;
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object') {
    const maybe = ts as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') {
      return maybe.toMillis();
    }
    if (typeof maybe.seconds === 'number') {
      return maybe.seconds * 1000;
    }
  }
  return null;
}

export function getReviewWindowState(
  submittedAt: unknown,
  nowMs: number = Date.now()
): {
  submittedMs: number;
  reviewReadyAtMs: number;
  remainingMs: number;
  elapsedMs: number;
  isWindowComplete: boolean;
  progressPct: number;
} {
  const submittedMs = timestampToMillis(submittedAt) ?? nowMs;
  const reviewReadyAtMs = submittedMs + TWELVE_HOURS_MS;
  const elapsedMs = Math.max(0, nowMs - submittedMs);
  const remainingMs = Math.max(0, reviewReadyAtMs - nowMs);
  const progressPct = Math.min(
    100,
    Math.max(0, Math.round((elapsedMs / TWELVE_HOURS_MS) * 100))
  );
  return {
    submittedMs,
    reviewReadyAtMs,
    remainingMs,
    elapsedMs,
    isWindowComplete: remainingMs === 0,
    progressPct,
  };
}

export function formatCountdownHms(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0'
  )}:${String(seconds).padStart(2, '0')}`;
}

export function formatDateTimeEs(ms: number): string {
  return new Date(ms).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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
      reject(new Error('No se pudo leer la imagen del documento.'));
    };
    img.src = objectUrl;
  });
}

function renderResizedDocumentJpeg(
  img: HTMLImageElement,
  maxSide: number,
  quality: number
): string {
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSide / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Tu navegador no soporta procesamiento de imágenes.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function processDocumentImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona una imagen válida (JPG, PNG o WebP).');
  }
  if (file.size > MAX_RAW_DOC_FILE_BYTES) {
    throw new Error('La imagen supera el límite de 12 MB.');
  }

  const img = await loadImageFromFile(file);

  const attempts: Array<{ maxSide: number; quality: number }> = [
    { maxSide: 720, quality: 0.78 },
    { maxSide: 580, quality: 0.68 },
    { maxSide: 480, quality: 0.58 },
    { maxSide: 380, quality: 0.5 },
  ];

  for (const attempt of attempts) {
    const dataUrl = renderResizedDocumentJpeg(
      img,
      attempt.maxSide,
      attempt.quality
    );
    if (dataUrl.length <= MAX_DOC_DATA_URL_LENGTH) {
      return dataUrl;
    }
  }

  throw new Error('No se pudo comprimir el comprobante por debajo del límite.');
}
