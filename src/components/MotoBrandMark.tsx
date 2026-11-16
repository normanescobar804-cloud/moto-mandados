import React, { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { getInitials } from '../utils/avatarImage';

export const MOTO_UNIT_PHOTO =
  '/assets/aistudio/IMG_2a5b2fe4-46b7-4e75-b297-8bd59581843e_61beae0e.jpg';

interface MotoLogoProps {
  color?: string;
  size?: number;
  className?: string;
}

export const MotoLogoEmblem: React.FC<MotoLogoProps> = ({
  color = '#EA580C',
  size = 36,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="12" fill="#0F172A" />
      <path
        d="M9 31.5C9 27.9101 11.9101 25 15.5 25C19.0899 25 22 27.9101 22 31.5C22 35.0899 19.0899 38 15.5 38C11.9101 38 9 35.0899 9 31.5Z"
        stroke="#F8FAFC"
        strokeWidth="2.6"
      />
      <path
        d="M27 31.5C27 27.9101 29.9101 25 33.5 25C37.0899 25 40 27.9101 40 31.5C40 35.0899 37.0899 38 33.5 38C29.9101 38 27 35.0899 27 31.5Z"
        stroke="#F8FAFC"
        strokeWidth="2.6"
      />
      <path
        d="M15.5 31.5L21 21H29.5L33.5 31.5"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 18H23.5L28 13H35.5"
        stroke="#F8FAFC"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="35.5" cy="13" r="2.5" fill={color} />
    </svg>
  );
};

interface UserAvatarProps {
  photoUrl?: string;
  name: string;
  color?: string;
  size?: number;
  className?: string;
  onEditClick?: () => void;
  editLabel?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  photoUrl,
  name,
  color = '#0F172A',
  size = 40,
  className = '',
  onEditClick,
  editLabel = 'Editar foto de perfil',
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [photoUrl]);

  const trimmed = (photoUrl || '').trim();
  const showImage = Boolean(trimmed) && !imgError;
  const initials = getInitials(name);
  const fontSize = Math.max(11, Math.round(size * 0.36));
  const badgeSize = Math.max(18, Math.round(size * 0.36));

  return (
    <div
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={trimmed}
          alt={`Foto de perfil de ${name}`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full rounded-full object-cover border border-slate-200 bg-slate-100"
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center font-display font-bold text-white border border-slate-200 select-none"
          style={{
            backgroundColor: color || '#0F172A',
            fontSize,
          }}
          aria-label={`Avatar de ${name}`}
        >
          {initials}
        </div>
      )}

      {onEditClick && (
        <button
          type="button"
          onClick={onEditClick}
          title={editLabel}
          aria-label={editLabel}
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white border border-slate-300 hover:border-orange-500 text-slate-700 hover:text-orange-600 flex items-center justify-center shadow-xs transition-colors cursor-pointer"
          style={{ width: badgeSize, height: badgeSize }}
        >
          <Camera
            style={{
              width: Math.max(10, Math.round(badgeSize * 0.54)),
              height: Math.max(10, Math.round(badgeSize * 0.54)),
            }}
          />
        </button>
      )}
    </div>
  );
};

interface MotoPhotoBadgeProps {
  color?: string;
  size?: number;
  className?: string;
  alt?: string;
}

export const MotoPhotoBadge: React.FC<MotoPhotoBadgeProps> = ({
  color = '#EA580C',
  size = 52,
  className = '',
  alt = 'Motocicleta oficial Moto Mandados',
}) => {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return <MotoLogoEmblem color={color} size={size} className={className} />;
  }

  return (
    <div
      className={`relative rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center p-1 shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={MOTO_UNIT_PHOTO}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-full h-full object-contain"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-0 inset-x-0 h-1"
        style={{ backgroundColor: color }}
      />
    </div>
  );
};

interface MotoUnitHeaderBadgeProps {
  motoName: string;
  motoModel?: string;
  motoPlate?: string;
  motoColor?: string;
  compact?: boolean;
  showPhoto?: boolean;
}

export const MotoUnitIdentity: React.FC<MotoUnitHeaderBadgeProps> = ({
  motoName,
  motoModel,
  motoPlate,
  motoColor = '#EA580C',
  compact = false,
  showPhoto = false,
}) => {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {showPhoto ? (
        <MotoPhotoBadge
          color={motoColor}
          size={compact ? 42 : 54}
          alt={`Unidad ${motoName}`}
        />
      ) : (
        <MotoLogoEmblem
          color={motoColor}
          size={compact ? 32 : 40}
          className="shrink-0"
        />
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-slate-900 truncate">
            {motoName}
          </span>
        </div>
        {(motoModel || motoPlate) && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
            {motoModel && <span className="truncate">{motoModel}</span>}
            {motoModel && motoPlate && <span aria-hidden="true">·</span>}
            {motoPlate && (
              <span className="font-mono tabular-nums text-slate-600">
                {motoPlate}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const HeroMotoIllustration: React.FC = () => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="relative w-full h-full min-h-[340px] rounded-2xl bg-slate-900 overflow-hidden border border-slate-800 flex flex-col justify-between p-6 lg:p-8 gap-6">
      <div className="flex items-center justify-between text-xs text-slate-300">
        <span className="font-semibold text-white">Unidad Oficial Moto Mandados</span>
        <span className="font-mono tabular-nums text-orange-400">
          Chasis Naranja · Baúl de Carga
        </span>
      </div>

      <div className="relative flex-1 rounded-xl bg-white border border-slate-200/80 p-5 sm:p-7 flex items-center justify-center overflow-hidden">
        {!imgError ? (
          <img
            src={MOTO_UNIT_PHOTO}
            alt="Motocicleta oficial Moto Mandados con baúl de reparto y rines naranja"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full max-w-[390px] h-auto max-h-[260px] object-contain mx-auto"
          />
        ) : (
          <MotoLogoEmblem size={120} />
        )}
      </div>

      <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">Moto Mandados</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span>Despacho, Pasajero y Rutas en Motocicleta</span>
        </div>
        <div className="font-mono tabular-nums text-slate-400">
          GPS en vivo · Optimización TSP
        </div>
      </div>
    </div>
  );
};
