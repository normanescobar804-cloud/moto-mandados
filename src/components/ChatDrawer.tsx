import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Edit3,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';
import {
  ChatMessage,
  Delivery,
  RiderProfile,
  TariffSettings,
  UserMode,
} from '../types';
import { formatCurrency, formatShortDate, toMillis } from '../utils/tariffs';
import { UserAvatar } from './MotoBrandMark';

export type ChatTarget =
  | { kind: 'delivery'; deliveryId: string }
  | { kind: 'direct'; peerUid: string; peerName: string; peerMotoName?: string };

interface ChatDrawerProps {
  isOpen: boolean;
  initialTarget: ChatTarget | null;
  currentUid: string;
  currentName: string;
  userMode: UserMode;
  deliveries: Delivery[];
  riders: RiderProfile[];
  messages: ChatMessage[];
  tariffs: TariffSettings;
  onClose: () => void;
  onSendMessage: (payload: {
    deliveryId: string;
    deliveryOwnerUid: string;
    recipientUid: string;
    text: string;
  }) => Promise<void>;
  onUpdateDeliveryFare?: (delivery: Delivery, newTotalFare: number) => Promise<void>;
}

const PASSENGER_QUICK_REPLIES = [
  'Ya estoy en el punto de recogida.',
  '¿En cuántos minutos llegas?',
  '¿Aceptas el precio propuesto?',
  'Por favor avísame al llegar.',
];

const DRIVER_QUICK_REPLIES = [
  'Voy en camino en la moto.',
  'Estoy en el punto de recogida.',
  'Tarifa confirmada, saliendo ahora.',
  'Llegué al destino.',
];

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  initialTarget,
  currentUid,
  userMode,
  deliveries,
  riders,
  messages,
  tariffs,
  onClose,
  onSendMessage,
  onUpdateDeliveryFare,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<ChatTarget | null>(
    initialTarget
  );
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const relevantDeliveries = useMemo(
    () =>
      deliveries
        .filter(
          (d) =>
            d.createdByUid === currentUid ||
            d.assignedRiderUid === currentUid ||
            d.status === 'pending'
        )
        .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt)),
    [deliveries, currentUid]
  );

  const directPeers = useMemo(() => {
    const map = new Map<
      string,
      { uid: string; name: string; motoName?: string; photoUrl?: string; motoColor?: string }
    >();
    riders.forEach((r) => {
      if (r.uid && r.uid !== currentUid) {
        map.set(r.uid, {
          uid: r.uid,
          name: r.displayName,
          motoName: r.motoName,
          photoUrl: r.photoUrl,
          motoColor: r.motoColor,
        });
      }
    });
    messages.forEach((m) => {
      if (m.deliveryId === '') {
        const peerUid = m.senderUid === currentUid ? m.recipientUid : m.senderUid;
        if (peerUid && peerUid !== currentUid && !map.has(peerUid)) {
          map.set(peerUid, {
            uid: peerUid,
            name: m.senderUid === currentUid ? 'Usuario Moto Mandados' : m.senderName,
          });
        }
      }
    });
    return Array.from(map.values());
  }, [riders, messages, currentUid]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialTarget) {
      setSelectedTarget(initialTarget);
    } else if (!selectedTarget) {
      if (relevantDeliveries.length > 0) {
        setSelectedTarget({
          kind: 'delivery',
          deliveryId: relevantDeliveries[0].id,
        });
      } else if (directPeers.length > 0) {
        setSelectedTarget({
          kind: 'direct',
          peerUid: directPeers[0].uid,
          peerName: directPeers[0].name,
          peerMotoName: directPeers[0].motoName,
        });
      }
    }
    setEditingPrice(false);
  }, [isOpen, initialTarget, relevantDeliveries, directPeers, selectedTarget]);

  const activeDelivery = useMemo(() => {
    if (selectedTarget?.kind !== 'delivery') return null;
    return deliveries.find((d) => d.id === selectedTarget.deliveryId) || null;
  }, [selectedTarget, deliveries]);

  useEffect(() => {
    if (activeDelivery) {
      setPriceInput(String(activeDelivery.totalFare));
    }
    setEditingPrice(false);
  }, [activeDelivery?.id, activeDelivery?.totalFare]);

  const threadMessages = useMemo(() => {
    if (!selectedTarget) return [];
    if (selectedTarget.kind === 'delivery') {
      return messages
        .filter((m) => m.deliveryId === selectedTarget.deliveryId)
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    }
    return messages
      .filter(
        (m) =>
          m.deliveryId === '' &&
          ((m.senderUid === currentUid &&
            m.recipientUid === selectedTarget.peerUid) ||
            (m.senderUid === selectedTarget.peerUid &&
              m.recipientUid === currentUid))
      )
      .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
  }, [selectedTarget, messages, currentUid]);

  useEffect(() => {
    if (isOpen) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [threadMessages.length, isOpen]);

  if (!isOpen) return null;

  const canEditActiveDeliveryPrice = Boolean(
    activeDelivery &&
      onUpdateDeliveryFare &&
      activeDelivery.status !== 'delivered' &&
      activeDelivery.status !== 'cancelled' &&
      (activeDelivery.createdByUid === currentUid ||
        activeDelivery.assignedRiderUid === currentUid)
  );

  const resolveRecipientForDelivery = (del: Delivery): string => {
    if (del.createdByUid === currentUid) {
      if (del.assignedRiderUid) return del.assignedRiderUid;
      const lastOther = [...threadMessages]
        .reverse()
        .find((m) => m.senderUid !== currentUid);
      return lastOther?.senderUid || '';
    }
    return del.createdByUid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean || !selectedTarget || sending) return;

    setSending(true);
    try {
      if (selectedTarget.kind === 'delivery' && activeDelivery) {
        await onSendMessage({
          deliveryId: activeDelivery.id,
          deliveryOwnerUid: activeDelivery.createdByUid,
          recipientUid: resolveRecipientForDelivery(activeDelivery),
          text: clean,
        });
      } else if (selectedTarget.kind === 'direct') {
        await onSendMessage({
          deliveryId: '',
          deliveryOwnerUid: currentUid,
          recipientUid: selectedTarget.peerUid,
          text: clean,
        });
      }
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  const handleSavePrice = async () => {
    if (!activeDelivery || !onUpdateDeliveryFare) return;
    const parsed = Number(priceInput);
    if (!Number.isFinite(parsed) || parsed < 10) return;
    setSavingPrice(true);
    try {
      await onUpdateDeliveryFare(activeDelivery, parsed);
      setEditingPrice(false);
    } finally {
      setSavingPrice(false);
    }
  };

  const quickReplies =
    userMode === 'passenger' ? PASSENGER_QUICK_REPLIES : DRIVER_QUICK_REPLIES;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Centro de Comunicación"
    >
      <div className="w-full max-w-2xl bg-white h-dvh border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-orange-400" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-slate-900 truncate">
                Comunicación Cliente — Conductor
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Chat en tiempo real por viaje, entrega o contacto directo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            aria-label="Cerrar chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-12">
          {/* Conversation List */}
          <div className="sm:col-span-4 border-b sm:border-b-0 sm:border-r border-slate-200 bg-slate-50 overflow-y-auto max-h-36 sm:max-h-none p-3 space-y-4">
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500 px-1.5">
                Viajes y Entregas ({relevantDeliveries.length})
              </div>
              {relevantDeliveries.length === 0 ? (
                <p className="text-[11px] text-slate-500 px-1.5 py-1">
                  Sin solicitudes activas.
                </p>
              ) : (
                relevantDeliveries.slice(0, 12).map((del) => {
                  const isActive =
                    selectedTarget?.kind === 'delivery' &&
                    selectedTarget.deliveryId === del.id;
                  const count = messages.filter(
                    (m) => m.deliveryId === del.id
                  ).length;
                  return (
                    <button
                      key={del.id}
                      type="button"
                      onClick={() =>
                        setSelectedTarget({ kind: 'delivery', deliveryId: del.id })
                      }
                      className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs transition-colors cursor-pointer space-y-0.5 ${
                        isActive
                          ? 'bg-white border-orange-500 text-slate-900 shadow-xs'
                          : 'bg-white/70 border-slate-200 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold truncate">{del.title}</span>
                        {count > 0 && (
                          <span className="font-mono tabular-nums text-[10px] font-bold text-orange-600 shrink-0">
                            {count}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {del.assignedMotoName
                          ? `${del.assignedMotoName} · ${del.assignedRiderName}`
                          : `Cliente: ${del.customerName}`}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 px-1.5">
                Conductores y Usuarios ({directPeers.length})
              </div>
              {directPeers.length === 0 ? (
                <p className="text-[11px] text-slate-500 px-1.5 py-1">
                  Sin otros usuarios conectados ahora.
                </p>
              ) : (
                directPeers.map((peer) => {
                  const isActive =
                    selectedTarget?.kind === 'direct' &&
                    selectedTarget.peerUid === peer.uid;
                  return (
                    <button
                      key={peer.uid}
                      type="button"
                      onClick={() =>
                        setSelectedTarget({
                          kind: 'direct',
                          peerUid: peer.uid,
                          peerName: peer.name,
                          peerMotoName: peer.motoName,
                        })
                      }
                      className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs transition-colors cursor-pointer flex items-center gap-2 ${
                        isActive
                          ? 'bg-white border-orange-500 text-slate-900 shadow-xs'
                          : 'bg-white/70 border-slate-200 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <UserAvatar
                        photoUrl={peer.photoUrl}
                        name={peer.name}
                        color={peer.motoColor}
                        size={28}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{peer.name}</div>
                        {peer.motoName && (
                          <div className="text-[11px] text-slate-500 truncate">
                            {peer.motoName}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Thread */}
          <div className="sm:col-span-8 flex flex-col min-h-0">
            {!selectedTarget ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-slate-500">
                Selecciona un viaje, entrega o conductor para iniciar la conversación en tiempo real.
              </div>
            ) : (
              <>
                {/* Thread context header */}
                <div className="px-4 py-3 border-b border-slate-200 bg-white space-y-2">
                  {selectedTarget.kind === 'delivery' && activeDelivery ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {activeDelivery.title}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {activeDelivery.assignedRiderUid
                            ? `Conductor: ${activeDelivery.assignedRiderName} (${activeDelivery.assignedMotoName})`
                            : `Pasajero/Cliente: ${activeDelivery.customerName} · Esperando conductor`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {editingPrice ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={10}
                              max={50000}
                              step="5"
                              value={priceInput}
                              onChange={(e) => setPriceInput(e.target.value)}
                              className="w-24 px-2 py-1 rounded-md border border-slate-300 text-xs font-mono tabular-nums"
                              aria-label="Nuevo precio"
                            />
                            <button
                              type="button"
                              disabled={savingPrice}
                              onClick={() => void handleSavePrice()}
                              className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Guardar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPrice(false)}
                              className="px-2 py-1 rounded-md border border-slate-200 text-xs text-slate-600 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="text-right">
                              <div className="font-mono tabular-nums text-xs font-bold text-slate-900">
                                {formatCurrency(
                                  activeDelivery.totalFare,
                                  tariffs.currency
                                )}
                              </div>
                              {activeDelivery.customFareEdited && (
                                <div className="text-[10px] text-orange-700 font-medium">
                                  Precio editado
                                </div>
                              )}
                            </div>
                            {canEditActiveDeliveryPrice && (
                              <button
                                type="button"
                                onClick={() => setEditingPrice(true)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Editar precio</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ) : selectedTarget.kind === 'direct' ? (
                    <div className="flex items-center gap-2.5">
                      <UserAvatar
                        photoUrl={
                          riders.find((r) => r.uid === selectedTarget.peerUid)
                            ?.photoUrl
                        }
                        name={selectedTarget.peerName}
                        color={
                          riders.find((r) => r.uid === selectedTarget.peerUid)
                            ?.motoColor
                        }
                        size={34}
                      />
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          {selectedTarget.peerName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {selectedTarget.peerMotoName || 'Chat directo Moto Mandados'}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Messages Scroll */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60">
                  {threadMessages.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-500 space-y-1">
                      <p className="font-medium text-slate-700">
                        Aún no hay mensajes en esta conversación
                      </p>
                      <p>
                        Envía un mensaje o usa una respuesta rápida abajo para coordinar la recogida o el precio.
                      </p>
                    </div>
                  ) : (
                    threadMessages.map((msg) => {
                      const isMine = msg.senderUid === currentUid;
                      const roleLabel =
                        msg.senderRole === 'passenger'
                          ? 'Pasajero/Cliente'
                          : msg.senderRole === 'admin'
                          ? 'Admin'
                          : 'Conductor';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            isMine ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1 px-1">
                            <span className="font-semibold text-slate-700">
                              {isMine ? 'Tú' : msg.senderName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{roleLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatShortDate(msg.createdAt)}</span>
                          </div>
                          <div
                            className={`max-w-[82%] px-3.5 py-2 rounded-xl text-xs leading-relaxed ${
                              isMine
                                ? 'bg-slate-900 text-white'
                                : 'bg-white border border-slate-200 text-slate-900'
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={scrollEndRef} />
                </div>

                {/* Quick replies & Composer */}
                <div className="p-3 pb-safe border-t border-slate-200 bg-white space-y-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {quickReplies.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setDraft(q)}
                        className="px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-medium text-slate-700 cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={500}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || sending}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar</span>
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
