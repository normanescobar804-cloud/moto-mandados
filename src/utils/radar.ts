export type RadarBand = 'cercano' | 'intermedio' | 'lejano';

export interface RadarBandMeta {
  id: RadarBand;
  label: string;
  shortLabel: string;
  rangeLabel: string;
  description: string;
  dotColor: string;
  ringColor: string;
  textClass: string;
}

export const RADAR_NEAR_MAX_KM = 2.5;
export const RADAR_MID_MAX_KM = 7.0;

export const RADAR_BANDS: Record<RadarBand, RadarBandMeta> = {
  cercano: {
    id: 'cercano',
    label: 'Más Cercanos',
    shortLabel: 'Cercano',
    rangeLabel: '≤ 2.5 km',
    description: 'Zona inmediata para respuesta rápida',
    dotColor: '#059669',
    ringColor: '#10B981',
    textClass: 'text-emerald-700',
  },
  intermedio: {
    id: 'intermedio',
    label: 'Intermedios',
    shortLabel: 'Intermedio',
    rangeLabel: '2.5 – 7.0 km',
    description: 'Distancia urbana media en moto',
    dotColor: '#D97706',
    ringColor: '#F59E0B',
    textClass: 'text-amber-700',
  },
  lejano: {
    id: 'lejano',
    label: 'Lejanos',
    shortLabel: 'Lejano',
    rangeLabel: '> 7.0 km',
    description: 'Mayor recorrido y tarifa extendida',
    dotColor: '#0284C7',
    ringColor: '#38BDF8',
    textClass: 'text-sky-700',
  },
};

export function exactRadarDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return 0;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const rawKm = R * c;
  if (!Number.isFinite(rawKm) || rawKm < 0) return 0;
  return Number(rawKm.toFixed(2));
}

export function computeBearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return 0;
  }
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return Math.round(((theta * 180) / Math.PI + 360) % 360);
}

export function getCardinalLabel(bearingDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const idx = Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

export function getRadarBand(distanceKm: number): RadarBand {
  if (distanceKm <= RADAR_NEAR_MAX_KM) return 'cercano';
  if (distanceKm <= RADAR_MID_MAX_KM) return 'intermedio';
  return 'lejano';
}

export function estimateEtaMinutes(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 1;
  return Math.max(1, Math.round((distanceKm / 28) * 60) + 1);
}

export function formatRadarKm(distanceKm: number): string {
  return `${Math.max(0, distanceKm).toFixed(2)} km`;
}
