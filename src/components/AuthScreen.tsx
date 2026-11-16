import React, { useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  Navigation,
  Wallet,
  ArrowRight,
  Bike,
  Upload,
  RotateCcw,
  Trash2,
  Lock,
  Laptop,
  Clock,
  CheckCircle2,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  UserPlus,
  RefreshCw,
  ArrowLeft,
  Sun,
  Moon,
} from 'lucide-react';
import {
  HeroMotoIllustration,
  MotoLogoEmblem,
  MotoPhotoBadge,
  UserAvatar,
} from './MotoBrandMark';
import { Department } from '../types';
import { SessionPersistenceMode } from '../firebase';
import { DEFAULT_DEPARTMENTS, MOTO_COLOR_OPTIONS } from '../utils/tariffs';
import { processProfilePhotoFile } from '../utils/avatarImage';
import {
  MIN_DRIVER_AGE,
  calculateAgeFromIsoDate,
  getMaxAdultBirthDateIso,
  parseIsoDateUtcMs,
} from '../utils/driverVerification';
import { useTheme } from '../utils/theme';
import { PWAInstallButton } from './PWAInstallButton';

type AuthMode = 'login' | 'register' | 'reset';

interface AuthScreenProps {
  onLoginGoogle: (persistenceMode: SessionPersistenceMode) => Promise<void>;
  onLoginEmail: (
    email: string,
    password: string,
    persistenceMode: SessionPersistenceMode
  ) => Promise<void>;
  onRegisterEmail: (
    fullName: string,
    email: string,
    password: string,
    persistenceMode: SessionPersistenceMode
  ) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  pendingVerificationEmail: string | null;
  onResendVerification: () => Promise<void>;
  onCheckVerification: () => Promise<void>;
  onCancelVerification: () => Promise<void>;
  isLoggingIn: boolean;
  authError: string | null;
  onClearError: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onLoginGoogle,
  onLoginEmail,
  onRegisterEmail,
  onResetPassword,
  pendingVerificationEmail,
  onResendVerification,
  onCheckVerification,
  onCancelVerification,
  isLoggingIn,
  authError,
  onClearError,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [persistenceMode, setPersistenceMode] =
    useState<SessionPersistenceMode>('local');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [checkingVerified, setCheckingVerified] = useState(false);

  const authPanelRef = useRef<HTMLDivElement | null>(null);

  const passwordRules = useMemo(
    () => ({
      minLen: password.length >= 8,
      hasLetter: /[a-zA-Z]/.test(password),
      hasNumber: /[0-9]/.test(password),
    }),
    [password]
  );
  const isPasswordStrong =
    passwordRules.minLen && passwordRules.hasLetter && passwordRules.hasNumber;

  const switchMode = (next: AuthMode) => {
    setAuthMode(next);
    setLocalError(null);
    setInfoNotice(null);
    onClearError();
  };

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setInfoNotice(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setLocalError('Ingresa un correo electrónico válido.');
      return;
    }
    if (!password) {
      setLocalError('Ingresa tu contraseña.');
      return;
    }
    await onLoginEmail(trimmedEmail, password, persistenceMode);
  };

  const handleSubmitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setInfoNotice(null);
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    if (trimmedName.length < 2) {
      setLocalError('Ingresa tu nombre completo (mínimo 2 caracteres).');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setLocalError('Ingresa un correo electrónico válido.');
      return;
    }
    if (!isPasswordStrong) {
      setLocalError(
        'La contraseña debe tener al menos 8 caracteres, incluir letras y al menos un número.'
      );
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Las contraseñas no coinciden.');
      return;
    }
    await onRegisterEmail(trimmedName, trimmedEmail, password, persistenceMode);
  };

  const handleSubmitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setInfoNotice(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setLocalError('Ingresa el correo electrónico de tu cuenta.');
      return;
    }
    try {
      await onResetPassword(trimmedEmail);
      setInfoNotice(
        `Enviamos un enlace para restablecer tu contraseña a ${trimmedEmail}. Revisa tu bandeja de entrada o correo no deseado.`
      );
    } catch {
      // authError displays upstream error
    }
  };

  const visibleError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50 dark-canvas flex flex-col">
      <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 whitespace-nowrap shrink-0">
            <MotoLogoEmblem size={32} />
            <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-900">
              Moto Mandados
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#rutas"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Rutas Óptimas
            </a>
            <a
              href="#monitoreo"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Unidad Propia
            </a>
            <a
              href="#tarifas"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Finanzas Claras
            </a>
            <a
              href="#seguridad"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Acceso Seguro
            </a>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton variant="compact" />
            <button
              type="button"
              onClick={toggleTheme}
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
              aria-label={
                theme === 'dark'
                  ? 'Cambiar a tema claro'
                  : 'Cambiar a modo oscuro nocturno'
              }
              title={theme === 'dark' ? 'Tema claro' : 'Modo nocturno'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
              <span className="hidden sm:inline">
                {theme === 'dark' ? 'Claro' : 'Nocturno'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                switchMode('login');
                authPanelRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-3 sm:px-4 py-2 min-h-[40px] text-xs sm:text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Iniciar Sesión
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Left / Primary Auth & Headline Column */}
        <div className="lg:col-span-6 flex flex-col justify-center space-y-5 sm:space-y-6">
          <div className="space-y-3">
            <div className="text-xs font-medium text-orange-700 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Moto Mandados</span>
              <span aria-hidden="true">·</span>
              <span>Delivery</span>
              <span aria-hidden="true">·</span>
              <span>Pasajero</span>
              <span aria-hidden="true">·</span>
              <span>Súper Exprés</span>
            </div>

            <h1 className="font-display text-2xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-slate-900 leading-[1.12] [text-wrap:balance]">
              Control total de tus rutas en moto, GPS en vivo y alertas urgentes
            </h1>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
              Accede con tu correo electrónico y contraseña verificados para gestionar entregas, rutas frecuentes y ganancias desde cualquier celular o computadora.
            </p>
          </div>

          {/* Structured Email + Password + Google Auth Card */}
          <div
            ref={authPanelRef}
            id="seguridad"
            className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xs"
          >
            {pendingVerificationEmail ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 pb-4 border-b border-slate-200">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-amber-700" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                      Verifica tu Correo Electrónico
                    </h2>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Por seguridad, enviamos un enlace de confirmación a{' '}
                      <strong className="text-slate-900 break-all">
                        {pendingVerificationEmail}
                      </strong>
                      . Abre el enlace en tu correo y luego presiona el botón para entrar.
                    </p>
                  </div>
                </div>

                {infoNotice && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                    {infoNotice}
                  </div>
                )}

                {visibleError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800"
                  >
                    {visibleError}
                  </div>
                )}

                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={checkingVerified}
                    onClick={async () => {
                      setLocalError(null);
                      setInfoNotice(null);
                      setCheckingVerified(true);
                      try {
                        await onCheckVerification();
                      } finally {
                        setCheckingVerified(false);
                      }
                    }}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {checkingVerified
                        ? 'Comprobando verificación...'
                        : 'Ya verifiqué mi correo · Entrar'}
                    </span>
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={resendingEmail}
                      onClick={async () => {
                        setLocalError(null);
                        setResendingEmail(true);
                        try {
                          await onResendVerification();
                          setInfoNotice(
                            `Reenviamos el correo de verificación a ${pendingVerificationEmail}. Revisa Spam si no aparece.`
                          );
                        } finally {
                          setResendingEmail(false);
                        }
                      }}
                      className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs font-semibold text-slate-800 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${resendingEmail ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {resendingEmail ? 'Enviando...' : 'Reenviar enlace'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void onCancelVerification()}
                      className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Usar otra cuenta</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Card Header + Segmented Navigation */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>Acceso Seguro Moto Mandados</span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      Correo verificado · Cifrado TLS
                    </span>
                  </div>

                  <div
                    role="tablist"
                    aria-label="Opciones de autenticación"
                    className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={authMode === 'login'}
                      onClick={() => switchMode('login')}
                      className={`min-h-[40px] px-1.5 sm:px-2 py-2 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        authMode === 'login'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Iniciar Sesión
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={authMode === 'register'}
                      onClick={() => switchMode('register')}
                      className={`min-h-[40px] px-1.5 sm:px-2 py-2 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        authMode === 'register'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Crear Cuenta
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={authMode === 'reset'}
                      onClick={() => switchMode('reset')}
                      className={`min-h-[40px] px-1.5 sm:px-2 py-2 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        authMode === 'reset'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Recuperar
                    </button>
                  </div>
                </div>

                {infoNotice && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                    {infoNotice}
                  </div>
                )}

                {visibleError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800"
                  >
                    {visibleError}
                  </div>
                )}

                {/* Mode 1: Login with Email + Password */}
                {authMode === 'login' && (
                  <form onSubmit={handleSubmitLogin} className="space-y-4">
                    <div>
                      <label
                        htmlFor="login-email"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Correo electrónico
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="login-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="conductor@correo.com"
                          className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label
                          htmlFor="login-password"
                          className="text-xs font-semibold text-slate-700"
                        >
                          Contraseña
                        </label>
                        <button
                          type="button"
                          onClick={() => switchMode('reset')}
                          className="text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                        >
                          ¿Olvidaste tu contraseña?
                        </button>
                      </div>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full min-h-[44px] pl-10 pr-11 py-2.5 rounded-xl border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                          aria-label={
                            showPassword
                              ? 'Ocultar contraseña'
                              : 'Mostrar contraseña'
                          }
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPersistenceMode('local')}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          persistenceMode === 'local'
                            ? 'border-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Laptop className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900">
                            Dispositivo Personal
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Sesión persistente con auto-bloqueo.
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPersistenceMode('session')}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          persistenceMode === 'session'
                            ? 'border-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Clock className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900">
                            Sesión Temporal
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Se cierra al cerrar el navegador.
                          </div>
                        </div>
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full min-h-[46px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
                    >
                      <Lock className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>
                        {isLoggingIn
                          ? 'Verificando credenciales...'
                          : 'Entrar con Correo y Contraseña'}
                      </span>
                      <ArrowRight className="w-4 h-4 shrink-0" />
                    </button>
                  </form>
                )}

                {/* Mode 2: Register with Email + Password */}
                {authMode === 'register' && (
                  <form onSubmit={handleSubmitRegister} className="space-y-3.5">
                    <div>
                      <label
                        htmlFor="reg-name"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Nombre completo
                      </label>
                      <input
                        id="reg-name"
                        type="text"
                        autoComplete="name"
                        required
                        minLength={2}
                        maxLength={80}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ej. Carlos Mendoza"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="reg-email"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Correo electrónico
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="reg-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="conductor@correo.com"
                          className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="reg-password"
                          className="block text-xs font-semibold text-slate-700 mb-1"
                        >
                          Contraseña (mín. 8)
                        </label>
                        <div className="relative">
                          <input
                            id="reg-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            required
                            minLength={8}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Mínimo 8 caracteres"
                            className="w-full min-h-[44px] pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                            aria-label="Alternar visibilidad de contraseña"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="reg-confirm"
                          className="block text-xs font-semibold text-slate-700 mb-1"
                        >
                          Confirmar contraseña
                        </label>
                        <div className="relative">
                          <input
                            id="reg-confirm"
                            type={showConfirmPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            required
                            minLength={8}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repite tu contraseña"
                            className="w-full min-h-[44px] pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                            aria-label="Alternar visibilidad de confirmación"
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                      <span
                        className={
                          passwordRules.minLen
                            ? 'text-emerald-700 font-semibold'
                            : 'text-slate-500'
                        }
                      >
                        {passwordRules.minLen ? '✓' : '·'} 8+ caracteres
                      </span>
                      <span
                        className={
                          passwordRules.hasLetter
                            ? 'text-emerald-700 font-semibold'
                            : 'text-slate-500'
                        }
                      >
                        {passwordRules.hasLetter ? '✓' : '·'} Incluye letras
                      </span>
                      <span
                        className={
                          passwordRules.hasNumber
                            ? 'text-emerald-700 font-semibold'
                            : 'text-slate-500'
                        }
                      >
                        {passwordRules.hasNumber ? '✓' : '·'} Incluye número
                      </span>
                      {confirmPassword && (
                        <span
                          className={
                            password === confirmPassword
                              ? 'text-emerald-700 font-semibold'
                              : 'text-red-600 font-semibold'
                          }
                        >
                          {password === confirmPassword
                            ? '✓ Coinciden'
                            : '× No coinciden'}
                        </span>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4 shrink-0" />
                      <span>
                        {isLoggingIn
                          ? 'Creando cuenta segura...'
                          : 'Crear Cuenta y Verificar Correo'}
                      </span>
                    </button>
                  </form>
                )}

                {/* Mode 3: Password Reset */}
                {authMode === 'reset' && (
                  <form onSubmit={handleSubmitReset} className="space-y-4">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Ingresa el correo registrado en Moto Mandados y te enviaremos un enlace seguro para restablecer tu contraseña.
                    </p>
                    <div>
                      <label
                        htmlFor="reset-email"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Correo electrónico
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="reset-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="conductor@correo.com"
                          className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
                    >
                      <Mail className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>
                        {isLoggingIn
                          ? 'Enviando enlace...'
                          : 'Enviar Enlace de Recuperación'}
                      </span>
                    </button>
                  </form>
                )}

                {/* Google OAuth Secondary Option */}
                {authMode !== 'reset' && (
                  <div className="space-y-3 pt-1">
                    <div className="relative flex items-center justify-center">
                      <div className="border-t border-slate-200 w-full" />
                      <span className="bg-white px-3 text-[11px] font-medium text-slate-400 whitespace-nowrap">
                        o continúa con
                      </span>
                      <div className="border-t border-slate-200 w-full" />
                    </div>

                    <button
                      type="button"
                      onClick={() => void onLoginGoogle(persistenceMode)}
                      disabled={isLoggingIn}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4 text-orange-600 shrink-0" />
                      <span>Continuar con Google Seguro</span>
                    </button>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Acceso validado por correo verificado</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Documentos y saldos aislados por UID</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div id="rutas" className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Navigation className="w-4 h-4 text-orange-600 shrink-0" />
                <span>Rutas Óptimas</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Reordenamiento automático de paradas y alertas push en vivo.
              </p>
            </div>
            <div id="monitoreo" className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Bike className="w-4 h-4 text-orange-600 shrink-0" />
                <span>Unidad Propia</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Foto de tu moto, verificación de documentos, saldo QR y chat.
              </p>
            </div>
            <div id="tarifas" className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Wallet className="w-4 h-4 text-orange-600 shrink-0" />
                <span>Finanzas Claras</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Desglose transparente de tarifas, recargas QR y exportación CSV.
              </p>
            </div>
          </div>

          <PWAInstallButton variant="card" />
        </div>

        {/* Right / Moto Showcase Column */}
        <div className="lg:col-span-6 flex items-stretch">
          <HeroMotoIllustration />
        </div>
      </main>
    </div>
  );
};

interface OnboardingModalProps {
  defaultName: string;
  defaultPhotoUrl?: string;
  departments: Department[];
  onComplete: (data: {
    displayName: string;
    photoUrl: string;
    motoName: string;
    motoModel: string;
    motoPlate: string;
    motoColor: string;
    departmentId: string;
    phone: string;
    birthDate: string;
    birthDateMs: number;
  }) => Promise<void>;
  isSaving: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  defaultName,
  defaultPhotoUrl = '',
  departments,
  onComplete,
  isSaving,
}) => {
  const deptList = departments.length > 0 ? departments : DEFAULT_DEPARTMENTS;
  const [displayName, setDisplayName] = useState(
    defaultName || 'Repartidor Moto Mandados'
  );
  const [photoUrl, setPhotoUrl] = useState(defaultPhotoUrl || '');
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [motoName, setMotoName] = useState('Relámpago 01');
  const [motoModel, setMotoModel] = useState('Yamaha FZ-25');
  const [motoPlate, setMotoPlate] = useState('M-408X');
  const [motoColor, setMotoColor] = useState(MOTO_COLOR_OPTIONS[0].id);
  const [departmentId, setDepartmentId] = useState(deptList[0].id);
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const maxAdultBirthDate = getMaxAdultBirthDateIso();
  const computedAge = birthDate ? calculateAgeFromIsoDate(birthDate) : null;

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setProcessingPhoto(true);
    try {
      const compressed = await processProfilePhotoFile(file);
      setPhotoUrl(compressed);
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'No se pudo procesar la foto.'
      );
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim().length < 2 || motoName.trim().length < 2) {
      setError('Ingresa tu nombre y el nombre de tu motocicleta.');
      return;
    }
    const age = calculateAgeFromIsoDate(birthDate);
    const birthDateMs = parseIsoDateUtcMs(birthDate);
    if (age === null || birthDateMs === null) {
      setError('Ingresa tu fecha de nacimiento para verificar tu edad.');
      return;
    }
    if (age < MIN_DRIVER_AGE) {
      setError(
        `Debes tener ${MIN_DRIVER_AGE} años o más para registrarte en Moto Mandados.`
      );
      return;
    }
    setError(null);
    await onComplete({
      displayName: displayName.trim().slice(0, 80),
      photoUrl: photoUrl.trim(),
      motoName: motoName.trim().slice(0, 80),
      motoModel: motoModel.trim().slice(0, 80) || 'Motocicleta Urbana',
      motoPlate: motoPlate.trim().slice(0, 24) || 'S/P',
      motoColor,
      departmentId,
      phone: phone.trim().slice(0, 32),
      birthDate: birthDate.trim(),
      birthDateMs,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark-canvas flex items-center justify-center p-3.5 sm:p-6">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 space-y-5 sm:space-y-6">
        <div className="flex items-center gap-3.5 sm:gap-4 pb-4 sm:pb-5 border-b border-slate-200">
          <MotoPhotoBadge color={motoColor} size={56} />
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
              Personaliza tu Unidad Moto Mandados
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Configura tu foto de perfil, departamento operativo e identidad de tu motocicleta.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <UserAvatar
                photoUrl={photoUrl}
                name={displayName || 'Motociclista'}
                color={motoColor}
                size={56}
                onEditClick={() => fileInputRef.current?.click()}
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900">
                  Foto de Perfil (Opcional)
                </div>
                <p className="text-[11px] text-slate-500">
                  Podrás cambiarla o quitarla cuando quieras desde tu perfil.
                </p>
                {photoError && (
                  <p className="text-[11px] text-red-600 font-medium mt-1">
                    {photoError}
                  </p>
                )}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              onChange={(e) => void handlePhotoSelect(e)}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={processingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{processingPhoto ? 'Procesando...' : 'Subir foto'}</span>
              </button>
              {defaultPhotoUrl && photoUrl !== defaultPhotoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoError(null);
                    setPhotoUrl(defaultPhotoUrl);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-orange-600" />
                  <span>Usar Google</span>
                </button>
              )}
              {photoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoError(null);
                    setPhotoUrl('');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-red-50 text-slate-600 hover:text-red-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Quitar</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nombre del Motociclista
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Ej. Carlos Mendoza"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nombre de tu Moto / Unidad
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={motoName}
                onChange={(e) => setMotoName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Ej. Relámpago 01"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Modelo y Cilindraje
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={motoModel}
                onChange={(e) => setMotoModel(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Ej. Honda XR 190L"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Placa / Identificador
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={24}
                value={motoPlate}
                onChange={(e) => setMotoPlate(e.target.value.toUpperCase())}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Ej. M-408X"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Departamento Operativo
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {deptList.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Teléfono de Contacto (Privado)
              </label>
              <input
                type="tel"
                inputMode="tel"
                maxLength={32}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 text-base sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="+52 55 0000 0000"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Fecha de Nacimiento (Requisito mínimo: 18 años en adelante) *
            </label>
            <input
              type="date"
              required
              max={maxAdultBirthDate}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-base sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {computedAge !== null ? (
              <p
                className={`text-xs font-semibold ${
                  computedAge >= MIN_DRIVER_AGE
                    ? 'text-emerald-700'
                    : 'text-red-600'
                }`}
              >
                {computedAge >= MIN_DRIVER_AGE
                  ? `Edad verificada: ${computedAge} años · Apto para registro`
                  : `Edad actual: ${computedAge} años · Debes tener 18 años o más para registrarte`}
              </p>
            ) : (
              <p className="text-[11px] text-slate-500">
                Para trabajar como conductor de moto deberás completar tus documentos, subir foto de tu moto y esperar 12 horas para confirmar tu aprobación.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Color del Emblema en Mapa y Panel
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {MOTO_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMotoColor(opt.id)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                    motoColor === opt.id
                      ? 'border-slate-900 bg-slate-50 font-semibold text-slate-900'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full border border-black/10"
                    style={{ backgroundColor: opt.id }}
                  />
                  <span className="truncate max-w-full text-[11px]">
                    {opt.label.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              {isSaving ? 'Guardando perfil...' : 'Entrar al Panel Moto Mandados'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
