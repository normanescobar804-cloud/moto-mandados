import React, { useContext, useMemo, useRef, useState } from 'react';
import {
  Bike,
  Check,
  CheckCircle2,
  Edit3,
  LocateFixed,
  MessageSquare,
  RotateCcw,
  Star,
  Store,
  Truck,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import {
  ChatMessage,
  Delivery,
  Department,
  Merchant,
  RiderProfile,
  ServiceCategory,
  ServiceType,
  TariffSettings,
} from '../types';
import {
  DEFAULT_DEPARTMENTS,
  SERVICE_CATEGORY_LABELS,
  STATUS_LABELS,
  calculateDeliveryFare,
  formatCurrency,
  haversineKm,
  recalculateFromCustomFare,
} from '../utils/tariffs';
import {
  RADAR_BANDS,
  exactRadarDistanceKm,
  formatRadarKm,
  getRadarBand,
} from '../utils/radar';
import { LiveFleetMap, MapsConfiguredContext, usePlaceAutocomplete } from './LiveFleetMap';
import { MotoPhotoBadge, UserAvatar } from './MotoBrandMark';
import { ProximityRadarPanel } from './ProximityRadarPanel';
import { ChatTarget } from './ChatDrawer';

interface PassengerConsoleProps {
  currentUser: RiderProfile;
  allRiders: RiderProfile[];
  deliveries: Delivery[];
  tariffs: TariffSettings;
  departments: Department[];
  merchants: Merchant[];
  messages: ChatMessage[];
  selectedDepartmentId: string;
  onSelectDepartment: (id: string) => void;
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
    preferredRiderUid?: string;
    preferredRiderName?: string;
  }) => Promise<void>;
  onUpdateDeliveryFare: (delivery: Delivery, newTotalFare: number) => Promise<void>;
  onOpenChat: (target: ChatTarget) => void;
  onRateDelivery: (delivery: Delivery) => void;
  onConfirmAssignedDriver?: (delivery: Delivery) => Promise<void>;
  onRejectAssignedDriver?: (delivery: Delivery) => Promise<void>;
}

const PASSENGER_QUICK_DESTINATIONS = [
  { label: 'Polanco · Av. Presidente Masaryk 214', lat: 19.4319, lng: -99.1932 },
  { label: 'Roma Norte · Plaza Río de Janeiro 54', lat: 19.4209, lng: -99.1604 },
  { label: 'Condesa · Parque México', lat: 19.4117, lng: -99.1695 },
  { label: 'Centro · Zócalo Capitalino', lat: 19.4326, lng: -99.1332 },
];

export const PassengerConsole: React.FC<PassengerConsoleProps> = ({
  currentUser,
  allRiders,
  deliveries,
  tariffs,
  departments,
  merchants,
  messages,
  selectedDepartmentId,
  onSelectDepartment,
  onDispatch,
  onUpdateDeliveryFare,
  onOpenChat,
  onRateDelivery,
  onConfirmAssignedDriver,
  onRejectAssignedDriver,
}) => {
  const deptList = departments.length > 0 ? departments : DEFAULT_DEPARTMENTS;
  const activeDept =
    deptList.find((d) => d.id === selectedDepartmentId) ||
    deptList.find((d) => d.id === currentUser.departmentId) ||
    deptList[0];

  const [serviceCategory, setServiceCategory] = useState<ServiceCategory>('pasajero');
  const [pickupAddress, setPickupAddress] = useState(
    `Mi Ubicación · ${activeDept.name}`
  );
  const [pickupCoords, setPickupCoords] = useState({
    lat: currentUser.lat || activeDept.centerLat,
    lng: currentUser.lng || activeDept.centerLng,
  });
  const [dropoffAddress, setDropoffAddress] = useState(
    'Roma Norte · Plaza Río de Janeiro 54'
  );
  const [dropoffCoords, setDropoffCoords] = useState({
    lat: 19.4209,
    lng: -99.1604,
  });
  const [passengerName, setPassengerName] = useState(currentUser.displayName);
  const [notes, setNotes] = useState('');
  const [customFareInput, setCustomFareInput] = useState<string>('');
  const [isPriceManuallyEdited, setIsPriceManuallyEdited] = useState(false);
  const [preferredDriver, setPreferredDriver] = useState<RiderProfile | null>(null);
  const [gpsRefreshing, setGpsRefreshing] = useState(false);
  const [respondingDeliveryId, setRespondingDeliveryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null);
  const [inlineFareValue, setInlineFareValue] = useState<string>('');
  const [savingInlineFare, setSavingInlineFare] = useState(false);

  const mapsConfigured = useContext(MapsConfiguredContext);
  const pickupAuto = usePlaceAutocomplete(pickupAddress);
  const dropoffAuto = usePlaceAutocomplete(dropoffAddress);
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDropoffSuggestions, setShowDropoffSuggestions] = useState(false);

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

  const isUrgent = serviceCategory === 'super_expres';
  const serviceType: ServiceType =
    serviceCategory === 'pasajero'
      ? 'pasajero_moto'
      : serviceCategory === 'super_expres'
      ? 'super_expres'
      : serviceCategory === 'comercio'
      ? 'comercio_local'
      : 'standard';

  const estimatedMinutes = useMemo(() => {
    const base = Math.round((distanceKm / 26) * 60) + 4;
    return isUrgent ? Math.max(8, base - 4) : Math.max(10, base);
  }, [distanceKm, isUrgent]);

  const defaultFare = useMemo(
    () =>
      calculateDeliveryFare(
        distanceKm,
        isUrgent,
        tariffs,
        activeDept.baseFareMultiplier,
        serviceCategory
      ),
    [distanceKm, isUrgent, tariffs, activeDept.baseFareMultiplier, serviceCategory]
  );

  const effectiveTotalFare = useMemo(() => {
    if (!isPriceManuallyEdited) return defaultFare.totalFare;
    const parsed = Number(customFareInput);
    if (!Number.isFinite(parsed) || parsed < 10) return defaultFare.totalFare;
    return Number(Math.min(50000, parsed).toFixed(2));
  }, [isPriceManuallyEdited, customFareInput, defaultFare.totalFare]);

  const fareBreakdown = useMemo(
    () => recalculateFromCustomFare(effectiveTotalFare, tariffs.platformFeePct),
    [effectiveTotalFare, tariffs.platformFeePct]
  );

  const myPassengerRequests = useMemo(
    () =>
      deliveries.filter(
        (d) =>
          d.createdByUid === currentUser.uid &&
          (selectedDepartmentId === 'all' || d.departmentId === selectedDepartmentId)
      ),
    [deliveries, currentUser.uid, selectedDepartmentId]
  );

  const availableDrivers = useMemo(
    () =>
      allRiders.filter(
        (r) =>
          r.uid !== currentUser.uid &&
          (r.status === 'available' || r.status === 'on_route')
      ),
    [allRiders, currentUser.uid]
  );

  const handleUseMyGps = () => {
    if (!navigator.geolocation) {
      setFormError('Tu navegador no soporta GPS; puedes escribir la dirección.');
      return;
    }
    setGpsRefreshing(true);
    setFormError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPickupCoords(coords);
        setPickupAddress(
          `GPS Pasajero (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
        );
        setGpsRefreshing(false);
      },
      () => {
        setFormError('No se pudo obtener ubicación GPS. Verifica permisos.');
        setGpsRefreshing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  };

  const handleAdjustPrice = (delta: number) => {
    const next = Math.max(10, Number((effectiveTotalFare + delta).toFixed(2)));
    setIsPriceManuallyEdited(true);
    setCustomFareInput(String(next));
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pickupAddress.trim().length < 3 || dropoffAddress.trim().length < 3) {
      setFormError('Indica direcciones válidas de recogida y destino.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const titleMap: Record<ServiceCategory, string> = {
        pasajero: 'Viaje Pasajero en Moto',
        super_expres: 'Envío Súper Exprés',
        comercio: 'Pedido Comercio Local',
        delivery: 'Envío Delivery Urbano',
      };
      await onDispatch({
        title: titleMap[serviceCategory],
        serviceCategory,
        serviceType,
        isUrgent,
        departmentId: activeDept.id,
        departmentName: activeDept.name,
        merchantName: '',
        cashOnDelivery: 0,
        pickupAddress: pickupAddress.trim(),
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        dropoffAddress: dropoffAddress.trim(),
        dropoffLat: dropoffCoords.lat,
        dropoffLng: dropoffCoords.lng,
        customerName: passengerName.trim() || currentUser.displayName,
        notes: notes.trim(),
        distanceKm,
        estimatedMinutes,
        customTotalFare: isPriceManuallyEdited ? effectiveTotalFare : undefined,
        preferredRiderUid: preferredDriver?.uid || '',
        preferredRiderName: preferredDriver
          ? `${preferredDriver.displayName} · ${preferredDriver.motoName}`
          : '',
      });
      setNotes('');
      setIsPriceManuallyEdited(false);
      setCustomFareInput('');
      setPreferredDriver(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo enviar tu solicitud.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveInlineFare = async (del: Delivery) => {
    const parsed = Number(inlineFareValue);
    if (!Number.isFinite(parsed) || parsed < 10) return;
    setSavingInlineFare(true);
    try {
      await onUpdateDeliveryFare(del, parsed);
      setEditingDeliveryId(null);
    } finally {
      setSavingInlineFare(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">Modo Activo</div>
            <div className="font-display text-base font-bold text-slate-900">
              Pasajero / Cliente
            </div>
            <div className="text-xs text-slate-500">
              Tarifa sugerida automática + precio editable
            </div>
          </div>
          <UserAvatar
            photoUrl={currentUser.photoUrl}
            name={currentUser.displayName}
            color={currentUser.motoColor}
            size={46}
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">Motos en Servicio</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
              {availableDrivers.length}
            </div>
            <div className="text-xs text-slate-500">
              Conductores listos para comunicarse
            </div>
          </div>
          <MotoPhotoBadge size={48} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">Mis Viajes y Envíos</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
              {myPassengerRequests.length}
            </div>
            <div className="text-xs text-slate-500">
              {
                myPassengerRequests.filter(
                  (d) => d.status !== 'delivered' && d.status !== 'cancelled'
                ).length
              }{' '}
              activos ahora
            </div>
          </div>
          <MessageSquare className="w-6 h-6 text-sky-600 shrink-0" />
        </div>
      </div>

      {/* Live Proximity Radar for Passengers */}
      <ProximityRadarPanel
        mode="passenger"
        observerCoords={pickupCoords}
        observerLabel={pickupAddress}
        currency={tariffs.currency}
        currentUserUid={currentUser.uid}
        availableRiders={allRiders}
        preferredRiderUid={preferredDriver?.uid || ''}
        onSelectPreferredDriver={(rider) => {
          setPreferredDriver(rider);
          if (rider) {
            formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }}
        onOpenChat={onOpenChat}
        onRefreshGps={handleUseMyGps}
        gpsRefreshing={gpsRefreshing}
      />

      {/* Main Split: Passenger Request + Editable Price | Live Fleet Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          ref={formRef}
          onSubmit={handleCreateRequest}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Solicitar Moto o Envío
              </h2>
              <p className="text-xs text-slate-500">
                La app calcula un precio por defecto y tú puedes editarlo
              </p>
            </div>
            <select
              value={activeDept.id}
              onChange={(e) => onSelectDepartment(e.target.value)}
              className="w-full sm:w-auto min-h-[40px] sm:min-h-0 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              aria-label="Departamento"
            >
              {deptList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Service Category Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {(
              [
                { id: 'pasajero', label: 'Pasajero', icon: <Bike className="w-3.5 h-3.5" /> },
                { id: 'super_expres', label: 'Exprés', icon: <Zap className="w-3.5 h-3.5" /> },
                { id: 'delivery', label: 'Delivery', icon: <Truck className="w-3.5 h-3.5" /> },
                { id: 'comercio', label: 'Comercio', icon: <Store className="w-3.5 h-3.5" /> },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setServiceCategory(cat.id)}
                className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
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

          {/* Pickup */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Punto de Recogida
              </label>
              <button
                type="button"
                onClick={handleUseMyGps}
                className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>Usar mi GPS</span>
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
              className="w-full px-3 py-2.5 sm:py-2 rounded-lg border border-slate-300 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {showPickupSuggestions &&
              mapsConfigured &&
              pickupAuto.suggestions.length > 0 && (
                <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
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

          {/* Dropoff */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Destino
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
              className="w-full px-3 py-2.5 sm:py-2 rounded-lg border border-slate-300 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {showDropoffSuggestions &&
              mapsConfigured &&
              dropoffAuto.suggestions.length > 0 && (
                <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
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
              {PASSENGER_QUICK_DESTINATIONS.map((dest) => (
                <button
                  key={dest.label}
                  type="button"
                  onClick={() => {
                    setDropoffAddress(dest.label);
                    setDropoffCoords({ lat: dest.lat, lng: dest.lng });
                    setShowDropoffSuggestions(false);
                  }}
                  className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer"
                >
                  {dest.label.split(' · ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tu Nombre
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
                className="w-full px-3 py-2.5 sm:py-2 rounded-lg border border-slate-300 text-base sm:text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nota para el Conductor
              </label>
              <input
                type="text"
                maxLength={300}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Llevo mochila, esquina norte"
                className="w-full px-3 py-2.5 sm:py-2 rounded-lg border border-slate-300 text-base sm:text-xs"
              />
            </div>
          </div>

          {/* Default Price + Editable Price Box */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">
                Precio por defecto ({distanceKm.toFixed(1)} km · ~{estimatedMinutes} min)
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatCurrency(defaultFare.totalFare, tariffs.currency)}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="passenger-editable-fare"
                  className="text-xs font-bold text-slate-900"
                >
                  Tu Precio Oferta ({tariffs.currency})
                </label>
                {isPriceManuallyEdited && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsPriceManuallyEdited(false);
                      setCustomFareInput('');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restaurar por defecto</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAdjustPrice(-10)}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-mono font-bold text-slate-800 cursor-pointer"
                >
                  -$10
                </button>
                <input
                  id="passenger-editable-fare"
                  type="number"
                  min={10}
                  max={50000}
                  step="1"
                  value={
                    isPriceManuallyEdited
                      ? customFareInput
                      : String(defaultFare.totalFare)
                  }
                  onChange={(e) => {
                    setIsPriceManuallyEdited(true);
                    setCustomFareInput(e.target.value);
                  }}
                  className="min-w-0 flex-1 min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-center font-mono tabular-nums text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => handleAdjustPrice(10)}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-mono font-bold text-slate-800 cursor-pointer"
                >
                  +$10
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {isPriceManuallyEdited
                    ? 'Precio personalizado por el cliente'
                    : 'Tarifa sugerida automática activa'}
                </span>
                <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                  Conductor recibe {formatCurrency(fareBreakdown.riderEarnings, tariffs.currency)}
                </span>
              </div>
            </div>
          </div>

          {preferredDriver && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <UserCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-emerald-950 truncate">
                    Moto elegida del radar: {preferredDriver.displayName} (
                    {preferredDriver.motoName})
                  </div>
                  <div className="font-mono tabular-nums text-[11px] text-emerald-800">
                    Distancia desde tu recogida:{' '}
                    {formatRadarKm(
                      exactRadarDistanceKm(
                        pickupCoords.lat,
                        pickupCoords.lng,
                        preferredDriver.lat,
                        preferredDriver.lng
                      )
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreferredDriver(null)}
                className="p-1.5 rounded-lg text-emerald-900 hover:bg-emerald-100 cursor-pointer shrink-0"
                aria-label="Quitar moto seleccionada"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {formError && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 min-h-[44px] px-4 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            {submitting
              ? 'Enviando solicitud...'
              : preferredDriver
              ? `Solicitar a ${preferredDriver.motoName} por ${formatCurrency(
                  fareBreakdown.totalFare,
                  tariffs.currency
                )}`
              : `Solicitar Moto por ${formatCurrency(
                  fareBreakdown.totalFare,
                  tariffs.currency
                )}`}
          </button>
        </form>

        {/* Map + Nearby Drivers */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Motos Disponibles y Ruta en Vivo
                </h3>
                <p className="text-xs text-slate-500">
                  Visualiza unidades cercanas y comunícate directo con un conductor
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onOpenChat(
                    availableDrivers[0]
                      ? {
                          kind: 'direct',
                          peerUid: availableDrivers[0].uid,
                          peerName: availableDrivers[0].displayName,
                          peerMotoName: availableDrivers[0].motoName,
                        }
                      : { kind: 'delivery', deliveryId: myPassengerRequests[0]?.id || '' }
                  )
                }
                disabled={availableDrivers.length === 0 && myPassengerRequests.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-800 cursor-pointer whitespace-nowrap"
              >
                <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
                <span>Chatear con Usuario / Moto</span>
              </button>
            </div>

            <LiveFleetMap
              riders={allRiders}
              deliveries={myPassengerRequests.filter(
                (d) => d.status !== 'delivered' && d.status !== 'cancelled'
              )}
              merchants={merchants.filter(
                (m) =>
                  selectedDepartmentId === 'all' ||
                  m.departmentId === selectedDepartmentId
              )}
              currentRiderUid={currentUser.uid}
              center={{
                lat: (pickupCoords.lat + dropoffCoords.lat) / 2,
                lng: (pickupCoords.lng + dropoffCoords.lng) / 2,
              }}
              zoom={activeDept.zoom}
              currency={tariffs.currency}
              className="h-[260px] sm:h-[360px]"
            />
          </div>

          {/* Active & Historical Passenger Requests */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Mis Solicitudes y Comunicación ({myPassengerRequests.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Edita el precio ofertado o abre el chat en tiempo real con tu conductor
                </p>
              </div>
            </div>

            {myPassengerRequests.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-xl">
                Aún no has creado viajes o envíos en Modo Pasajero. Usa el formulario izquierdo para pedir una moto con precio sugerido o personalizado.
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {myPassengerRequests.map((req) => {
                  const msgCount = messages.filter(
                    (m) => m.deliveryId === req.id
                  ).length;
                  const canEdit =
                    req.status !== 'delivered' && req.status !== 'cancelled';
                  const isEditingThis = editingDeliveryId === req.id;

                  const assignedDriver = allRiders.find(
                    (r) => r.uid === req.assignedRiderUid
                  );
                  const driverDistanceKm = assignedDriver
                    ? exactRadarDistanceKm(
                        req.pickupLat,
                        req.pickupLng,
                        assignedDriver.lat,
                        assignedDriver.lng
                      )
                    : null;
                  const driverBand =
                    driverDistanceKm !== null
                      ? RADAR_BANDS[getRadarBand(driverDistanceKm)]
                      : null;

                  return (
                    <div
                      key={req.id}
                      className="py-4 first:pt-0 last:pb-0 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span className="font-semibold text-slate-900">
                              {SERVICE_CATEGORY_LABELS[req.serviceCategory || 'delivery']}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{STATUS_LABELS[req.status]}</span>
                            <span aria-hidden="true">·</span>
                            <span>{req.departmentName}</span>
                          </div>
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {req.title}
                          </div>
                          <div className="text-xs text-slate-600 truncate">
                            De: {req.pickupAddress} → A: {req.dropoffAddress}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 pt-0.5">
                            {req.assignedRiderUid ? (
                              <>
                                <UserAvatar
                                  photoUrl={assignedDriver?.photoUrl}
                                  name={req.assignedRiderName || 'Conductor'}
                                  color={assignedDriver?.motoColor}
                                  size={22}
                                />
                                <span>
                                  Conductor: {req.assignedRiderName} ({req.assignedMotoName})
                                  {driverDistanceKm !== null && driverBand ? (
                                    <>
                                      {' '}
                                      ·{' '}
                                      <strong className="font-mono tabular-nums text-slate-900">
                                        a {formatRadarKm(driverDistanceKm)}
                                      </strong>{' '}
                                      <span className={driverBand.textClass}>
                                        ({driverBand.label})
                                      </span>
                                    </>
                                  ) : null}
                                </span>
                              </>
                            ) : req.preferredRiderName ? (
                              <span>
                                Esperando respuesta de {req.preferredRiderName} (o cualquier moto del radar)...
                              </span>
                            ) : (
                              <span>Buscando conductor disponible en el radar...</span>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono tabular-nums text-base font-bold text-slate-900">
                            {formatCurrency(req.totalFare, tariffs.currency)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {req.customFareEdited
                              ? `Editado (sugerido ${formatCurrency(
                                  req.suggestedFare ?? req.totalFare,
                                  tariffs.currency
                                )})`
                              : 'Tarifa por defecto'}
                          </div>
                        </div>
                      </div>

                      {req.status === 'assigned' && req.passengerAccepted !== true && onConfirmAssignedDriver && onRejectAssignedDriver && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                          <div className="min-w-0 text-amber-950">
                            <div className="font-semibold">
                              El conductor aceptó tu solicitud
                              {driverDistanceKm !== null
                                ? ` (está a ${formatRadarKm(driverDistanceKm)})`
                                : ''}
                            </div>
                            <div className="text-[11px] text-amber-800">
                              Si te parece la distancia y el conductor, confirma el viaje; de lo contrario busca otro.
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={respondingDeliveryId === req.id}
                              onClick={async () => {
                                setRespondingDeliveryId(req.id);
                                try {
                                  await onRejectAssignedDriver(req);
                                } finally {
                                  setRespondingDeliveryId(null);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-amber-300 bg-white hover:bg-amber-100 disabled:opacity-50 text-xs font-semibold text-amber-950 cursor-pointer whitespace-nowrap"
                            >
                              <X className="w-3.5 h-3.5 text-red-600" />
                              <span>Rechazar y Buscar Otro</span>
                            </button>
                            <button
                              type="button"
                              disabled={respondingDeliveryId === req.id}
                              onClick={async () => {
                                setRespondingDeliveryId(req.id);
                                try {
                                  await onConfirmAssignedDriver(req);
                                } finally {
                                  setRespondingDeliveryId(null);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Aceptar Conductor</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {req.status === 'assigned' && req.passengerAccepted === true && (
                        <div className="text-xs font-semibold text-emerald-700">
                          Confirmado por pasajero y conductor · Listo para iniciar trayecto
                        </div>
                      )}

                      {isEditingThis && (
                        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-700">
                            Nuevo precio ({tariffs.currency}):
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={10}
                              max={50000}
                              step="5"
                              value={inlineFareValue}
                              onChange={(e) => setInlineFareValue(e.target.value)}
                              className="w-28 px-2.5 py-1 rounded-md border border-slate-300 bg-white text-xs font-mono tabular-nums"
                            />
                            <button
                              type="button"
                              disabled={savingInlineFare}
                              onClick={() => void handleSaveInlineFare(req)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Guardar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDeliveryId(null)}
                              className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-xs text-slate-600 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {canEdit && !isEditingThis && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeliveryId(req.id);
                              setInlineFareValue(String(req.totalFare));
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editar Precio</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            onOpenChat({ kind: 'delivery', deliveryId: req.id })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-orange-400" />
                          <span>
                            {req.assignedRiderUid
                              ? 'Chatear con Conductor'
                              : 'Abrir Chat'}
                            {msgCount > 0 ? ` (${msgCount})` : ''}
                          </span>
                        </button>

                        {req.status === 'delivered' && !req.rated && (
                          <button
                            type="button"
                            onClick={() => onRateDelivery(req)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 cursor-pointer whitespace-nowrap"
                          >
                            <Star className="w-3.5 h-3.5 text-amber-600" />
                            <span>Calificar</span>
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
      </div>
    </div>
  );
};
