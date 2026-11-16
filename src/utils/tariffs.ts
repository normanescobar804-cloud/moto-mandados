import {
  DeliveryStatus,
  Department,
  Merchant,
  ServiceCategory,
  ServiceType,
  TariffSettings,
} from '../types';

export const DEFAULT_TARIFFS: TariffSettings = {
  baseFare: 35,
  perKmRate: 11,
  urgentMultiplier: 1.35,
  expressFixedSurcharge: 25,
  platformFeePct: 5,
  currency: 'MXN',
  updatedBy: 'system',
};

export const DEFAULT_DEPARTMENTS: Department[] = [
  {
    id: 'dept_centro',
    name: 'Departamento Centro',
    code: 'CTR',
    centerLat: 19.4326,
    centerLng: -99.1332,
    zoom: 12.5,
    baseFareMultiplier: 1.0,
    active: true,
  },
  {
    id: 'dept_occidente',
    name: 'Departamento Occidente',
    code: 'OCC',
    centerLat: 20.6597,
    centerLng: -103.3496,
    zoom: 12.5,
    baseFareMultiplier: 1.05,
    active: true,
  },
  {
    id: 'dept_norte',
    name: 'Departamento Norte',
    code: 'NTE',
    centerLat: 25.6866,
    centerLng: -100.3161,
    zoom: 12.5,
    baseFareMultiplier: 1.1,
    active: true,
  },
  {
    id: 'dept_sur',
    name: 'Departamento Sur',
    code: 'SUR',
    centerLat: 19.0414,
    centerLng: -98.2063,
    zoom: 12.5,
    baseFareMultiplier: 0.95,
    active: true,
  },
];

export const DEFAULT_MERCHANTS: Merchant[] = [
  {
    id: 'merch_cafe_reforma',
    name: 'Tostaduría Reforma Central',
    category: 'Alimentos y Café',
    departmentId: 'dept_centro',
    departmentName: 'Departamento Centro',
    address: 'Av. Paseo de la Reforma 222, Juárez',
    lat: 19.4285,
    lng: -99.1618,
    active: true,
  },
  {
    id: 'merch_farma_roma',
    name: 'FarmaExpress Roma',
    category: 'Farmacia',
    departmentId: 'dept_centro',
    departmentName: 'Departamento Centro',
    address: 'Av. Álvaro Obregón 110, Roma Norte',
    lat: 19.4182,
    lng: -99.1595,
    active: true,
  },
  {
    id: 'merch_tech_occ',
    name: 'TecnoStore Chapultepec',
    category: 'Electrónica',
    departmentId: 'dept_occidente',
    departmentName: 'Departamento Occidente',
    address: 'Av. Chapultepec Sur 240, Americana',
    lat: 20.6712,
    lng: -103.3685,
    active: true,
  },
];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  delivery: 'Delivery',
  comercio: 'Comercio',
  super_expres: 'Súper Exprés',
  pasajero: 'Pasajero Moto',
};

export interface ServicePreset {
  id: ServiceType;
  category: ServiceCategory;
  label: string;
  shortLabel: string;
  description: string;
  isUrgent: boolean;
  targetMinutes: number;
}

export const SERVICE_PRESETS: ServicePreset[] = [
  {
    id: 'pasajero_moto',
    category: 'pasajero',
    label: 'Viaje Pasajero en Moto',
    shortLabel: 'Pasajero Moto',
    description: 'Traslado rápido de 1 pasajero con casco incluido y tarifa editable.',
    isUrgent: false,
    targetMinutes: 14,
  },
  {
    id: 'super_expres',
    category: 'super_expres',
    label: 'Súper Exprés (< 15 min)',
    shortLabel: 'Súper Exprés',
    description: 'Despacho inmediato de máxima prioridad con unidad dedicada.',
    isUrgent: true,
    targetMinutes: 12,
  },
  {
    id: 'comercio_local',
    category: 'comercio',
    label: 'Pedido Comercio Local',
    shortLabel: 'Comercio',
    description: 'Recolección en tienda o restaurante afiliado con opción de cobro contra entrega.',
    isUrgent: false,
    targetMinutes: 25,
  },
  {
    id: 'standard',
    category: 'delivery',
    label: 'Delivery Estándar',
    shortLabel: 'Delivery',
    description: 'Mensajería o paquetería urbana optimizada en ruta.',
    isUrgent: false,
    targetMinutes: 40,
  },
  {
    id: 'express_15',
    category: 'super_expres',
    label: 'Express 15 min',
    shortLabel: 'Express 15m',
    description: 'Recolección inmediata y prioridad en ruta.',
    isUrgent: true,
    targetMinutes: 15,
  },
  {
    id: 'urgent_docs',
    category: 'delivery',
    label: 'Documentos Urgentes',
    shortLabel: 'Documentos',
    description: 'Contratos, llaves o mensajería corporativa con acuse rápido.',
    isUrgent: true,
    targetMinutes: 20,
  },
  {
    id: 'medical',
    category: 'comercio',
    label: 'Farmacia y Salud',
    shortLabel: 'Farmacia',
    description: 'Insumos de farmacia o laboratorio con manejo cuidadoso.',
    isUrgent: true,
    targetMinutes: 20,
  },
];

export const MOTO_COLOR_OPTIONS = [
  { id: '#EA580C', label: 'Naranja Mando' },
  { id: '#0F172A', label: 'Negro Carbón' },
  { id: '#0284C7', label: 'Azul Urbano' },
  { id: '#059669', label: 'Verde Eco' },
  { id: '#DC2626', label: 'Rojo Express' },
  { id: '#7C3AED', label: 'Violeta Nocturno' },
];

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'Pendiente',
  assigned: 'Asignada',
  en_route: 'En camino',
  picked_up: 'Recogido',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
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
  return Math.max(0.4, Number((R * c).toFixed(2)));
}

export function calculateDeliveryFare(
  distanceKm: number,
  isUrgent: boolean,
  tariffs: TariffSettings,
  departmentMultiplier = 1.0,
  serviceCategory: ServiceCategory = 'delivery'
) {
  const safeDist = Math.max(0.4, Number(distanceKm.toFixed(2)));
  const mult = Math.max(0.5, departmentMultiplier);
  const baseFare = Number((tariffs.baseFare * mult).toFixed(2));
  const distanceFare = Number((safeDist * tariffs.perKmRate * mult).toFixed(2));
  const subtotal = baseFare + distanceFare;
  const superExpressExtra = serviceCategory === 'super_expres' ? 15 : 0;
  const urgentSurcharge = isUrgent
    ? Number(
        (
          subtotal * (tariffs.urgentMultiplier - 1) +
          tariffs.expressFixedSurcharge +
          superExpressExtra
        ).toFixed(2)
      )
    : 0;
  const totalFare = Number((subtotal + urgentSurcharge).toFixed(2));
  const platformFee = Number(
    ((totalFare * tariffs.platformFeePct) / 100).toFixed(2)
  );
  const riderEarnings = Number((totalFare - platformFee).toFixed(2));

  return {
    distanceKm: safeDist,
    baseFare,
    distanceFare,
    urgentSurcharge,
    totalFare,
    platformFee,
    riderEarnings,
  };
}

export function recalculateFromCustomFare(
  customTotalFare: number,
  platformFeePct: number
) {
  const safeTotal = Math.min(
    50000,
    Math.max(10, Number(customTotalFare.toFixed(2)))
  );
  const platformFee = Number(
    ((safeTotal * Math.max(0, Math.min(50, platformFeePct))) / 100).toFixed(2)
  );
  const riderEarnings = Number((safeTotal - platformFee).toFixed(2));
  return {
    totalFare: safeTotal,
    platformFee,
    riderEarnings,
  };
}

export function formatCurrency(amount: number, currency = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (ts instanceof Date) return ts.getTime();
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'seconds' in ts &&
    typeof (ts as { seconds: number }).seconds === 'number'
  ) {
    return (ts as { seconds: number }).seconds * 1000;
  }
  return 0;
}

export function formatShortDate(ts: unknown): string {
  const ms = toMillis(ts);
  if (!ms) return 'Reciente';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function clampStr(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}
