import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMapView,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { Delivery, Merchant, RiderProfile } from '../types';
import { HeatmapPoint } from '../utils/demandHeatmap';
import {
  SERVICE_CATEGORY_LABELS,
  STATUS_LABELS,
  formatCurrency,
} from '../utils/tariffs';
import { useTheme } from '../utils/theme';

export const MapsConfiguredContext = createContext<boolean>(false);

interface MapCameraControllerProps {
  center: { lat: number; lng: number };
  zoom: number;
  focusTrigger?: number;
}

const MapCameraController: React.FC<MapCameraControllerProps> = ({
  center,
  zoom,
  focusTrigger = 0,
}) => {
  const map = useMap();
  const prevTriggerRef = useRef<number>(focusTrigger);
  const prevCenterKeyRef = useRef<string>('');

  useEffect(() => {
    if (!map) return;
    const key = `${center.lat.toFixed(4)}_${center.lng.toFixed(4)}_${zoom}`;
    if (
      focusTrigger !== prevTriggerRef.current ||
      (prevCenterKeyRef.current && prevCenterKeyRef.current !== key)
    ) {
      map.panTo(center);
      map.setZoom(zoom);
      prevTriggerRef.current = focusTrigger;
    }
    prevCenterKeyRef.current = key;
  }, [map, center, zoom, focusTrigger]);

  return null;
};

interface PolylineOverlayProps {
  encodedPolyline: string;
  strokeColor?: string;
}

const PolylineOverlay: React.FC<PolylineOverlayProps> = ({
  encodedPolyline,
  strokeColor = '#EA580C',
}) => {
  const map = useMap();
  const geometryLib = useMapsLibrary('geometry');
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !geometryLib || !encodedPolyline) {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
      return;
    }

    try {
      const path = geometryLib.encoding.decodePath(encodedPolyline);
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
      }

      const line = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor,
        strokeOpacity: 0.92,
        strokeWeight: 5,
        map,
      });
      polylineRef.current = line;

      if (path.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        path.forEach((pt) => bounds.extend(pt));
        map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
      }
    } catch (err) {
      console.error('Error decoding route polyline:', err);
    }

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, geometryLib, encodedPolyline, strokeColor]);

  return null;
};

interface DemandHeatmapOverlayProps {
  points: HeatmapPoint[];
  radiusPixels: number;
  visible: boolean;
}

const HEATMAP_COLOR_RANGE: Array<[number, number, number, number]> = [
  [254, 240, 138, 120],
  [253, 186, 116, 175],
  [249, 115, 22, 210],
  [234, 88, 12, 230],
  [220, 38, 38, 245],
  [153, 27, 27, 255],
];

function supportsWebGL2Context(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

const DemandHeatmapOverlay: React.FC<DemandHeatmapOverlayProps> = ({
  points,
  radiusPixels,
  visible,
}) => {
  const map = useMap();
  const [webglReady] = useState<boolean>(() => supportsWebGL2Context());
  const [deckFailed, setDeckFailed] = useState(false);
  const deckRef = useRef<GoogleMapsOverlay | null>(null);
  const fallbackCirclesRef = useRef<google.maps.Circle[]>([]);

  const deckLayers = useMemo(() => {
    if (!visible || points.length === 0 || !webglReady || deckFailed) {
      return [];
    }
    return [
      new HeatmapLayer<HeatmapPoint>({
        id: 'moto-mando-demand-heatmap',
        data: points,
        getPosition: (d) => [d.lng, d.lat],
        getWeight: (d) => d.weight,
        radiusPixels,
        intensity: 1.35,
        threshold: 0.04,
        opacity: 0.78,
        colorRange: HEATMAP_COLOR_RANGE,
      }),
    ];
  }, [visible, points, radiusPixels, webglReady, deckFailed]);

  // Deck.gl GoogleMapsOverlay lifecycle (WebGL2 browsers)
  useEffect(() => {
    if (!map || !webglReady || deckFailed) return;

    let overlay: GoogleMapsOverlay | null = null;
    try {
      overlay = new GoogleMapsOverlay({
        interleaved: false,
        layers: [],
      });
      overlay.setMap(map);
      deckRef.current = overlay;
    } catch (err) {
      console.warn('Deck.gl Heatmap fallback activated:', err);
      setDeckFailed(true);
    }

    return () => {
      if (overlay) {
        try {
          overlay.setMap(null);
          overlay.finalize();
        } catch {
          // Ignore cleanup errors on unmount
        }
      }
      deckRef.current = null;
    };
  }, [map, webglReady, deckFailed]);

  useEffect(() => {
    if (!deckRef.current || !webglReady || deckFailed) return;
    try {
      deckRef.current.setProps({ layers: deckLayers });
    } catch (err) {
      console.warn('Deck.gl Heatmap layer update failed, using vector fallback:', err);
      setDeckFailed(true);
    }
  }, [deckLayers, webglReady, deckFailed]);

  // Native Google Maps weighted radial fallback when WebGL2 is unavailable
  useEffect(() => {
    fallbackCirclesRef.current.forEach((circle) => circle.setMap(null));
    fallbackCirclesRef.current = [];

    const useFallback = !webglReady || deckFailed;
    if (!map || !useFallback || !visible || points.length === 0) return;

    const baseRadiusMeters = Math.max(280, radiusPixels * 12);
    const created: google.maps.Circle[] = [];

    points.forEach((pt) => {
      const intensityRatio = Math.min(1, pt.weight / 3.2);
      const fillColor =
        intensityRatio >= 0.75
          ? '#DC2626'
          : intensityRatio >= 0.45
          ? '#EA580C'
          : '#F59E0B';

      created.push(
        new google.maps.Circle({
          map,
          center: { lat: pt.lat, lng: pt.lng },
          radius: baseRadiusMeters * (0.75 + intensityRatio * 0.5),
          strokeOpacity: 0,
          fillColor,
          fillOpacity: 0.16 + intensityRatio * 0.14,
          clickable: false,
          zIndex: 5,
        })
      );
      created.push(
        new google.maps.Circle({
          map,
          center: { lat: pt.lat, lng: pt.lng },
          radius: baseRadiusMeters * 0.42,
          strokeOpacity: 0,
          fillColor,
          fillOpacity: 0.24 + intensityRatio * 0.18,
          clickable: false,
          zIndex: 6,
        })
      );
    });

    fallbackCirclesRef.current = created;

    return () => {
      created.forEach((c) => c.setMap(null));
      fallbackCirclesRef.current = [];
    };
  }, [map, webglReady, deckFailed, visible, points, radiusPixels]);

  return null;
};

interface RiderMarkerItemProps {
  rider: RiderProfile;
  isCurrentUser: boolean;
}

const RiderMarkerItem: React.FC<RiderMarkerItemProps> = ({
  rider,
  isCurrentUser,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: rider.lat, lng: rider.lng }}
        onClick={() => setOpen(true)}
        title={`${rider.motoName} (${rider.displayName})`}
        zIndex={isCurrentUser ? 50 : 30}
      >
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-white text-xs font-semibold shadow-md border border-white/80 cursor-pointer"
          style={{ backgroundColor: rider.motoColor || '#EA580C' }}
        >
          <span className="font-display whitespace-nowrap">{rider.motoName}</span>
          <span className="font-mono tabular-nums text-[10px] opacity-90">
            {Math.round(rider.speedKmh)} km/h
          </span>
        </div>
      </AdvancedMarker>

      {open && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)} maxWidth={240}>
          <div className="p-1 space-y-1 text-slate-900 keep-light">
            <div className="font-display font-bold text-sm">{rider.motoName}</div>
            <div className="text-xs text-slate-600">
              {rider.displayName} · {rider.motoModel}
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-500">
              Placa: {rider.motoPlate} · {Math.round(rider.speedKmh)} km/h · ★ {rider.rating.toFixed(1)}
            </div>
            <div className="text-[11px] text-slate-500">
              {rider.departmentName}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface MerchantMarkerItemProps {
  merchant: Merchant;
}

const MerchantMarkerItem: React.FC<MerchantMarkerItemProps> = ({ merchant }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: merchant.lat, lng: merchant.lng }}
        onClick={() => setOpen(true)}
        title={`Comercio: ${merchant.name}`}
        zIndex={15}
      >
        <div className="px-2 py-1 rounded-md bg-white border border-slate-300 shadow-sm text-[11px] font-semibold text-slate-800 whitespace-nowrap cursor-pointer">
          {merchant.name}
        </div>
      </AdvancedMarker>
      {open && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)} maxWidth={230}>
          <div className="p-1 space-y-1 text-slate-900 keep-light">
            <div className="font-display font-bold text-xs">{merchant.name}</div>
            <div className="text-[11px] text-slate-600">
              {merchant.category} · {merchant.departmentName}
            </div>
            <div className="text-[11px] text-slate-500">{merchant.address}</div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface StopMarkerItemProps {
  delivery: Delivery;
  index: number;
  currency: string;
  onSelectDelivery?: (delivery: Delivery) => void;
}

const StopMarkerItem: React.FC<StopMarkerItemProps> = ({
  delivery,
  index,
  currency,
  onSelectDelivery,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  const isUrgent = delivery.isUrgent;
  const pinBg =
    delivery.status === 'delivered'
      ? '#16A34A'
      : isUrgent
      ? '#DC2626'
      : delivery.serviceCategory === 'comercio'
      ? '#0284C7'
      : '#0F172A';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: delivery.dropoffLat, lng: delivery.dropoffLng }}
        onClick={() => {
          setOpen(true);
          onSelectDelivery?.(delivery);
        }}
        title={`Parada #${index + 1}: ${delivery.title}`}
        zIndex={isUrgent ? 40 : 20}
      >
        <Pin
          background={pinBg}
          borderColor="#FFFFFF"
          glyphColor="#FFFFFF"
          glyphText={String(index + 1)}
          scale={1.1}
        />
      </AdvancedMarker>

      {open && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)} maxWidth={260}>
          <div className="p-1 space-y-1 text-slate-900 keep-light">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-sm">
                Parada #{index + 1} · {delivery.title}
              </span>
            </div>
            <div className="text-[11px] font-semibold text-orange-700">
              {SERVICE_CATEGORY_LABELS[delivery.serviceCategory || 'delivery']}
              {delivery.merchantName ? ` · ${delivery.merchantName}` : ''}
            </div>
            <div className="text-xs text-slate-600">{delivery.dropoffAddress}</div>
            <div className="text-xs text-slate-500">
              Estado: {STATUS_LABELS[delivery.status]} ·{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatCurrency(delivery.totalFare, currency)}
              </span>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface LiveFleetMapProps {
  riders: RiderProfile[];
  deliveries: Delivery[];
  merchants?: Merchant[];
  currentRiderUid?: string;
  encodedPolyline?: string;
  heatmapPoints?: HeatmapPoint[];
  showHeatmap?: boolean;
  heatmapRadius?: number;
  center?: { lat: number; lng: number };
  zoom?: number;
  focusTrigger?: number;
  currency?: string;
  onSelectDelivery?: (delivery: Delivery) => void;
  className?: string;
}

export const LiveFleetMap: React.FC<LiveFleetMapProps> = ({
  riders,
  deliveries,
  merchants = [],
  currentRiderUid,
  encodedPolyline = '',
  heatmapPoints = [],
  showHeatmap = false,
  heatmapRadius = 55,
  center = { lat: 19.4326, lng: -99.1332 },
  zoom = 13,
  focusTrigger = 0,
  currency = 'MXN',
  onSelectDelivery,
  className = 'h-[440px]',
}) => {
  const mapsConfigured = useContext(MapsConfiguredContext);
  const { theme } = useTheme();
  const activeDeliveries = deliveries.filter(
    (d) => d.status !== 'cancelled' && d.status !== 'delivered'
  );

  if (!mapsConfigured) {
    return (
      <div
        className={`w-full rounded-xl border border-slate-200 bg-slate-100 flex flex-col items-center justify-center p-6 text-center space-y-2 ${className}`}
      >
        <div className="text-sm font-semibold text-slate-800">
          Inicializando Google Maps Platform
        </div>
        <p className="text-xs text-slate-500 max-w-sm">
          Verifica que tu clave de Google Maps Platform esté disponible en el entorno para visualizar el mapa interactivo en tiempo real.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative ${className}`}
    >
      <GoogleMapView
        mapId="DEMO_MAP_ID"
        colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
        defaultCenter={center}
        defaultZoom={zoom}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
      >
        <MapCameraController
          center={center}
          zoom={zoom}
          focusTrigger={focusTrigger}
        />

        <DemandHeatmapOverlay
          points={heatmapPoints}
          radiusPixels={heatmapRadius}
          visible={showHeatmap}
        />

        {riders
          .filter((r) => r.status !== 'offline')
          .map((rider) => (
            <RiderMarkerItem
              key={rider.uid}
              rider={rider}
              isCurrentUser={rider.uid === currentRiderUid}
            />
          ))}

        {merchants
          .filter((m) => m.active)
          .map((merchant) => (
            <MerchantMarkerItem key={merchant.id} merchant={merchant} />
          ))}

        {activeDeliveries.map((delivery, idx) => (
          <StopMarkerItem
            key={delivery.id}
            delivery={delivery}
            index={delivery.stopOrder > 0 ? delivery.stopOrder - 1 : idx}
            currency={currency}
            onSelectDelivery={onSelectDelivery}
          />
        ))}

        {encodedPolyline && <PolylineOverlay encodedPolyline={encodedPolyline} />}
      </GoogleMapView>

      {showHeatmap && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-slate-200/90 bg-white/95 backdrop-blur-xs px-3 py-2 shadow-sm text-[11px] text-slate-700 space-y-1">
          <div className="font-semibold text-slate-900">
            Intensidad de Demanda ({heatmapPoints.length} pts)
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Baja</span>
            <div
              className="h-2 w-24 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, #FEF08A 0%, #FDBA74 28%, #F97316 58%, #DC2626 84%, #991B1B 100%)',
              }}
            />
            <span className="font-semibold text-red-700">Crítica</span>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Modern Autocomplete Hook (Places API New) ---
export function usePlaceAutocomplete(inputString: string) {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!placesLib) return;
    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;

    if (!inputString || inputString.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    setIsLoading(true);

    const timer = setTimeout(() => {
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: inputString,
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res) => {
          if (!cancelled) {
            setSuggestions(res.suggestions || []);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          console.error('Autocomplete error:', err);
          if (!cancelled) {
            setSuggestions([]);
            setIsLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, inputString]);

  const selectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ): Promise<{ address: string; lat: number; lng: number } | null> => {
    if (!suggestion.placePrediction) return null;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['formattedAddress', 'location', 'displayName'],
      });
      const loc = place.location;
      const address =
        place.formattedAddress ||
        place.displayName ||
        suggestion.placePrediction.text.text;
      sessionTokenRef.current = null;
      setSuggestions([]);
      if (loc) {
        return { address, lat: loc.lat(), lng: loc.lng() };
      }
      return null;
    } catch (err) {
      console.error('fetchFields error:', err);
      return null;
    }
  };

  return {
    suggestions,
    isLoading,
    selectSuggestion,
    clearSuggestions: () => {
      sessionTokenRef.current = null;
      setSuggestions([]);
    },
  };
}
