import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Laptop,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { InstallPlatform, usePWAInstall } from '../utils/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'sidebar' | 'compact' | 'card';
}

const PLATFORM_STEPS: Record<
  InstallPlatform,
  {
    title: string;
    subtitle: string;
    steps: string[];
  }
> = {
  android: {
    title: 'Android (Chrome / Edge)',
    subtitle: 'Instalación directa como app en pantalla de inicio',
    steps: [
      'Abre Moto Mandados en Google Chrome o Microsoft Edge.',
      'Toca el menú ⋮ en la esquina superior derecha.',
      'Selecciona "Instalar aplicación" o "Agregar a pantalla principal" y confirma.',
    ],
  },
  ios: {
    title: 'iPhone / iPad (Safari)',
    subtitle: 'Acceso inmediato y alertas en pantalla completa',
    steps: [
      'Abre esta página desde Safari en tu iPhone o iPad.',
      'Toca el botón Compartir en la barra inferior o superior.',
      'Desliza hacia abajo y elige "Agregar a pantalla de inicio", luego toca "Agregar".',
    ],
  },
  desktop: {
    title: 'PC / Mac (Chrome / Edge)',
    subtitle: 'Ventana independiente en Windows, macOS o Linux',
    steps: [
      'Abre Moto Mandados en Chrome o Microsoft Edge.',
      'Haz clic en el ícono de Instalar en el extremo derecho de la barra de direcciones (o abre el menú ⋮).',
      'Selecciona "Instalar Moto Mandados" para fijarla en tu escritorio o barra de tareas.',
    ],
  },
};

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'sidebar',
}) => {
  const { isInstallable, isInstalled, platform, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [activePlatform, setActivePlatform] =
    useState<InstallPlatform>(platform);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setActivePlatform(platform);
  }, [platform]);

  useEffect(() => {
    if (!showGuide) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowGuide(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showGuide]);

  const handlePrimaryAction = async () => {
    if (isInstallable) {
      setInstalling(true);
      try {
        const accepted = await install();
        if (!accepted) {
          setShowGuide(true);
        }
      } finally {
        setInstalling(false);
      }
      return;
    }
    setActivePlatform(platform);
    setShowGuide(true);
  };

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div
          className={`bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex items-center gap-3 ${className}`}
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-sm font-bold text-slate-900">
              App Instalada en este Dispositivo
            </h3>
            <p className="text-xs text-slate-500">
              Moto Mandados se está ejecutando en modo independiente para teléfono o PC.
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  const guideModal = showGuide && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      onClick={() => setShowGuide(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-orange-600" />
            </div>
            <div className="min-w-0">
              <h3
                id="pwa-install-title"
                className="font-display text-base font-bold text-slate-900"
              >
                Instalar Moto Mandados
              </h3>
              <p className="text-xs text-slate-500">
                Disponible como aplicación para Teléfono y PC
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide(false)}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
            aria-label="Cerrar guía de instalación"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isInstallable && (
          <button
            type="button"
            disabled={installing}
            onClick={() => void handlePrimaryAction()}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 px-4 py-2.5 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>
              {installing ? 'Abriendo instalador...' : 'Instalar Ahora en este Equipo'}
            </span>
          </button>
        )}

        <div
          role="tablist"
          aria-label="Plataforma de instalación"
          className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl"
        >
          {(
            [
              {
                id: 'android',
                label: 'Android',
                icon: <Smartphone className="w-3.5 h-3.5 shrink-0" />,
              },
              {
                id: 'ios',
                label: 'iPhone',
                icon: <Share className="w-3.5 h-3.5 shrink-0" />,
              },
              {
                id: 'desktop',
                label: 'PC / Mac',
                icon: <Laptop className="w-3.5 h-3.5 shrink-0" />,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activePlatform === tab.id}
              onClick={() => setActivePlatform(tab.id)}
              className={`min-h-[40px] inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activePlatform === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div>
            <div className="text-xs font-bold text-slate-900">
              {PLATFORM_STEPS[activePlatform].title}
            </div>
            <div className="text-[11px] text-slate-500">
              {PLATFORM_STEPS[activePlatform].subtitle}
            </div>
          </div>
          <ol className="space-y-2 text-xs text-slate-700 leading-relaxed">
            {PLATFORM_STEPS[activePlatform].steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-white border border-slate-200 font-mono text-[11px] font-bold text-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <button
          type="button"
          onClick={() => setShowGuide(false)}
          className="w-full min-h-[44px] rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
        >
          Entendido
        </button>
      </div>
    </div>
  );

  if (variant === 'compact') {
    return (
      <>
        <button
          type="button"
          onClick={() => void handlePrimaryAction()}
          disabled={installing}
          className={`min-h-[40px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap ${className}`}
          title="Instalar Moto Mandados en teléfono o PC"
        >
          <Download className="w-3.5 h-3.5 text-orange-600 shrink-0" />
          <span className="hidden sm:inline">
            {isInstallable ? 'Instalar App' : 'Instalar Móvil/PC'}
          </span>
          <span className="sm:hidden">App</span>
        </button>
        {guideModal}
      </>
    );
  }

  if (variant === 'card') {
    return (
      <>
        <div
          className={`bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4 ${className}`}
        >
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2.5 min-w-0">
              {platform === 'desktop' ? (
                <Laptop className="w-4 h-4 text-orange-600 shrink-0" />
              ) : (
                <Smartphone className="w-4 h-4 text-orange-600 shrink-0" />
              )}
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Instalar en Teléfono o PC
                </h3>
                <p className="text-xs text-slate-500">
                  Úsala como app nativa con acceso rápido y soporte offline
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-slate-600 leading-relaxed">
              {isInstallable
                ? 'Tu navegador permite instalar Moto Mandados con un toque en este equipo.'
                : 'Compatible con Android (Chrome), iPhone/iPad (Safari) y PC/Mac (Chrome o Edge).'}
            </p>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={installing}
                onClick={() => void handlePrimaryAction()}
                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>
                  {isInstallable ? 'Instalar Ahora' : 'Ver Pasos de Instalación'}
                </span>
              </button>
            </div>
          </div>
        </div>
        {guideModal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={installing}
        onClick={() => void handlePrimaryAction()}
        className={`w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 px-3 py-2 text-xs font-semibold text-slate-800 transition-colors cursor-pointer whitespace-nowrap ${className}`}
      >
        {platform === 'desktop' ? (
          <Laptop className="w-3.5 h-3.5 text-orange-600 shrink-0" />
        ) : (
          <Download className="w-3.5 h-3.5 text-orange-600 shrink-0" />
        )}
        <span>
          {isInstallable
            ? 'Instalar App Moto Mandados'
            : 'Instalar en Móvil o PC'}
        </span>
      </button>
      {guideModal}
    </>
  );
};
