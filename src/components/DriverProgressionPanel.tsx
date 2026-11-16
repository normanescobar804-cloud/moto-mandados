import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Flame,
  Gift,
  Lock,
  Medal,
  Sparkles,
  Ticket,
  Trophy,
} from 'lucide-react';
import { DriverApplication, RiderProfile, Wallet } from '../types';
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  AchievementCategory,
  ClaimableRewardPayload,
  computeDriverProgression,
} from '../utils/driverProgression';
import { formatCountdownHms } from '../utils/driverVerification';

interface DriverProgressionPanelProps {
  rider: RiderProfile;
  wallet: Wallet;
  application?: DriverApplication | null;
  platformFeePct: number;
  onClaimReward: (payload: ClaimableRewardPayload) => Promise<void>;
  compact?: boolean;
  onOpenFullAchievements?: () => void;
}

export const DriverProgressionPanel: React.FC<DriverProgressionPanelProps> = ({
  rider,
  wallet,
  application = null,
  platformFeePct,
  onClaimReward,
  compact = false,
  onOpenFullAchievements,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [categoryFilter, setCategoryFilter] = useState<'all' | AchievementCategory>('all');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const progression = useMemo(
    () =>
      computeDriverProgression({
        rider,
        wallet,
        application,
        nowMs,
      }),
    [rider, wallet, application, nowMs]
  );

  const filteredAchievements = useMemo(
    () =>
      categoryFilter === 'all'
        ? progression.achievements
        : progression.achievements.filter((a) => a.category === categoryFilter),
    [progression.achievements, categoryFilter]
  );

  const handleClaim = async (payload: ClaimableRewardPayload) => {
    setClaimingId(payload.rewardId);
    try {
      await onClaimReward(payload);
    } finally {
      setClaimingId(null);
    }
  };

  if (compact) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-slate-200 bg-slate-50"
              style={{ color: progression.currentStage.accentHex }}
            >
              {progression.currentStage.id === 'gran_maestro' ? (
                <Crown className="w-5 h-5" />
              ) : (
                <Trophy className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm sm:text-base font-bold text-slate-900">
                  {progression.currentStage.name}
                </span>
                <span className="font-mono tabular-nums text-xs font-semibold text-orange-700">
                  · {progression.totalXp.toLocaleString('es-MX')} XP
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                {progression.nextStage
                  ? `Faltan ${progression.xpToNextStage.toLocaleString('es-MX')} XP para ${progression.nextStage.shortName} (+${progression.nextStage.freeTripsBonus} viajes gratis)`
                  : 'Etapa máxima Gran Maestro alcanzada'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
              <span className="text-emerald-800 font-medium">Viajes Gratis: </span>
              <span className="font-mono tabular-nums font-bold text-emerald-900">
                {progression.freeTripsBalance}
              </span>
              <span className="text-emerald-700 text-[11px] ml-1">(0% com.)</span>
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-600">Comisión estándar: </span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {platformFeePct}%
              </span>
            </div>

            {onOpenFullAchievements && (
              <button
                type="button"
                onClick={onOpenFullAchievements}
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5"
              >
                <Award className="w-3.5 h-3.5 text-orange-400" />
                <span>
                  Ver Logros y Etapas
                  {progression.pendingClaimCount > 0
                    ? ` (${progression.pendingClaimCount} por reclamar)`
                    : ''}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Progreso Bronce → Gran Maestro ({progression.unlockedCount}/
              {progression.achievements.length} logros)
            </span>
            <span className="font-mono tabular-nums font-semibold text-slate-700">
              {progression.stageProgressPct}%
            </span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-md overflow-hidden">
            <div
              className="h-full bg-orange-600 transition-all duration-300"
              style={{ width: `${Math.max(4, progression.stageProgressPct)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Rank Hero & 12h Free-Trip Vault */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-start gap-3.5">
            <div
              className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0"
              style={{ color: progression.currentStage.accentHex }}
            >
              {progression.currentStage.id === 'gran_maestro' ? (
                <Crown className="w-6 h-6" />
              ) : (
                <Trophy className="w-6 h-6" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Progreso y Logros del Conductor · {progression.currentStage.shortName}
                </h3>
                <span className="font-mono tabular-nums text-xs font-bold text-orange-700">
                  {progression.totalXp.toLocaleString('es-MX')} XP totales
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Sube desde <strong>Bronce</strong> hasta <strong>Gran Maestro</strong> completando viajes, kilómetros, puntualidad y ciclos de 12 horas para desbloquear premios y de 10 hasta 20 viajes gratis sin deducción del {platformFeePct}%.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 shrink-0">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
              <div className="text-emerald-800 font-medium flex items-center gap-1">
                <Ticket className="w-3.5 h-3.5" />
                <span>Viajes Gratis</span>
              </div>
              <div className="font-mono tabular-nums text-lg font-bold text-emerald-950 mt-0.5">
                {progression.freeTripsBalance}
              </div>
              <div className="text-[11px] text-emerald-700">
                0% comisión ({progression.freeTripsUsed} usados)
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs">
              <div className="text-amber-800 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Ciclo 12 Horas</span>
              </div>
              <div className="font-mono tabular-nums text-lg font-bold text-amber-950 mt-0.5">
                {progression.window12h.completed
                  ? '12 / 12 h'
                  : formatCountdownHms(progression.window12h.remainingMs)}
              </div>
              <div className="text-[11px] text-amber-800">
                {progression.window12h.completed
                  ? 'Bonos 10-20h listos'
                  : `${progression.window12h.progressPct}% completado`}
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div className="text-slate-600 font-medium flex items-center gap-1">
                <Medal className="w-3.5 h-3.5 text-orange-600" />
                <span>Logros</span>
              </div>
              <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-0.5">
                {progression.unlockedCount} / {progression.achievements.length}
              </div>
              <div className="text-[11px] text-slate-500">
                {progression.pendingClaimCount > 0
                  ? `${progression.pendingClaimCount} premios por reclamar`
                  : 'Todo reclamado al día'}
              </div>
            </div>
          </div>
        </div>

        {/* Experience Progress Bar to Next Stage */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-orange-600" />
              <span>
                {progression.nextStage
                  ? `Siguiente etapa: ${progression.nextStage.name}`
                  : 'Has alcanzado la etapa máxima: Gran Maestro'}
              </span>
            </div>
            <div className="font-mono tabular-nums text-slate-700 font-semibold">
              {progression.nextStage
                ? `${progression.totalXp.toLocaleString('es-MX')} / ${progression.nextStage.minXp.toLocaleString('es-MX')} XP (${progression.stageProgressPct}%)`
                : `${progression.totalXp.toLocaleString('es-MX')} XP · 100%`}
            </div>
          </div>
          <div className="h-3 w-full bg-slate-200 rounded-md overflow-hidden">
            <div
              className="h-full bg-orange-600 transition-all duration-300"
              style={{ width: `${Math.max(4, progression.stageProgressPct)}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Ganas +60 XP por viaje, +6 XP por km recorrido, +150 XP tras 12 horas y bonos por puntualidad/estrellas.
            </span>
            {progression.nextStage && (
              <span className="font-semibold text-emerald-700">
                Premio al subir: +{progression.nextStage.freeTripsBonus} Viajes Gratis
              </span>
            )}
          </div>
        </div>

        {/* 7-Stage Roadmap: Bronce -> Gran Maestro */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-display text-sm font-bold text-slate-900">
              Etapas por Experiencia (Bronce → Gran Maestro)
            </h4>
            <span className="text-[11px] text-slate-500">
              Cada etapa desbloquea viajes gratis sin deducción del {platformFeePct}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {progression.stages.map((stage) => {
              const canClaimStage =
                stage.unlocked && !stage.claimed && stage.freeTripsBonus > 0;
              return (
                <div
                  key={stage.id}
                  className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition-colors ${
                    stage.isCurrent
                      ? 'border-orange-400 bg-orange-50'
                      : stage.unlocked
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="text-[11px] font-mono font-bold uppercase tracking-wide"
                        style={{ color: stage.accentHex }}
                      >
                        Etapa {stage.order}
                      </span>
                      {stage.unlocked ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </div>

                    <div className="font-display text-sm font-bold text-slate-900">
                      {stage.shortName}
                    </div>

                    <div className="font-mono tabular-nums text-[11px] text-slate-600 font-semibold">
                      {stage.minXp.toLocaleString('es-MX')} XP · {stage.recommendedTrips}+ viajes
                    </div>

                    <p className="text-[11px] text-slate-600 leading-snug pt-1">
                      {stage.freeTripsBonus > 0
                        ? `+${stage.freeTripsBonus} Viajes Gratis (0% com.)`
                        : 'Etapa inicial + acceso a bono 12h'}
                    </p>
                  </div>

                  {stage.freeTripsBonus > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      {canClaimStage ? (
                        <button
                          type="button"
                          disabled={claimingId === stage.rewardId}
                          onClick={() =>
                            void handleClaim({
                              rewardId: stage.rewardId,
                              title: stage.prizeTitle,
                              freeTripsToAdd: stage.freeTripsBonus,
                              xpToAdd: 50,
                              nextRank: progression.currentStage.id,
                            })
                          }
                          className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[11px] font-semibold cursor-pointer inline-flex items-center justify-center gap-1"
                        >
                          <Gift className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {claimingId === stage.rewardId
                              ? 'Canjeando...'
                              : `Reclamar +${stage.freeTripsBonus}`}
                          </span>
                        </button>
                      ) : stage.claimed ? (
                        <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Premio reclamado</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          Faltan {Math.max(0, stage.minXp - progression.totalXp).toLocaleString('es-MX')} XP
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detailed Driver Achievements Catalog */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-600 shrink-0" />
              <span>Logros Detallados y Bonos de Viajes Gratis (10 a 20 Viajes tras 12h)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada logro desbloqueado acredita experiencia (XP) y viajes gratis donde no se deduce el {platformFeePct}% de comisión.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: '12_horas', label: 'Bonos 12h' },
                { id: 'experiencia', label: 'Viajes' },
                { id: 'distancia', label: 'Km' },
                { id: 'excelencia', label: 'Calidad' },
                { id: 'maestria', label: 'Gran Maestro' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  categoryFilter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAchievements.map((ach) => {
            const canClaim = ach.unlocked && !ach.claimed;
            return (
              <div
                key={ach.id}
                className={`rounded-xl border p-4 space-y-3 flex flex-col justify-between ${
                  canClaim
                    ? 'border-emerald-300 bg-emerald-50'
                    : ach.claimed
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-[11px] font-semibold text-orange-700 uppercase tracking-wide">
                        {ACHIEVEMENT_CATEGORY_LABELS[ach.category]}
                      </div>
                      <h4 className="font-display text-sm font-bold text-slate-900">
                        {ach.title}
                      </h4>
                    </div>

                    <div className="shrink-0 text-right">
                      {ach.claimed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Reclamado</span>
                        </span>
                      ) : ach.unlocked ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                          <Gift className="w-4 h-4" />
                          <span>Desbloqueado</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                          <Lock className="w-3.5 h-3.5" />
                          <span>En progreso</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {ach.description}
                  </p>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 font-medium">Requisito:</span>
                      <span className="font-semibold text-slate-800 text-right">
                        {ach.requirementText}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 font-medium">Premio:</span>
                      <span className="font-bold text-emerald-700 text-right">
                        {ach.prizeLabel}
                      </span>
                    </div>
                    {ach.countdownLabel && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 font-medium">Reloj 12h:</span>
                        <span className="font-mono tabular-nums font-semibold text-amber-800">
                          {ach.countdownLabel}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono tabular-nums text-slate-600 font-semibold">
                        Progreso: {ach.currentValue} / {ach.targetValue} {ach.unitLabel}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-slate-900">
                        {ach.progressPct}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-200 rounded-md overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          ach.unlocked ? 'bg-emerald-600' : 'bg-orange-600'
                        }`}
                        style={{ width: `${Math.max(4, ach.progressPct)}%` }}
                      />
                    </div>
                  </div>

                  {canClaim && (
                    <button
                      type="button"
                      disabled={claimingId === ach.id}
                      onClick={() =>
                        void handleClaim({
                          rewardId: ach.id,
                          title: ach.title,
                          freeTripsToAdd: ach.freeTripsReward,
                          xpToAdd: ach.xpReward,
                          nextRank: progression.currentStage.id,
                        })
                      }
                      className="w-full min-h-[40px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer inline-flex items-center justify-center gap-1.5"
                    >
                      <Gift className="w-4 h-4" />
                      <span>
                        {claimingId === ach.id
                          ? 'Acreditando bono...'
                          : `Reclamar Premio (+${ach.freeTripsReward} Viajes Gratis y +${ach.xpReward} XP)`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
