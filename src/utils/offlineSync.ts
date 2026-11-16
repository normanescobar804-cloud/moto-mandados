import {
  Delivery,
  DeliveryStatus,
  Department,
  Merchant,
  RiderProfile,
  RiderStatus,
  ServiceCategory,
  ServiceType,
  TariffSettings,
  Wallet,
} from '../types';

const DB_NAME = 'moto_mando_offline_db';
const DB_VERSION = 1;
const STORE_SNAPSHOTS = 'snapshots';
const STORE_QUEUE = 'syncQueue';
const LS_SNAPSHOT_PREFIX = 'motomando_snapshot_';
const LS_QUEUE_PREFIX = 'motomando_queue_';

export interface OfflineSnapshot {
  uid: string;
  rider: RiderProfile | null;
  deliveries: Delivery[];
  departments: Department[];
  merchants: Merchant[];
  tariffs: TariffSettings | null;
  wallet: Wallet | null;
  savedAt: number;
}

export type OfflineQueueItem =
  | {
      id: string;
      uid: string;
      kind: 'location';
      createdAt: number;
      payload: {
        lat: number;
        lng: number;
        speedKmh: number;
        heading: number;
        departmentId: string;
        departmentName: string;
        ratingCount: number;
      };
    }
  | {
      id: string;
      uid: string;
      kind: 'rider_status';
      createdAt: number;
      payload: {
        status: RiderStatus;
        departmentId: string;
        departmentName: string;
        ratingCount: number;
      };
    }
  | {
      id: string;
      uid: string;
      kind: 'claim_delivery';
      createdAt: number;
      payload: {
        deliveryId: string;
        deliveryTitle: string;
        riderName: string;
        motoName: string;
        stopOrder: number;
        pickupAddress: string;
      };
    }
  | {
      id: string;
      uid: string;
      kind: 'advance_delivery';
      createdAt: number;
      payload: {
        delivery: Delivery;
        nextStatus: DeliveryStatus;
      };
    }
  | {
      id: string;
      uid: string;
      kind: 'dispatch_delivery';
      createdAt: number;
      payload: {
        deliveryId: string;
        title: string;
        serviceCategory: ServiceCategory;
        serviceType: ServiceType;
        isUrgent: boolean;
        departmentId: string;
        departmentName: string;
        merchantName: string;
        cashOnDelivery: number;
        pickupAddress: string;
        pickupLat: number;
        pickupLng: number;
        dropoffAddress: string;
        dropoffLat: number;
        dropoffLng: number;
        customerName: string;
        notes: string;
        distanceKm: number;
        estimatedMinutes: number;
        baseFare: number;
        distanceFare: number;
        urgentSurcharge: number;
        suggestedFare?: number;
        customFareEdited?: boolean;
        totalFare: number;
        riderEarnings: number;
        platformFee: number;
        preferredRiderUid?: string;
        preferredRiderName?: string;
      };
    };

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
        queueStore.createIndex('uid', 'uid', { unique: false });
        queueStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

function safeJsonClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export async function saveOfflineSnapshot(
  snapshot: OfflineSnapshot
): Promise<void> {
  const clean = safeJsonClone(snapshot);
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
      tx.objectStore(STORE_SNAPSHOTS).put(clean);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    try {
      window.localStorage.setItem(
        `${LS_SNAPSHOT_PREFIX}${clean.uid}`,
        JSON.stringify(clean)
      );
    } catch {
      // Storage quota exceeded; ignore silently
    }
  }
}

export async function loadOfflineSnapshot(
  uid: string
): Promise<OfflineSnapshot | null> {
  if (!uid) return null;
  try {
    const db = await openOfflineDb();
    const res = await new Promise<OfflineSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
      const req = tx.objectStore(STORE_SNAPSHOTS).get(uid);
      req.onsuccess = () =>
        resolve((req.result as OfflineSnapshot | undefined) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (res) return res;
  } catch {
    // Fallback to localStorage below
  }

  try {
    const raw = window.localStorage.getItem(`${LS_SNAPSHOT_PREFIX}${uid}`);
    return raw ? (JSON.parse(raw) as OfflineSnapshot) : null;
  } catch {
    return null;
  }
}

export async function listOfflineQueue(uid: string): Promise<OfflineQueueItem[]> {
  if (!uid) return [];
  try {
    const db = await openOfflineDb();
    const items = await new Promise<OfflineQueueItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readonly');
      const index = tx.objectStore(STORE_QUEUE).index('uid');
      const req = index.getAll(uid);
      req.onsuccess = () =>
        resolve(((req.result as OfflineQueueItem[]) || []).sort((a, b) => a.createdAt - b.createdAt));
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items;
  } catch {
    try {
      const raw = window.localStorage.getItem(`${LS_QUEUE_PREFIX}${uid}`);
      const parsed = raw ? (JSON.parse(raw) as OfflineQueueItem[]) : [];
      return parsed.sort((a, b) => a.createdAt - b.createdAt);
    } catch {
      return [];
    }
  }
}

export async function enqueueOfflineMutation(
  item: OfflineQueueItem
): Promise<OfflineQueueItem[]> {
  const clean = safeJsonClone(item);
  const current = await listOfflineQueue(clean.uid);

  // Coalesce high-frequency location or status updates for the same rider
  const filtered = current.filter((existing) => {
    if (clean.kind === 'location' && existing.kind === 'location') {
      return false;
    }
    if (clean.kind === 'rider_status' && existing.kind === 'rider_status') {
      return false;
    }
    if (
      clean.kind === 'advance_delivery' &&
      existing.kind === 'advance_delivery' &&
      existing.payload.delivery.id === clean.payload.delivery.id &&
      existing.payload.nextStatus === clean.payload.nextStatus
    ) {
      return false;
    }
    return true;
  });

  const nextList = [...filtered, clean].sort((a, b) => a.createdAt - b.createdAt);

  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      current.forEach((old) => store.delete(old.id));
      nextList.forEach((entry) => store.put(entry));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    try {
      window.localStorage.setItem(
        `${LS_QUEUE_PREFIX}${clean.uid}`,
        JSON.stringify(nextList)
      );
    } catch {
      // Ignore storage error
    }
  }

  return nextList;
}

export async function removeOfflineQueueItem(
  uid: string,
  itemId: string
): Promise<OfflineQueueItem[]> {
  const current = await listOfflineQueue(uid);
  const nextList = current.filter((i) => i.id !== itemId);

  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      tx.objectStore(STORE_QUEUE).delete(itemId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    try {
      window.localStorage.setItem(
        `${LS_QUEUE_PREFIX}${uid}`,
        JSON.stringify(nextList)
      );
    } catch {
      // Ignore
    }
  }

  return nextList;
}

export async function clearUserOfflineData(uid: string): Promise<void> {
  if (!uid) return;
  try {
    window.localStorage.removeItem(`${LS_SNAPSHOT_PREFIX}${uid}`);
    window.localStorage.removeItem(`${LS_QUEUE_PREFIX}${uid}`);
    window.localStorage.removeItem(`motomando_mode_${uid}`);
    window.localStorage.removeItem(`motomandados_autolock_${uid}`);
  } catch {
    // Ignore storage cleanup error
  }
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_SNAPSHOTS, STORE_QUEUE], 'readwrite');
      tx.objectStore(STORE_SNAPSHOTS).delete(uid);
      const qStore = tx.objectStore(STORE_QUEUE);
      const idx = qStore.index('uid');
      const req = idx.getAllKeys(uid);
      req.onsuccess = () => {
        const keys = req.result || [];
        keys.forEach((k) => qStore.delete(k));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ignore IndexedDB cleanup error
  }
}

export function isNetworkOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return (
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('client is offline')
  );
}
