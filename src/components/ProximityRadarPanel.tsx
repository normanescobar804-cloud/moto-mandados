import React, { useMemo, useState } from 'react';
import {
  Bike,
  CheckCircle2,
  Compass,
  LocateFixed,
  MessageSquare,
  Radar,
  RotateCcw,
  Star,
  UserCheck,
  X,
} from 'lucide-react';
import { Delivery, RiderProfile } from '../types';
import {
  RADAR_BANDS,
  RADAR_MID_MAX_KM,
  RADAR_NEAR_MAX_KM,
  RadarBand,
  computeBearingDeg,
  estimateEtaMinutes,
  exactRadarDistanceKm,
  formatRadarKm,
  getCardinalLabel,
  getRadarBand,
} from '../utils/radar';
import { SERVICE_CATEGORY_LABELS, formatCurrency } from '../utils/tariffs';
import { UserAvatar } from './MotoBrandMark';
import { ChatTarget } from './ChatDrawer';

interface DriverTargetItem {
  kind: 'delivery';
  id: string;
  delivery: Delivery;
  distanceKm: number;
  tripDistanceKm: number;
  bearingDeg: number;
  cardinal: string;
  etaMinutes: number;
  band: RadarBand;
  isPreferredForMe: boolean;
}

interface PassengerTargetItem {
  kind: 'rider';
  id: string;
  rider: RiderProfile;
  distanceKm: number;
  bearingDeg: number;
  cardinal: string;
  etaMinutes: number;
  band: RadarBand;
}

type RadarTargetItem = DriverTargetItem | PassengerTargetItem;

interface ProximityRadarPanelProps {
  mode: 'driver' | 'passenger';
  observerCoords: { lat: number; lng: number };
  observerLabel: string;
  currency: string;
  currentUserUid: string;
  pendingDeliveries?: Delivery[];
  availableRiders?: RiderProfile[];
  preferredRiderUid?: string;
  onClaimDelivery?: (delivery: Delivery) => Promise<void>;
  onSelectPreferredDriver?: (rider: RiderProfile | null) => void;
  onOpenChat?: (target: ChatTarget) => void;
  onRefreshGps?: () => void;
  gpsRefreshing?: boolean;
}

type RangeFilterKm = 5 | 10 | 25 | 50 | 0; // 0 = Todos

export const ProximityRadarPanel: React.FC<ProximityRadarPanelProps> = ({
  mode,
  observerCoords,
  observerLabel,
  currency,
  currentUserUid,
  pendingDeliveries = [],
  availableRiders = [],
  preferredRiderUid = '',
  onClaimDelivery,
  onSelectPreferredDriver,
  onOpenChat,
  onRefreshGps,
  gpsRefreshing = false,
}) => {
  const [bandFilter, setBandFilter] = useState<'all' | RadarBand>('all');
  const [maxRangeKm, setMaxRangeKm] = useState<RangeFilterKm>(0);
  const [sweepActive, setSweepActive] = useState(true);
  const [omittedIds, setOmittedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const allTargets = useMemo<RadarTargetItem[]>(() => {
    if (mode === 'driver') {
      return pendingDeliveries
        .filter((d) => {
          if (d.status !== 'pending') return false;
          if (omittedIds.includes(d.id)) return false;
          if (d.declinedRiderUids?.includes(currentUserUid)) return false;
          return true;
        })
        .map((del) => {
          const distanceKm = exactRadarDistanceKm(
            observerCoords.lat,
            observerCoords.lng,
            del.pickupLat,
            del.pickupLng
          );
          const tripDistanceKm = exactRadarDistanceKm(
            del.pickupLat,
            del.pickupLng,
            del.dropoffLat,
            del.dropoffLng
          );
          const bearingDeg = computeBearingDeg(
            observerCoords.lat,
            observerCoords.lng,
            del.pickupLat,
            del.pickupLng
          );
          return {
            kind: 'delivery' as const,
            id: del.id,
            delivery: del,
            distanceKm,
            tripDistanceKm,
            bearingDeg,
            cardinal: getCardinalLabel(bearingDeg),
            etaMinutes: estimateEtaMinutes(distanceKm),
            band: getRadarBand(distanceKm),
            isPreferredForMe: del.preferredRiderUid === currentUserUid,
          };
        })
        .sort((a, b) => {
          if (a.isPreferredForMe !== b.isPreferredForMe) {
            return a.isPreferredForMe ? -1 : 1;
          }
          return a.distanceKm - b.distanceKm;
        });
    }

    return availableRiders
      .filter((r) => r.uid !== currentUserUid && r.status !== 'offline')
      .map((rider) => {
        const distanceKm = exactRadarDistanceKm(
          observerCoords.lat,
          observerCoords.lng,
          rider.lat,
          rider.lng
        );
        const bearingDeg = computeBearingDeg(
          observerCoords.lat,
          observerCoords.lng,
          rider.lat,
          rider.lng
        );
        return {
          kind: 'rider' as const,
          id: rider.uid,
          rider,
          distanceKm,
          bearingDeg,
          cardinal: getCardinalLabel(bearingDeg),
          etaMinutes: estimateEtaMinutes(distanceKm),
          band: getRadarBand(distanceKm),
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [
    mode,
    pendingDeliveries,
    availableRiders,
    omittedIds,
    currentUserUid,
    observerCoords.lat,
    observerCoords.lng,
  ]);

  const countsByBand = useMemo(() => {
    const counts = { cercano: 0, intermedio: 0, lejano: 0 };
    for (const item of allTargets) {
      counts[item.band] += 1;
    }
    return counts;
  }, [allTargets]);

  const filteredTargets = useMemo(() => {
    return allTargets.filter((item) => {
      if (bandFilter !== 'all' && item.band !== bandFilter) return false;
      if (maxRangeKm > 0 && item.distanceKm > maxRangeKm) return false;
      return true;
    });
  }, [allTargets, bandFilter, maxRangeKm]);

  const activeSelected = useMemo(() => {
    if (filteredTargets.length === 0) return null;
    return (
      filteredTargets.find((t) => t.id === selectedId) || filteredTargets[0]
    );
  }, [filteredTargets, selectedId]);

  const outerScaleKm = useMemo(() => {
    if (maxRangeKm > 0) return Math.max(maxRangeKm, 8);
    const maxDist = filteredTargets.reduce(
      (acc, t) => Math.max(acc, t.distanceKm),
      10
    );
    return Math.max(12, Math.ceil(maxDist * 1.12));
  }, [filteredTargets, maxRangeKm]);

  const radarSize = 240;
  const center = radarSize / 2;
  const maxRadiusPx = 98;

  const nearRadiusPx = Math.max(
    22,
    Math.min(46, (RADAR_NEAR_MAX_KM / outerScaleKm) * maxRadiusPx)
  );
  const midRadiusPx = Math.max(
    nearRadiusPx + 20,
    Math.min(74, (RADAR_MID_MAX_KM / outerScaleKm) * maxRadiusPx)
  );

  const mapDistanceToRadius = (km: number): number => {
    if (km <= RADAR_NEAR_MAX_KM) {
      return (km / RADAR_NEAR_MAX_KM) * nearRadiusPx;
    }
    if (km <= RADAR_MID_MAX_KM) {
      return (
        nearRadiusPx +
        ((km - RADAR_NEAR_MAX_KM) / (RADAR_MID_MAX_KM - RADAR_NEAR_MAX_KM)) *
          (midRadiusPx - nearRadiusPx)
      );
    }
    const clamped = Math.min(km, outerScaleKm);
    return (
      midRadiusPx +
      ((clamped - RADAR_MID_MAX_KM) /
        Math.max(1, outerScaleKm - RADAR_MID_MAX_KM)) *
        (maxRadiusPx - midRadiusPx)
    );
  };

  const handleAcceptDelivery = async (del: Delivery) => {
    if (!onClaimDelivery || claimingId) return;
    setClaimingId(del.id);
    try {
      await onClaimDelivery(del);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <section
      aria-label={
        mode === 'driver'
          ? 'Radar de pasajeros y solicitudes cercanas'
          : 'Radar de motos disponibles cercanas'
      }
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-orange-600 shrink-0" />
            <h3 className="font-display text-base font-bold text-slate-900">
              {mode === 'driver'
                ? 'Radar de Pasajeros y Solicitudes'
                : 'Radar de Motos Disponibles'}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            Centro: {observerLabel} ({observerCoords.lat.toFixed(4)},{' '}
            {observerCoords.lng.toFixed(4)}) · Distancia real en km
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSweepActive((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <Compass className="w-3.5 h-3.5 text-orange-600" />
            <span>{sweepActive ? 'Pausar Barrido' : 'Reanudar Barrido'}</span>
          </button>
          {onRefreshGps && (
            <button
              type="button"
              disabled={gpsRefreshing}
              onClick={onRefreshGps}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
            >
              <LocateFixed className="w-3.5 h-3.5 text-emerald-600" />
              <span>{gpsRefreshing ? 'Ubicando...' : 'Actualizar GPS'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 3-Band Summary Metrics (Unboxed / crisp tabular counters) */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3 pt-1 border-t border-slate-200">
        {(['cercano', 'intermedio', 'lejano'] as const).map((bandKey) => {
          const meta = RADAR_BANDS[bandKey];
          const isSelected = bandFilter === bandKey;
          return (
            <button
              key={bandKey}
              type="button"
              onClick={() =>
                setBandFilter((prev) => (prev === bandKey ? 'all' : bandKey))
              }
              className={`text-left p-2.5 sm:p-3 rounded-lg border transition-colors cursor-pointer ${
                isSelected
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className={`text-xs font-bold ${meta.textClass}`}>
                  {meta.label}
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: meta.dotColor }}
                  aria-hidden="true"
                />
              </div>
              <div className="font-mono tabular-nums text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
                {countsByBand[bandKey]}
              </div>
              <div className="font-mono tabular-nums text-[11px] text-slate-500">
                {meta.rangeLabel}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `Todos (${allTargets.length})` },
              { id: 'cercano', label: `Cercanos (${countsByBand.cercano})` },
              {
                id: 'intermedio',
                label: `Intermedios (${countsByBand.intermedio})`,
              },
              { id: 'lejano', label: `Lejanos (${countsByBand.lejano})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setBandFilter(tab.id)}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                bandFilter === tab.id
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor={`radar-range-${mode}`}
            className="text-xs font-medium text-slate-500"
          >
            Radio máximo:
          </label>
          <select
            id={`radar-range-${mode}`}
            value={maxRangeKm}
            onChange={(e) => setMaxRangeKm(Number(e.target.value) as RangeFilterKm)}
            className="px-2.5 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white text-xs font-mono font-semibold text-slate-800"
          >
            <option value={5}>5 km</option>
            <option value={10}>10 km</option>
            <option value={25}>25 km</option>
            <option value={50}>50 km</option>
            <option value={0}>Todos (sin límite)</option>
          </select>
        </div>
      </div>

      {/* Main Split: Tactical SVG Radar + Target List */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* SVG Radar Scope */}
        <div className="md:col-span-5 flex flex-col items-center bg-slate-950 rounded-xl p-4 text-slate-100 border border-slate-800">
          <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
            <span>ALCANCE: {maxRangeKm === 0 ? `${outerScaleKm} km` : `${maxRangeKm} km`}</span>
            <span className="tabular-nums text-emerald-400">
              {filteredTargets.length} EN RADAR
            </span>
          </div>

          <svg
            viewBox={`0 0 ${radarSize} ${radarSize}`}
            className="w-full max-w-[236px] aspect-square overflow-visible"
            role="img"
            aria-label="Mapa de radar por zonas de distancia en kilómetros"
          >
            <defs>
              <radialGradient id={`radar-bg-${mode}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0f2922" stopOpacity="0.85" />
                <stop offset="65%" stopColor="#091526" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#050b14" stopOpacity="1" />
              </radialGradient>
              <linearGradient id={`radar-sweep-${mode}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Scope disc */}
            <circle
              cx={center}
              cy={center}
              r={maxRadiusPx + 6}
              fill={`url(#radar-bg-${mode})`}
              stroke="#1e293b"
              strokeWidth="1.5"
            />

            {/* Crosshair axes */}
            <line
              x1={center}
              y1={center - maxRadiusPx}
              x2={center}
              y2={center + maxRadiusPx}
              stroke="#1e3a4c"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <line
              x1={center - maxRadiusPx}
              y1={center}
              x2={center + maxRadiusPx}
              y2={center}
              stroke="#1e3a4c"
              strokeWidth="1"
              strokeDasharray="3 3"
            />

            {/* Outer zone ring (>7 km) */}
            <circle
              cx={center}
              cy={center}
              r={maxRadiusPx}
              fill="none"
              stroke="#38BDF8"
              strokeOpacity="0.38"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
            {/* Intermediate zone ring (2.5 - 7 km) */}
            <circle
              cx={center}
              cy={center}
              r={midRadiusPx}
              fill="none"
              stroke="#F59E0B"
              strokeOpacity="0.5"
              strokeWidth="1.2"
            />
            {/* Near zone ring (<=2.5 km) */}
            <circle
              cx={center}
              cy={center}
              r={nearRadiusPx}
              fill="none"
              stroke="#10B981"
              strokeOpacity="0.65"
              strokeWidth="1.4"
            />

            {/* Cardinal labels */}
            <text
              x={center}
              y={center - maxRadiusPx - 9}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="9"
              fontWeight="700"
            >
              N
            </text>
            <text
              x={center}
              y={center + maxRadiusPx + 14}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="9"
              fontWeight="700"
            >
              S
            </text>
            <text
              x={center + maxRadiusPx + 11}
              y={center + 3}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="9"
              fontWeight="700"
            >
              E
            </text>
            <text
              x={center - maxRadiusPx - 11}
              y={center + 3}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="9"
              fontWeight="700"
            >
              O
            </text>

            {/* Ring distance markers */}
            <text
              x={center + 4}
              y={center - nearRadiusPx + 9}
              fill="#34d399"
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
            >
              2.5km
            </text>
            <text
              x={center + 4}
              y={center - midRadiusPx + 9}
              fill="#fbbf24"
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
            >
              7.0km
            </text>
            <text
              x={center + 4}
              y={center - maxRadiusPx + 9}
              fill="#7dd3fc"
              fontSize="8"
              fontFamily="JetBrains Mono, monospace"
            >
              {outerScaleKm}km
            </text>

            {/* Rotating sweep sector */}
            {sweepActive && (
              <g
                style={{
                  transformOrigin: `${center}px ${center}px`,
                }}
                className="animate-[spin_5s_linear_infinite]"
              >
                <path
                  d={`M ${center} ${center} L ${center} ${
                    center - maxRadiusPx
                  } A ${maxRadiusPx} ${maxRadiusPx} 0 0 1 ${
                    center + maxRadiusPx * 0.65
                  } ${center - maxRadiusPx * 0.76} Z`}
                  fill={`url(#radar-sweep-${mode})`}
                />
                <line
                  x1={center}
                  y1={center}
                  x2={center}
                  y2={center - maxRadiusPx}
                  stroke="#34d399"
                  strokeWidth="1.5"
                  strokeOpacity="0.85"
                />
              </g>
            )}

            {/* Observer center point */}
            <circle cx={center} cy={center} r={5} fill="#EA580C" stroke="#fff" strokeWidth="1.5" />

            {/* Target blips */}
            {filteredTargets.slice(0, 20).map((target) => {
              const rad = ((target.bearingDeg - 90) * Math.PI) / 180;
              const distPx = mapDistanceToRadius(target.distanceKm);
              const x = center + Math.cos(rad) * distPx;
              const y = center + Math.sin(rad) * distPx;
              const isSelected = activeSelected?.id === target.id;
              const color = RADAR_BANDS[target.band].ringColor;

              return (
                <g
                  key={target.id}
                  onClick={() => setSelectedId(target.id)}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`Objetivo a ${formatRadarKm(target.distanceKm)}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(target.id);
                    }
                  }}
                >
                  {isSelected && (
                    <circle
                      cx={x}
                      cy={y}
                      r={10}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="1.4"
                      strokeDasharray="2 2"
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 6 : 4.8}
                    fill={color}
                    stroke="#090e1a"
                    strokeWidth="1.4"
                  />
                </g>
              );
            })}
          </svg>

          {/* Selected Radar Blip Readout */}
          {activeSelected ? (
            <div className="w-full mt-3 pt-2.5 border-t border-slate-800 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white truncate">
                  {activeSelected.kind === 'delivery'
                    ? activeSelected.delivery.customerName || activeSelected.delivery.title
                    : `${activeSelected.rider.displayName} · ${activeSelected.rider.motoName}`}
                </span>
                <span className="font-mono tabular-nums font-bold text-emerald-400 shrink-0">
                  {formatRadarKm(activeSelected.distanceKm)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                <span>
                  {RADAR_BANDS[activeSelected.band].label} · Rumbo{' '}
                  {activeSelected.cardinal} ({activeSelected.bearingDeg}°)
                </span>
                <span>~{activeSelected.etaMinutes} min</span>
              </div>
            </div>
          ) : (
            <div className="w-full mt-3 pt-2.5 border-t border-slate-800 text-[11px] text-slate-400 text-center">
              Sin objetivos en este rango
            </div>
          )}
        </div>

        {/* Radar Targets List with Mutual Optional Accept/Reject Actions */}
        <div className="md:col-span-7 space-y-2.5">
          {mode === 'driver' && omittedIds.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-600">
                Omitiste {omittedIds.length}{' '}
                {omittedIds.length === 1 ? 'solicitud' : 'solicitudes'} de tu radar.
              </span>
              <button
                type="button"
                onClick={() => setOmittedIds([])}
                className="inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Mostrar todas</span>
              </button>
            </div>
          )}

          {filteredTargets.length === 0 ? (
            <div className="py-10 px-4 text-center border border-dashed border-slate-200 rounded-xl space-y-1.5">
              <Radar className="w-6 h-6 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">
                {mode === 'driver'
                  ? 'Sin pasajeros o solicitudes en esta zona del radar'
                  : 'Sin motos activas detectadas en esta zona del radar'}
              </div>
              <p className="text-xs text-slate-500">
                Amplía el radio máximo o cambia el filtro entre Más Cercanos, Intermedios y Lejanos.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white max-h-[420px] overflow-y-auto">
              {filteredTargets.map((item) => {
                const bandMeta = RADAR_BANDS[item.band];
                const isSelected = activeSelected?.id === item.id;

                if (item.kind === 'delivery') {
                  const del = item.delivery;
                  return (
                    <div
                      key={del.id}
                      onClick={() => setSelectedId(del.id)}
                      className={`p-3.5 space-y-2.5 transition-colors cursor-pointer ${
                        isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className={`font-bold ${bandMeta.textClass}`}>
                              {bandMeta.label}
                            </span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span className="font-mono tabular-nums font-bold text-slate-900">
                              A {formatRadarKm(item.distanceKm)}
                            </span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span className="font-mono tabular-nums text-slate-500">
                              ~{item.etaMinutes} min · {item.cardinal}
                            </span>
                            {item.isPreferredForMe && (
                              <>
                                <span aria-hidden="true" className="text-slate-400">·</span>
                                <span className="font-semibold text-orange-600">
                                  Te solicitó directo
                                </span>
                              </>
                            )}
                          </div>
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {del.customerName || 'Pasajero'} ·{' '}
                            {SERVICE_CATEGORY_LABELS[del.serviceCategory || 'delivery']}
                          </div>
                          <div className="text-xs text-slate-600 truncate">
                            Recoger: {del.pickupAddress}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            Destino: {del.dropoffAddress} (recorrido{' '}
                            <span className="font-mono tabular-nums font-semibold">
                              {formatRadarKm(item.tripDistanceKm)}
                            </span>
                            )
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono tabular-nums text-sm font-bold text-emerald-700">
                            +{formatCurrency(del.riderEarnings, currency)}
                          </div>
                          <div className="font-mono tabular-nums text-[11px] text-slate-500">
                            Tarifa {formatCurrency(del.totalFare, currency)}
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex flex-wrap items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOmittedIds((prev) =>
                              prev.includes(del.id) ? prev : [...prev, del.id]
                            )
                          }
                          className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Omitir</span>
                        </button>

                        {onOpenChat && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenChat({ kind: 'delivery', deliveryId: del.id })
                            }
                            className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer whitespace-nowrap"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
                            <span>Chatear</span>
                          </button>
                        )}

                        {onClaimDelivery && (
                          <button
                            type="button"
                            disabled={claimingId === del.id}
                            onClick={() => void handleAcceptDelivery(del)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {claimingId === del.id
                                ? 'Aceptando...'
                                : 'Aceptar Solicitud'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                // Passenger mode: nearby riders
                const rider = item.rider;
                const isPreferred = preferredRiderUid === rider.uid;
                return (
                  <div
                    key={rider.uid}
                    onClick={() => setSelectedId(rider.uid)}
                    className={`p-3.5 space-y-2.5 transition-colors cursor-pointer ${
                      isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <UserAvatar
                          photoUrl={rider.photoUrl}
                          name={rider.displayName}
                          color={rider.motoColor}
                          size={38}
                        />
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className={`font-bold ${bandMeta.textClass}`}>
                              {bandMeta.label}
                            </span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span className="font-mono tabular-nums font-bold text-slate-900">
                              A {formatRadarKm(item.distanceKm)}
                            </span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span className="font-mono tabular-nums text-slate-500">
                              ~{item.etaMinutes} min · {item.cardinal}
                            </span>
                          </div>
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {rider.displayName} · {rider.motoName}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {rider.motoModel} · Placa {rider.motoPlate} ·{' '}
                            {rider.status === 'available'
                              ? 'Disponible ahora'
                              : 'En ruta cercana'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-0.5">
                        <div className="inline-flex items-center gap-1 font-mono tabular-nums text-xs font-bold text-slate-900">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          <span>{rider.rating.toFixed(2)}</span>
                        </div>
                        <div className="font-mono tabular-nums text-[11px] text-slate-500">
                          {rider.completedCount} viajes
                        </div>
                      </div>
                    </div>

                    <div
                      className="flex flex-wrap items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onOpenChat && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenChat({
                              kind: 'direct',
                              peerUid: rider.uid,
                              peerName: rider.displayName,
                              peerMotoName: rider.motoName,
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer whitespace-nowrap"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
                          <span>Chatear</span>
                        </button>
                      )}

                      {onSelectPreferredDriver && (
                        <button
                          type="button"
                          onClick={() =>
                            onSelectPreferredDriver(isPreferred ? null : rider)
                          }
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                            isPreferred
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          }`}
                        >
                          {isPreferred ? (
                            <>
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Moto Elegida (Quitar)</span>
                            </>
                          ) : (
                            <>
                              <Bike className="w-3.5 h-3.5 text-orange-400" />
                              <span>Solicitar a esta Moto</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
