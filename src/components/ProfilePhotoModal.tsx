import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { UserAvatar } from './MotoBrandMark';
import { processProfilePhotoFile } from '../utils/avatarImage';

interface ProfilePhotoModalProps {
  isOpen: boolean;
  currentPhotoUrl: string;
  googlePhotoUrl?: string;
  displayName: string;
  accentColor?: string;
  onClose: () => void;
  onSavePhoto: (nextPhotoUrl: string) => Promise<void>;
}

export const ProfilePhotoModal: React.FC<ProfilePhotoModalProps> = ({
  isOpen,
  currentPhotoUrl,
  googlePhotoUrl,
  displayName,
  accentColor = '#EA580C',
  onClose,
  onSavePhoto,
}) => {
  const [draftPhotoUrl, setDraftPhotoUrl] = useState(currentPhotoUrl);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraftPhotoUrl(currentPhotoUrl || '');
      setError(null);
    }
  }, [isOpen, currentPhotoUrl]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setProcessing(true);
    try {
      const compressed = await processProfilePhotoFile(file);
      setDraftPhotoUrl(compressed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo procesar la foto seleccionada.'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSavePhoto(draftPhotoUrl);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la foto de perfil.'
      );
    } finally {
      setSaving(false);
    }
  };

  const hasChanged = (draftPhotoUrl || '') !== (currentPhotoUrl || '');

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Editar Foto de Perfil"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Camera className="w-5 h-5 text-orange-600 shrink-0" />
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Editar Foto de Perfil
              </h3>
              <p className="text-xs text-slate-500">
                Visible para pasajeros, conductores y administración
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            aria-label="Cerrar modal de foto"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 py-2">
          <UserAvatar
            photoUrl={draftPhotoUrl}
            name={displayName}
            color={accentColor}
            size={104}
          />
          <div className="text-center">
            <div className="text-sm font-bold text-slate-900">{displayName}</div>
            <div className="text-xs text-slate-500">
              {draftPhotoUrl
                ? 'Vista previa lista · Recorte cuadrado automático'
                : 'Sin foto personalizada · Se mostrarán tus iniciales'}
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          onChange={(e) => void handleFileChange(e)}
          className="hidden"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={processing || saving}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{processing ? 'Procesando...' : 'Subir nueva foto'}</span>
          </button>

          {googlePhotoUrl && draftPhotoUrl !== googlePhotoUrl ? (
            <button
              type="button"
              disabled={processing || saving}
              onClick={() => {
                setError(null);
                setDraftPhotoUrl(googlePhotoUrl);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 text-orange-600" />
              <span>Usar foto de Google</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={processing || saving || !draftPhotoUrl}
              onClick={() => {
                setError(null);
                setDraftPhotoUrl('');
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-700 disabled:opacity-40 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Quitar foto</span>
            </button>
          )}
        </div>

        {googlePhotoUrl && draftPhotoUrl === googlePhotoUrl && (
          <div className="flex justify-center">
            <button
              type="button"
              disabled={processing || saving}
              onClick={() => {
                setError(null);
                setDraftPhotoUrl('');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Usar solo iniciales (quitar foto)</span>
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
          >
            {error}
          </div>
        )}

        <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={processing || saving || !hasChanged}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Guardando...' : 'Guardar Foto'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
