import React, { useEffect, useRef, useState } from 'react';
import {
  Navigation,
  Route as RouteIcon,
  Zap,
  CheckCircle2,
  Play,
  Square,
  LocateFixed,
  Clock,
  ArrowRight,
  AlertTriangle,
  Star,
  Crosshair,
  Wallet as WalletIcon,
  Wifi,
  WifiOff,
  MessageSquare,
  Edit3,
  Check,
  X,
  BellRing,
  Bookmark,
} from 'lucide-react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  ChatMessage,
  Delivery,
  DeliveryStatus,
  Department,
  DriverApplication,
  FrequentRoute,
  FrequentRouteInput,
  Merchant,
  OptimizedRouteState,
  RiderProfile,
  RiderStatus,
  TariffSettings,
  Wallet,
} from '../types';
import { LiveFleetMap } from './LiveFleetMap';
import { MotoUnitIdentity, UserAvatar } from './MotoBrandMark';
import { ChatTarget } from './ChatDrawer';
import { DriverProgressionPanel } from './DriverProgressionPanel';
import { FrequentRoutesSection } from './FrequentRoutesSection';
import { ProximityRadarPanel } from './ProximityRadarPanel';
import { BrowserPushPermission } from '../utils/pushNotifications';
import { ClaimableRewardPayload } from '../utils/driverProgression';
import { exactRadarDistanceKm, formatRadarKm } from '../utils/radar';
import {
  SERVICE_CATEGORY_LABELS,
  STATUS_LABELS,
  formatCurrency,
} from '../utils/tariffs';

interface RiderConsoleProps {
  currentRider: RiderProfile;
  allRiders: RiderProfile[];
  deliveries: Delivery[];
  tariffs: TariffSettings;
  wallet: Wallet;
  departments: Department[];
  merchants: Merchant[];
  selectedDepartmentId: string;
  onSelectDepartment: (id: string) => void;
  onUpdateRiderStatus: (status: RiderStatus) => Promise<void>;
  onUpdateRiderLocation: (coords: {
    lat: number;
    lng: number;
    speedKmh: number;
    heading: number;
  }) => Promise<void>;
  onClaimDelivery: (delivery: Delivery) => Promise<void>;
  onAdvanceDeliveryStatus: (
    delivery: Delivery,
    nextStatus: DeliveryStatus
  ) => Promise<void>;
  onApplyOptimizedOrder: (orderedIds: string[]) => Promise<void>;
  onOpenUrgentModal: () => void;
  onRateDelivery: (delivery: Delivery) => void;
  messages?: ChatMessage[];
  onOpenChat?: (target: ChatTarget) => void;
  onUpdateDeliveryFare?: (delivery: Delivery, newTotalFare: number) => Promise<void>;
  isOffline?: boolean;
  simulatedOffline?: boolean;
  onToggleSimulatedOffline?: () => void;
  pushPermission?: BrowserPushPermission;
  pushSubscribed?: boolean;
  onEnablePush?: () => Promise<void>;
  onTestPush?: () => Promise<unknown>;
  frequentRoutes?: FrequentRoute[];
  onSaveFrequentRoute?: (
    input: FrequentRouteInput,
    existingId?: string
  ) => Promise<void>;
  onDeleteFrequentRoute?: (routeId: string) => Promise<void>;
  onUseFrequentRoute?: (route: FrequentRoute) => void;
  driverApplication?: DriverApplication | null;
  onClaimReward?: (payload: ClaimableRewardPayload) => Promise<void>;
  onOpenAchievements?: () => void;
  onReleaseDelivery?: (delivery: Delivery) => Promise<void>;
}

export const RiderConsole: React.FC<RiderConsoleProps> = ({
  currentRider,
  allRiders,
  deliveries,
  tariffs,
  wallet,
  departments,
  merchants,
  selectedDepartmentId,
  onSelectDepartment,
  onUpdateRiderStatus,
  onUpdateRiderLocation,
  onClaimDelivery,
  onAdvanceDeliveryStatus,
  onApplyOptimizedOrder,
  onOpenUrgentModal,
  onRateDelivery,
  messages = [],
  onOpenChat,
  onUpdateDeliveryFare,
  isOffline = false,
  simulatedOffline = false,
  onToggleSimulatedOffline,
  pushPermission = 'default',
  pushSubscribed = false,
  onEnablePush,
  onTestPush,
  frequentRoutes = [],
  onSaveFrequentRoute,
  onDeleteFrequentRoute,
  onUseFrequentRoute,
  driverApplication = null,
  onClaimReward,
  onOpenAchievements,
  onReleaseDelivery,
}) => {
  const routesLib = useMapsLibrary('routes');
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsRefreshing, setGpsRefreshing] = useState(false);
  const [simulatingGps, setSimulatingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [editingFareId, setEditingFareId] = useState<string | null>(null);
  const [fareDraft, setFareDraft] = useState('');
  const [savingFare, setSavingFare] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [confirmCompleteStop, setConfirmCompleteStop] = useState<Delivery | null>(
    null
  );
  const [completingStop, setCompletingStop] = useState(false);
  const [optimizedRoute, setOptimizedRoute] =
    useState<OptimizedRouteState | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const simStepRef = useRef(0);

  const handleRefreshRadarGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Tu navegador no soporta geolocalización nativa.');
      return;
    }
    setGpsRefreshing(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const speedKmh =
          pos.coords.speed && pos.coords.speed > 0
            ? Number((pos.coords.speed * 3.6).toFixed(1))
            : currentRider.speedKmh;
        const heading =
          pos.coords.heading && !Number.isNaN(pos.coords.heading)
            ? Math.round(pos.coords.heading)
            : currentRider.heading;
        void onUpdateRiderLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speedKmh,
          heading,
        }).finally(() => setGpsRefreshing(false));
      },
      (err) => {
        setGpsError(`GPS: ${err.message}. Puedes usar el simulador de ruta.`);
        setGpsRefreshing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  };

  const myActiveStops = deliveries
    .filter(
      (d) =>
        d.assignedRiderUid === currentRider.uid &&
        d.status !== 'delivered' &&
        d.status !== 'cancelled'
    )
    .sort((a, b) => a.stopOrder - b.stopOrder);

  const pendingQueue = deliveries.filter(
    (d) =>
      d.status === 'pending' &&
      !d.declinedRiderUids?.includes(currentRider.uid) &&
      (selectedDepartmentId === 'all' || d.departmentId === selectedDepartmentId)
  );

  const recentDelivered = deliveries
    .filter(
      (d) =>
        d.status === 'delivered' &&
        (d.assignedRiderUid === currentRider.uid ||
          d.createdByUid === currentRider.uid)
    )
    .slice(0, 4);

  const activeDepartment = departments.find((d) => d.id === selectedDepartmentId);
  const mapCenter = activeDepartment
    ? { lat: activeDepartment.centerLat, lng: activeDepartment.centerLng }
    : { lat: currentRider.lat, lng: currentRider.lng };
  const mapZoom = activeDepartment ? activeDepartment.zoom : 13;

  useEffect(() => {
    if (!confirmCompleteStop || completingStop) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirmCompleteStop(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmCompleteStop, completingStop]);

  // Real browser GPS geolocation watcher
  useEffect(() => {
    if (!gpsActive) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('Tu navegador no soporta geolocalización nativa.');
      setGpsActive(false);
      return;
    }

    setGpsError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const speedKmh =
          pos.coords.speed && pos.coords.speed > 0
            ? Number((pos.coords.speed * 3.6).toFixed(1))
            : 28;
        const heading =
          pos.coords.heading && !Number.isNaN(pos.coords.heading)
            ? Math.round(pos.coords.heading)
            : 45;
        void onUpdateRiderLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speedKmh,
          heading,
        });
      },
      (err) => {
        setGpsError(`GPS: ${err.message}. Puedes usar el simulador de ruta.`);
        setGpsActive(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [gpsActive, onUpdateRiderLocation]);

  // Smooth GPS Route Simulator for desktop / verification testing
  useEffect(() => {
    if (!simulatingGps) return;
    const interval = setInterval(() => {
      simStepRef.current += 1;
      const target = myActiveStops[0];
      const baseLat = currentRider.lat;
      const baseLng = currentRider.lng;

      let nextLat = baseLat + Math.sin(simStepRef.current / 4) * 0.0012;
      let nextLng = baseLng + Math.cos(simStepRef.current / 4) * 0.0012;
      let heading = 90;

      if (target) {
        const dLat = target.dropoffLat - baseLat;
        const dLng = target.dropoffLng - baseLng;
        const dist = Math.hypot(dLat, dLng);
        if (dist > 0.0005) {
          const step = Math.min(0.0018, dist * 0.25);
          nextLat = baseLat + (dLat / dist) * step;
          nextLng = baseLng + (dLng / dist) * step;
          heading = Math.round(
            ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360
          );
        }
      }

      void onUpdateRiderLocation({
        lat: Number(nextLat.toFixed(6)),
        lng: Number(nextLng.toFixed(6)),
        speedKmh: 38.4,
        heading,
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [simulatingGps, currentRider.lat, currentRider.lng, myActiveStops, onUpdateRiderLocation]);

  const handleOptimizeRoute = async () => {
    if (myActiveStops.length === 0) return;
    if (isOffline) {
      setRouteError(
        'Sin conexión a Internet: las paradas locales siguen disponibles y se sincronizarán al reconectar.'
      );
      return;
    }
    setOptimizing(true);
    setRouteError(null);

    const origin = { lat: currentRider.lat, lng: currentRider.lng };
    const lastStop = myActiveStops[myActiveStops.length - 1];
    const intermediates = myActiveStops.slice(0, -1);

    try {
      const res = await fetch('/api/routes/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination: { lat: lastStop.dropoffLat, lng: lastStop.dropoffLng },
          intermediates: intermediates.map((s) => ({
            lat: s.dropoffLat,
            lng: s.dropoffLng,
          })),
          travelMode: 'TWO_WHEELER',
        }),
      });

      if (res.status === 429) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        throw new Error('Cuota de Google Maps Routes alcanzada.');
      }

      const data = await res.json();
      if (res.ok && data?.routes?.[0]) {
        const route = data.routes[0];
        const optIdx: number[] = route.optimizedIntermediateWaypointIndex || [];
        const reorderedIntermediates =
          optIdx.length === intermediates.length
            ? optIdx.map((i) => intermediates[i])
            : intermediates;
        const ordered = [...reorderedIntermediates, lastStop];
        const orderedIds = ordered.map((d) => d.id);

        await onApplyOptimizedOrder(orderedIds);

        const durationSec = parseInt(
          String(route.duration || '0s').replace('s', ''),
          10
        );
        setOptimizedRoute({
          encodedPolyline: route.polyline?.encodedPolyline || '',
          totalDistanceMeters: route.distanceMeters || 0,
          totalDurationSeconds: Number.isNaN(durationSec) ? 0 : durationSec,
          orderedDeliveryIds: orderedIds,
          legDetails: (route.legs || []).map(
            (l: { distanceMeters?: number; duration?: string }) => ({
              distanceMeters: l.distanceMeters || 0,
              durationSeconds: parseInt(
                String(l.duration || '0s').replace('s', ''),
                10
              ),
            })
          ),
          computedAt: Date.now(),
        });
        setOptimizing(false);
        return;
      }

      if (routesLib) {
        const routeResponse = await (routesLib.Route as unknown as {
          computeRoutes: (req: unknown) => Promise<{
            routes?: Array<{
              distanceMeters?: number;
              durationMillis?: number;
              polyline?: { encodedPolyline?: string };
            }>;
          }>;
        }).computeRoutes({
          origin,
          destination: { lat: lastStop.dropoffLat, lng: lastStop.dropoffLng },
          travelMode: 'DRIVING',
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        });

        const first = routeResponse?.routes?.[0];
        if (first) {
          setOptimizedRoute({
            encodedPolyline: first.polyline?.encodedPolyline || '',
            totalDistanceMeters: first.distanceMeters || 0,
            totalDurationSeconds: Math.round((first.durationMillis || 0) / 1000),
            orderedDeliveryIds: myActiveStops.map((d) => d.id),
            legDetails: [],
            computedAt: Date.now(),
          });
          setOptimizing(false);
          return;
        }
      }

      throw new Error(
        data?.error?.message ||
          'No se pudo calcular la ruta óptima en este momento.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al optimizar ruta.';
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setRouteError(msg);
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Rider Unit Identity, Saldo, Rating & Live GPS Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3.5 sm:gap-5">
          <div className="flex items-center gap-3.5">
            <UserAvatar
              photoUrl={currentRider.photoUrl}
              name={currentRider.displayName}
              color={currentRider.motoColor}
              size={44}
            />
            <MotoUnitIdentity
              motoName={currentRider.motoName}
              motoModel={currentRider.motoModel}
              motoPlate={currentRider.motoPlate}
              motoColor={currentRider.motoColor}
              showPhoto
            />
          </div>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" />
          <div className="space-y-0.5">
            <div className="text-xs text-slate-500">
              GPS en vivo · {currentRider.departmentName}
            </div>
            <div className="font-mono tabular-nums text-xs font-semibold text-slate-900">
              {currentRider.lat.toFixed(5)}, {currentRider.lng.toFixed(5)} ·{' '}
              {Math.round(currentRider.speedKmh)} km/h
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" />
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <div className="text-slate-500">Saldo Banpro / LAFISE</div>
              <div className="font-mono tabular-nums font-bold text-slate-900 flex items-center gap-1">
                <WalletIcon className="w-3.5 h-3.5 text-orange-600" />
                {formatCurrency(wallet.balance, tariffs.currency)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Viajes Gratis</div>
              <div className="font-mono tabular-nums font-bold text-emerald-700">
                {wallet.freeTripsBalance ?? 0} (0% com.)
              </div>
            </div>
            <div>
              <div className="text-slate-500">Calificación</div>
              <div className="font-mono tabular-nums font-bold text-slate-900 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                {currentRider.rating.toFixed(2)} ({currentRider.ratingCount || 0})
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full xl:w-auto">
          <div className="w-full sm:w-auto grid grid-cols-3 sm:flex items-center p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'available', label: 'Disponible' },
                { id: 'on_route', label: 'En Ruta' },
                { id: 'offline', label: 'Inactivo' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => void onUpdateRiderStatus(opt.id)}
                className={`px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap text-center ${
                  currentRider.status === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSimulatingGps(false);
                setGpsActive((v) => !v);
              }}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                gpsActive
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <LocateFixed className="w-4 h-4 shrink-0" />
              <span>{gpsActive ? 'GPS Real Activo' : 'Activar GPS'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setGpsActive(false);
                setSimulatingGps((v) => !v);
              }}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                simulatingGps
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {simulatingGps ? (
                <Square className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{simulatingGps ? 'Detener' : 'Simular GPS'}</span>
            </button>

            {onToggleSimulatedOffline && (
              <button
                type="button"
                onClick={onToggleSimulatedOffline}
                className={`col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 px-3 py-2 min-h-[40px] rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  simulatedOffline
                    ? 'bg-amber-600 border-amber-600 text-white'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
                title="Simular pérdida de conexión para probar caché local y sincronización automática"
              >
                {simulatedOffline ? (
                  <WifiOff className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{simulatedOffline ? 'Reconectar Red' : 'Simular Sin Red'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {gpsError && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{gpsError}</span>
        </div>
      )}

      {onEnablePush && pushPermission !== 'unsupported' && (
        <div
          className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
            pushPermission === 'granted'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : pushPermission === 'denied'
              ? 'bg-amber-50 border-amber-200 text-amber-950'
              : 'bg-orange-50 border-orange-200 text-orange-950'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <BellRing className="w-4 h-4 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold">
                {pushPermission === 'granted'
                  ? pushSubscribed
                    ? 'Alertas Push en Segundo Plano Activas (Service Worker + Web Push)'
                    : 'Alertas Push del Navegador Activas (incluso con pestaña inactiva)'
                  : pushPermission === 'denied'
                  ? 'Notificaciones Push bloqueadas en el navegador'
                  : 'Activa las Alertas Push del Navegador para recibir entregas urgentes incluso si cambias de pestaña'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pushPermission === 'default' && (
              <button
                type="button"
                onClick={() => void onEnablePush()}
                className="px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold cursor-pointer whitespace-nowrap"
              >
                Activar Alertas Push
              </button>
            )}
            {pushPermission === 'granted' && onTestPush && (
              <button
                type="button"
                onClick={() => void onTestPush()}
                className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-100 text-emerald-900 font-semibold cursor-pointer whitespace-nowrap"
              >
                Probar Alerta Push
              </button>
            )}
          </div>
        </div>
      )}

      {onClaimReward && (
        <DriverProgressionPanel
          rider={currentRider}
          wallet={wallet}
          application={driverApplication}
          platformFeePct={tariffs.platformFeePct}
          onClaimReward={onClaimReward}
          compact
          onOpenFullAchievements={onOpenAchievements}
        />
      )}

      {/* Live Proximity Radar for Drivers */}
      <ProximityRadarPanel
        mode="driver"
        observerCoords={{ lat: currentRider.lat, lng: currentRider.lng }}
        observerLabel={`${currentRider.motoName} · ${currentRider.departmentName}`}
        currency={tariffs.currency}
        currentUserUid={currentRider.uid}
        pendingDeliveries={pendingQueue}
        onClaimDelivery={onClaimDelivery}
        onOpenChat={onOpenChat}
        onRefreshGps={handleRefreshRadarGps}
        gpsRefreshing={gpsRefreshing}
      />

      {/* Main Split: Integrated Live Map + Stop Queue & Optimizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Mapa de Navegación y Paradas en Tiempo Real
                </h3>
                <p className="text-xs text-slate-500">
                  Unidad {currentRider.motoName} · Comercios afiliados y paradas activas
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectDepartment('all');
                    setFocusTrigger((n) => n + 1);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Crosshair className="w-3.5 h-3.5 text-orange-600" />
                  <span>Centrar en mi Moto</span>
                </button>
                <button
                  type="button"
                  disabled={myActiveStops.length === 0 || optimizing}
                  onClick={handleOptimizeRoute}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RouteIcon className="w-4 h-4 shrink-0" />
                  <span>
                    {optimizing ? 'Optimizando...' : 'Calcular Ruta Óptima'}
                  </span>
                </button>
              </div>
            </div>

            {optimizedRoute && (
              <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-900">
                  Ruta optimizada para motocicleta
                </span>
                <div className="flex items-center gap-4 font-mono tabular-nums text-slate-700">
                  <span>
                    {(optimizedRoute.totalDistanceMeters / 1000).toFixed(2)} km totales
                  </span>
                  <span>
                    {Math.max(1, Math.round(optimizedRoute.totalDurationSeconds / 60))} min estimados
                  </span>
                </div>
              </div>
            )}

            {routeError && (
              <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {routeError}
              </div>
            )}

            <LiveFleetMap
              riders={[currentRider, ...allRiders.filter((r) => r.uid !== currentRider.uid)]}
              deliveries={myActiveStops.length > 0 ? myActiveStops : pendingQueue}
              merchants={merchants.filter(
                (m) =>
                  selectedDepartmentId === 'all' ||
                  m.departmentId === selectedDepartmentId
              )}
              currentRiderUid={currentRider.uid}
              encodedPolyline={optimizedRoute?.encodedPolyline}
              center={mapCenter}
              zoom={mapZoom}
              focusTrigger={focusTrigger}
              currency={tariffs.currency}
              className="h-[280px] sm:h-[380px] lg:h-[460px]"
            />
          </div>
        </div>

        <div className="lg:col-span-5 space-y-5">
          {/* Active Rider Route Queue */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Mis Paradas Activas ({myActiveStops.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Secuencia ordenada de entrega para tu unidad
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenUrgentModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Zap className="w-3.5 h-3.5 text-orange-400" />
                <span>Nueva Solicitud</span>
              </button>
            </div>

            {myActiveStops.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl space-y-2">
                <Navigation className="w-6 h-6 text-slate-400 mx-auto" />
                <div className="text-sm font-medium text-slate-700">
                  Sin paradas activas en este momento
                </div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Toma una solicitud de Delivery, Comercio o Súper Exprés de la cola disponible.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {myActiveStops.map((stop, idx) => {
                  const nextStatus: DeliveryStatus =
                    stop.status === 'assigned'
                      ? 'en_route'
                      : stop.status === 'en_route'
                      ? 'picked_up'
                      : 'delivered';
                  const nextActionLabel =
                    stop.status === 'assigned'
                      ? 'Iniciar Trayecto'
                      : stop.status === 'en_route'
                      ? 'Marcar Recogido'
                      : 'Completar Entrega';

                  return (
                    <div key={stop.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span className="font-mono font-bold text-slate-900">
                              #{idx + 1}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                stop.serviceCategory === 'super_expres' || stop.isUrgent
                                  ? 'text-red-700 font-semibold'
                                  : stop.serviceCategory === 'comercio'
                                  ? 'text-sky-700 font-semibold'
                                  : 'text-slate-600 font-medium'
                              }
                            >
                              {SERVICE_CATEGORY_LABELS[stop.serviceCategory || 'delivery']}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{STATUS_LABELS[stop.status]}</span>
                            <span aria-hidden="true">·</span>
                            <span>{stop.departmentName}</span>
                          </div>
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {stop.title}
                          </div>
                          {stop.merchantName && (
                            <div className="text-xs font-medium text-slate-700 truncate">
                              Comercio: {stop.merchantName}
                              {stop.cashOnDelivery > 0
                                ? ` · Cobrar ${formatCurrency(stop.cashOnDelivery, tariffs.currency)}`
                                : ''}
                            </div>
                          )}
                          <div className="text-xs text-slate-600 truncate">
                            Recoge: {stop.pickupAddress} (
                            <span className="font-mono tabular-nums font-semibold">
                              a{' '}
                              {formatRadarKm(
                                exactRadarDistanceKm(
                                  currentRider.lat,
                                  currentRider.lng,
                                  stop.pickupLat,
                                  stop.pickupLng
                                )
                              )}
                            </span>
                            )
                          </div>
                          <div className="text-xs text-slate-900 font-medium truncate">
                            Entrega: {stop.dropoffAddress}
                          </div>
                          {stop.status === 'assigned' && (
                            <div
                              className={`text-xs font-medium ${
                                stop.passengerAccepted
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {stop.passengerAccepted
                                ? 'Confirmado por pasajero y conductor'
                                : 'Esperando confirmación opcional del pasajero'}
                            </div>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono tabular-nums text-sm font-bold text-emerald-700">
                            +{formatCurrency(stop.riderEarnings, tariffs.currency)}
                          </div>
                          <div className="font-mono tabular-nums text-[11px] text-slate-500">
                            Total {formatCurrency(stop.totalFare, tariffs.currency)} ·{' '}
                            {stop.distanceKm.toFixed(1)} km
                          </div>
                          {stop.customFareEdited && (
                            <div className="text-[10px] font-semibold text-orange-700">
                              Precio editado
                            </div>
                          )}
                        </div>
                      </div>

                      {editingFareId === stop.id && onUpdateDeliveryFare && (
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-700">
                            Precio total ({tariffs.currency}):
                          </span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={10}
                              max={50000}
                              step="5"
                              value={fareDraft}
                              onChange={(e) => setFareDraft(e.target.value)}
                              className="w-24 px-2 py-1 rounded-md border border-slate-300 bg-white text-xs font-mono tabular-nums"
                            />
                            <button
                              type="button"
                              disabled={savingFare}
                              onClick={async () => {
                                const parsed = Number(fareDraft);
                                if (!Number.isFinite(parsed) || parsed < 10) return;
                                setSavingFare(true);
                                try {
                                  await onUpdateDeliveryFare(stop, parsed);
                                  setEditingFareId(null);
                                } finally {
                                  setSavingFare(false);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Guardar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingFareId(null)}
                              className="px-2 py-1 rounded-md border border-slate-300 bg-white text-xs text-slate-600 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-slate-500 truncate">
                          Cliente: {stop.customerName}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {onUpdateDeliveryFare && editingFareId !== stop.id && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFareId(stop.id);
                                setFareDraft(String(stop.totalFare));
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Precio</span>
                            </button>
                          )}
                          {onSaveFrequentRoute && (
                            <button
                              type="button"
                              onClick={() => {
                                void onSaveFrequentRoute({
                                  name: stop.title.slice(0, 80),
                                  serviceCategory: stop.serviceCategory || 'delivery',
                                  serviceType: stop.serviceType || 'standard',
                                  departmentId: stop.departmentId,
                                  departmentName: stop.departmentName,
                                  pickupAddress: stop.pickupAddress,
                                  pickupLat: stop.pickupLat,
                                  pickupLng: stop.pickupLng,
                                  dropoffAddress: stop.dropoffAddress,
                                  dropoffLat: stop.dropoffLat,
                                  dropoffLng: stop.dropoffLng,
                                  defaultCustomerName: stop.customerName || '',
                                  defaultNotes: stop.notes || '',
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                              title="Guardar origen y destino como Ruta Frecuente"
                            >
                              <Bookmark className="w-3.5 h-3.5 text-slate-600" />
                              <span>Guardar Ruta</span>
                            </button>
                          )}
                          {onOpenChat && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenChat({ kind: 'delivery', deliveryId: stop.id })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer whitespace-nowrap"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
                              <span>
                                Chat
                                {messages.filter((m) => m.deliveryId === stop.id).length >
                                0
                                  ? ` (${
                                      messages.filter((m) => m.deliveryId === stop.id)
                                        .length
                                    })`
                                  : ''}
                              </span>
                            </button>
                          )}
                          {stop.status === 'assigned' && onReleaseDelivery && (
                            <button
                              type="button"
                              disabled={releasingId === stop.id}
                              onClick={async () => {
                                setReleasingId(stop.id);
                                try {
                                  await onReleaseDelivery(stop);
                                } finally {
                                  setReleasingId(null);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                              title="Liberar solicitud para que otro conductor del radar pueda tomarla"
                            >
                              <X className="w-3.5 h-3.5 text-red-600" />
                              <span>
                                {releasingId === stop.id ? 'Liberando...' : 'Liberar'}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (nextStatus === 'delivered') {
                                setConfirmCompleteStop(stop);
                              } else {
                                void onAdvanceDeliveryStatus(stop, nextStatus);
                              }
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                              nextStatus === 'delivered'
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-orange-600 hover:bg-orange-700 text-white'
                            }`}
                          >
                            {nextStatus === 'delivered' ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowRight className="w-3.5 h-3.5" />
                            )}
                            <span>{nextActionLabel}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending Dispatch Queue */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-slate-900">
                Solicitudes Disponibles ({pendingQueue.length})
              </h3>
              <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0">
                <Clock className="w-3.5 h-3.5" />
                En tiempo real
              </span>
            </div>

            {pendingQueue.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No hay solicitudes pendientes en el departamento seleccionado.
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {pendingQueue.map((item) => (
                  <div
                    key={item.id}
                    className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span
                          className={
                            item.serviceCategory === 'super_expres' || item.isUrgent
                              ? 'font-semibold text-red-700'
                              : item.serviceCategory === 'comercio'
                              ? 'font-semibold text-sky-700'
                              : 'text-slate-600 font-medium'
                          }
                        >
                          {SERVICE_CATEGORY_LABELS[item.serviceCategory || 'delivery']}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">·</span>
                        <span className="text-slate-500">{item.departmentName}</span>
                        <span aria-hidden="true" className="text-slate-400">·</span>
                        <span className="font-mono tabular-nums text-slate-700 font-semibold">
                          A{' '}
                          {formatRadarKm(
                            exactRadarDistanceKm(
                              currentRider.lat,
                              currentRider.lng,
                              item.pickupLat,
                              item.pickupLng
                            )
                          )}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">·</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          Viaje {item.distanceKm.toFixed(1)} km
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {item.title}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {item.dropoffAddress}
                      </div>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-1.5 shrink-0 pt-1 sm:pt-0">
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-0.5">
                        <span className="font-mono tabular-nums text-xs font-bold text-slate-900">
                          {formatCurrency(item.riderEarnings, tariffs.currency)} netos
                        </span>
                        {item.customFareEdited && (
                          <span className="text-[10px] font-semibold text-orange-700">
                            Oferta cliente
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {onOpenChat && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenChat({ kind: 'delivery', deliveryId: item.id })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-2 sm:py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
                            <span>Chat</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void onClaimDelivery(item)}
                          className="px-3 py-2 sm:py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          Tomar Parada
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Completed + Rating Trigger */}
          {recentDelivered.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Entregas Completadas Recientes
                </h3>
                <span className="text-[11px] text-slate-500">Calificaciones</span>
              </div>
              <div className="divide-y divide-slate-200">
                {recentDelivered.map((del) => (
                  <div
                    key={del.id}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {del.title}
                      </div>
                      <div className="text-slate-500 truncate">
                        {del.departmentName} · +{formatCurrency(del.riderEarnings, tariffs.currency)}
                      </div>
                    </div>
                    {del.rated ? (
                      <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                        Calificada
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRateDelivery(del)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer shrink-0"
                      >
                        <Star className="w-3 h-3 text-amber-500" />
                        <span>Calificar</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Frequent Routes Manager */}
      {onSaveFrequentRoute && onDeleteFrequentRoute && onUseFrequentRoute && (
        <FrequentRoutesSection
          routes={frequentRoutes}
          departments={departments}
          defaultDepartmentId={currentRider.departmentId}
          riderLocation={{ lat: currentRider.lat, lng: currentRider.lng }}
          onSaveRoute={onSaveFrequentRoute}
          onDeleteRoute={onDeleteFrequentRoute}
          onUseRoute={onUseFrequentRoute}
        />
      )}

      {confirmCompleteStop && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-complete-title"
          onClick={() => {
            if (!completingStop) setConfirmCompleteStop(null);
          }}
        >
          <div
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="confirm-complete-title"
                    className="font-display text-base font-bold text-slate-900"
                  >
                    ¿Confirmar entrega completada?
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verifica que entregaste el pedido antes de finalizar
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={completingStop}
                onClick={() => setConfirmCompleteStop(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                aria-label="Cerrar confirmación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 truncate">
                  {confirmCompleteStop.title}
                </span>
                <span className="font-medium text-slate-500 shrink-0">
                  {SERVICE_CATEGORY_LABELS[
                    confirmCompleteStop.serviceCategory || 'delivery'
                  ]}
                </span>
              </div>
              <div className="text-slate-600">
                <span className="font-medium text-slate-700">Cliente:</span>{' '}
                {confirmCompleteStop.customerName}
              </div>
              <div className="text-slate-600">
                <span className="font-medium text-slate-700">Destino:</span>{' '}
                {confirmCompleteStop.dropoffAddress}
              </div>
              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                {(() => {
                  const hasFreeTrip = (wallet.freeTripsBalance ?? 0) > 0;
                  const feeAmount = hasFreeTrip
                    ? 0
                    : Number(
                        (
                          (confirmCompleteStop.totalFare * tariffs.platformFeePct) /
                          100
                        ).toFixed(2)
                      );
                  const netAmount = Number(
                    (confirmCompleteStop.totalFare - feeAmount).toFixed(2)
                  );
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">
                          Tarifa total:{' '}
                          <span className="font-mono tabular-nums font-semibold text-slate-700">
                            {formatCurrency(
                              confirmCompleteStop.totalFare,
                              tariffs.currency
                            )}
                          </span>
                        </span>
                        <span className="font-mono tabular-nums font-bold text-emerald-700">
                          +{formatCurrency(netAmount, tariffs.currency)} netos
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">
                          {hasFreeTrip
                            ? `Viaje Gratis disponible (${wallet.freeTripsBalance} restantes)`
                            : `Deducción plataforma (${tariffs.platformFeePct}% del viaje)`}
                        </span>
                        <span
                          className={`font-mono tabular-nums font-semibold ${
                            hasFreeTrip ? 'text-emerald-700' : 'text-orange-700'
                          }`}
                        >
                          {hasFreeTrip
                            ? '0% · Bono aplicado'
                            : `-${formatCurrency(feeAmount, tariffs.currency)} del saldo`}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {confirmCompleteStop.cashOnDelivery > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2.5 text-xs text-amber-950 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Recuerda cobrar{' '}
                  <strong className="font-mono tabular-nums">
                    {formatCurrency(
                      confirmCompleteStop.cashOnDelivery,
                      tariffs.currency
                    )}
                  </strong>{' '}
                  contra entrega al cliente.
                </span>
              </div>
            )}

            <p className="text-xs text-slate-500 leading-relaxed">
              {(wallet.freeTripsBalance ?? 0) > 0
                ? 'Al confirmar, se aplicará 1 Viaje Gratis (0% comisión) y conservarás el 100% de la tarifa.'
                : `Al confirmar, la entrega quedará completada y se deducirá el ${tariffs.platformFeePct}% de comisión desde tu saldo operativo.`}
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={completingStop}
                onClick={() => setConfirmCompleteStop(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={completingStop}
                onClick={async () => {
                  const target = confirmCompleteStop;
                  if (!target) return;
                  setCompletingStop(true);
                  try {
                    await onAdvanceDeliveryStatus(target, 'delivered');
                    setConfirmCompleteStop(null);
                  } finally {
                    setCompletingStop(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {completingStop ? 'Completando...' : 'Sí, completar entrega'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
