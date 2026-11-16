import {
  DriverApplication,
  DriverRankId,
  RiderProfile,
  Wallet,
} from '../types';
import { TWELVE_HOURS_MS, timestampToMillis } from './driverVerification';

export interface DriverRankStage {
  id: DriverRankId;
  order: number;
  name: string;
  shortName: string;
  minXp: number;
  recommendedTrips: number;
  accentHex: string;
  borderClass: string;
  bgTintClass: string;
  textClass: string;
  rewardId: string;
  freeTripsBonus: number;
  prizeTitle: string;
  perks: string[];
}

export const DRIVER_RANK_STAGES: DriverRankStage[] = [
  {
    id: 'bronce',
    order: 1,
    name: 'Etapa 1 · Bronce',
    shortName: 'Bronce',
    minXp: 0,
    recommendedTrips: 0,
    accentHex: '#B45309',
    borderClass: 'border-amber-300',
    bgTintClass: 'bg-amber-50',
    textClass: 'text-amber-900',
    rewardId: 'stage_bronce_inicio',
    freeTripsBonus: 0,
    prizeTitle: 'Acceso Operativo Moto Mandados + Bono 12h disponible',
    perks: [
      'Comisión estándar transparente del 5% por viaje',
      'Recargas oficiales vía Banpro Nicaragua y Banco LAFISE',
      'Desbloqueo de 10 a 20 viajes gratis tras completar 12 horas',
    ],
  },
  {
    id: 'plata',
    order: 2,
    name: 'Etapa 2 · Plata',
    shortName: 'Plata',
    minXp: 200,
    recommendedTrips: 3,
    accentHex: '#475569',
    borderClass: 'border-slate-300',
    bgTintClass: 'bg-slate-100',
    textClass: 'text-slate-900',
    rewardId: 'stage_plata_bonus',
    freeTripsBonus: 5,
    prizeTitle: 'Bono Plata: +5 Viajes Gratis (0% comisión)',
    perks: [
      'Insignia Plata verificada en panel de flota',
      'Prioridad media en pedidos de Delivery urbano',
      '+5 Viajes Gratis sin deducción del 5%',
    ],
  },
  {
    id: 'oro',
    order: 3,
    name: 'Etapa 3 · Oro',
    shortName: 'Oro',
    minXp: 550,
    recommendedTrips: 10,
    accentHex: '#D97706',
    borderClass: 'border-amber-400',
    bgTintClass: 'bg-amber-50',
    textClass: 'text-amber-950',
    rewardId: 'stage_oro_bonus',
    freeTripsBonus: 10,
    prizeTitle: 'Bono Oro: +10 Viajes Gratis (0% comisión)',
    perks: [
      'Prioridad en cola de Comercio Local y Súper Exprés',
      '+10 Viajes Gratis con ganancia 100% neta para ti',
      'Destacado Dorado en despachos urgentes',
    ],
  },
  {
    id: 'platino',
    order: 4,
    name: 'Etapa 4 · Platino',
    shortName: 'Platino',
    minXp: 1100,
    recommendedTrips: 20,
    accentHex: '#0284C7',
    borderClass: 'border-sky-300',
    bgTintClass: 'bg-sky-50',
    textClass: 'text-sky-900',
    rewardId: 'stage_platino_bonus',
    freeTripsBonus: 12,
    prizeTitle: 'Bono Platino: +12 Viajes Gratis (0% comisión)',
    perks: [
      'Acceso anticipado a pedidos corporativos de alta tarifa',
      '+12 Viajes Gratis sin deducción del 5%',
      'Soporte operativo prioritario en ruta',
    ],
  },
  {
    id: 'diamante',
    order: 5,
    name: 'Etapa 5 · Diamante',
    shortName: 'Diamante',
    minXp: 1900,
    recommendedTrips: 35,
    accentHex: '#2563EB',
    borderClass: 'border-sky-400',
    bgTintClass: 'bg-sky-50',
    textClass: 'text-sky-950',
    rewardId: 'stage_diamante_bonus',
    freeTripsBonus: 15,
    prizeTitle: 'Bono Diamante: +15 Viajes Gratis (0% comisión)',
    perks: [
      'Estatus Diamante en asignación de rutas múltiples',
      '+15 Viajes Gratis sin deducción de plataforma',
      'Prioridad en entregas nocturnas y de fin de semana',
    ],
  },
  {
    id: 'maestro',
    order: 6,
    name: 'Etapa 6 · Maestro',
    shortName: 'Maestro',
    minXp: 3000,
    recommendedTrips: 60,
    accentHex: '#7C3AED',
    borderClass: 'border-orange-300',
    bgTintClass: 'bg-orange-50',
    textClass: 'text-orange-950',
    rewardId: 'stage_maestro_bonus',
    freeTripsBonus: 18,
    prizeTitle: 'Bono Maestro: +18 Viajes Gratis (0% comisión)',
    perks: [
      'Rango Maestro con prioridad élite en toda la zona',
      '+18 Viajes Gratis exentos de la comisión del 5%',
      'Acceso preferencial a clientes frecuentes y comercios VIP',
    ],
  },
  {
    id: 'gran_maestro',
    order: 7,
    name: 'Etapa 7 · Gran Maestro',
    shortName: 'Gran Maestro',
    minXp: 4500,
    recommendedTrips: 90,
    accentHex: '#EA580C',
    borderClass: 'border-orange-400',
    bgTintClass: 'bg-orange-50',
    textClass: 'text-orange-950',
    rewardId: 'stage_gran_maestro_bonus',
    freeTripsBonus: 20,
    prizeTitle: 'Premio Gran Maestro: +20 Viajes Gratis + Trofeo Élite',
    perks: [
      'Nivel máximo Gran Maestro en Moto Mandados Nicaragua',
      '+20 Viajes Gratis con 0% de comisión por viaje',
      'Prioridad absoluta en Súper Exprés, Comercio y Pasajeros',
    ],
  },
];

export type AchievementCategory =
  | '12_horas'
  | 'experiencia'
  | 'distancia'
  | 'excelencia'
  | 'maestria';

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  '12_horas': 'Bonos de 12 Horas',
  experiencia: 'Viajes y Experiencia',
  distancia: 'Kilometraje en Ruta',
  excelencia: 'Calidad y Puntualidad',
  maestria: 'Etapas y Maestría',
};

export interface DriverAchievementStatus {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  requirementText: string;
  currentValue: number;
  targetValue: number;
  unitLabel: string;
  progressPct: number;
  xpReward: number;
  freeTripsReward: number;
  prizeLabel: string;
  unlocked: boolean;
  claimed: boolean;
  countdownLabel?: string;
}

export interface ClaimableRewardPayload {
  rewardId: string;
  title: string;
  freeTripsToAdd: number;
  xpToAdd: number;
  nextRank: DriverRankId;
}

export interface DriverProgressionSummary {
  totalXp: number;
  baseActivityXp: number;
  claimedBonusXp: number;
  currentStage: DriverRankStage;
  nextStage: DriverRankStage | null;
  stageProgressPct: number;
  xpToNextStage: number;
  stages: Array<
    DriverRankStage & {
      unlocked: boolean;
      claimed: boolean;
      isCurrent: boolean;
    }
  >;
  achievements: DriverAchievementStatus[];
  unlockedCount: number;
  claimedCount: number;
  pendingClaimCount: number;
  totalClaimableFreeTrips: number;
  window12h: {
    anchorMs: number;
    elapsedMs: number;
    remainingMs: number;
    progressPct: number;
    completed: boolean;
    elapsedHoursLabel: string;
  };
  freeTripsBalance: number;
  freeTripsEarned: number;
  freeTripsUsed: number;
}

export function getRankStageById(rankId?: DriverRankId): DriverRankStage {
  return (
    DRIVER_RANK_STAGES.find((r) => r.id === rankId) || DRIVER_RANK_STAGES[0]
  );
}

export function computeDriverProgression(params: {
  rider: RiderProfile;
  wallet: Wallet;
  application?: DriverApplication | null;
  nowMs?: number;
}): DriverProgressionSummary {
  const { rider, wallet, application, nowMs = Date.now() } = params;
  const completedTrips = Math.max(0, rider.completedCount || 0);
  const totalKm = Math.max(0, rider.totalKm || 0);
  const onTimeRate = Math.max(0, rider.onTimeRate || 0);
  const rating = Math.max(0, rider.rating || 0);
  const isApproved =
    rider.role === 'admin' || rider.verificationStatus === 'approved';

  const anchorMs =
    timestampToMillis(application?.submittedAt) ??
    timestampToMillis(rider.createdAt) ??
    nowMs;
  const elapsedMs = Math.max(0, nowMs - anchorMs);
  const remainingMs = Math.max(0, TWELVE_HOURS_MS - elapsedMs);
  const window12hCompleted = remainingMs === 0;
  const window12hPct = Math.min(
    100,
    Math.max(0, Math.round((elapsedMs / TWELVE_HOURS_MS) * 100))
  );
  const elapsedHours = Math.min(12, elapsedMs / (60 * 60 * 1000));

  const claimedIds = new Set(wallet.claimedRewardIds || []);

  // Deterministic activity XP derived from verified operational telemetry
  const tripXp = completedTrips * 60;
  const kmXp = Math.round(totalKm * 6);
  const approvalXp = isApproved ? 120 : 0;
  const milestone12hXp = window12hCompleted ? 150 : 0;
  const punctualityXp = completedTrips >= 1 && onTimeRate >= 95 ? 100 : 0;
  const ratingXp = completedTrips >= 1 && rating >= 4.8 ? 80 : 0;
  const baseActivityXp =
    tripXp + kmXp + approvalXp + milestone12hXp + punctualityXp + ratingXp;

  const claimedBonusXp = Math.max(0, wallet.xpPoints || 0);
  const totalXp = baseActivityXp + claimedBonusXp;

  let currentStage = DRIVER_RANK_STAGES[0];
  for (const stage of DRIVER_RANK_STAGES) {
    if (totalXp >= stage.minXp) {
      currentStage = stage;
    }
  }

  const nextStage =
    DRIVER_RANK_STAGES.find((s) => s.order === currentStage.order + 1) || null;
  const stageProgressPct = nextStage
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(
            ((totalXp - currentStage.minXp) /
              Math.max(1, nextStage.minXp - currentStage.minXp)) *
              100
          )
        )
      )
    : 100;
  const xpToNextStage = nextStage ? Math.max(0, nextStage.minXp - totalXp) : 0;

  const stages = DRIVER_RANK_STAGES.map((stage) => ({
    ...stage,
    unlocked: totalXp >= stage.minXp,
    claimed: stage.freeTripsBonus === 0 || claimedIds.has(stage.rewardId),
    isCurrent: stage.id === currentStage.id,
  }));

  const formatRemainingHms = (ms: number) => {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(
      s
    ).padStart(2, '0')}`;
  };

  const achievements: DriverAchievementStatus[] = [
    {
      id: 'ach_12h_bienvenida',
      category: '12_horas',
      title: 'Bono Activación 12 Horas (10 Viajes Gratis)',
      description:
        'Cumple el período de 12 horas desde tu registro y habilitación para desbloquear tus primeros 10 viajes sin deducción del 5%.',
      requirementText: 'Completar 12 horas de registro/verificación en plataforma',
      currentValue: Number(elapsedHours.toFixed(1)),
      targetValue: 12,
      unitLabel: 'h',
      progressPct: window12hPct,
      xpReward: 150,
      freeTripsReward: 10,
      prizeLabel: '10 Viajes Gratis (0% comisión)',
      unlocked: window12hCompleted && isApproved,
      claimed: claimedIds.has('ach_12h_bienvenida'),
      countdownLabel: window12hCompleted
        ? isApproved
          ? '12h cumplidas · Disponible'
          : '12h cumplidas · Requiere aprobación'
        : `Faltan ${formatRemainingHms(remainingMs)}`,
    },
    {
      id: 'ach_12h_veterano',
      category: '12_horas',
      title: 'Bono Jornada Élite 12 Horas (20 Viajes Gratis)',
      description:
        'Supera las 12 horas en la plataforma y completa al menos 5 entregas exitosas para desbloquear el máximo bono de 20 viajes gratis.',
      requirementText: '12 horas cumplidas + 5 entregas completadas',
      currentValue:
        window12hCompleted && isApproved
          ? Math.min(5, completedTrips)
          : Math.min(4, completedTrips),
      targetValue: 5,
      unitLabel: 'viajes',
      progressPct: Math.min(
        100,
        Math.round(
          (window12hPct * 0.5 +
            Math.min(100, (completedTrips / 5) * 100) * 0.5)
        )
      ),
      xpReward: 300,
      freeTripsReward: 20,
      prizeLabel: '20 Viajes Gratis (0% comisión)',
      unlocked: window12hCompleted && isApproved && completedTrips >= 5,
      claimed: claimedIds.has('ach_12h_veterano'),
      countdownLabel: window12hCompleted
        ? `${Math.min(5, completedTrips)}/5 viajes`
        : `Faltan ${formatRemainingHms(remainingMs)}`,
    },
    {
      id: 'ach_primer_viaje',
      category: 'experiencia',
      title: 'Primer Mandado Completado',
      description:
        'Finaliza tu primera entrega verificada en Moto Mandados con liquidación transparente.',
      requirementText: 'Completar 1 entrega verificada',
      currentValue: Math.min(1, completedTrips),
      targetValue: 1,
      unitLabel: 'viaje',
      progressPct: Math.min(100, completedTrips >= 1 ? 100 : 0),
      xpReward: 80,
      freeTripsReward: 2,
      prizeLabel: '+2 Viajes Gratis + 80 XP',
      unlocked: completedTrips >= 1,
      claimed: claimedIds.has('ach_primer_viaje'),
    },
    {
      id: 'ach_10_viajes',
      category: 'experiencia',
      title: 'Motorizado Activo (10 Viajes)',
      description:
        'Consolida tu ritmo de trabajo alcanzando 10 viajes entregados en tu departamento.',
      requirementText: 'Alcanzar 10 entregas completadas',
      currentValue: Math.min(10, completedTrips),
      targetValue: 10,
      unitLabel: 'viajes',
      progressPct: Math.min(100, Math.round((completedTrips / 10) * 100)),
      xpReward: 200,
      freeTripsReward: 10,
      prizeLabel: '10 Viajes Gratis + 200 XP',
      unlocked: completedTrips >= 10,
      claimed: claimedIds.has('ach_10_viajes'),
    },
    {
      id: 'ach_25_viajes',
      category: 'experiencia',
      title: 'Ruta Constante (25 Viajes)',
      description:
        'Completa 25 servicios entre Delivery, Comercio y Súper Exprés.',
      requirementText: 'Alcanzar 25 entregas completadas',
      currentValue: Math.min(25, completedTrips),
      targetValue: 25,
      unitLabel: 'viajes',
      progressPct: Math.min(100, Math.round((completedTrips / 25) * 100)),
      xpReward: 350,
      freeTripsReward: 12,
      prizeLabel: '12 Viajes Gratis + 350 XP',
      unlocked: completedTrips >= 25,
      claimed: claimedIds.has('ach_25_viajes'),
    },
    {
      id: 'ach_50_viajes',
      category: 'experiencia',
      title: 'Veterano de Asfalto (50 Viajes)',
      description:
        'Supera las 50 entregas completadas con historial verificado en flota.',
      requirementText: 'Alcanzar 50 entregas completadas',
      currentValue: Math.min(50, completedTrips),
      targetValue: 50,
      unitLabel: 'viajes',
      progressPct: Math.min(100, Math.round((completedTrips / 50) * 100)),
      xpReward: 500,
      freeTripsReward: 15,
      prizeLabel: '15 Viajes Gratis + 500 XP',
      unlocked: completedTrips >= 50,
      claimed: claimedIds.has('ach_50_viajes'),
    },
    {
      id: 'ach_100_viajes',
      category: 'experiencia',
      title: 'Centenario Moto Mandados (100 Viajes)',
      description:
        'Ingresa al club élite de los 100 viajes completados sin deducción en tus próximos 20 recorridos.',
      requirementText: 'Alcanzar 100 entregas completadas',
      currentValue: Math.min(100, completedTrips),
      targetValue: 100,
      unitLabel: 'viajes',
      progressPct: Math.min(100, Math.round((completedTrips / 100) * 100)),
      xpReward: 800,
      freeTripsReward: 20,
      prizeLabel: '20 Viajes Gratis + 800 XP',
      unlocked: completedTrips >= 100,
      claimed: claimedIds.has('ach_100_viajes'),
    },
    {
      id: 'ach_km_100',
      category: 'distancia',
      title: 'Explorador Urbano (100 km)',
      description:
        'Recorre tus primeros 100 kilómetros operativos en rutas verificadas por GPS.',
      requirementText: 'Acumular 100 km recorridos',
      currentValue: Number(Math.min(100, totalKm).toFixed(1)),
      targetValue: 100,
      unitLabel: 'km',
      progressPct: Math.min(100, Math.round((totalKm / 100) * 100)),
      xpReward: 180,
      freeTripsReward: 5,
      prizeLabel: '5 Viajes Gratis + 180 XP',
      unlocked: totalKm >= 100,
      claimed: claimedIds.has('ach_km_100'),
    },
    {
      id: 'ach_km_500',
      category: 'distancia',
      title: 'Maestro de Kilometraje (500 km)',
      description:
        'Supera los 500 km de distancia acumulada atendiendo entregas en toda la zona.',
      requirementText: 'Acumular 500 km recorridos',
      currentValue: Number(Math.min(500, totalKm).toFixed(1)),
      targetValue: 500,
      unitLabel: 'km',
      progressPct: Math.min(100, Math.round((totalKm / 500) * 100)),
      xpReward: 450,
      freeTripsReward: 15,
      prizeLabel: '15 Viajes Gratis + 450 XP',
      unlocked: totalKm >= 500,
      claimed: claimedIds.has('ach_km_500'),
    },
    {
      id: 'ach_puntualidad',
      category: 'excelencia',
      title: 'Reloj Suizo (Puntualidad ≥ 95%)',
      description:
        'Mantén una tasa de entrega puntual de al menos 95% durante tus primeros 5 viajes o más.',
      requirementText: 'Puntualidad ≥ 95% con mínimo 5 viajes',
      currentValue: completedTrips >= 5 ? Number(onTimeRate.toFixed(1)) : completedTrips,
      targetValue: completedTrips >= 5 ? 95 : 5,
      unitLabel: completedTrips >= 5 ? '%' : 'viajes',
      progressPct:
        completedTrips >= 5
          ? Math.min(100, Math.round((onTimeRate / 95) * 100))
          : Math.min(90, Math.round((completedTrips / 5) * 90)),
      xpReward: 220,
      freeTripsReward: 10,
      prizeLabel: '10 Viajes Gratis + 220 XP',
      unlocked: completedTrips >= 5 && onTimeRate >= 95,
      claimed: claimedIds.has('ach_puntualidad'),
    },
    {
      id: 'ach_estrellas',
      category: 'excelencia',
      title: 'Favorito 5 Estrellas',
      description:
        'Conserva calificación sobresaliente de 4.80 ★ o superior con al menos 3 viajes realizados.',
      requirementText: 'Calificación ≥ 4.80 ★ con mínimo 3 viajes',
      currentValue:
        completedTrips >= 3 ? Number(rating.toFixed(2)) : completedTrips,
      targetValue: completedTrips >= 3 ? 4.8 : 3,
      unitLabel: completedTrips >= 3 ? '★' : 'viajes',
      progressPct:
        completedTrips >= 3
          ? Math.min(100, Math.round((rating / 4.8) * 100))
          : Math.min(90, Math.round((completedTrips / 3) * 90)),
      xpReward: 250,
      freeTripsReward: 10,
      prizeLabel: '10 Viajes Gratis + 250 XP',
      unlocked: completedTrips >= 3 && rating >= 4.8,
      claimed: claimedIds.has('ach_estrellas'),
    },
    {
      id: 'ach_gran_maestro',
      category: 'maestria',
      title: 'Cumbre Gran Maestro',
      description:
        'Alcanza la etapa máxima de Moto Mandados (Gran Maestro · 4,500 XP) y recibe el premio supremo.',
      requirementText: 'Alcanzar Etapa Gran Maestro (4,500 XP)',
      currentValue: Math.min(4500, totalXp),
      targetValue: 4500,
      unitLabel: 'XP',
      progressPct: Math.min(100, Math.round((totalXp / 4500) * 100)),
      xpReward: 500,
      freeTripsReward: 20,
      prizeLabel: '20 Viajes Gratis + Trofeo Gran Maestro',
      unlocked: totalXp >= 4500,
      claimed: claimedIds.has('ach_gran_maestro'),
    },
  ];

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const claimedCount = achievements.filter((a) => a.claimed).length;
  const claimableAchievements = achievements.filter(
    (a) => a.unlocked && !a.claimed
  );
  const claimableStages = stages.filter(
    (s) => s.unlocked && !s.claimed && s.freeTripsBonus > 0
  );

  const pendingClaimCount =
    claimableAchievements.length + claimableStages.length;
  const totalClaimableFreeTrips =
    claimableAchievements.reduce((acc, a) => acc + a.freeTripsReward, 0) +
    claimableStages.reduce((acc, s) => acc + s.freeTripsBonus, 0);

  return {
    totalXp,
    baseActivityXp,
    claimedBonusXp,
    currentStage,
    nextStage,
    stageProgressPct,
    xpToNextStage,
    stages,
    achievements,
    unlockedCount,
    claimedCount,
    pendingClaimCount,
    totalClaimableFreeTrips,
    window12h: {
      anchorMs,
      elapsedMs,
      remainingMs,
      progressPct: window12hPct,
      completed: window12hCompleted,
      elapsedHoursLabel: `${elapsedHours.toFixed(1)} / 12.0 h`,
    },
    freeTripsBalance: Math.max(0, wallet.freeTripsBalance ?? 0),
    freeTripsEarned: Math.max(0, wallet.freeTripsEarned ?? 0),
    freeTripsUsed: Math.max(0, wallet.freeTripsUsed ?? 0),
  };
}
