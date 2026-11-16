import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Map as GoogleMapView,
  AdvancedMarker,
  Pin,
} from '@vis.gl/react-google-maps';
import {
  Bike,
  Zap,
  Package,
  FileText,
  Cross,
  Clock,
  MapPin,
  RotateCcw,
  X,
  LocateFixed,
  Store,
  Truck,
  Bookmark,
} from 'lucide-react';
import {
  Department,
  FrequentRoute,
  FrequentRouteInput,
  Merchant,
  ServiceCategory,
  ServiceType,
  TariffSettings,
} from '../types';
import {
  DEFAULT_DEPARTMENTS,
  SERVICE_CATEGORY_LABELS,
  SERVICE_PRESETS,
  calculateDeliveryFare,
  formatCurrency,
  haversineKm,
  recalculateFromCustomFare,
} from '../utils/tariffs';
import {
  MapsConfiguredContext,
  usePlaceAutocomplete,
} from './LiveFleetMap';
import { useTheme } from '../utils/theme';

interface UrgentDispatchModalProps {
  isOpen: boolean;
  initialServiceType?: ServiceType;
  initialRoute?: FrequentRoute | null;
  frequentRoutes?: FrequentRoute[];
  tariffs: TariffSettings;
  departments: Department[];
  merchants: Merchant[];
  defaultDepartmentId: string;
  riderLocation: { lat: number; lng: number };
  onClose: () => void;
  onSaveAsFrequentRoute?: (input: FrequentRouteInput) => Promise<void>;
  onDispatch: (payload: {
    title: string;
    serviceCategory: ServiceCategory;
    serviceType: ServiceType;
    isUrgent: boolean;
    departmentId: string;
    departmentName: string;
    merchantName: string;
    cashOnDelivery: number;
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffAddress: string;
    dropoffLat: number;
    dropoffLng: number;
    customerName: string;
    notes: string;
    distanceKm: number;
    estimatedMinutes: number;
    customTotalFare?: number;
  }) => Promise<void>;
}

const PRESET_ICONS: Record<ServiceType, React.ReactNode> = {
  pasajero_moto: <Bike className="w-4 h-4 shrink-0" />,
  super_expres: <Zap className="w-4 h-4 shrink-0" />,
  express_15: <Zap className="w-4 h-4 shrink-0" />,
  comercio_local: <Store className="w-4 h-4 shrink-0" />,
  priority_pkg: <Package className="w-4 h-4 shrink-0" />,
  urgent_docs: <FileText className="w-4 h-4 shrink-0" />,
  medical: <Cross className="w-4 h-4 shrink-0" />,
  standard: <Clock className="w-4 h-4 shrink-0" />,
};

const QUICK_DESTINATIONS = [
  { label: 'Polanco · Av. Presidente Masaryk 214', lat: 19.4319, lng: -99.1932 },
  { label: 'Roma Norte · Plaza Río de Janeiro 54', lat: 19.4209, lng: -99.1604 },
  { label: 'Santa Fe · Centro Corporativo Poniente', lat: 19.3652, lng: -99.2611 },
  { label: 'Del Valle · Parque Hundido Sur', lat: 19.3785, lng: -99.1778 },
];

export const UrgentDispatchModal: React.FC<UrgentDispatchModalProps> = ({
  isOpen,
  initialServiceType = 'super_expres',
  initialRoute = null,
  frequentRoutes = [],
  tariffs,
  departments,
  merchants,
  defaultDepartmentId,
  riderLocation,
  onClose,
  onSaveAsFrequentRoute,
  onDispatch,
}) => {
  const deptList = departments.length > 0 ? departments : DEFAULT_DEPARTMENTS;
  const initialPreset =
    SERVICE_PRESETS.find((p) => p.id === initialServiceType) || SERVICE_PRESETS[0];

  const [serviceCategory, setServiceCategory] = useState<ServiceCategory>(
    initialPreset.category
  );
  const [serviceType, setServiceType] = useState<ServiceType>(initialPreset.id);
  const [departmentId, setDepartmentId] = useState<string>(
    defaultDepartmentId || deptList[0].id
  );
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('');
  const [merchantName, setMerchantName] = useState<string>('');
  const [cashOnDelivery, setCashOnDelivery] = useState<string>('0');

  const [title, setTitle] = useState(initialPreset.label);
  const [customerName, setCustomerName] = useState('Cliente Corporativo');
  const [notes, setNotes] = useState('');

  const [pickupAddress, setPickupAddress] = useState('Base Central · Reforma 222');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number }>({
    lat: riderLocation.lat || 19.4285,
    lng: riderLocation.lng || -99.1618,
  });

  const [dropoffAddress, setDropoffAddress] = useState(
    'Roma Norte · Plaza Río de Janeiro 54'
  );
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number }>({
    lat: 19.4209,
    lng: -99.1604,
  });

  const [customFareInput, setCustomFareInput] = useState('');
  const [isCustomFareEdited, setIsCustomFareEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingRouteShortcut, setSavingRouteShortcut] = useState(false);
  const [selectedFrequentRouteId, setSelectedFrequentRouteId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const applyFrequentRouteToForm = (route: FrequentRoute) => {
    setSelectedFrequentRouteId(route.id);
    setServiceCategory(route.serviceCategory || 'delivery');
    setServiceType(route.serviceType || 'super_expres');
    setTitle(route.name || 'Envío Express');
    setDepartmentId(route.departmentId || defaultDepartmentId || deptList[0].id);
    setPickupAddress(route.pickupAddress);
    setPickupCoords({ lat: route.pickupLat, lng: route.pickupLng });
    setDropoffAddress(route.dropoffAddress);
    setDropoffCoords({ lat: route.dropoffLat, lng: route.dropoffLng });
    setCustomerName(route.defaultCustomerName || 'Cliente Corporativo');
    setNotes(route.defaultNotes || '');
    setIsCustomFareEdited(false);
    setCustomFareInput('');
  };

  useEffect(() => {
    if (isOpen) {
      if (initialRoute) {
        applyFrequentRouteToForm(initialRoute);
      } else {
        setSelectedFrequentRouteId('');
        const preset =
          SERVICE_PRESETS.find((p) => p.id === initialServiceType) ||
          SERVICE_PRESETS[0];
        setServiceCategory(preset.category);
        setServiceType(preset.id);
        setTitle(preset.label);
        setDepartmentId(defaultDepartmentId || deptList[0].id);
        setIsCustomFareEdited(false);
        setCustomFareInput('');
      }
    }
  }, [isOpen, initialServiceType, initialRoute, defaultDepartmentId, deptList]);

  const activeDepartment =
    deptList.find((d) => d.id === departmentId) || deptList[0];

  const deptMerchants = useMemo(
    () =>
      merchants.filter(
        (m) => m.active && (!m.departmentId || m.departmentId === departmentId)
      ),
    [merchants, departmentId]
  );

  const mapsConfigured = useContext(MapsConfiguredContext);
  const { theme } = useTheme();
  const pickupAuto = usePlaceAutocomplete(pickupAddress);
  const dropoffAuto = usePlaceAutocomplete(dropoffAddress);
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDropoffSuggestions, setShowDropoffSuggestions] = useState(false);

  const activePreset =
    SERVICE_PRESETS.find((p) => p.id === serviceType) || SERVICE_PRESETS[0];

  const distanceKm = useMemo(
    () =>
      haversineKm(
        pickupCoords.lat,
        pickupCoords.lng,
        dropoffCoords.lat,
        dropoffCoords.lng
      ),
    [pickupCoords, dropoffCoords]
  );

  const estimatedMinutes = useMemo(() => {
    const baseMin = Math.round((distanceKm / 26) * 60) + 5;
    if (serviceCategory === 'super_expres') return Math.max(8, baseMin - 5);
    return activePreset.isUrgent ? Math.max(10, baseMin - 3) : baseMin;
  }, [distanceKm, activePreset.isUrgent, serviceCategory]);

  const fare = useMemo(
    () =>
      calculateDeliveryFare(
        distanceKm,
        activePreset.isUrgent || serviceCategory === 'super_expres',
        tariffs,
        activeDepartment?.baseFareMultiplier || 1.0,
        serviceCategory
      ),
    [
      distanceKm,
      activePreset.isUrgent,
      tariffs,
      activeDepartment?.baseFareMultiplier,
      serviceCategory,
    ]
  );

  const effectiveTotalFare = useMemo(() => {
    if (!isCustomFareEdited) return fare.totalFare;
    const parsed = Number(customFareInput);
    if (!Number.isFinite(parsed) || parsed < 10) return fare.totalFare;
    return Number(Math.min(50000, parsed).toFixed(2));
  }, [isCustomFareEdited, customFareInput, fare.totalFare]);

  const effectiveBreakdown = useMemo(
    () => recalculateFromCustomFare(effectiveTotalFare, tariffs.platformFeePct),
    [effectiveTotalFare, tariffs.platformFeePct]
  );

  if (!isOpen) return null;

  const handleSelectCategory = (cat: ServiceCategory) => {
    setServiceCategory(cat);
    const match =
      SERVICE_PRESETS.find((p) => p.category === cat) || SERVICE_PRESETS[0];
    setServiceType(match.id);
    setTitle(match.label);
    if (cat === 'comercio' && deptMerchants.length > 0) {
      const m = deptMerchants[0];
      setSelectedMerchantId(m.id);
      setMerchantName(m.name);
      setPickupAddress(m.address);
      setPickupCoords({ lat: m.lat, lng: m.lng });
    } else if (cat !== 'comercio') {
      setSelectedMerchantId('');
      setMerchantName('');
      setCashOnDelivery('0');
    }
  };

  const handleDepartmentChange = (nextId: string) => {
    setDepartmentId(nextId);
    const nextDept = deptList.find((d) => d.id === nextId);
    if (nextDept) {
      setPickupCoords({
        lat: nextDept.centerLat,
        lng: nextDept.centerLng,
      });
      setDropoffCoords({
        lat: Number((nextDept.centerLat + 0.012).toFixed(4)),
        lng: Number((nextDept.centerLng - 0.014).toFixed(4)),
      });
      setPickupAddress(`Centro Operativo · ${nextDept.name}`);
      setDropoffAddress(`Zona Comercial · ${nextDept.name}`);
    }
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      setPickupCoords(riderLocation);
      setPickupAddress(
        `GPS Actual (${riderLocation.lat.toFixed(4)}, ${riderLocation.lng.toFixed(4)})`
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setPickupCoords(coords);
        setPickupAddress(
          `GPS Actual (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
        );
      },
      () => {
        setPickupCoords(riderLocation);
        setPickupAddress(
          `Unidad Actual (${riderLocation.lat.toFixed(4)}, ${riderLocation.lng.toFixed(4)})`
        );
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pickupAddress.trim().length < 3 || dropoffAddress.trim().length < 3) {
      setFormError('Indica direcciones válidas de recolección y entrega.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await onDispatch({
        title: title.trim() || activePreset.label,
        serviceCategory,
        serviceType,
        isUrgent:
          activePreset.isUrgent || serviceCategory === 'super_expres',
        departmentId: activeDepartment.id,
        departmentName: activeDepartment.name,
        merchantName: merchantName.trim().slice(0, 100),
        cashOnDelivery: Math.max(0, Number(cashOnDelivery) || 0),
        pickupAddress: pickupAddress.trim(),
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        dropoffAddress: dropoffAddress.trim(),
        dropoffLat: dropoffCoords.lat,
        dropoffLng: dropoffCoords.lng,
        customerName: customerName.trim() || 'Cliente',
        notes: notes.trim(),
        distanceKm,
        estimatedMinutes,
        customTotalFare: isCustomFareEdited ? effectiveTotalFare : undefined,
      });
      onClose();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo enviar la solicitud.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="urgent-dispatch-title"
    >
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl overflow-y-auto max-h-[94dvh] my-auto">
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-600 text-white flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="urgent-dispatch-title"
                className="font-display text-lg font-bold text-slate-900"
              >
                Solicitud de Servicio Moto Mandados
              </h2>
              <p className="text-xs text-slate-500">
                Delivery, Comercio afiliado y Súper Exprés con cálculo de tarifa multidepartamento
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Cerrar solicitud"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-7 p-4 sm:p-6 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-200">
            {frequentRoutes.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 shrink-0">
                  <Bookmark className="w-3.5 h-3.5 text-orange-600" />
                  <span>Cargar Ruta Frecuente</span>
                </div>
                <select
                  value={selectedFrequentRouteId}
                  onChange={(e) => {
                    const match = frequentRoutes.find((r) => r.id === e.target.value);
                    if (match) {
                      applyFrequentRouteToForm(match);
                    } else {
                      setSelectedFrequentRouteId('');
                    }
                  }}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-900"
                >
                  <option value="">Selecciona una ruta guardada...</option>
                  {frequentRoutes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.name} ({route.departmentName})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* 3 Primary Verticals */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Vertical de Servicio
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    [
                      {
                        id: 'pasajero',
                        label: 'Pasajero',
                        icon: <Bike className="w-3.5 h-3.5" />,
                      },
                      {
                        id: 'delivery',
                        label: 'Delivery',
                        icon: <Truck className="w-3.5 h-3.5" />,
                      },
                      {
                        id: 'comercio',
                        label: 'Comercio',
                        icon: <Store className="w-3.5 h-3.5" />,
                      },
                      {
                        id: 'super_expres',
                        label: 'Exprés',
                        icon: <Zap className="w-3.5 h-3.5" />,
                      },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat.id)}
                      className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        serviceCategory === cat.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {cat.icon}
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Departamento Operativo
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                >
                  {deptList.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} (×{dept.baseFareMultiplier.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Presets */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Modalidad Rápida
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SERVICE_PRESETS.map((preset) => {
                  const selected = preset.id === serviceType;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setServiceType(preset.id);
                        setServiceCategory(preset.category);
                        setTitle(preset.label);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        selected
                          ? 'bg-orange-600 text-white border-orange-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {PRESET_ICONS[preset.id]}
                      <span className="truncate">{preset.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {activePreset.description}
              </p>
            </div>

            {/* Merchant & Cash on Delivery when Comercio */}
            {serviceCategory === 'comercio' && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Comercio Afiliado
                  </label>
                  <select
                    value={selectedMerchantId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedMerchantId(val);
                      const m = merchants.find((item) => item.id === val);
                      if (m) {
                        setMerchantName(m.name);
                        setPickupAddress(m.address);
                        setPickupCoords({ lat: m.lat, lng: m.lng });
                      }
                    }}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                  >
                    <option value="">Comercio manual...</option>
                    {deptMerchants.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nombre del Comercio
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="Ej. Café Reforma"
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Cobro Contra Entrega ({tariffs.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={cashOnDelivery}
                    onChange={(e) => setCashOnDelivery(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono tabular-nums"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Concepto del Envío
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Destinatario / Cliente
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Punto de Recolección (Origen)
                </label>
                <button
                  type="button"
                  onClick={handleUseCurrentGps}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  <span>Usar GPS actual</span>
                </button>
              </div>
              <input
                type="text"
                required
                maxLength={240}
                value={pickupAddress}
                onFocus={() => setShowPickupSuggestions(true)}
                onChange={(e) => {
                  setPickupAddress(e.target.value);
                  setShowPickupSuggestions(true);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              {showPickupSuggestions && pickupAuto.suggestions.length > 0 && (
                <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {pickupAuto.suggestions.map((s, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await pickupAuto.selectSuggestion(s);
                          if (res) {
                            setPickupAddress(res.address);
                            setPickupCoords({ lat: res.lat, lng: res.lng });
                          }
                          setShowPickupSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {s.placePrediction?.text.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="relative">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Punto de Entrega (Destino)
              </label>
              <input
                type="text"
                required
                maxLength={240}
                value={dropoffAddress}
                onFocus={() => setShowDropoffSuggestions(true)}
                onChange={(e) => {
                  setDropoffAddress(e.target.value);
                  setShowDropoffSuggestions(true);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              {showDropoffSuggestions && dropoffAuto.suggestions.length > 0 && (
                <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {dropoffAuto.suggestions.map((s, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await dropoffAuto.selectSuggestion(s);
                          if (res) {
                            setDropoffAddress(res.address);
                            setDropoffCoords({ lat: res.lat, lng: res.lng });
                          }
                          setShowDropoffSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {s.placePrediction?.text.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_DESTINATIONS.map((dest) => (
                  <button
                    key={dest.label}
                    type="button"
                    onClick={() => {
                      setDropoffAddress(dest.label);
                      setDropoffCoords({ lat: dest.lat, lng: dest.lng });
                      setShowDropoffSuggestions(false);
                    }}
                    className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer"
                  >
                    {dest.label.split(' · ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instrucciones para el Motociclista
              </label>
              <input
                type="text"
                maxLength={300}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Entregar en recepción piso 3, solicitar firma"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="lg:col-span-5 p-4 sm:p-6 bg-slate-50 flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="h-40 sm:h-52 w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-200">
                {mapsConfigured ? (
                  <GoogleMapView
                    mapId="DEMO_MAP_ID"
                    colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
                    center={{
                      lat: (pickupCoords.lat + dropoffCoords.lat) / 2,
                      lng: (pickupCoords.lng + dropoffCoords.lng) / 2,
                    }}
                    zoom={12}
                    disableDefaultUI
                    gestureHandling="cooperative"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <AdvancedMarker position={pickupCoords} title="Recolección">
                      <Pin background="#0F172A" borderColor="#FFF" glyphColor="#FFF" glyphText="A" />
                    </AdvancedMarker>
                    <AdvancedMarker position={dropoffCoords} title="Entrega">
                      <Pin background="#EA580C" borderColor="#FFF" glyphColor="#FFF" glyphText="B" />
                    </AdvancedMarker>
                  </GoogleMapView>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-600 p-4 text-center">
                    Cargando vista previa del mapa...
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {SERVICE_CATEGORY_LABELS[serviceCategory]} · {activeDepartment.code}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {distanceKm.toFixed(2)} km · {estimatedMinutes} min
                  </span>
                </div>
                <div className="border-t border-slate-100 pt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Tarifa base ({activeDepartment.code})</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(fare.baseFare, tariffs.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Kilometraje ({distanceKm.toFixed(1)} km)</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(fare.distanceFare, tariffs.currency)}
                    </span>
                  </div>
                  {fare.urgentSurcharge > 0 && (
                    <div className="flex justify-between text-orange-700 font-medium">
                      <span>Recargo prioridad / Súper Exprés</span>
                      <span className="font-mono tabular-nums">
                        +{formatCurrency(fare.urgentSurcharge, tariffs.currency)}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline">
                    <span className="text-slate-600">Precio por defecto</span>
                    <span className="font-mono tabular-nums text-xs font-semibold text-slate-700">
                      {formatCurrency(fare.totalFare, tariffs.currency)}
                    </span>
                  </div>
                  <div className="pt-1.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="modal-custom-fare"
                        className="font-semibold text-slate-900"
                      >
                        Precio Editable ({tariffs.currency})
                      </label>
                      {isCustomFareEdited && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomFareEdited(false);
                            setCustomFareInput('');
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restaurar</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomFareEdited(true);
                          setCustomFareInput(
                            String(Math.max(10, Number((effectiveTotalFare - 10).toFixed(2))))
                          );
                        }}
                        className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 font-mono font-bold text-xs cursor-pointer"
                      >
                        -$10
                      </button>
                      <input
                        id="modal-custom-fare"
                        type="number"
                        min={10}
                        max={50000}
                        step="1"
                        value={
                          isCustomFareEdited
                            ? customFareInput
                            : String(fare.totalFare)
                        }
                        onChange={(e) => {
                          setIsCustomFareEdited(true);
                          setCustomFareInput(e.target.value);
                        }}
                        className="flex-1 px-2.5 py-1.5 rounded-md border border-slate-300 text-center font-mono tabular-nums text-sm font-bold text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomFareEdited(true);
                          setCustomFareInput(
                            String(Math.min(50000, Number((effectiveTotalFare + 10).toFixed(2))))
                          );
                        }}
                        className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 font-mono font-bold text-xs cursor-pointer"
                      >
                        +$10
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                    <span>Ganancia neta motociclista ({100 - tariffs.platformFeePct}%)</span>
                    <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                      {formatCurrency(effectiveBreakdown.riderEarnings, tariffs.currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {formError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  {formError}
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5">
                {onSaveAsFrequentRoute ? (
                  <button
                    type="button"
                    disabled={
                      savingRouteShortcut ||
                      pickupAddress.trim().length < 3 ||
                      dropoffAddress.trim().length < 3
                    }
                    onClick={async () => {
                      setSavingRouteShortcut(true);
                      try {
                        await onSaveAsFrequentRoute({
                          name: (title.trim() || `${pickupAddress.slice(0, 28)} → ${dropoffAddress.slice(0, 28)}`).slice(0, 80),
                          serviceCategory,
                          serviceType,
                          departmentId: activeDepartment.id,
                          departmentName: activeDepartment.name,
                          pickupAddress: pickupAddress.trim(),
                          pickupLat: pickupCoords.lat,
                          pickupLng: pickupCoords.lng,
                          dropoffAddress: dropoffAddress.trim(),
                          dropoffLat: dropoffCoords.lat,
                          dropoffLng: dropoffCoords.lng,
                          defaultCustomerName: customerName.trim(),
                          defaultNotes: notes.trim(),
                        });
                      } finally {
                        setSavingRouteShortcut(false);
                      }
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-orange-600" />
                    <span>
                      {savingRouteShortcut ? 'Guardando...' : 'Guardar Ruta'}
                    </span>
                  </button>
                ) : (
                  <span className="hidden sm:inline" />
                )}
                <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto sm:ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 sm:flex-initial px-5 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {submitting ? 'Despachando...' : 'Confirmar Solicitud'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
