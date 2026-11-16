import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  Award,
  MapPin,
  Clock,
  Star,
  Camera,
  RotateCcw,
  Trash2,
  ShieldCheck,
  Lock,
  Sun,
  Moon,
} from 'lucide-react';
import {
  Delivery,
  DeliveryRating,
  Department,
  DriverApplication,
  RiderProfile,
  TariffSettings,
  ThemePreference,
  UserPrivateInfo,
  Wallet,
} from '../types';
import { MotoPhotoBadge, UserAvatar } from './MotoBrandMark';
import { DriverProgressionPanel } from './DriverProgressionPanel';
import {
  PushSubscriptionStudio,
  PushTestOptions,
} from './PushSubscriptionStudio';
import { PWAInstallButton } from './PWAInstallButton';
import { processProfilePhotoFile } from '../utils/avatarImage';
import { ClaimableRewardPayload } from '../utils/driverProgression';
import { VERIFICATION_STATUS_LABELS } from '../utils/driverVerification';
import {
  BrowserPushPermission,
  TestPushOutcome,
} from '../utils/pushNotifications';
import {
  DEFAULT_DEPARTMENTS,
  MOTO_COLOR_OPTIONS,
  SERVICE_CATEGORY_LABELS,
  STATUS_LABELS,
  formatCurrency,
  formatShortDate,
} from '../utils/tariffs';

interface ProfilePanelProps {
  rider: RiderProfile;
  googlePhotoUrl?: string;
  privateInfo: UserPrivateInfo | null;
  driverApplication?: DriverApplication | null;
  deliveries: Delivery[];
  tariffs: TariffSettings;
  departments: Department[];
  ratings: DeliveryRating[];
  onSaveProfile: (updates: {
    displayName: string;
    motoName: string;
    motoModel: string;
    motoPlate: string;
    motoColor: string;
    departmentId: string;
    phone: string;
  }) => Promise<void>;
  onUpdatePhoto: (photoUrl: string) => Promise<void>;
  onOpenDriverVerification?: () => void;
  onUpdateNotifications: (prefs: {
    notifUrgent: boolean;
    notifRouteRecalc: boolean;
    notifDailyEarnings: boolean;
    notifGpsProximity: boolean;
    notifSound: boolean;
    dailyEarningsTime?: string;
  }) => Promise<void>;
  onTriggerDailyEarningsSummary?: () => Promise<void>;
  onRateDelivery: (delivery: Delivery) => void;
  pushPermission: BrowserPushPermission;
  pushSubscribed: boolean;
  dailySummaryText?: string;
  onEnablePush: () => Promise<void>;
  onDisablePush?: () => Promise<void>;
  onRefreshPush?: () => Promise<void>;
  onTestPush: (options?: PushTestOptions) => Promise<TestPushOutcome | void>;
  autoLockMinutes: number;
  onChangeAutoLockMinutes: (mins: number) => void;
  onLockNow: () => void;
  lastSignInTime?: string;
  theme: ThemePreference;
  onChangeTheme: (next: ThemePreference) => void;
  wallet: Wallet;
  onClaimReward: (payload: ClaimableRewardPayload) => Promise<void>;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({
  rider,
  googlePhotoUrl = '',
  privateInfo,
  driverApplication = null,
  deliveries,
  tariffs,
  departments,
  ratings,
  onSaveProfile,
  onUpdatePhoto,
  onOpenDriverVerification,
  onUpdateNotifications,
  onTriggerDailyEarningsSummary,
  onRateDelivery,
  pushPermission,
  pushSubscribed,
  dailySummaryText,
  onEnablePush,
  onDisablePush,
  onRefreshPush,
  onTestPush,
  autoLockMinutes,
  onChangeAutoLockMinutes,
  onLockNow,
  lastSignInTime,
  theme,
  onChangeTheme,
  wallet,
  onClaimReward,
}) => {
  const deptList = departments.length > 0 ? departments : DEFAULT_DEPARTMENTS;
  const [displayName, setDisplayName] = useState(rider.displayName);
  const [motoName, setMotoName] = useState(rider.motoName);
  const [motoModel, setMotoModel] = useState(rider.motoModel);
  const [motoPlate, setMotoPlate] = useState(rider.motoPlate);
  const [motoColor, setMotoColor] = useState(rider.motoColor);
  const [departmentId, setDepartmentId] = useState(
    rider.departmentId || deptList[0].id
  );
  const [phone, setPhone] = useState(privateInfo?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSavedToast, setPhotoSavedToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [notifPrefs, setNotifPrefs] = useState({
    notifUrgent: privateInfo?.notifUrgent ?? true,
    notifRouteRecalc: privateInfo?.notifRouteRecalc ?? true,
    notifDailyEarnings: privateInfo?.notifDailyEarnings ?? true,
    notifGpsProximity: privateInfo?.notifGpsProximity ?? true,
    notifSound: privateInfo?.notifSound ?? false,
  });
  const [dailyTime, setDailyTime] = useState(
    privateInfo?.dailyEarningsTime || '20:00'
  );
  const [savingDailyTime, setSavingDailyTime] = useState(false);
  const [dailyTimeSaved, setDailyTimeSaved] = useState(false);

  useEffect(() => {
    setDisplayName(rider.displayName);
    setMotoName(rider.motoName);
    setMotoModel(rider.motoModel);
    setMotoPlate(rider.motoPlate);
    setMotoColor(rider.motoColor);
    setDepartmentId(rider.departmentId || deptList[0].id);
  }, [rider, deptList]);

  useEffect(() => {
    if (privateInfo) {
      setPhone(privateInfo.phone || '');
      setNotifPrefs({
        notifUrgent: privateInfo.notifUrgent,
        notifRouteRecalc: privateInfo.notifRouteRecalc,
        notifDailyEarnings: privateInfo.notifDailyEarnings,
        notifGpsProximity: privateInfo.notifGpsProximity,
        notifSound: privateInfo.notifSound,
      });
      if (privateInfo.dailyEarningsTime) {
        setDailyTime(privateInfo.dailyEarningsTime);
      }
    }
  }, [privateInfo]);

  const myDeliveries = deliveries.filter(
    (d) => d.assignedRiderUid === rider.uid || d.createdByUid === rider.uid
  );
  const myCompleted = myDeliveries.filter((d) => d.status === 'delivered');
  const myRatings = ratings.filter((r) => r.riderUid === rider.uid);
  const computedAvgRating =
    myRatings.length > 0
      ? myRatings.reduce((acc, r) => acc + r.score, 0) / myRatings.length
      : rider.rating;

  const handlePhotoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setUpdatingPhoto(true);
    try {
      const compressed = await processProfilePhotoFile(file);
      await onUpdatePhoto(compressed);
      setPhotoSavedToast(true);
      setTimeout(() => setPhotoSavedToast(false), 3000);
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar tu foto de perfil.'
      );
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleApplyDirectPhoto = async (nextUrl: string) => {
    setPhotoError(null);
    setUpdatingPhoto(true);
    try {
      await onUpdatePhoto(nextUrl);
      setPhotoSavedToast(true);
      setTimeout(() => setPhotoSavedToast(false), 3000);
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar tu foto de perfil.'
      );
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await onSaveProfile({
        displayName: displayName.trim().slice(0, 80),
        motoName: motoName.trim().slice(0, 80),
        motoModel: motoModel.trim().slice(0, 80),
        motoPlate: motoPlate.trim().slice(0, 24),
        motoColor,
        departmentId,
        phone: phone.trim().slice(0, 32),
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleToggleNotif = async (key: keyof typeof notifPrefs) => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    await onUpdateNotifications({
      ...next,
      dailyEarningsTime: dailyTime,
    });
  };

  const handleSaveDailyTime = async () => {
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(dailyTime)) return;
    setSavingDailyTime(true);
    try {
      const next = {
        ...notifPrefs,
        notifDailyEarnings: true,
        dailyEarningsTime: dailyTime,
      };
      setNotifPrefs({
        notifUrgent: next.notifUrgent,
        notifRouteRecalc: next.notifRouteRecalc,
        notifDailyEarnings: true,
        notifGpsProximity: next.notifGpsProximity,
        notifSound: next.notifSound,
      });
      await onUpdateNotifications(next);
      setDailyTimeSaved(true);
      setTimeout(() => setDailyTimeSaved(false), 3000);
    } finally {
      setSavingDailyTime(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Performance Statistics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Entregas Completadas</span>
            <Award className="w-4 h-4 text-orange-600" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {rider.completedCount}
          </div>
          <div className="text-xs text-slate-500">Historial verificado</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Tasa de Puntualidad</span>
            <Clock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-emerald-700">
            {rider.onTimeRate.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500">Entregas dentro de SLA</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Distancia Recorrida</span>
            <MapPin className="w-4 h-4 text-slate-400" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {rider.totalKm.toFixed(1)} km
          </div>
          <div className="text-xs text-slate-500">
            {rider.departmentName || 'Departamento Centro'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Calificación de Servicio</span>
            <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {computedAvgRating.toFixed(2)} / 5.0
          </div>
          <div className="text-xs text-slate-500">
            {myRatings.length || rider.ratingCount || 0} evaluaciones
          </div>
        </div>
      </div>

      {/* Driver Verification Status Strip */}
      {(() => {
        const vStatus =
          driverApplication?.status || rider.verificationStatus || 'unsubmitted';
        const isApproved = vStatus === 'approved' || rider.role === 'admin';
        const isPending = vStatus === 'pending_review';
        const isRejected = vStatus === 'rejected';
        return (
          <div
            className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
              isApproved
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : isPending
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : isRejected
                ? 'bg-red-50 border-red-200 text-red-950'
                : 'bg-slate-100 border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <div className="text-xs">
                <div className="font-bold">
                  Estado de Habilitación como Conductor:{' '}
                  {isApproved
                    ? 'Conductor Aprobado'
                    : VERIFICATION_STATUS_LABELS[vStatus]}
                </div>
                <div className="opacity-80 mt-0.5">
                  {isApproved
                    ? 'Cédula, licencia, seguro, circulación, foto de moto y mayoría de edad (18+) verificados.'
                    : isPending
                    ? 'Tu solicitud está en período de revisión de 12 horas para confirmar tu aprobación.'
                    : isRejected
                    ? driverApplication?.reviewNote ||
                      'Corrige y reenvía tus documentos y foto de moto para habilitar Modo Conductor.'
                    : 'Debes enviar cédula, licencia, teléfono, dirección exacta, seguro, circulación, foto actualizada de tu moto y tener 18+ años.'}
                </div>
              </div>
            </div>
            {!isApproved && onOpenDriverVerification && (
              <button
                type="button"
                onClick={onOpenDriverVerification}
                className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                {isPending ? 'Ver Cuenta Regresiva (12h)' : 'Completar Documentos'}
              </button>
            )}
          </div>
        );
      })()}

      {/* Driver Stages (Bronce -> Gran Maestro), Free Trips & Detailed Achievements */}
      <DriverProgressionPanel
        rider={rider}
        wallet={wallet}
        application={driverApplication}
        platformFeePct={tariffs.platformFeePct}
        onClaimReward={onClaimReward}
      />

      {/* Personalization & Notification Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-4 min-w-0">
              <UserAvatar
                photoUrl={rider.photoUrl}
                name={rider.displayName}
                color={motoColor}
                size={68}
                onEditClick={() => fileInputRef.current?.click()}
                editLabel="Cambiar foto de perfil"
              />
              <div className="min-w-0">
                <h3 className="font-display text-lg font-bold text-slate-900 truncate">
                  {rider.displayName}
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {privateInfo?.email || 'Cuenta verificada'} · Edita tu foto cuando desees
                </p>
                {photoSavedToast && (
                  <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 mt-1">
                    <Check className="w-3.5 h-3.5" />
                    Foto de perfil guardada
                  </p>
                )}
                {photoError && (
                  <p className="text-xs font-medium text-red-600 mt-1">
                    {photoError}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                onChange={(e) => void handlePhotoFileChange(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={updatingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{updatingPhoto ? 'Guardando...' : 'Cambiar foto'}</span>
              </button>
              {googlePhotoUrl && rider.photoUrl !== googlePhotoUrl && (
                <button
                  type="button"
                  disabled={updatingPhoto}
                  onClick={() => void handleApplyDirectPhoto(googlePhotoUrl)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-orange-600" />
                  <span>Google</span>
                </button>
              )}
              {rider.photoUrl && (
                <button
                  type="button"
                  disabled={updatingPhoto}
                  onClick={() => void handleApplyDirectPhoto('')}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-red-50 text-slate-600 hover:text-red-700 disabled:opacity-60 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  title="Quitar foto de perfil"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Quitar</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 pb-2">
            <MotoPhotoBadge color={motoColor} size={56} />
            <div>
              <h4 className="font-display text-base font-bold text-slate-900">
                Identidad de Unidad y Departamento
              </h4>
              <p className="text-xs text-slate-500">
                Personaliza el nombre, emblema y zona de tu motocicleta
              </p>
            </div>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre del Motociclista
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre de tu Moto
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={motoName}
                  onChange={(e) => setMotoName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modelo
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={motoModel}
                  onChange={(e) => setMotoModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Placa
                </label>
                <input
                  type="text"
                  required
                  maxLength={24}
                  value={motoPlate}
                  onChange={(e) => setMotoPlate(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Departamento
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                >
                  {deptList.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Teléfono Privado
                </label>
                <input
                  type="tel"
                  maxLength={32}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Color del Emblema Moto Mandados
              </label>
              <div className="flex flex-wrap gap-2">
                {MOTO_COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMotoColor(opt.id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                      motoColor === opt.id
                        ? 'border-slate-900 bg-slate-50 font-semibold text-slate-900'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: opt.id }}
                    />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-3">
              {savedToast && (
                <span className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-emerald-700">
                  <Check className="w-4 h-4" />
                  Cambios guardados
                </span>
              )}
              <button
                type="submit"
                disabled={savingProfile}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {savingProfile ? 'Guardando...' : 'Guardar Perfil y Moto'}
              </button>
            </div>
          </form>
        </div>

        {/* Appearance & Notifications Configuration */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                {theme === 'dark' ? (
                  <Moon className="w-4 h-4 text-orange-600 shrink-0" />
                ) : (
                  <Sun className="w-4 h-4 text-orange-600 shrink-0" />
                )}
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Apariencia y Modo Nocturno
                  </h3>
                  <p className="text-xs text-slate-500">
                    Reduce la fatiga visual en entregas nocturnas
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                {theme === 'dark' ? 'Oscuro activo' : 'Claro activo'}
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="Seleccionar tema de interfaz"
              className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl"
            >
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'light'}
                onClick={() => onChangeTheme('light')}
                className={`min-h-[44px] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Tema Claro</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'dark'}
                onClick={() => onChangeTheme('dark')}
                className={`min-h-[44px] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  theme === 'dark'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Moon className="w-4 h-4 text-orange-500 shrink-0" />
                <span>Oscuro Nocturno</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Tu preferencia se guarda automáticamente en tu cuenta para mantener la misma vista en cualquier dispositivo, incluso en el mapa en vivo.
            </p>
          </div>

          <PWAInstallButton variant="card" />

          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200">
              <Bell className="w-4 h-4 text-orange-600 shrink-0" />
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Notificaciones Personalizadas
                </h3>
                <p className="text-xs text-slate-500">
                  Configura alertas prioritarias para tu jornada
                </p>
              </div>
            </div>

          <div className="divide-y divide-slate-200">
            {(
              [
                {
                  key: 'notifUrgent',
                  title: 'Alertas de Servicio Súper Exprés',
                  desc: 'Aviso inmediato cuando ingresa un pedido prioritario.',
                },
                {
                  key: 'notifRouteRecalc',
                  title: 'Recálculo Automático de Ruta',
                  desc: 'Notificar al detectar cambios de tráfico o nuevas paradas.',
                },
                {
                  key: 'notifGpsProximity',
                  title: 'Proximidad GPS en Parada',
                  desc: 'Confirmación rápida al acercarte a menos de 150m del destino.',
                },
                {
                  key: 'notifDailyEarnings',
                  title: 'Resumen Diario de Ganancias y QR',
                  desc: 'Avisos de abonos y recargas acreditadas en tu saldo.',
                },
                {
                  key: 'notifSound',
                  title: 'Sonido de Alerta Prioritaria',
                  desc: 'Señal acústica para solicitudes urgentes asignadas.',
                },
              ] as const
            ).map((item) => {
              const active = notifPrefs[item.key];
              return (
                <div
                  key={item.key}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-500">{item.desc}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    onClick={() => void handleToggleNotif(item.key)}
                    className={`w-10 h-6 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                      active ? 'bg-orange-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                        active ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Scheduled Daily Earnings Push Time Picker */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-600 shrink-0" />
                <span className="text-xs font-bold text-slate-900">
                  Hora del Resumen Diario de Ganancias
                </span>
              </div>
              {dailyTimeSaved && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                  Programada
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              {notifPrefs.notifDailyEarnings
                ? `Recibirás un resumen push automático con tus entregas y ganancias del día todos los días a las ${
                    privateInfo?.dailyEarningsTime || dailyTime
                  } hrs.`
                : 'El resumen diario está pausado. Al guardar una hora se activará automáticamente.'}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <input
                type="time"
                aria-label="Hora programada para resumen diario de ganancias"
                value={dailyTime}
                onChange={(e) => setDailyTime(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono font-semibold text-slate-900"
              />
              <button
                type="button"
                disabled={savingDailyTime || !dailyTime}
                onClick={() => void handleSaveDailyTime()}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                {savingDailyTime ? 'Guardando...' : 'Guardar Hora'}
              </button>
              {onTriggerDailyEarningsSummary && (
                <button
                  type="button"
                  onClick={() => void onTriggerDailyEarningsSummary()}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Enviar Resumen Ahora
                </button>
              )}
            </div>

            {pushPermission !== 'granted' && (
              <div className="text-[11px] text-amber-800 flex items-center justify-between gap-2 pt-1">
                <span>
                  Activa los permisos Push del navegador para recibir este resumen en segundo plano.
                </span>
                {pushPermission === 'default' && (
                  <button
                    type="button"
                    onClick={() => void onEnablePush()}
                    className="font-semibold text-orange-700 hover:underline cursor-pointer shrink-0"
                  >
                    Activar
                  </button>
                )}
              </div>
            )}
          </div>

          <PushSubscriptionStudio
            pushPermission={pushPermission}
            pushSubscribed={pushSubscribed}
            soundEnabled={notifPrefs.notifSound}
            dailySummaryText={dailySummaryText}
            onEnablePush={onEnablePush}
            onDisablePush={onDisablePush}
            onRefreshPush={onRefreshPush}
            onTestPush={onTestPush}
          />

          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Seguridad de Sesión y Bloqueo Automático
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Correo verificado · Google OAuth 2.0
                    {lastSignInTime ? ` · Último acceso: ${lastSignInTime}` : ''}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700">
                Bloqueo por inactividad:
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={autoLockMinutes}
                  onChange={(e) => onChangeAutoLockMinutes(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                >
                  <option value={5}>5 minutos</option>
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={60}>60 minutos</option>
                  <option value={0}>Solo manual</option>
                </select>
                <button
                  type="button"
                  onClick={onLockNow}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer whitespace-nowrap"
                >
                  Bloquear Ahora
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Received Ratings Showcase */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Calificaciones y Reseñas Recibidas
            </h3>
            <p className="text-xs text-slate-500">
              Evaluación de clientes y despachos completados por {rider.motoName}
            </p>
          </div>
          <div className="font-mono tabular-nums text-sm font-bold text-slate-900 flex items-center gap-1">
            <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
            <span>{computedAvgRating.toFixed(2)}</span>
          </div>
        </div>

        {myRatings.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">
            Todavía no hay reseñas registradas. Califica tus entregas completadas abajo para generar historial de servicio.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {myRatings.slice(0, 6).map((rev) => (
              <div
                key={rev.id}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= rev.score
                            ? 'fill-amber-400 text-amber-500'
                            : 'text-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {formatShortDate(rev.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-slate-700">
                  {rev.comment || 'Servicio completado sin observaciones adicionales.'}
                </p>
                <div className="text-[11px] text-slate-500">
                  Evaluado por {rev.authorName}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Personal Delivery History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Historial de Entregas de {rider.motoName}
            </h3>
            <p className="text-xs text-slate-500">
              {myCompleted.length} completadas de {myDeliveries.length} asociadas a tu cuenta
            </p>
          </div>
        </div>

        {myDeliveries.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Todavía no tienes entregas registradas en tu historial personal.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Fecha</th>
                  <th className="py-2.5 px-3">Servicio / Destino</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Distancia</th>
                  <th className="py-2.5 px-3 text-right">Ganancia Neta</th>
                  <th className="py-2.5 px-4 text-right">Calificación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {myDeliveries.slice(0, 20).map((del) => (
                  <tr key={del.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                      {formatShortDate(del.createdAt)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{del.title}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">
                        {SERVICE_CATEGORY_LABELS[del.serviceCategory || 'delivery']} · {del.departmentName} · {del.dropoffAddress}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={
                          del.status === 'delivered'
                            ? 'text-emerald-700 font-semibold'
                            : 'text-slate-700 font-medium'
                        }
                      >
                        {STATUS_LABELS[del.status]}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {del.distanceKm.toFixed(2)} km
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {formatCurrency(del.riderEarnings, tariffs.currency)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {del.status === 'delivered' ? (
                        del.rated ? (
                          <span className="text-emerald-700 font-semibold">Calificada</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onRateDelivery(del)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                          >
                            <Star className="w-3 h-3 text-amber-500" />
                            <span>Calificar</span>
                          </button>
                        )
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
