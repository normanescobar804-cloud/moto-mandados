import React, { useState } from 'react';
import {
  Bell,
  X,
  Zap,
  Route as RouteIcon,
  QrCode,
  Star,
  CheckCheck,
  Info,
  ShieldCheck,
  Cpu,
  Radio,
  Timer,
  Send,
} from 'lucide-react';
import { AppNotification, Delivery } from '../types';
import { BrowserPushPermission, TestPushOutcome } from '../utils/pushNotifications';
import { PushTestOptions } from './PushSubscriptionStudio';
import { formatShortDate, toMillis } from '../utils/tariffs';

interface NotificationsDrawerProps {
  isOpen: boolean;
  notifications: AppNotification[];
  pushPermission: BrowserPushPermission;
  pushSubscribed: boolean;
  onEnablePush: () => Promise<void>;
  onTestPush: (options?: PushTestOptions) => Promise<TestPushOutcome | void>;
  onClose: () => void;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}

const CATEGORY_ICON: Record<AppNotification['category'], React.ReactNode> = {
  urgent: <Zap className="w-4 h-4 text-orange-600 shrink-0" />,
  route: <RouteIcon className="w-4 h-4 text-sky-600 shrink-0" />,
  wallet: <QrCode className="w-4 h-4 text-emerald-600 shrink-0" />,
  rating: <Star className="w-4 h-4 text-amber-500 shrink-0" />,
  system: <Info className="w-4 h-4 text-slate-500 shrink-0" />,
};

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  notifications,
  pushPermission,
  pushSubscribed,
  onEnablePush,
  onTestPush,
  onClose,
  onMarkRead,
  onMarkAllRead,
}) => {
  const [drawerCountdown, setDrawerCountdown] = useState<number | null>(null);
  const [testingNow, setTestingNow] = useState(false);

  if (!isOpen) return null;

  const sorted = [...notifications].sort(
    (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
  );
  const unreadCount = sorted.filter((n) => !n.read).length;
  const permGranted = pushPermission === 'granted';

  const handleDelayedDrawerTest = () => {
    if (drawerCountdown !== null) return;
    let rem = 3;
    setDrawerCountdown(rem);
    const id = window.setInterval(() => {
      rem -= 1;
      if (rem <= 0) {
        window.clearInterval(id);
        setDrawerCountdown(null);
        void onTestPush({ scenario: 'urgent' });
      } else {
        setDrawerCountdown(rem);
      }
    }, 1000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-label="Centro de Notificaciones"
    >
      <div className="flex-1" onClick={onClose} />
      <aside className="w-full max-w-md bg-white border-l border-slate-200 h-full flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-orange-600" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Notificaciones en Vivo
              </h2>
              <p className="text-xs text-slate-500">
                {unreadCount > 0
                  ? `${unreadCount} sin leer`
                  : 'Todas las alertas al día'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void onMarkAllRead()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Leer todas</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              aria-label="Cerrar notificaciones"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Graphical Browser Background Push Status Bar */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-900">
              Estado de Suscripción Push
            </div>
            <span
              className={`font-mono tabular-nums text-[11px] font-bold ${
                permGranted
                  ? 'text-emerald-700'
                  : pushPermission === 'denied'
                  ? 'text-red-700'
                  : 'text-amber-700'
              }`}
            >
              {permGranted
                ? pushSubscribed
                  ? '3/3 Activo (VAPID)'
                  : '2/3 Activo (Local)'
                : pushPermission === 'denied'
                ? 'Bloqueado'
                : 'Sin activar'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <div
              className={`px-2 py-1.5 rounded-lg border flex items-center gap-1.5 font-semibold ${
                permGranted
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : pushPermission === 'denied'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Permiso</span>
            </div>
            <div
              className={`px-2 py-1.5 rounded-lg border flex items-center gap-1.5 font-semibold ${
                permGranted
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">2do Plano</span>
            </div>
            <div
              className={`px-2 py-1.5 rounded-lg border flex items-center gap-1.5 font-semibold ${
                pushSubscribed
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : permGranted
                  ? 'bg-sky-50 border-sky-200 text-sky-900'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Web Push</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pushPermission === 'default' && (
              <button
                type="button"
                onClick={() => void onEnablePush()}
                className="flex-1 px-3 py-2 min-h-[38px] rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Activar Alertas Push
              </button>
            )}
            {pushPermission === 'granted' && (
              <>
                <button
                  type="button"
                  disabled={testingNow}
                  onClick={async () => {
                    setTestingNow(true);
                    try {
                      await onTestPush({ scenario: 'urgent' });
                    } finally {
                      setTestingNow(false);
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1.5 flex-1 px-3 py-2 min-h-[38px] rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5 text-orange-400" />
                  <span>{testingNow ? 'Enviando...' : 'Probar Ahora'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDelayedDrawerTest}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  title="Envía una prueba en 3 segundos para probar fuera de esta pestaña"
                >
                  <Timer className="w-3.5 h-3.5 text-orange-600" />
                  <span className="font-mono tabular-nums">
                    {drawerCountdown !== null ? `${drawerCountdown}s...` : 'En 3s'}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
          {sorted.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Bell className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">
                Sin notificaciones todavía
              </div>
              <p className="text-xs text-slate-500">
                Aquí recibirás avisos de entregas urgentes, rutas asignadas, recargas QR y calificaciones.
              </p>
            </div>
          ) : (
            sorted.map((notif) => (
              <button
                key={notif.id}
                type="button"
                onClick={() => {
                  if (!notif.read) void onMarkRead(notif.id);
                }}
                className={`w-full text-left px-5 py-4 flex items-start gap-3 transition-colors cursor-pointer ${
                  notif.read ? 'bg-white hover:bg-slate-50' : 'bg-orange-50/40 hover:bg-orange-50/70'
                }`}
              >
                <div className="mt-0.5">{CATEGORY_ICON[notif.category]}</div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {notif.title}
                    </span>
                    {!notif.read && (
                      <span className="text-[10px] font-semibold text-orange-700 shrink-0">
                        Nueva
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {notif.body}
                  </p>
                  <div className="text-[11px] text-slate-400">
                    {formatShortDate(notif.createdAt)}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  );
};

interface RatingModalProps {
  delivery: Delivery | null;
  onClose: () => void;
  onSubmit: (payload: {
    delivery: Delivery;
    score: number;
    comment: string;
  }) => Promise<void>;
}

const QUICK_TAGS = [
  'Puntualidad excelente',
  'Trato amable y profesional',
  'Ruta rápida y precisa',
  'Paquete en perfecto estado',
];

export const RatingModal: React.FC<RatingModalProps> = ({
  delivery,
  onClose,
  onSubmit,
}) => {
  const [score, setScore] = useState(5);
  const [hovered, setHovered] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!delivery) return null;

  const activeStars = hovered ?? score;

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        delivery,
        score,
        comment: comment.trim().slice(0, 300),
      });
      setComment('');
      setScore(5);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rating-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3
              id="rating-modal-title"
              className="font-display text-base font-bold text-slate-900"
            >
              Calificar Servicio de Entrega
            </h3>
            <p className="text-xs text-slate-500">
              {delivery.title} · {delivery.assignedMotoName || 'Unidad Moto Mandados'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
          <div className="space-y-2 text-center">
            <div className="text-xs font-semibold text-slate-700">
              Selecciona tu calificación
            </div>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setScore(star)}
                  className="p-1 cursor-pointer transition-transform hover:scale-110"
                  aria-label={`${star} estrellas`}
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= activeStars
                        ? 'fill-amber-400 text-amber-500'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="font-mono tabular-nums text-xs font-semibold text-slate-700">
              {activeStars}.0 / 5.0 estrellas
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setComment((prev) =>
                    prev ? `${prev}. ${tag}` : tag
                  )
                }
                className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer"
              >
                + {tag}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Comentario opcional
            </label>
            <textarea
              rows={3}
              maxLength={300}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comparte detalles sobre la entrega, puntualidad o atención..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
            >
              {submitting ? 'Enviando...' : 'Enviar Calificación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
