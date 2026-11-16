import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Route as RouteIcon,
  Zap,
  DollarSign,
  Sliders,
  Database,
  Check,
  Store,
  QrCode,
  BarChart3,
  Globe,
  Star,
  Plus,
  CheckCircle2,
  XCircle,
  Flame,
  Crosshair,
  AlertTriangle,
  ShieldCheck,
  Clock,
  FileText,
  CreditCard,
  Phone,
  MapPin,
  Shield,
  Car,
  X,
} from 'lucide-react';
import {
  Delivery,
  DeliveryRating,
  Department,
  DriverApplication,
  Merchant,
  QrTopup,
  RiderProfile,
  ServiceCategory,
  TariffSettings,
  Transaction,
  Wallet,
} from '../types';
import { LiveFleetMap } from './LiveFleetMap';
import { UserAvatar } from './MotoBrandMark';
import {
  SERVICE_CATEGORY_LABELS,
  STATUS_LABELS,
  formatCurrency,
  formatShortDate,
} from '../utils/tariffs';
import {
  HeatmapPointScope,
  HeatmapSourceFilter,
  buildHeatmapPoints,
  computeDemandHotspots,
} from '../utils/demandHeatmap';
import {
  calculateAgeFromIsoDate,
  formatCountdownHms,
  formatDateTimeEs,
  getReviewWindowState,
} from '../utils/driverVerification';
import { getRankStageById } from '../utils/driverProgression';

type AdminSubTab =
  | 'operacion'
  | 'verificacion_conductores'
  | 'comercio_tarifas'
  | 'saldos_qr'
  | 'estadisticas_expansion';

interface AdminDashboardProps {
  riders: RiderProfile[];
  deliveries: Delivery[];
  transactions: Transaction[];
  tariffs: TariffSettings;
  departments: Department[];
  merchants: Merchant[];
  wallets: Wallet[];
  topups: QrTopup[];
  ratings: DeliveryRating[];
  driverApplications?: DriverApplication[];
  onAssignDelivery: (delivery: Delivery, rider: RiderProfile) => Promise<void>;
  onSaveTariffs: (
    next: Omit<TariffSettings, 'updatedBy' | 'updatedAt'>
  ) => Promise<void>;
  onApproveTopup: (topup: QrTopup) => Promise<void>;
  onRejectTopup: (topup: QrTopup) => Promise<void>;
  onApproveDriverApplication?: (
    app: DriverApplication,
    note?: string
  ) => Promise<void>;
  onRejectDriverApplication?: (
    app: DriverApplication,
    reason: string
  ) => Promise<void>;
  onCreateDepartment: (
    dept: Omit<Department, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onToggleDepartmentActive: (dept: Department) => Promise<void>;
  onCreateMerchant: (
    merchant: Omit<Merchant, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onToggleMerchantActive: (merchant: Merchant) => Promise<void>;
  onSeedDemoData: () => Promise<void>;
}

const EXPANSION_PRESETS = [
  { name: 'Departamento Puebla', code: 'PUE', lat: 19.0414, lng: -98.2063, mult: 0.95 },
  { name: 'Departamento Querétaro', code: 'QRO', lat: 20.5888, lng: -100.3899, mult: 1.05 },
  { name: 'Departamento Mérida', code: 'MID', lat: 20.9674, lng: -89.5926, mult: 1.0 },
  { name: 'Departamento Tijuana', code: 'TIJ', lat: 32.5149, lng: -117.0382, mult: 1.15 },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  riders,
  deliveries,
  transactions,
  tariffs,
  departments,
  merchants,
  wallets,
  topups,
  ratings,
  driverApplications = [],
  onAssignDelivery,
  onSaveTariffs,
  onApproveTopup,
  onRejectTopup,
  onApproveDriverApplication,
  onRejectDriverApplication,
  onCreateDepartment,
  onToggleDepartmentActive,
  onCreateMerchant,
  onToggleMerchantActive,
  onSeedDemoData,
}) => {
  const [subTab, setSubTab] = useState<AdminSubTab>('operacion');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [selectedRiderMap, setSelectedRiderMap] = useState<Record<string, string>>({});
  const [seeding, setSeeding] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewBusyUid, setReviewBusyUid] = useState<string | null>(null);
  const [previewDocImage, setPreviewDocImage] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Demand heatmap state
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [heatmapSource, setHeatmapSource] = useState<HeatmapSourceFilter>('all');
  const [heatmapPointScope, setHeatmapPointScope] =
    useState<HeatmapPointScope>('both');
  const [heatmapRadius, setHeatmapRadius] = useState<number>(55);
  const [focusedHotspot, setFocusedHotspot] = useState<{
    id: string;
    lat: number;
    lng: number;
    zoom: number;
    trigger: number;
  } | null>(null);

  // Tariff editor state
  const [baseFare, setBaseFare] = useState(String(tariffs.baseFare));
  const [perKmRate, setPerKmRate] = useState(String(tariffs.perKmRate));
  const [urgentMultiplier, setUrgentMultiplier] = useState(
    String(tariffs.urgentMultiplier)
  );
  const [expressFixedSurcharge, setExpressFixedSurcharge] = useState(
    String(tariffs.expressFixedSurcharge)
  );
  const [platformFeePct, setPlatformFeePct] = useState(
    String(tariffs.platformFeePct)
  );
  const [savingTariffs, setSavingTariffs] = useState(false);
  const [tariffSavedMsg, setTariffSavedMsg] = useState(false);

  // New Merchant form state
  const [mName, setMName] = useState('');
  const [mCategory, setMCategory] = useState('Restaurante y Café');
  const [mDeptId, setMDeptId] = useState(departments[0]?.id || 'dept_centro');
  const [mAddress, setMAddress] = useState('');
  const [mLat, setMLat] = useState('19.4326');
  const [mLng, setMLng] = useState('-99.1332');
  const [savingMerchant, setSavingMerchant] = useState(false);

  // New Department form state
  const [dName, setDName] = useState('');
  const [dCode, setDCode] = useState('');
  const [dLat, setDLat] = useState('20.5888');
  const [dLng, setDLng] = useState('-100.3899');
  const [dZoom, setDZoom] = useState('12.5');
  const [dMult, setDMult] = useState('1.05');
  const [savingDept, setSavingDept] = useState(false);

  useEffect(() => {
    setBaseFare(String(tariffs.baseFare));
    setPerKmRate(String(tariffs.perKmRate));
    setUrgentMultiplier(String(tariffs.urgentMultiplier));
    setExpressFixedSurcharge(String(tariffs.expressFixedSurcharge));
    setPlatformFeePct(String(tariffs.platformFeePct));
  }, [tariffs]);

  useEffect(() => {
    if (departments.length > 0 && !departments.some((d) => d.id === mDeptId)) {
      setMDeptId(departments[0].id);
    }
  }, [departments, mDeptId]);

  const filteredRiders = useMemo(
    () =>
      deptFilter === 'all'
        ? riders
        : riders.filter((r) => r.departmentId === deptFilter),
    [riders, deptFilter]
  );

  const filteredDeliveries = useMemo(
    () =>
      deptFilter === 'all'
        ? deliveries
        : deliveries.filter((d) => d.departmentId === deptFilter),
    [deliveries, deptFilter]
  );

  const activeRiders = filteredRiders.filter((r) => r.status !== 'offline');
  const inProgressDeliveries = filteredDeliveries.filter((d) =>
    ['assigned', 'en_route', 'picked_up'].includes(d.status)
  );
  const urgentPending = filteredDeliveries.filter(
    (d) => d.status === 'pending' && (d.isUrgent || d.serviceCategory === 'super_expres')
  );
  const totalGrossRevenue = transactions
    .filter((t) => deptFilter === 'all' || t.departmentId === deptFilter)
    .reduce((acc, t) => acc + t.grossAmount, 0);

  const pendingTopups = topups.filter((t) => t.status === 'pending');

  useEffect(() => {
    if (subTab !== 'verificacion_conductores') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [subTab]);

  const filteredDriverApplications = useMemo(() => {
    const base =
      deptFilter === 'all'
        ? driverApplications
        : driverApplications.filter((a) => a.departmentId === deptFilter);
    const rank: Record<string, number> = {
      pending_review: 0,
      rejected: 1,
      approved: 2,
    };
    return [...base].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  }, [driverApplications, deptFilter]);

  const pendingDriverApps = driverApplications.filter(
    (a) => a.status === 'pending_review'
  );

  const selectedDeptObj = departments.find((d) => d.id === deptFilter);
  const mapCenter = selectedDeptObj
    ? { lat: selectedDeptObj.centerLat, lng: selectedDeptObj.centerLng }
    : riders[0]
    ? { lat: riders[0].lat, lng: riders[0].lng }
    : { lat: 19.4326, lng: -99.1332 };
  const mapZoom = selectedDeptObj ? selectedDeptObj.zoom : 12;

  const heatmapPoints = useMemo(
    () =>
      buildHeatmapPoints(
        filteredDeliveries,
        heatmapSource,
        heatmapPointScope
      ),
    [filteredDeliveries, heatmapSource, heatmapPointScope]
  );

  const demandHotspots = useMemo(
    () =>
      computeDemandHotspots(
        filteredDeliveries,
        filteredRiders,
        heatmapSource,
        heatmapPointScope
      ),
    [filteredDeliveries, filteredRiders, heatmapSource, heatmapPointScope]
  );

  useEffect(() => {
    setFocusedHotspot(null);
  }, [deptFilter]);

  // Analytics metrics
  const verticalStats = useMemo(() => {
    const categories: ServiceCategory[] = [
      'pasajero',
      'delivery',
      'comercio',
      'super_expres',
    ];
    return categories.map((cat) => {
      const catDel = deliveries.filter(
        (d) => (d.serviceCategory || 'delivery') === cat
      );
      const catTx = transactions.filter(
        (t) => (t.serviceCategory || 'delivery') === cat
      );
      const rev = catTx.reduce((sum, t) => sum + t.grossAmount, 0);
      return {
        category: cat,
        label: SERVICE_CATEGORY_LABELS[cat],
        count: catDel.length,
        delivered: catDel.filter((d) => d.status === 'delivered').length,
        revenue: rev,
      };
    });
  }, [deliveries, transactions]);

  const deptStats = useMemo(() => {
    return departments.map((dept) => {
      const count = deliveries.filter((d) => d.departmentId === dept.id).length;
      const riderCount = riders.filter((r) => r.departmentId === dept.id).length;
      const rev = transactions
        .filter((t) => t.departmentId === dept.id)
        .reduce((acc, t) => acc + t.grossAmount, 0);
      return { dept, count, riderCount, rev };
    });
  }, [departments, deliveries, riders, transactions]);

  const riderLeaderboard = useMemo(() => {
    return [...riders]
      .map((r) => {
        const rRatings = ratings.filter((rt) => rt.riderUid === r.uid);
        const avg =
          rRatings.length > 0
            ? rRatings.reduce((acc, rt) => acc + rt.score, 0) / rRatings.length
            : r.rating;
        return {
          rider: r,
          avgRating: avg,
          reviewCount: rRatings.length || r.ratingCount || 0,
        };
      })
      .sort((a, b) => b.avgRating - a.avgRating || b.rider.completedCount - a.rider.completedCount);
  }, [riders, ratings]);

  const handleTariffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTariffs(true);
    try {
      await onSaveTariffs({
        baseFare: Math.max(0, Number(baseFare) || 0),
        perKmRate: Math.max(0, Number(perKmRate) || 0),
        urgentMultiplier: Math.min(5, Math.max(1, Number(urgentMultiplier) || 1)),
        expressFixedSurcharge: Math.max(0, Number(expressFixedSurcharge) || 0),
        platformFeePct: Math.min(50, Math.max(0, Number(platformFeePct) || 0)),
        currency: tariffs.currency || 'MXN',
      });
      setTariffSavedMsg(true);
      setTimeout(() => setTariffSavedMsg(false), 3000);
    } finally {
      setSavingTariffs(false);
    }
  };

  const handleMerchantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mName.trim() || !mAddress.trim()) return;
    const dept = departments.find((d) => d.id === mDeptId) || departments[0];
    setSavingMerchant(true);
    try {
      await onCreateMerchant({
        name: mName.trim().slice(0, 100),
        category: mCategory.trim().slice(0, 60) || 'Comercio General',
        departmentId: dept?.id || 'dept_centro',
        departmentName: dept?.name || 'Departamento Centro',
        address: mAddress.trim().slice(0, 240),
        lat: Number(mLat) || dept?.centerLat || 19.4326,
        lng: Number(mLng) || dept?.centerLng || -99.1332,
        active: true,
      });
      setMName('');
      setMAddress('');
    } finally {
      setSavingMerchant(false);
    }
  };

  const handleDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dName.trim() || !dCode.trim()) return;
    setSavingDept(true);
    try {
      await onCreateDepartment({
        name: dName.trim().slice(0, 80),
        code: dCode.trim().toUpperCase().slice(0, 16),
        centerLat: Number(dLat) || 19.4326,
        centerLng: Number(dLng) || -99.1332,
        zoom: Math.min(18, Math.max(8, Number(dZoom) || 12.5)),
        baseFareMultiplier: Math.min(3, Math.max(0.5, Number(dMult) || 1.0)),
        active: true,
      });
      setDName('');
      setDCode('');
    } finally {
      setSavingDept(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation & Department Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              {
                id: 'operacion',
                label: 'Operación y Mapa',
                icon: <RouteIcon className="w-3.5 h-3.5" />,
              },
              {
                id: 'verificacion_conductores',
                label: `Conductores${pendingDriverApps.length > 0 ? ` (${pendingDriverApps.length})` : ''}`,
                icon: <ShieldCheck className="w-3.5 h-3.5" />,
              },
              {
                id: 'comercio_tarifas',
                label: 'Comercios y Tarifas',
                icon: <Store className="w-3.5 h-3.5" />,
              },
              {
                id: 'saldos_qr',
                label: `Saldos, QR y Bancos${pendingTopups.length > 0 ? ` (${pendingTopups.length})` : ''}`,
                icon: <QrCode className="w-3.5 h-3.5" />,
              },
              {
                id: 'estadisticas_expansion',
                label: 'Estadísticas y Expansión',
                icon: <BarChart3 className="w-3.5 h-3.5" />,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                subTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
            aria-label="Filtrar panel por departamento"
          >
            <option value="all">Toda la Red ({departments.length} deptos)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: OPERACIÓN Y MAPA */}
      {subTab === 'operacion' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Unidades Activas</span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                {activeRiders.length} / {filteredRiders.length}
              </div>
              <div className="text-xs text-slate-500">En línea con GPS activo</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Entregas en Curso</span>
                <RouteIcon className="w-4 h-4 text-slate-400" />
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                {inProgressDeliveries.length}
              </div>
              <div className="text-xs text-slate-500">
                {filteredDeliveries.filter((d) => d.status === 'delivered').length} completadas
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Cola Súper Exprés</span>
                <Zap className="w-4 h-4 text-orange-600" />
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-orange-600">
                {urgentPending.length}
              </div>
              <div className="text-xs text-slate-500">
                Solicitudes prioritarias sin asignar
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Facturación Bruta</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                {formatCurrency(totalGrossRevenue, tariffs.currency)}
              </div>
              <div className="text-xs text-slate-500">
                {pendingTopups.length} recargas pendientes (QR/Banco)
              </div>
            </div>
          </div>

          {deliveries.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Inicializar Flota y Entregas de Demostración
                </h3>
                <p className="text-xs text-slate-600">
                  Genera entregas de Delivery, Comercio y Súper Exprés, calificaciones y transacciones iniciales en Firestore.
                </p>
              </div>
              <button
                type="button"
                disabled={seeding}
                onClick={async () => {
                  setSeeding(true);
                  try {
                    await onSeedDemoData();
                  } finally {
                    setSeeding(false);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Database className="w-4 h-4 text-orange-400" />
                <span>{seeding ? 'Cargando datos...' : 'Cargar Rutas de Prueba'}</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Mapa Operativo y Mapa de Calor
                  </h3>
                  <p className="text-xs text-slate-500">
                    Zonas de demanda histórica y activa junto a unidades GPS en línea ({activeRiders.length} activas)
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {focusedHotspot && (
                    <button
                      type="button"
                      onClick={() => setFocusedHotspot(null)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                    >
                      Vista General
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowHeatmap((prev) => !prev)}
                    aria-pressed={showHeatmap}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      showHeatmap
                        ? 'bg-orange-600 border-orange-600 text-white hover:bg-orange-700'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>{showHeatmap ? 'Mapa de Calor Activo' : 'Activar Calor'}</span>
                  </button>
                </div>
              </div>

              {showHeatmap && (
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        { id: 'all', label: 'Histórico + Activo' },
                        { id: 'active', label: 'Solo Activas' },
                        { id: 'historical', label: 'Solo Históricas' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setHeatmapSource(opt.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          heatmapSource === opt.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={heatmapPointScope}
                      onChange={(e) =>
                        setHeatmapPointScope(e.target.value as HeatmapPointScope)
                      }
                      aria-label="Puntos del mapa de calor"
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                    >
                      <option value="both">Origen y Destino</option>
                      <option value="pickup">Solo Recogidas</option>
                      <option value="dropoff">Solo Destinos</option>
                    </select>

                    <select
                      value={String(heatmapRadius)}
                      onChange={(e) => setHeatmapRadius(Number(e.target.value))}
                      aria-label="Radio del mapa de calor"
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                    >
                      <option value="40">Radio Compacto</option>
                      <option value="55">Radio Medio</option>
                      <option value="75">Radio Amplio</option>
                    </select>
                  </div>
                </div>
              )}

              <LiveFleetMap
                riders={filteredRiders}
                deliveries={filteredDeliveries}
                merchants={merchants.filter(
                  (m) => deptFilter === 'all' || m.departmentId === deptFilter
                )}
                heatmapPoints={heatmapPoints}
                showHeatmap={showHeatmap}
                heatmapRadius={heatmapRadius}
                center={
                  focusedHotspot
                    ? { lat: focusedHotspot.lat, lng: focusedHotspot.lng }
                    : mapCenter
                }
                zoom={focusedHotspot ? focusedHotspot.zoom : mapZoom}
                focusTrigger={focusedHotspot?.trigger || 0}
                currency={tariffs.currency}
                className="h-[430px]"
              />

              {/* Hotspot Coverage Breakdown */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-display text-sm font-bold text-slate-900">
                      Zonas de Alta Demanda y Cobertura de Flota
                    </h4>
                    <p className="text-xs text-slate-500">
                      Concentración de envíos vs. repartidores en línea dentro de 3.5 km
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-xs text-slate-500">
                    {demandHotspots.length} zonas
                  </span>
                </div>

                {demandHotspots.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    Aún no hay suficientes entregas con coordenadas para detectar zonas de calor en este filtro.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {demandHotspots.map((hotspot) => {
                      const isFocused = focusedHotspot?.id === hotspot.id;
                      return (
                        <div
                          key={hotspot.id}
                          className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-semibold text-slate-900 truncate">
                              {hotspot.zoneName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {hotspot.departmentName} · {hotspot.totalCount}{' '}
                              {hotspot.totalCount === 1 ? 'entrega' : 'entregas'} ({hotspot.activeCount} activas / {hotspot.historicalCount} hist.) ·{' '}
                              {hotspot.nearbyAvailableRiders}{' '}
                              {hotspot.nearbyAvailableRiders === 1
                                ? 'moto cerca'
                                : 'motos cerca'}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={`inline-flex items-center gap-1 font-semibold ${
                                hotspot.status === 'critical'
                                  ? 'text-red-700'
                                  : hotspot.status === 'high'
                                  ? 'text-orange-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {hotspot.status === 'critical' ? (
                                <>
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>Sin Cobertura</span>
                                </>
                              ) : hotspot.status === 'high' ? (
                                <>
                                  <Flame className="w-3.5 h-3.5" />
                                  <span>Alta Demanda</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Cubierta</span>
                                </>
                              )}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                setFocusedHotspot({
                                  id: hotspot.id,
                                  lat: hotspot.lat,
                                  lng: hotspot.lng,
                                  zoom: 14,
                                  trigger: Date.now(),
                                })
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                                isFocused
                                  ? 'bg-slate-900 border-slate-900 text-white'
                                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <Crosshair className="w-3 h-3" />
                              <span>{isFocused ? 'Enfocada' : 'Enfocar'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Progreso por Motociclista
                </h3>
                <p className="text-xs text-slate-500">
                  Velocidad GPS, calificación y carga por departamento
                </p>
              </div>

              <div className="divide-y divide-slate-200">
                {filteredRiders.map((rider) => {
                  const riderStops = deliveries.filter(
                    (d) =>
                      d.assignedRiderUid === rider.uid &&
                      d.status !== 'delivered' &&
                      d.status !== 'cancelled'
                  );
                  const riderDone = deliveries.filter(
                    (d) =>
                      d.assignedRiderUid === rider.uid && d.status === 'delivered'
                  );
                  const totalWorkload = riderStops.length + riderDone.length;
                  const pct =
                    totalWorkload > 0
                      ? Math.round((riderDone.length / totalWorkload) * 100)
                      : 100;

                  return (
                    <div key={rider.uid} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            photoUrl={rider.photoUrl}
                            name={rider.displayName}
                            color={rider.motoColor}
                            size={36}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {rider.motoName}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              {rider.displayName} · {rider.departmentName}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold text-slate-900">
                            ★ {rider.rating.toFixed(1)} ·{' '}
                            {rider.status === 'available'
                              ? 'Disponible'
                              : rider.status === 'on_route'
                              ? 'En Ruta'
                              : 'Inactivo'}
                          </div>
                          <div className="font-mono tabular-nums text-[11px] text-slate-500">
                            {Math.round(rider.speedKmh)} km/h
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>
                            {riderStops.length} activas · {riderDone.length} entregadas
                          </span>
                          <span className="font-mono tabular-nums font-semibold text-slate-700">
                            {pct}% progreso
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-orange-600 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Monitor de Despacho y Asignación
                </h3>
                <p className="text-xs text-slate-500">
                  Asigna pedidos de Delivery, Comercio o Súper Exprés a las unidades disponibles
                </p>
              </div>
              <span className="font-mono tabular-nums text-xs text-slate-500">
                {filteredDeliveries.length} registros
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50">
                    <th className="py-2.5 px-4">Envío / Vertical</th>
                    <th className="py-2.5 px-3">Departamento</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3">Unidad</th>
                    <th className="py-2.5 px-3 text-right">Importe</th>
                    <th className="py-2.5 px-4 text-right">Asignación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredDeliveries.slice(0, 15).map((del) => {
                    const chosenRiderId =
                      selectedRiderMap[del.id] || riders[0]?.uid || '';
                    const chosenRider = riders.find((r) => r.uid === chosenRiderId);

                    return (
                      <tr key={del.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 max-w-[260px]">
                          <div className="font-semibold text-slate-900 truncate">
                            {del.title}
                          </div>
                          <div className="text-slate-500 truncate">
                            {SERVICE_CATEGORY_LABELS[del.serviceCategory || 'delivery']}
                            {del.merchantName ? ` · ${del.merchantName}` : ''} ·{' '}
                            {del.dropoffAddress}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {formatShortDate(del.createdAt)} ·{' '}
                            <span className="font-mono tabular-nums">
                              {del.distanceKm.toFixed(1)} km
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-slate-700">
                          {del.departmentName}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              del.status === 'delivered'
                                ? 'text-emerald-700'
                                : del.status === 'pending'
                                ? 'text-orange-700'
                                : del.status === 'cancelled'
                                ? 'text-slate-400'
                                : 'text-slate-900'
                            }`}
                          >
                            {STATUS_LABELS[del.status]}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-slate-700">
                          {del.assignedMotoName || 'Sin asignar'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatCurrency(del.totalFare, tariffs.currency)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {del.status === 'pending' && riders.length > 0 ? (
                            <div className="inline-flex items-center gap-1.5">
                              <select
                                value={chosenRiderId}
                                onChange={(e) =>
                                  setSelectedRiderMap((prev) => ({
                                    ...prev,
                                    [del.id]: e.target.value,
                                  }))
                                }
                                className="px-2 py-1 rounded-md border border-slate-300 bg-white text-xs text-slate-800"
                              >
                                {riders.map((r) => (
                                  <option key={r.uid} value={r.uid}>
                                    {r.motoName}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  chosenRider &&
                                  void onAssignDelivery(del, chosenRider)
                                }
                                className="px-2.5 py-1 rounded-md bg-orange-600 hover:bg-orange-700 text-white font-semibold cursor-pointer"
                              >
                                Asignar
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COMERCIOS Y TARIFAS */}
      {subTab === 'comercio_tarifas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <Store className="w-4 h-4 text-orange-600 shrink-0" />
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Registrar Nuevo Comercio Afiliado
                  </h3>
                  <p className="text-xs text-slate-500">
                    Habilita tiendas, farmacias y restaurantes para despacho directo
                  </p>
                </div>
              </div>

              <form onSubmit={handleMerchantSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Nombre del Comercio"
                    value={mName}
                    onChange={(e) => setMName(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Giro (ej. Farmacia)"
                    value={mCategory}
                    onChange={(e) => setMCategory(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                  <select
                    value={mDeptId}
                    onChange={(e) => setMDeptId(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Dirección completa"
                    value={mAddress}
                    onChange={(e) => setMAddress(e.target.value)}
                    className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="Latitud"
                    value={mLat}
                    onChange={(e) => setMLat(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="Longitud"
                    value={mLng}
                    onChange={(e) => setMLng(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingMerchant}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{savingMerchant ? 'Guardando...' : 'Agregar Comercio'}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Directorio de Comercios ({merchants.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-200">
                {merchants.map((m) => (
                  <div
                    key={m.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {m.name}
                      </div>
                      <div className="text-slate-500 truncate">
                        {m.category} · {m.departmentName} · {m.address}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onToggleMerchantActive(m)}
                      className={`px-2.5 py-1 rounded-md border font-semibold cursor-pointer shrink-0 ${
                        m.active
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      {m.active ? 'Activo' : 'Pausado'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Global Tariff Settings */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Sliders className="w-4 h-4 text-orange-600 shrink-0" />
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Configuración de Tarifas Globales
                </h3>
                <p className="text-xs text-slate-500">
                  Reglas base aplicadas en todos los departamentos ({tariffs.currency})
                </p>
              </div>
            </div>

            <form onSubmit={handleTariffSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tarifa Base
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={baseFare}
                    onChange={(e) => setBaseFare(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Costo por Km
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={perKmRate}
                    onChange={(e) => setPerKmRate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mult. Urgente
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="1"
                    max="5"
                    value={urgentMultiplier}
                    onChange={(e) => setUrgentMultiplier(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recargo Express
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={expressFixedSurcharge}
                    onChange={(e) => setExpressFixedSurcharge(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Comisión Plataforma (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="50"
                  value={platformFeePct}
                  onChange={(e) => setPlatformFeePct(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Estándar Moto Mandados: 5% de deducción por viaje (0% cuando el conductor aplica un Viaje Gratis).
                </p>
              </div>

              <button
                type="submit"
                disabled={savingTariffs}
                className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
              >
                {tariffSavedMsg ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Tarifas Actualizadas</span>
                  </>
                ) : (
                  <span>
                    {savingTariffs ? 'Guardando...' : 'Actualizar Sistema de Tarifas'}
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: SALDOS Y RECARGAS QR */}
      {subTab === 'saldos_qr' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Validación de Recargas (Banpro Nicaragua, LAFISE y QR)
                </h3>
                <p className="text-xs text-slate-500">
                  {pendingTopups.length} pendientes de acreditación · {topups.length} totales
                </p>
              </div>
            </div>

            {topups.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Aún no hay solicitudes de recarga registradas.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-4">Folio / Método</th>
                      <th className="py-2.5 px-3">Unidad / Repartidor</th>
                      <th className="py-2.5 px-3 text-right">Monto</th>
                      <th className="py-2.5 px-3">Estado</th>
                      <th className="py-2.5 px-4 text-right">Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {topups.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-mono font-semibold text-slate-900">
                            {t.referenceCode}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {t.method === 'bank_transfer'
                              ? `Banco: ${t.bankName} •••• ${t.accountLast4}${
                                  t.transferReference ? ` · Ref: ${t.transferReference}` : ''
                                }`
                              : 'Código QR'}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">{t.motoName}</div>
                          <div className="text-slate-500">{t.riderName}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatCurrency(t.amount, tariffs.currency)}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`font-semibold ${
                              t.status === 'approved'
                                ? 'text-emerald-700'
                                : t.status === 'rejected'
                                ? 'text-red-700'
                                : 'text-orange-700'
                            }`}
                          >
                            {t.status === 'approved'
                              ? 'Acreditada'
                              : t.status === 'rejected'
                              ? 'Rechazada'
                              : 'Pendiente'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {t.status === 'pending' ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void onApproveTopup(t)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Aprobar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void onRejectTopup(t)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-200 text-red-700 hover:bg-red-50 font-semibold cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Rechazar</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400">Auditada</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">
                Saldos de Billeteras de Flota
              </h3>
              <p className="text-xs text-slate-500">
                Balance operativo, etapa de conductor, viajes gratis y deducciones del 5%
              </p>
            </div>
            <div className="divide-y divide-slate-200">
              {riders.map((r) => {
                const w = wallets.find((item) => item.uid === r.uid);
                const stage = getRankStageById(w?.currentRank);
                return (
                  <div
                    key={r.uid}
                    className="px-5 py-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {r.motoName}
                      </div>
                      <div className="text-slate-500 truncate">
                        {r.displayName} · {r.departmentName}
                      </div>
                      <div className="text-[11px] font-medium text-slate-600 mt-0.5 flex flex-wrap items-center gap-2">
                        <span style={{ color: stage.accentHex }} className="font-semibold">
                          Etapa {stage.shortName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 font-semibold">
                          {w?.freeTripsBalance ?? 0} viajes gratis
                        </span>
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-bold text-slate-900">
                        {formatCurrency(w?.balance || 0, tariffs.currency)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Recargas: {formatCurrency(w?.totalTopups || 0, tariffs.currency)}
                      </div>
                      <div className="text-[11px] text-orange-700">
                        Ded. 5%: {formatCurrency(w?.totalFeesDeducted || 0, tariffs.currency)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ESTADÍSTICAS AVANZADAS Y EXPANSIÓN A DEPARTAMENTOS */}
      {subTab === 'estadisticas_expansion' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Breakdown by Service Vertical */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Estadísticas por Vertical de Servicio
                </h3>
                <p className="text-xs text-slate-500">
                  Comparativa entre Delivery, Comercio y Súper Exprés
                </p>
              </div>
              <div className="space-y-4">
                {verticalStats.map((v) => {
                  const maxRev = Math.max(
                    100,
                    ...verticalStats.map((x) => x.revenue)
                  );
                  const pct = Math.round((v.revenue / maxRev) * 100);
                  return (
                    <div key={v.category} className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">
                          {v.label}
                        </span>
                        <span className="font-mono tabular-nums text-slate-700">
                          {v.count} envíos ({v.delivered} entregados) ·{' '}
                          <strong className="text-slate-900">
                            {formatCurrency(v.revenue, tariffs.currency)}
                          </strong>
                        </span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            v.category === 'super_expres'
                              ? 'bg-orange-600'
                              : v.category === 'comercio'
                              ? 'bg-sky-600'
                              : 'bg-slate-800'
                          }`}
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rider Star Rating Leaderboard */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Ranking de Calificaciones y Rendimiento
                </h3>
                <p className="text-xs text-slate-500">
                  Evaluación promedio y entregas verificadas por unidad
                </p>
              </div>
              <div className="divide-y divide-slate-200">
                {riderLeaderboard.map((entry, idx) => (
                  <div
                    key={entry.rider.uid}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono font-bold text-slate-400 w-5">
                        #{idx + 1}
                      </span>
                      <UserAvatar
                        photoUrl={entry.rider.photoUrl}
                        name={entry.rider.displayName}
                        color={entry.rider.motoColor}
                        size={30}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {entry.rider.motoName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {entry.rider.displayName} · {entry.rider.departmentName}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono tabular-nums">
                      <div className="font-bold text-slate-900 inline-flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                        {entry.avgRating.toFixed(2)} ({entry.reviewCount})
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {entry.rider.completedCount} entregas · {entry.rider.totalKm.toFixed(1)} km
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Department Expansion Manager */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Cobertura por Departamentos ({departments.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Métricas operativas y multiplicador tarifario regional
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-4">Departamento</th>
                      <th className="py-2.5 px-3 text-right">Unidades</th>
                      <th className="py-2.5 px-3 text-right">Pedidos</th>
                      <th className="py-2.5 px-3 text-right">Tarifa Reg.</th>
                      <th className="py-2.5 px-3 text-right">Ingresos</th>
                      <th className="py-2.5 px-4 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {deptStats.map(({ dept, count, riderCount, rev }) => (
                      <tr key={dept.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {dept.name} ({dept.code})
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {dept.centerLat.toFixed(3)}, {dept.centerLng.toFixed(3)}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {riderCount}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {count}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          ×{dept.baseFareMultiplier.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                          {formatCurrency(rev, tariffs.currency)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => void onToggleDepartmentActive(dept)}
                            className={`px-2.5 py-1 rounded-md border font-semibold cursor-pointer ${
                              dept.active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                          >
                            {dept.active ? 'Operando' : 'Inactivo'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-orange-600 shrink-0" />
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Expansión a Nuevo Departamento
                  </h3>
                  <p className="text-xs text-slate-500">
                    Despliega Moto Mandados en nuevas ciudades y zonas
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {EXPANSION_PRESETS.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => {
                      setDName(p.name);
                      setDCode(p.code);
                      setDLat(String(p.lat));
                      setDLng(String(p.lng));
                      setDMult(String(p.mult));
                    }}
                    className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer"
                  >
                    + {p.name.replace('Departamento ', '')}
                  </button>
                ))}
              </div>

              <form onSubmit={handleDeptSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre del Departamento
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Departamento Bajío"
                      value={dName}
                      onChange={(e) => setDName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm sm:text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Código
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={10}
                      placeholder="BJX"
                      value={dCode}
                      onChange={(e) => setDCode(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm sm:text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Latitud Centro
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      required
                      value={dLat}
                      onChange={(e) => setDLat(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm sm:text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Longitud Centro
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      required
                      value={dLng}
                      onChange={(e) => setDLng(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm sm:text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Multiplicador Tarifa
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="3"
                      required
                      value={dMult}
                      onChange={(e) => setDMult(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Zoom Inicial Mapa
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="8"
                      max="18"
                      required
                      value={dZoom}
                      onChange={(e) => setDZoom(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingDept}
                  className="w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {savingDept ? 'Creando zona...' : 'Habilitar Nuevo Departamento'}
                  </span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB: VERIFICACIÓN DE CONDUCTORES (18+ / DOCUMENTOS / 12 HORAS) */}
      {subTab === 'verificacion_conductores' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Cola de Verificación de Conductores (18+ · Documentos · Foto de Moto · 12 Horas)
                </h3>
                <p className="text-xs text-slate-500">
                  Revisa cédula, licencia de conducir, teléfono, dirección exacta, seguro, circulación, foto actualizada de la moto y edad 18+ antes de confirmar la aprobación.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                {pendingDriverApps.length} en revisión
              </span>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                {driverApplications.filter((a) => a.status === 'approved').length} aprobados
              </span>
            </div>
          </div>

          {filteredDriverApplications.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-xs text-slate-500">
              No hay solicitudes de documentos de conductores registradas todavía.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredDriverApplications.map((app) => {
                const win = getReviewWindowState(app.submittedAt, nowMs);
                const age = calculateAgeFromIsoDate(app.birthDate);
                const deptName =
                  departments.find((d) => d.id === app.departmentId)?.name ||
                  app.departmentId;
                const noteVal = reviewNotes[app.uid] ?? '';
                const docPhotos = [
                  { label: 'Foto de Moto Actualizada', url: app.motoPhotoUrl },
                  { label: 'Cédula', url: app.cedulaPhotoUrl },
                  { label: 'Licencia', url: app.licensePhotoUrl },
                  { label: 'Seguro', url: app.insurancePhotoUrl },
                  { label: 'Circulación', url: app.circulationPhotoUrl },
                ].filter((p) => Boolean(p.url));

                return (
                  <div
                    key={app.uid}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-slate-200">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-display text-base font-bold text-slate-900">
                            {app.applicantName}
                          </h4>
                          <span className="text-xs font-mono text-slate-500">
                            · {app.motoName} ({app.motoPlate})
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {deptName} · Edad verificada:{' '}
                          <strong className="text-slate-900">
                            {age ?? 18} años
                          </strong>{' '}
                          ({app.birthDate}) · Enviado {formatDateTimeEs(win.submittedMs)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {app.status === 'pending_review' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 font-mono tabular-nums">
                            <Clock className="w-3.5 h-3.5 text-amber-700" />
                            <span>
                              {win.isWindowComplete
                                ? '12h completadas · Listo'
                                : `Faltan ${formatCountdownHms(win.remainingMs)}`}
                            </span>
                          </span>
                        )}
                        <span
                          className={`px-3 py-1 rounded-lg text-xs font-bold ${
                            app.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : app.status === 'rejected'
                              ? 'bg-red-50 text-red-800 border border-red-200'
                              : 'bg-slate-900 text-white'
                          }`}
                        >
                          {app.status === 'approved'
                            ? 'Aprobado'
                            : app.status === 'rejected'
                            ? 'Rechazado'
                            : 'Pendiente de Confirmación'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                          <CreditCard className="w-3.5 h-3.5 text-orange-600" />
                          <span>Cédula</span>
                        </div>
                        <div className="font-mono font-bold text-slate-900 mt-0.5">
                          {app.cedulaNumber}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-orange-600" />
                          <span>Licencia de Conducir</span>
                        </div>
                        <div className="font-mono font-bold text-slate-900 mt-0.5">
                          {app.licenseNumber}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-orange-600" />
                          <span>Teléfono</span>
                        </div>
                        <div className="font-mono font-bold text-slate-900 mt-0.5">
                          {app.phone}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5 text-orange-600" />
                          <span>Seguro</span>
                        </div>
                        <div className="font-mono font-bold text-slate-900 mt-0.5">
                          {app.insuranceNumber}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                          <Car className="w-3.5 h-3.5 text-orange-600" />
                          <span>Circulación</span>
                        </div>
                        <div className="font-mono font-bold text-slate-900 mt-0.5">
                          {app.circulationNumber}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-orange-600" />
                          <span>Dirección Exacta</span>
                        </div>
                        <div className="font-medium text-slate-900 mt-0.5">
                          {app.exactAddress}
                        </div>
                      </div>
                    </div>

                    {docPhotos.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        {docPhotos.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() =>
                              setPreviewDocImage({
                                title: `${app.applicantName} · ${p.label}`,
                                url: p.url!,
                              })
                            }
                            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            <img
                              src={p.url}
                              alt={p.label}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded object-cover border border-slate-200"
                            />
                            <span>Ver {p.label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {app.reviewNote && (
                      <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <strong className="text-slate-800">Nota de revisión:</strong>{' '}
                        {app.reviewNote}
                      </div>
                    )}

                    {app.status !== 'approved' &&
                      (onApproveDriverApplication || onRejectDriverApplication) && (
                        <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                          <input
                            type="text"
                            maxLength={280}
                            value={noteVal}
                            onChange={(e) =>
                              setReviewNotes((prev) => ({
                                ...prev,
                                [app.uid]: e.target.value,
                              }))
                            }
                            placeholder="Observación opcional o motivo de rechazo..."
                            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-800"
                          />
                          {onApproveDriverApplication && (
                            <button
                              type="button"
                              disabled={reviewBusyUid === app.uid}
                              onClick={async () => {
                                setReviewBusyUid(app.uid);
                                try {
                                  await onApproveDriverApplication(app, noteVal.trim());
                                } finally {
                                  setReviewBusyUid(null);
                                }
                              }}
                              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Confirmar y Aprobar</span>
                            </button>
                          )}
                          {onRejectDriverApplication && (
                            <button
                              type="button"
                              disabled={reviewBusyUid === app.uid}
                              onClick={async () => {
                                setReviewBusyUid(app.uid);
                                try {
                                  await onRejectDriverApplication(
                                    app,
                                    noteVal.trim() ||
                                      'Documentos incompletos o ilegibles. Revisa y vuelve a enviar.'
                                  );
                                } finally {
                                  setReviewBusyUid(null);
                                }
                              }}
                              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-red-300 bg-white hover:bg-red-50 disabled:opacity-60 text-red-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Rechazar</span>
                            </button>
                          )}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {previewDocImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4"
          onClick={() => setPreviewDocImage(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="text-sm font-bold text-slate-900">
                {previewDocImage.title}
              </div>
              <button
                type="button"
                onClick={() => setPreviewDocImage(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Cerrar vista"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-center bg-slate-50 rounded-xl p-3">
              <img
                src={previewDocImage.url}
                alt={previewDocImage.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
