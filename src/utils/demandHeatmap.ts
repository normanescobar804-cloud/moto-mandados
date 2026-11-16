import { Delivery, RiderProfile } from '../types';
import { haversineKm } from './tariffs';

export type HeatmapSourceFilter = 'all' | 'active' | 'historical';
export type HeatmapPointScope = 'both' | 'pickup' | 'dropoff';

export interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
}

export interface DemandHotspot {
  id: string;
  zoneName: string;
  departmentId: string;
  departmentName: string;
  lat: number;
  lng: number;
  totalCount: number;
  activeCount: number;
  historicalCount: number;
  urgentCount: number;
  heatScore: number;
  nearbyAvailableRiders: number;
  status: 'critical' | 'high' | 'balanced';
}

const ACTIVE_STATUSES = new Set([
  'pending',
  'assigned',
  'en_route',
  'picked_up',
]);

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) > 0.01 &&
    Math.abs(lng) > 0.01 &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function getDeliveryWeight(delivery: Delivery): number {
  const isActive = ACTIVE_STATUSES.has(delivery.status);
  const isUrgent =
    delivery.isUrgent || delivery.serviceCategory === 'super_expres';

  if (delivery.status === 'pending') {
    return isUrgent ? 3.2 : 2.4;
  }
  if (isActive) {
    return isUrgent ? 2.5 : 1.8;
  }
  return isUrgent ? 1.35 : 1.0;
}

function extractZoneLabel(address: string, fallback: string): string {
  const cleaned = address.trim();
  if (!cleaned) return fallback;
  const parts = cleaned
    .split(/[,·]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]} · ${parts[1]}`.slice(0, 48);
  }
  return parts[0].slice(0, 48);
}

export function filterDeliveriesForHeatmap(
  deliveries: Delivery[],
  sourceFilter: HeatmapSourceFilter
): Delivery[] {
  return deliveries.filter((d) => {
    if (d.status === 'cancelled') return false;
    if (sourceFilter === 'active') return ACTIVE_STATUSES.has(d.status);
    if (sourceFilter === 'historical') return d.status === 'delivered';
    return true;
  });
}

export function buildHeatmapPoints(
  deliveries: Delivery[],
  sourceFilter: HeatmapSourceFilter,
  pointScope: HeatmapPointScope = 'both'
): HeatmapPoint[] {
  const filtered = filterDeliveriesForHeatmap(deliveries, sourceFilter);
  const points: HeatmapPoint[] = [];

  filtered.forEach((delivery) => {
    const weight = getDeliveryWeight(delivery);

    if (
      (pointScope === 'both' || pointScope === 'pickup') &&
      isValidCoord(delivery.pickupLat, delivery.pickupLng)
    ) {
      points.push({
        lat: delivery.pickupLat,
        lng: delivery.pickupLng,
        weight: pointScope === 'both' ? Number((weight * 0.9).toFixed(2)) : weight,
      });
    }

    if (
      (pointScope === 'both' || pointScope === 'dropoff') &&
      isValidCoord(delivery.dropoffLat, delivery.dropoffLng)
    ) {
      points.push({
        lat: delivery.dropoffLat,
        lng: delivery.dropoffLng,
        weight,
      });
    }
  });

  return points;
}

export function computeDemandHotspots(
  deliveries: Delivery[],
  riders: RiderProfile[],
  sourceFilter: HeatmapSourceFilter,
  pointScope: HeatmapPointScope = 'both'
): DemandHotspot[] {
  const filtered = filterDeliveriesForHeatmap(deliveries, sourceFilter);
  const gridStep = 0.016; // ~1.7 km spatial demand buckets

  interface Bucket {
    id: string;
    latSum: number;
    lngSum: number;
    pointCount: number;
    deliveryIds: Record<string, true>;
    activeIds: Record<string, true>;
    historicalIds: Record<string, true>;
    urgentIds: Record<string, true>;
    heatScore: number;
    departmentId: string;
    departmentName: string;
    zoneCounts: Record<string, number>;
  }

  const buckets: Record<string, Bucket> = {};

  const pushToBucket = (
    lat: number,
    lng: number,
    weight: number,
    delivery: Delivery,
    label: string
  ) => {
    if (!isValidCoord(lat, lng)) return;
    const gx = Math.round(lat / gridStep);
    const gy = Math.round(lng / gridStep);
    const key = `${gx}_${gy}`;

    if (!buckets[key]) {
      buckets[key] = {
        id: key,
        latSum: 0,
        lngSum: 0,
        pointCount: 0,
        deliveryIds: {},
        activeIds: {},
        historicalIds: {},
        urgentIds: {},
        heatScore: 0,
        departmentId: delivery.departmentId || 'dept_centro',
        departmentName: delivery.departmentName || 'Departamento Centro',
        zoneCounts: {},
      };
    }

    const b = buckets[key];
    b.latSum += lat;
    b.lngSum += lng;
    b.pointCount += 1;
    b.heatScore += weight;
    b.deliveryIds[delivery.id] = true;
    if (ACTIVE_STATUSES.has(delivery.status)) {
      b.activeIds[delivery.id] = true;
    } else if (delivery.status === 'delivered') {
      b.historicalIds[delivery.id] = true;
    }
    if (delivery.isUrgent || delivery.serviceCategory === 'super_expres') {
      b.urgentIds[delivery.id] = true;
    }
    b.zoneCounts[label] = (b.zoneCounts[label] || 0) + 1;
  };

  filtered.forEach((delivery) => {
    const weight = getDeliveryWeight(delivery);
    if (pointScope === 'both' || pointScope === 'pickup') {
      pushToBucket(
        delivery.pickupLat,
        delivery.pickupLng,
        pointScope === 'both' ? weight * 0.9 : weight,
        delivery,
        extractZoneLabel(delivery.pickupAddress, delivery.departmentName)
      );
    }
    if (pointScope === 'both' || pointScope === 'dropoff') {
      pushToBucket(
        delivery.dropoffLat,
        delivery.dropoffLng,
        weight,
        delivery,
        extractZoneLabel(delivery.dropoffAddress, delivery.departmentName)
      );
    }
  });

  const onlineRiders = riders.filter(
    (r) => r.status !== 'offline' && isValidCoord(r.lat, r.lng)
  );

  return Object.values(buckets)
    .map((b) => {
      const lat = b.latSum / b.pointCount;
      const lng = b.lngSum / b.pointCount;
      const totalCount = Object.keys(b.deliveryIds).length;
      const activeCount = Object.keys(b.activeIds).length;
      const historicalCount = Object.keys(b.historicalIds).length;
      const urgentCount = Object.keys(b.urgentIds).length;

      const nearbyAvailableRiders = onlineRiders.filter(
        (r) => haversineKm(lat, lng, r.lat, r.lng) <= 3.5
      ).length;

      let topZone = b.departmentName;
      let topCount = -1;
      Object.entries(b.zoneCounts).forEach(([zone, cnt]) => {
        if (cnt > topCount) {
          topCount = cnt;
          topZone = zone;
        }
      });

      const status: DemandHotspot['status'] =
        (activeCount > 0 && nearbyAvailableRiders === 0) ||
        (b.heatScore >= 4.5 && nearbyAvailableRiders === 0)
          ? 'critical'
          : b.heatScore >= 3.0 || activeCount > nearbyAvailableRiders
          ? 'high'
          : 'balanced';

      return {
        id: b.id,
        zoneName: topZone,
        departmentId: b.departmentId,
        departmentName: b.departmentName,
        lat,
        lng,
        totalCount,
        activeCount,
        historicalCount,
        urgentCount,
        heatScore: Number(b.heatScore.toFixed(1)),
        nearbyAvailableRiders,
        status,
      };
    })
    .sort(
      (a, b) =>
        b.heatScore - a.heatScore ||
        b.activeCount - a.activeCount ||
        b.totalCount - a.totalCount
    )
    .slice(0, 6);
}
