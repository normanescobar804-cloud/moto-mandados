import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BellOff,
  BellRing,
  CheckCircle2,
  Cpu,
  MapPin,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Volume2,
  VolumeX,
  Wallet as WalletIcon,
  X,
  Zap,
} from 'lucide-react';
import {
  BrowserPushPermission,
  PushDiagnostics,
  TestPushOutcome,
  getPushSubscriptionDiagnostics,
} from '../utils/pushNotifications';

export type PushTestScenario = 'urgent' | 'route' | 'daily';

export interface PushTestOptions {
  scenario?: PushTestScenario;
  title?: string;
  body?: string;
  isUrgent?: boolean;
}

interface PushSubscriptionStudioProps {
  pushPermission: BrowserPushPermission;
  pushSubscribed: boolean;
  soundEnabled: boolean;
  dailySummaryText?: string;
  onEnablePush: () => Promise<void>;
  onDisablePush?: () => Promise<void>;
  onRefreshPush?: () => Promise<void>;
  onTestPush: (options?: PushTestOptions) => Promise<TestPushOutcome | void>;
}

const SCENARIOS: Array<{
  id: PushTestScenario;
  label: string;
  title: string;
  defaultBody: string;
  isUrgent: boolean;
  icon: React.ReactNode;
}> = [
  {
    id: 'urgent',
    label: 'Súper Exprés',
    title: '⚡ Nuevo Súper Exprés · $145.00 MXN',
    defaultBody:
      'Entrega prioritaria a 1.40 km · Recoger en Farmacia Central hacia Zona Centro.',
    isUrgent: true,
    icon: <Zap className="w-3.5 h-3.5 text-orange-600 shrink-0" />,
  },
  {
    id: 'route',
    label: 'Proximidad GPS',
    title: '📍 Llegando al punto de recogida',
    defaultBody:
      'Estás a 0.12 km del pasajero · Confirma recogida al llegar al punto.',
    isUrgent: false,
    icon: <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />,
  },
  {
    id: 'daily',
    label: 'Resumen Diario',
    title: '💰 Resumen Diario de Ganancias · Moto Mandados',
    defaultBody:
      'Balance del día sincronizado: entregas completadas, ganancias netas y viajes gratis.',
    isUrgent: false,
    icon: <WalletIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
  },
];

export const PushSubscriptionStudio: React.FC<PushSubscriptionStudioProps> = ({
  pushPermission,
  pushSubscribed,
  soundEnabled,
  dailySummaryText,
  onEnablePush,
  onDisablePush,
  onRefreshPush,
  onTestPush,
}) => {
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics>({
    supported: true,
    permission: pushPermission,
    swRegistered: false,
    swState: 'none',
    pushManagerAvailable: false,
    hasActiveSubscription: pushSubscribed,
    endpointHost: '',
  });
  const [checkingDiag, setCheckingDiag] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [selectedScenario, setSelectedScenario] =
    useState<PushTestScenario>('urgent');
  const [sendingTest, setSendingTest] = useState(false);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const [previewPulse, setPreviewPulse] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<TestPushOutcome | null>(null);

  const countdownTimerRef = useRef<number | null>(null);

  const loadDiagnostics = useCallback(async () => {
    setCheckingDiag(true);
    try {
      const diag = await getPushSubscriptionDiagnostics();
      setDiagnostics(diag);
    } finally {
      setCheckingDiag(false);
    }
  }, []);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics, pushPermission, pushSubscribed]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  const activeScenario =
    SCENARIOS.find((s) => s.id === selectedScenario) || SCENARIOS[0];
  const previewBody =
    selectedScenario === 'daily' && dailySummaryText
      ? dailySummaryText
      : activeScenario.defaultBody;

  const permGranted = pushPermission === 'granted';
  const swReady = diagnostics.swRegistered;
  const webPushReady = pushSubscribed || diagnostics.hasActiveSubscription;

  const activeLayers =
    (permGranted ? 1 : 0) + (swReady ? 1 : 0) + (webPushReady ? 1 : 0);
  const progressPct = Math.round((activeLayers / 3) * 100);

  // SVG circular readiness ring geometry
  const ringSize = 68;
  const strokeWidth = 6;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (progressPct / 100) * circumference;

  const ringColor =
    pushPermission === 'denied' || pushPermission === 'unsupported'
      ? '#DC2626'
      : activeLayers === 3
      ? '#059669'
      : permGranted
      ? '#0284C7'
      : '#D97706';

  const overallHeadline =
    pushPermission === 'unsupported'
      ? 'Navegador incompatible con Push'
      : pushPermission === 'denied'
      ? 'Notificaciones bloqueadas en el navegador'
      : activeLayers === 3
      ? 'Suscripción Push Completa'
      : permGranted
      ? 'Alerta Local Activa (2do Plano)'
      : 'Pendiente de Activación';

  const overallSubtitle =
    pushPermission === 'unsupported'
      ? 'Usa Chrome, Edge, Firefox o Safari PWA para recibir alertas en segundo plano.'
      : pushPermission === 'denied'
      ? 'Habilita el permiso desde los ajustes del sitio para desbloquear el canal.'
      : activeLayers === 3
      ? 'Permiso, Service Worker y canal Web Push VAPID operando en tiempo real.'
      : permGranted
      ? 'Permiso concedido · Service Worker activo para mostrar avisos incluso en otras pestañas.'
      : 'Activa el permiso para recibir entregas Súper Exprés y resúmenes aunque cambies de pestaña.';

  const dispatchScenarioTest = useCallback(async () => {
    setSendingTest(true);
    try {
      const outcome = await onTestPush({
        scenario: activeScenario.id,
        title: activeScenario.title,
        body: previewBody,
        isUrgent: activeScenario.isUrgent,
      });
      setPreviewPulse(true);
      window.setTimeout(() => setPreviewPulse(false), 1200);
      if (outcome) {
        setLastOutcome(outcome);
      } else {
        setLastOutcome({
          shown: pushPermission === 'granted',
          channel: swReady ? 'service_worker' : 'browser_api',
          serverPushSent: webPushReady ? 1 : 0,
          timestamp: new Date().toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          title: activeScenario.title,
        });
      }
      await loadDiagnostics();
    } finally {
      setSendingTest(false);
    }
  }, [
    activeScenario,
    previewBody,
    onTestPush,
    pushPermission,
    swReady,
    webPushReady,
    loadDiagnostics,
  ]);

  const startDelayedBackgroundTest = () => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setCountdownSec(null);
      return;
    }

    let remaining = 3;
    setCountdownSec(remaining);
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownTimerRef.current !== null) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdownSec(null);
        void dispatchScenarioTest();
      } else {
        setCountdownSec(remaining);
      }
    }, 1000);
  };

  return (
    <div className="pt-4 border-t border-slate-200 space-y-4">
      {/* Header + SVG Circular Readiness Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative shrink-0 w-[68px] h-[68px] flex items-center justify-center">
            <svg
              width={ringSize}
              height={ringSize}
              viewBox={`0 0 ${ringSize} ${ringSize}`}
              className="-rotate-90"
              aria-hidden="true"
            >
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-slate-200"
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke={ringColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono tabular-nums text-xs font-bold text-slate-900">
                {activeLayers}/3
              </span>
            </div>
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <BellRing className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span>{overallHeadline}</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {overallSubtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={checkingDiag}
          onClick={async () => {
            if (onRefreshPush) {
              await onRefreshPush();
            }
            await loadDiagnostics();
          }}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${checkingDiag ? 'animate-spin' : ''}`}
          />
          <span>Verificar Estado</span>
        </button>
      </div>

      {/* Graphical 3-Node Subscription Pipeline */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
        aria-label="Capas de suscripción Push"
      >
        {/* Step 1: Browser Permission */}
        <div
          className={`p-3 rounded-xl border space-y-1 ${
            permGranted
              ? 'bg-emerald-50 border-emerald-200'
              : pushPermission === 'denied' || pushPermission === 'unsupported'
              ? 'bg-red-50 border-red-200'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-700">
              1. Permiso Navegador
            </span>
            {permGranted ? (
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <ShieldAlert
                className={`w-4 h-4 shrink-0 ${
                  pushPermission === 'denied' || pushPermission === 'unsupported'
                    ? 'text-red-700'
                    : 'text-amber-700'
                }`}
              />
            )}
          </div>
          <div
            className={`text-xs font-bold ${
              permGranted
                ? 'text-emerald-950'
                : pushPermission === 'denied' || pushPermission === 'unsupported'
                ? 'text-red-950'
                : 'text-amber-950'
            }`}
          >
            {permGranted
              ? 'Concedido'
              : pushPermission === 'denied'
              ? 'Bloqueado'
              : pushPermission === 'unsupported'
              ? 'No compatible'
              : 'Sin solicitar'}
          </div>
        </div>

        {/* Step 2: Service Worker */}
        <div
          className={`p-3 rounded-xl border space-y-1 ${
            swReady
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-700">
              2. Service Worker
            </span>
            <Cpu
              className={`w-4 h-4 shrink-0 ${
                swReady ? 'text-emerald-700' : 'text-slate-500'
              }`}
            />
          </div>
          <div
            className={`text-xs font-bold ${
              swReady ? 'text-emerald-950' : 'text-slate-800'
            }`}
          >
            {diagnostics.swState === 'active'
              ? 'Activo (2do plano)'
              : diagnostics.swState === 'waiting' ||
                diagnostics.swState === 'installing'
              ? 'Instalando...'
              : 'Inactivo'}
          </div>
        </div>

        {/* Step 3: VAPID / Delivery Channel */}
        <div
          className={`p-3 rounded-xl border space-y-1 ${
            webPushReady
              ? 'bg-emerald-50 border-emerald-200'
              : permGranted
              ? 'bg-sky-50 border-sky-200'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-700">
              3. Canal Web Push
            </span>
            <Radio
              className={`w-4 h-4 shrink-0 ${
                webPushReady
                  ? 'text-emerald-700'
                  : permGranted
                  ? 'text-sky-700'
                  : 'text-slate-500'
              }`}
            />
          </div>
          <div
            className={`text-xs font-bold truncate ${
              webPushReady
                ? 'text-emerald-950'
                : permGranted
                ? 'text-sky-900'
                : 'text-slate-800'
            }`}
            title={diagnostics.endpointHost || undefined}
          >
            {webPushReady
              ? diagnostics.endpointHost
                ? `Suscrito (${diagnostics.endpointHost})`
                : 'VAPID Suscrito'
              : permGranted
              ? 'Canal local listo'
              : 'Desconectado'}
          </div>
        </div>
      </div>

      {/* Subscription Activation / Recovery Controls */}
      {pushPermission === 'default' && (
        <div className="p-3.5 rounded-xl bg-orange-50 border border-orange-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-orange-950">
            <div className="font-bold">Activa las notificaciones en un toque</div>
            <div className="text-[11px] text-orange-800">
              Recibirás avisos inmediatos de pedidos Súper Exprés incluso fuera de esta pestaña.
            </div>
          </div>
          <button
            type="button"
            disabled={enabling}
            onClick={async () => {
              setEnabling(true);
              try {
                await onEnablePush();
                await loadDiagnostics();
              } finally {
                setEnabling(false);
              }
            }}
            className="px-4 py-2 min-h-[44px] rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            {enabling ? 'Activando...' : 'Activar Alertas Push'}
          </button>
        </div>
      )}

      {pushPermission === 'denied' && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-2 text-xs text-red-950">
          <div className="font-bold">
            Cómo desbloquear las notificaciones en tu navegador:
          </div>
          <ol className="list-decimal list-inside space-y-1 text-[11px] text-red-900">
            <li>Toca el ícono de candado o configuración junto a la dirección web arriba.</li>
            <li>Busca <strong>Notificaciones</strong> y cámbialo a <strong>Permitir</strong>.</li>
            <li>Pulsa el botón <strong>Verificar Estado</strong> arriba para sincronizar tu suscripción.</li>
          </ol>
        </div>
      )}

      {/* Intuitive Interactive Notification Simulator & Live Preview */}
      {pushPermission !== 'unsupported' && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Simulador y Prueba Intuitiva de Notificaciones
              </div>
              <div className="text-[11px] text-slate-500">
                Elige un tipo de alerta, previsualiza el mensaje y pruébalo al instante o en segundo plano
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
              {soundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Con tono de alerta</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                  <span>Silenciosa</span>
                </>
              )}
            </div>
          </div>

          {/* Scenario Selector Tabs */}
          <div className="grid grid-cols-3 gap-1.5">
            {SCENARIOS.map((sc) => {
              const active = selectedScenario === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => setSelectedScenario(sc.id)}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {sc.icon}
                  <span className="truncate">{sc.label}</span>
                </button>
              );
            })}
          </div>

          {/* Live OS Notification Visual Mockup */}
          <div
            className={`p-3 rounded-xl border bg-white transition-all duration-200 ${
              previewPulse
                ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                : 'border-slate-200'
            }`}
            aria-label="Vista previa visual de notificación"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-600 text-white flex items-center justify-center shrink-0 font-display font-bold text-xs">
                MM
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">
                    Moto Mandados · Vista Previa
                  </span>
                  <span className="font-mono tabular-nums">Ahora</span>
                </div>
                <div className="text-xs font-bold text-slate-900 truncate">
                  {activeScenario.title}
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  {previewBody}
                </p>
              </div>
            </div>
          </div>

          {/* Intuitive Test Buttons: Instant vs 3s Background Countdown */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 flex-1">
              <button
                type="button"
                disabled={sendingTest || pushPermission === 'denied'}
                onClick={() => void dispatchScenarioTest()}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {sendingTest
                    ? 'Enviando...'
                    : permGranted
                    ? 'Enviar Prueba Ahora'
                    : 'Activar y Probar'}
                </span>
              </button>

              <button
                type="button"
                disabled={sendingTest || pushPermission === 'denied'}
                onClick={startDelayedBackgroundTest}
                className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[42px] rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                  countdownSec !== null
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-50'
                }`}
                title="Cuenta regresiva de 3 segundos para que cambies de pestaña y pruebes la alerta en segundo plano"
              >
                {countdownSec !== null ? (
                  <>
                    <X className="w-3.5 h-3.5 text-red-600" />
                    <span className="font-mono tabular-nums">
                      Cambia de pestaña ({countdownSec}s) · Cancelar
                    </span>
                  </>
                ) : (
                  <>
                    <Timer className="w-3.5 h-3.5 text-orange-600" />
                    <span>Probar en 2do Plano (3s)</span>
                  </>
                )}
              </button>
            </div>

            {permGranted && webPushReady && onDisablePush && (
              <button
                type="button"
                disabled={disabling}
                onClick={async () => {
                  setDisabling(true);
                  try {
                    await onDisablePush();
                    await loadDiagnostics();
                  } finally {
                    setDisabling(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
              >
                <BellOff className="w-3.5 h-3.5 text-slate-500" />
                <span>{disabling ? 'Pausando...' : 'Pausar Web Push'}</span>
              </button>
            )}
          </div>

          {lastOutcome && (
            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {lastOutcome.shown
                    ? `Prueba recibida por ${
                        lastOutcome.channel === 'service_worker'
                          ? 'Service Worker (2do plano)'
                          : 'API del Navegador'
                      }`
                    : 'No se pudo mostrar la notificación (revisa permisos del navegador)'}
                </span>
              </div>
              <div className="font-mono tabular-nums text-slate-500">
                {lastOutcome.timestamp}
                {lastOutcome.serverPushSent > 0
                  ? ` · VAPID: ${lastOutcome.serverPushSent} env.`
                  : ''}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
