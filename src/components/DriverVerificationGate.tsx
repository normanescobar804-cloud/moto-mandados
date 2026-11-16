import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Clock,
  FileText,
  CreditCard,
  Phone,
  MapPin,
  Shield,
  Car,
  Calendar,
  AlertTriangle,
  Upload,
  Trash2,
  CheckCircle2,
  User as UserIcon,
  Edit3,
  Camera,
  Bike,
} from 'lucide-react';
import {
  Department,
  DriverApplication,
  RiderProfile,
  UserPrivateInfo,
} from '../types';
import {
  MIN_DRIVER_AGE,
  calculateAgeFromIsoDate,
  formatCountdownHms,
  formatDateTimeEs,
  getMaxAdultBirthDateIso,
  getReviewWindowState,
  parseIsoDateUtcMs,
  processDocumentImageFile,
} from '../utils/driverVerification';

export interface DriverApplicationSubmitPayload {
  birthDate: string;
  birthDateMs: number;
  cedulaNumber: string;
  licenseNumber: string;
  phone: string;
  exactAddress: string;
  insuranceNumber: string;
  circulationNumber: string;
  cedulaPhotoUrl: string;
  licensePhotoUrl: string;
  insurancePhotoUrl: string;
  circulationPhotoUrl: string;
  motoPhotoUrl: string;
}

interface DriverVerificationGateProps {
  currentRider: RiderProfile;
  privateInfo: UserPrivateInfo | null;
  departments: Department[];
  application: DriverApplication | null;
  onSubmitApplication: (data: DriverApplicationSubmitPayload) => Promise<void>;
  onSwitchToPassenger: () => void;
}

interface DocPhotoFieldProps {
  label: string;
  value: string;
  processing: boolean;
  onSelectFile: (file: File) => void;
  onClear: () => void;
}

const DocPhotoField: React.FC<DocPhotoFieldProps> = ({
  label,
  value,
  processing,
  onSelectFile,
  onClear,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onSelectFile(f);
        }}
        className="hidden"
      />
      {value ? (
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={value}
            alt={label}
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-md object-cover border border-slate-200 shrink-0"
          />
          <span className="text-[11px] font-semibold text-emerald-700 truncate">
            Comprobante adjunto
          </span>
        </div>
      ) : (
        <span className="text-[11px] text-slate-500 truncate">
          Foto / comprobante opcional ({label})
        </span>
      )}

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          disabled={processing}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60 text-[11px] font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
        >
          <Upload className="w-3 h-3 text-orange-600" />
          <span>{processing ? 'Cargando...' : value ? 'Cambiar' : 'Adjuntar'}</span>
        </button>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="p-1 rounded-md border border-slate-200 bg-white hover:bg-red-50 text-slate-500 hover:text-red-700 cursor-pointer"
            title="Quitar foto"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export const DriverVerificationGate: React.FC<DriverVerificationGateProps> = ({
  currentRider,
  privateInfo,
  departments,
  application,
  onSubmitApplication,
  onSwitchToPassenger,
}) => {
  const effectiveStatus =
    application?.status || currentRider.verificationStatus || 'unsubmitted';

  const [editingPending, setEditingPending] = useState(false);
  const [birthDate, setBirthDate] = useState(
    application?.birthDate || privateInfo?.birthDate || ''
  );
  const [cedulaNumber, setCedulaNumber] = useState(
    application?.cedulaNumber || ''
  );
  const [licenseNumber, setLicenseNumber] = useState(
    application?.licenseNumber || ''
  );
  const [phone, setPhone] = useState(
    application?.phone || privateInfo?.phone || ''
  );
  const [exactAddress, setExactAddress] = useState(
    application?.exactAddress || ''
  );
  const [insuranceNumber, setInsuranceNumber] = useState(
    application?.insuranceNumber || ''
  );
  const [circulationNumber, setCirculationNumber] = useState(
    application?.circulationNumber || ''
  );

  const [cedulaPhotoUrl, setCedulaPhotoUrl] = useState(
    application?.cedulaPhotoUrl || ''
  );
  const [licensePhotoUrl, setLicensePhotoUrl] = useState(
    application?.licensePhotoUrl || ''
  );
  const [insurancePhotoUrl, setInsurancePhotoUrl] = useState(
    application?.insurancePhotoUrl || ''
  );
  const [circulationPhotoUrl, setCirculationPhotoUrl] = useState(
    application?.circulationPhotoUrl || ''
  );
  const [motoPhotoUrl, setMotoPhotoUrl] = useState(
    application?.motoPhotoUrl || ''
  );
  const motoPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const [processingField, setProcessingField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (application) {
      setBirthDate(application.birthDate || privateInfo?.birthDate || '');
      setCedulaNumber(application.cedulaNumber || '');
      setLicenseNumber(application.licenseNumber || '');
      setPhone(application.phone || privateInfo?.phone || '');
      setExactAddress(application.exactAddress || '');
      setInsuranceNumber(application.insuranceNumber || '');
      setCirculationNumber(application.circulationNumber || '');
      setCedulaPhotoUrl(application.cedulaPhotoUrl || '');
      setLicensePhotoUrl(application.licensePhotoUrl || '');
      setInsurancePhotoUrl(application.insurancePhotoUrl || '');
      setCirculationPhotoUrl(application.circulationPhotoUrl || '');
      setMotoPhotoUrl(application.motoPhotoUrl || '');
    } else {
      if (privateInfo?.birthDate && !birthDate) {
        setBirthDate(privateInfo.birthDate);
      }
      if (privateInfo?.phone && !phone) {
        setPhone(privateInfo.phone);
      }
    }
  }, [application, privateInfo]);

  useEffect(() => {
    if (effectiveStatus !== 'pending_review') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [effectiveStatus]);

  const computedAge = birthDate ? calculateAgeFromIsoDate(birthDate) : null;
  const maxAdultBirthDate = getMaxAdultBirthDateIso();
  const deptName =
    departments.find((d) => d.id === currentRider.departmentId)?.name ||
    currentRider.departmentName;

  const handlePhotoUpload = async (
    field: 'cedula' | 'license' | 'insurance' | 'circulation' | 'moto',
    file: File
  ) => {
    setFormError(null);
    setProcessingField(field);
    try {
      const compressed = await processDocumentImageFile(file);
      if (field === 'cedula') setCedulaPhotoUrl(compressed);
      if (field === 'license') setLicensePhotoUrl(compressed);
      if (field === 'insurance') setInsurancePhotoUrl(compressed);
      if (field === 'circulation') setCirculationPhotoUrl(compressed);
      if (field === 'moto') setMotoPhotoUrl(compressed);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo adjuntar la imagen.'
      );
    } finally {
      setProcessingField(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const age = calculateAgeFromIsoDate(birthDate);
    const birthDateMs = parseIsoDateUtcMs(birthDate);
    if (age === null || birthDateMs === null) {
      setFormError('Ingresa una fecha de nacimiento válida.');
      return;
    }
    if (age < MIN_DRIVER_AGE) {
      setFormError(
        `Debes tener ${MIN_DRIVER_AGE} años o más para registrarte y trabajar como conductor en Moto Mandados (edad actual: ${age} años).`
      );
      return;
    }
    if (cedulaNumber.trim().length < 5) {
      setFormError('Ingresa un número de cédula válido (mínimo 5 caracteres).');
      return;
    }
    if (licenseNumber.trim().length < 5) {
      setFormError(
        'Ingresa tu número de licencia de conducir vigente (mínimo 5 caracteres).'
      );
      return;
    }
    if (phone.trim().length < 7) {
      setFormError('Ingresa un número de teléfono válido (mínimo 7 dígitos).');
      return;
    }
    if (exactAddress.trim().length < 10) {
      setFormError(
        'Ingresa tu dirección exacta completa (calle, número, colonia/barrio y referencia).'
      );
      return;
    }
    if (insuranceNumber.trim().length < 4) {
      setFormError(
        'Ingresa el número de póliza o seguro vigente de tu motocicleta.'
      );
      return;
    }
    if (circulationNumber.trim().length < 4) {
      setFormError(
        'Ingresa el número de tarjeta o matrícula de circulación de tu motocicleta.'
      );
      return;
    }
    if (!motoPhotoUrl) {
      setFormError(
        'Debes subir una foto actualizada de tu motocicleta para completar la verificación.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitApplication({
        birthDate: birthDate.trim(),
        birthDateMs,
        cedulaNumber: cedulaNumber.trim(),
        licenseNumber: licenseNumber.trim(),
        phone: phone.trim(),
        exactAddress: exactAddress.trim(),
        insuranceNumber: insuranceNumber.trim(),
        circulationNumber: circulationNumber.trim(),
        cedulaPhotoUrl,
        licensePhotoUrl,
        insurancePhotoUrl,
        circulationPhotoUrl,
        motoPhotoUrl,
      });
      setEditingPending(false);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'No se pudo enviar tu solicitud. Revisa tus datos e intenta de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (effectiveStatus === 'pending_review' && application && !editingPending) {
    const win = getReviewWindowState(application.submittedAt, nowMs);
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-700">
                  Verificación de Conductor en Curso
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
                  Solicitud recibida · Espera de 12 horas para confirmar aprobación
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Tus documentos fueron enviados correctamente. Nuestro equipo validará tu cédula, licencia, seguro, circulación y mayoría de edad dentro de un plazo de 12 horas.
                </p>
              </div>
            </div>

            <div className="px-4 py-3 rounded-xl bg-slate-900 text-white text-center shrink-0 w-full md:w-auto md:min-w-[175px]">
              <div className="text-[11px] font-medium text-slate-300">
                {win.isWindowComplete
                  ? 'Plazo de 12h cumplido'
                  : 'Tiempo restante (12h)'}
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-orange-400 mt-0.5">
                {win.isWindowComplete ? '00:00:00' : formatCountdownHms(win.remainingMs)}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-600">
              <span>
                Enviado: <strong className="text-slate-900">{formatDateTimeEs(win.submittedMs)}</strong>
              </span>
              <span>
                Confirmación estimada: <strong className="text-slate-900">{formatDateTimeEs(win.reviewReadyAtMs)}</strong>
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-orange-600 transition-all duration-500"
                style={{ width: `${win.progressPct}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              {win.isWindowComplete
                ? 'El tiempo de espera de 12 horas se completó. Tu solicitud está lista para confirmación final del administrador.'
                : `Progreso del período de verificación de 12 horas: ${win.progressPct}%. Recibirás una alerta en tu panel en cuanto sea aprobada.`}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-orange-600" />
                Número de Cédula
              </div>
              <div className="font-mono text-sm font-bold text-slate-900">
                {application.cedulaNumber}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-orange-600" />
                Licencia de Conducir
              </div>
              <div className="font-mono text-sm font-bold text-slate-900">
                {application.licenseNumber}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-orange-600" />
                Teléfono
              </div>
              <div className="font-mono text-sm font-bold text-slate-900">
                {application.phone}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-orange-600" />
                Seguro de Moto
              </div>
              <div className="font-mono text-sm font-bold text-slate-900">
                {application.insuranceNumber}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-orange-600" />
                Circulación
              </div>
              <div className="font-mono text-sm font-bold text-slate-900">
                {application.circulationNumber}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-orange-600" />
                Edad Verificada (18+)
              </div>
              <div className="text-sm font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {calculateAgeFromIsoDate(application.birthDate) ?? 18} años ({application.birthDate})
                </span>
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-orange-600" />
                Dirección Exacta Registrada
              </div>
              <div className="text-xs font-medium text-slate-800">
                {application.exactAddress}
              </div>
            </div>

            {application.motoPhotoUrl && (
              <div className="sm:col-span-2 lg:col-span-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-4">
                <img
                  src={application.motoPhotoUrl}
                  alt={`Foto actualizada de ${application.motoName}`}
                  referrerPolicy="no-referrer"
                  className="w-32 h-24 rounded-lg object-cover border border-slate-200 shrink-0"
                />
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                    <Bike className="w-3.5 h-3.5 text-orange-600" />
                    Foto Actualizada de Motocicleta Adjunta
                  </div>
                  <div className="text-xs font-bold text-slate-900">
                    {application.motoName} · Placa {application.motoPlate}
                  </div>
                  <p className="text-[11px] text-emerald-700 font-semibold">
                    Fotografía actual enviada para inspección visual de la unidad.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setEditingPending(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Edit3 className="w-4 h-4 text-slate-500" />
              <span>Actualizar o Corregir Documentos</span>
            </button>

            <button
              type="button"
              onClick={onSwitchToPassenger}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <UserIcon className="w-4 h-4" />
              <span>Usar Modo Pasajero mientras esperas</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-orange-700">
                Requisitos Obligatorios para Trabajar en Moto Mandados
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 mt-0.5">
                Formulario de Documentos del Conductor
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Para activar el Modo Conductor para <strong className="text-slate-900">{currentRider.motoName}</strong> ({currentRider.motoPlate} · {deptName}), completa los documentos requeridos, sube una foto actualizada de tu moto y confirma que tienes 18 años en adelante.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSwitchToPassenger}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap shrink-0"
          >
            <UserIcon className="w-3.5 h-3.5 text-orange-600" />
            <span>Ir a Modo Pasajero</span>
          </button>
        </div>

        {effectiveStatus === 'rejected' && application?.reviewNote && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs font-bold text-red-900">
                Tu solicitud anterior fue rechazada · Corrige y reenvía tus documentos
              </div>
              <p className="text-xs text-red-800">{application.reviewNote}</p>
            </div>
          </div>
        )}

        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-950 space-y-1">
            <div className="font-bold">
              Tiempo de validación: 12 horas para confirmar aprobación
            </div>
            <p className="text-amber-900">
              Solo personas mayores de 18 años pueden registrarse como conductores. Al enviar este formulario, iniciará el período de revisión de 12 horas para verificar tu documentación y habilitar tus rutas.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Age 18+ & Phone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Calendar className="w-4 h-4 text-orange-600" />
                <span>Fecha de Nacimiento (Mínimo 18 años) *</span>
              </label>
              <input
                type="date"
                required
                max={maxAdultBirthDate}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              {computedAge !== null && (
                <div
                  className={`text-xs font-semibold ${
                    computedAge >= MIN_DRIVER_AGE
                      ? 'text-emerald-700'
                      : 'text-red-600'
                  }`}
                >
                  {computedAge >= MIN_DRIVER_AGE
                    ? `Edad verificada: ${computedAge} años (Cumple requisito 18+)`
                    : `Edad calculada: ${computedAge} años · No cumple el mínimo de 18 años`}
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Phone className="w-4 h-4 text-orange-600" />
                <span>Número de Teléfono Activo *</span>
              </label>
              <input
                type="tel"
                required
                minLength={7}
                maxLength={32}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. +52 55 1234 5678"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <p className="text-[11px] text-slate-500">
                Resguardado de forma privada para coordinación y emergencias.
              </p>
            </div>
          </div>

          {/* Cedula & Driver License */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <CreditCard className="w-4 h-4 text-orange-600" />
                <span>Número de Cédula / Identificación *</span>
              </label>
              <input
                type="text"
                required
                minLength={5}
                maxLength={40}
                value={cedulaNumber}
                onChange={(e) => setCedulaNumber(e.target.value.toUpperCase())}
                placeholder="Ej. 001-140599-0021K"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <DocPhotoField
                label="Cédula"
                value={cedulaPhotoUrl}
                processing={processingField === 'cedula'}
                onSelectFile={(f) => void handlePhotoUpload('cedula', f)}
                onClear={() => setCedulaPhotoUrl('')}
              />
            </div>

            <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <FileText className="w-4 h-4 text-orange-600" />
                <span>Licencia de Conducir (Categoría Moto) *</span>
              </label>
              <input
                type="text"
                required
                minLength={5}
                maxLength={40}
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
                placeholder="Ej. LIC-MOTO-884210"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <DocPhotoField
                label="Licencia"
                value={licensePhotoUrl}
                processing={processingField === 'license'}
                onSelectFile={(f) => void handlePhotoUpload('license', f)}
                onClear={() => setLicensePhotoUrl('')}
              />
            </div>
          </div>

          {/* Insurance & Circulation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Shield className="w-4 h-4 text-orange-600" />
                <span>Seguro de Motocicleta (Póliza Vigente) *</span>
              </label>
              <input
                type="text"
                required
                minLength={4}
                maxLength={60}
                value={insuranceNumber}
                onChange={(e) => setInsuranceNumber(e.target.value.toUpperCase())}
                placeholder="Ej. POL-SEG-2026-9941"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <DocPhotoField
                label="Seguro"
                value={insurancePhotoUrl}
                processing={processingField === 'insurance'}
                onSelectFile={(f) => void handlePhotoUpload('insurance', f)}
                onClear={() => setInsurancePhotoUrl('')}
              />
            </div>

            <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Car className="w-4 h-4 text-orange-600" />
                <span>Tarjeta de Circulación *</span>
              </label>
              <input
                type="text"
                required
                minLength={4}
                maxLength={60}
                value={circulationNumber}
                onChange={(e) => setCirculationNumber(e.target.value.toUpperCase())}
                placeholder="Ej. CIRC-MT-552019"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <DocPhotoField
                label="Circulación"
                value={circulationPhotoUrl}
                processing={processingField === 'circulation'}
                onSelectFile={(f) => void handlePhotoUpload('circulation', f)}
                onClear={() => setCirculationPhotoUrl('')}
              />
            </div>
          </div>

          {/* Exact Address */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <MapPin className="w-4 h-4 text-orange-600" />
              <span>Dirección Exacta de Domicilio *</span>
            </label>
            <textarea
              required
              minLength={10}
              maxLength={240}
              rows={2}
              value={exactAddress}
              onChange={(e) => setExactAddress(e.target.value)}
              placeholder="Ej. Calle Reforma #214, Colonia Centro, casa color blanco frente al parque, Ciudad de México"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Required Up-to-Date Motorcycle Photo */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Bike className="w-4 h-4 text-orange-600" />
                  <span>Foto Actualizada de tu Motocicleta (Obligatorio) *</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Sube una fotografía reciente donde se aprecie el estado actual de tu moto y su placa visible ({currentRider.motoPlate}) para validar tu unidad de trabajo.
                </p>
              </div>
              <input
                ref={motoPhotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handlePhotoUpload('moto', f);
                }}
                className="hidden"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={processingField === 'moto'}
                  onClick={() => motoPhotoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Camera className="w-3.5 h-3.5 text-orange-400" />
                  <span>
                    {processingField === 'moto'
                      ? 'Procesando foto...'
                      : motoPhotoUrl
                      ? 'Actualizar foto de moto'
                      : 'Subir foto de moto'}
                  </span>
                </button>
                {motoPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setMotoPhotoUrl('')}
                    className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-red-50 text-slate-500 hover:text-red-700 cursor-pointer"
                    title="Quitar foto de moto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {motoPhotoUrl ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-xl bg-white border border-slate-200">
                <img
                  src={motoPhotoUrl}
                  alt={`Foto actualizada de ${currentRider.motoName}`}
                  referrerPolicy="no-referrer"
                  className="w-full sm:w-44 h-32 rounded-lg object-cover border border-slate-200 shrink-0"
                />
                <div className="space-y-1 text-xs">
                  <div className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Foto actualizada de moto lista para verificación</span>
                  </div>
                  <div className="text-slate-600">
                    Unidad: <strong className="text-slate-900">{currentRider.motoName}</strong> · {currentRider.motoModel} · Placa <span className="font-mono">{currentRider.motoPlate}</span>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => motoPhotoInputRef.current?.click()}
                className="w-full py-6 px-4 rounded-xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition-colors"
              >
                <Camera className="w-6 h-6 text-orange-600" />
                <span className="text-xs font-semibold text-slate-800">
                  Haz clic aquí para subir la foto actualizada de tu motocicleta
                </span>
                <span className="text-[11px] text-slate-500">
                  Formatos JPG, PNG o WebP · Requisito obligatorio para trabajar
                </span>
              </button>
            )}
          </div>

          {formError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200">
            {editingPending && (
              <button
                type="button"
                onClick={() => setEditingPending(false)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar edición
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || processingField !== null}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Enviando documentos...'
                  : 'Enviar Documentos y Solicitar Aprobación (12h)'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
