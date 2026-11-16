import React, { useMemo, useState } from 'react';
import {
  Bookmark,
  Plus,
  Zap,
  Edit3,
  Trash2,
  LocateFixed,
  Search,
  Check,
  X,
  ArrowRight,
  Route as RouteIcon,
} from 'lucide-react';
import {
  Department,
  FrequentRoute,
  FrequentRouteInput,
  ServiceType,
} from '../types';
import {
  DEFAULT_DEPARTMENTS,
  SERVICE_CATEGORY_LABELS,
  SERVICE_PRESETS,
  haversineKm,
} from '../utils/tariffs';
import { usePlaceAutocomplete } from './LiveFleetMap';

interface FrequentRoutesSectionProps {
  routes: FrequentRoute[];
  departments: Department[];
  defaultDepartmentId: string;
  riderLocation: { lat: number; lng: number };
  onSaveRoute: (input: FrequentRouteInput, existingId?: string) => Promise<void>;
  onDeleteRoute: (routeId: string) => Promise<void>;
  onUseRoute: (route: FrequentRoute) => void;
}

export const FrequentRoutesSection: React.FC<FrequentRoutesSectionProps> = ({
  routes,
  departments,
  defaultDepartmentId,
  riderLocation,
  onSaveRoute,
  onDeleteRoute,
  onUseRoute,
}) => {
  const deptList = departments.length > 0 ? departments : DEFAULT_DEPARTMENTS;
  const fallbackDept =
    deptList.find((d) => d.id === defaultDepartmentId) || deptList[0];

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('super_expres');
  const [departmentId, setDepartmentId] = useState<string>(fallbackDept.id);
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number }>({
    lat: riderLocation.lat || fallbackDept.centerLat,
    lng: riderLocation.lng || fallbackDept.centerLng,
  });
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number }>({
    lat: Number(((riderLocation.lat || fallbackDept.centerLat) + 0.015).toFixed(4)),
    lng: Number(((riderLocation.lng || fallbackDept.centerLng) - 0.015).toFixed(4)),
  });
  const [defaultCustomerName, setDefaultCustomerName] = useState('');
  const [defaultNotes, setDefaultNotes] = useState('');

  const pickupAuto = usePlaceAutocomplete(pickupAddress);
  const dropoffAuto = usePlaceAutocomplete(dropoffAddress);
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDropoffSuggestions, setShowDropoffSuggestions] = useState(false);

  const activePreset =
    SERVICE_PRESETS.find((p) => p.id === serviceType) || SERVICE_PRESETS[0];
  const activeDepartment =
    deptList.find((d) => d.id === departmentId) || fallbackDept;

  const previewKm = useMemo(
    () =>
      haversineKm(
        pickupCoords.lat,
        pickupCoords.lng,
        dropoffCoords.lat,
        dropoffCoords.lng
      ),
    [pickupCoords, dropoffCoords]
  );

  const sortedAndFilteredRoutes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const sorted = [...routes].sort((a, b) => {
      const usageDiff = (b.usageCount || 0) - (a.usageCount || 0);
      if (usageDiff !== 0) return usageDiff;
      return a.name.localeCompare(b.name);
    });
    if (!q) return sorted;
    return sorted.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.pickupAddress.toLowerCase().includes(q) ||
        r.dropoffAddress.toLowerCase().includes(q) ||
        r.departmentName.toLowerCase().includes(q) ||
        r.defaultCustomerName.toLowerCase().includes(q)
    );
  }, [routes, searchTerm]);

  const openCreateForm = () => {
    const dept =
      deptList.find((d) => d.id === defaultDepartmentId) || deptList[0];
    setEditingId(null);
    setName('');
    setServiceType('super_expres');
    setDepartmentId(dept.id);
    setPickupAddress('');
    setPickupCoords({
      lat: riderLocation.lat || dept.centerLat,
      lng: riderLocation.lng || dept.centerLng,
    });
    setDropoffAddress('');
    setDropoffCoords({
      lat: Number(((riderLocation.lat || dept.centerLat) + 0.014).toFixed(4)),
      lng: Number(((riderLocation.lng || dept.centerLng) - 0.014).toFixed(4)),
    });
    setDefaultCustomerName('');
    setDefaultNotes('');
    setFormError(null);
    setShowPickupSuggestions(false);
    setShowDropoffSuggestions(false);
    setFormOpen(true);
  };

  const openEditForm = (route: FrequentRoute) => {
    setEditingId(route.id);
    setName(route.name);
    setServiceType(route.serviceType);
    setDepartmentId(route.departmentId || fallbackDept.id);
    setPickupAddress(route.pickupAddress);
    setPickupCoords({ lat: route.pickupLat, lng: route.pickupLng });
    setDropoffAddress(route.dropoffAddress);
    setDropoffCoords({ lat: route.dropoffLat, lng: route.dropoffLng });
    setDefaultCustomerName(route.defaultCustomerName || '');
    setDefaultNotes(route.defaultNotes || '');
    setFormError(null);
    setShowPickupSuggestions(false);
    setShowDropoffSuggestions(false);
    setFormOpen(true);
  };

  const handleUseCurrentGpsForOrigin = () => {
    if (!navigator.geolocation) {
      setPickupCoords(riderLocation);
      setPickupAddress(
        `Unidad Actual (${riderLocation.lat.toFixed(4)}, ${riderLocation.lng.toFixed(4)})`
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
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

  const handleDepartmentChange = (nextDeptId: string) => {
    setDepartmentId(nextDeptId);
    const nextDept = deptList.find((d) => d.id === nextDeptId);
    if (nextDept && !editingId) {
      setPickupCoords({ lat: nextDept.centerLat, lng: nextDept.centerLng });
      setDropoffCoords({
        lat: Number((nextDept.centerLat + 0.012).toFixed(4)),
        lng: Number((nextDept.centerLng - 0.012).toFixed(4)),
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPickup = pickupAddress.trim();
    const cleanDropoff = dropoffAddress.trim();

    if (cleanName.length < 2) {
      setFormError('Ingresa un nombre o alias de al menos 2 caracteres.');
      return;
    }
    if (cleanPickup.length < 3 || cleanDropoff.length < 3) {
      setFormError('Indica direcciones válidas de origen y destino.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      await onSaveRoute(
        {
          name: cleanName,
          serviceCategory: activePreset.category,
          serviceType: activePreset.id,
          departmentId: activeDepartment.id,
          departmentName: activeDepartment.name,
          pickupAddress: cleanPickup,
          pickupLat: pickupCoords.lat,
          pickupLng: pickupCoords.lng,
          dropoffAddress: cleanDropoff,
          dropoffLat: dropoffCoords.lat,
          dropoffLng: dropoffCoords.lng,
          defaultCustomerName: defaultCustomerName.trim(),
          defaultNotes: defaultNotes.trim(),
        },
        editingId || undefined
      );
      setFormOpen(false);
      setEditingId(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo guardar la ruta frecuente.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async (routeId: string) => {
    setDeletingId(routeId);
    try {
      await onDeleteRoute(routeId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      aria-labelledby="frequent-routes-heading"
      className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Bookmark className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3
                id="frequent-routes-heading"
                className="font-display text-base font-bold text-slate-900"
              >
                Rutas Frecuentes
              </h3>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-mono font-semibold text-slate-700 tabular-nums">
                {routes.length}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Guarda orígenes y destinos recurrentes para despachar entregas en un solo clic.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {routes.length > 2 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar ruta..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 w-44 sm:w-52"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (formOpen) {
                setFormOpen(false);
                setEditingId(null);
              } else {
                openCreateForm();
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              formOpen
                ? 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                : 'bg-orange-600 hover:bg-orange-700 text-white'
            }`}
          >
            {formOpen ? (
              <>
                <X className="w-3.5 h-3.5" />
                <span>Cerrar Formulario</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Ruta Frecuente</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Create / Edit Form */}
      {formOpen && (
        <form
          onSubmit={handleSave}
          className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-900">
              {editingId ? 'Editar Ruta Frecuente' : 'Registrar Nueva Ruta Frecuente'}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              Distancia estimada: {previewKm.toFixed(2)} km
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre o Alias de la Ruta *
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Farmacia Centro → Polanco"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Modalidad Predeterminada
              </label>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as ServiceType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {SERVICE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} ({SERVICE_CATEGORY_LABELS[preset.category]})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Departamento
              </label>
              <select
                value={departmentId}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {deptList.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Origin */}
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Origen (Recolección) *
                </label>
                <button
                  type="button"
                  onClick={handleUseCurrentGpsForOrigin}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                >
                  <LocateFixed className="w-3 h-3" />
                  <span>Usar GPS actual</span>
                </button>
              </div>
              <input
                type="text"
                required
                minLength={3}
                maxLength={240}
                value={pickupAddress}
                onFocus={() => setShowPickupSuggestions(true)}
                onChange={(e) => {
                  setPickupAddress(e.target.value);
                  setShowPickupSuggestions(true);
                }}
                placeholder="Dirección o punto de recolección"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              {showPickupSuggestions && pickupAuto.suggestions.length > 0 && (
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
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-400">
                Coords: {pickupCoords.lat.toFixed(4)}, {pickupCoords.lng.toFixed(4)}
              </div>
            </div>

            {/* Destination */}
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Destino (Entrega) *
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={240}
                value={dropoffAddress}
                onFocus={() => setShowDropoffSuggestions(true)}
                onChange={(e) => {
                  setDropoffAddress(e.target.value);
                  setShowDropoffSuggestions(true);
                }}
                placeholder="Dirección o punto de entrega habitual"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              {showDropoffSuggestions && dropoffAuto.suggestions.length > 0 && (
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
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-400">
                Coords: {dropoffCoords.lat.toFixed(4)}, {dropoffCoords.lng.toFixed(4)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Destinatario / Cliente Frecuente (Opcional)
              </label>
              <input
                type="text"
                maxLength={80}
                value={defaultCustomerName}
                onChange={(e) => setDefaultCustomerName(e.target.value)}
                placeholder="Ej. Recepción Corporativa / Juan Pérez"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instrucciones Predeterminadas (Opcional)
              </label>
              <input
                type="text"
                maxLength={300}
                value={defaultNotes}
                onChange={(e) => setDefaultNotes(e.target.value)}
                placeholder="Ej. Entregar en caseta de vigilancia, pedir firma"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {formError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
                setFormError(null);
              }}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? 'Guardando...'
                  : editingId
                  ? 'Actualizar Ruta'
                  : 'Guardar Ruta Frecuente'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Saved Routes List */}
      {routes.length === 0 ? (
        <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <RouteIcon className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Aún no tienes rutas frecuentes guardadas
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Guarda tus recorridos más comunes (comercios, oficinas o clientes habituales) para crear nuevas entregas en segundos.
              </p>
            </div>
          </div>
          {!formOpen && (
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap self-start sm:self-center"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear primera ruta</span>
            </button>
          )}
        </div>
      ) : sortedAndFilteredRoutes.length === 0 ? (
        <p className="text-xs text-slate-500 py-3">
          No hay rutas frecuentes que coincidan con &ldquo;{searchTerm}&rdquo;.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {sortedAndFilteredRoutes.map((route) => {
            const distKm = haversineKm(
              route.pickupLat,
              route.pickupLng,
              route.dropoffLat,
              route.dropoffLng
            );
            const isConfirmingDelete = confirmDeleteId === route.id;

            return (
              <div
                key={route.id}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col justify-between gap-3"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display text-sm font-bold text-slate-900 truncate">
                        {route.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                        <span className="font-semibold text-orange-700">
                          {SERVICE_CATEGORY_LABELS[route.serviceCategory || 'delivery']}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{route.departmentName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {distKm.toFixed(1)} km
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-mono font-semibold text-slate-600 tabular-nums shrink-0">
                      {route.usageCount || 0} usos
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-sm bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        A
                      </span>
                      <span
                        className="text-slate-700 font-medium line-clamp-2"
                        title={route.pickupAddress}
                      >
                        {route.pickupAddress}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-sm bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        B
                      </span>
                      <span
                        className="text-slate-800 font-semibold line-clamp-2"
                        title={route.dropoffAddress}
                      >
                        {route.dropoffAddress}
                      </span>
                    </div>
                  </div>

                  {(route.defaultCustomerName || route.defaultNotes) && (
                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      {route.defaultCustomerName && (
                        <div className="truncate">
                          <span className="font-semibold text-slate-700">Cliente:</span>{' '}
                          {route.defaultCustomerName}
                        </div>
                      )}
                      {route.defaultNotes && (
                        <div className="truncate" title={route.defaultNotes}>
                          <span className="font-semibold text-slate-700">Nota:</span>{' '}
                          {route.defaultNotes}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  {isConfirmingDelete ? (
                    <div className="flex items-center justify-between gap-2 w-full">
                      <span className="text-[11px] font-semibold text-red-700">
                        ¿Eliminar ruta?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={deletingId === route.id}
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 cursor-pointer"
                        >
                          No
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === route.id}
                          onClick={() => void handleConfirmDelete(route.id)}
                          className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          {deletingId === route.id ? '...' : 'Sí, eliminar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditForm(route)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                          title="Editar ruta frecuente"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(route.id)}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-500 hover:text-red-700 cursor-pointer"
                          aria-label={`Eliminar ruta ${route.name}`}
                          title="Eliminar ruta"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onUseRoute(route)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Crear Entrega</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
