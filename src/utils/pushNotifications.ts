import { registerSW } from 'virtual:pwa-register';

export type BrowserPushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export interface UrgentPushPayload {
  title: string;
  body: string;
  deliveryId?: string;
  tag?: string;
  isUrgent?: boolean;
  url?: string;
}

let swInitialized = false;
let activeRegistration: ServiceWorkerRegistration | null = null;
const BASE_URL = import.meta.env.BASE_URL || '/';

export function isBrowserPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  );
}

export function getBrowserPushPermission(): BrowserPushPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as BrowserPushPermission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (!swInitialized) {
    swInitialized = true;
    try {
      registerSW({
        immediate: true,
        onRegisteredSW(_swUrl, registration) {
          if (registration) activeRegistration = registration;
        },
        onRegisterError() {
          // Fallback handled below
        },
      });
    } catch {
      // Fallback handled below
    }
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) {
      activeRegistration = existing;
      return existing;
    }
    const fallbackReg = await navigator.serviceWorker.register(
      `${BASE_URL}sw-push.js`,
      {
        scope: BASE_URL,
      }
    );
    activeRegistration = fallbackReg;
    return fallbackReg;
  } catch {
    return activeRegistration;
  }
}

export async function requestBrowserPushPermission(): Promise<BrowserPushPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result as BrowserPushPermission;
  } catch {
    return getBrowserPushPermission();
  }
}

export async function syncServerPushSubscription(params: {
  uid: string;
  departmentId: string;
  userMode: 'driver' | 'passenger';
  urgentEnabled: boolean;
  dailyEarningsEnabled?: boolean;
  dailyEarningsTime?: string;
  timezoneOffsetMinutes?: number;
  dailySummaryText?: string;
}): Promise<{ subscribed: boolean; reason?: string }> {
  if (!isBrowserPushSupported()) {
    return { subscribed: false, reason: 'unsupported' };
  }
  if (getBrowserPushPermission() !== 'granted') {
    return { subscribed: false, reason: 'permission_not_granted' };
  }

  const reg = await ensureServiceWorkerReady();
  if (!reg || !('pushManager' in reg)) {
    return { subscribed: false, reason: 'push_manager_unavailable' };
  }

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await fetch('/api/push/vapid-public-key');
      if (!res.ok) return { subscribed: false, reason: 'vapid_unavailable' };
      const data = (await res.json()) as { enabled?: boolean; publicKey?: string };
      if (!data?.publicKey) {
        return { subscribed: false, reason: 'missing_public_key' };
      }
      const applicationServerKey = urlBase64ToUint8Array(data.publicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });
    }

    const subJson = sub.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: params.uid,
        departmentId: params.departmentId || 'all',
        userMode: params.userMode,
        urgentEnabled: params.urgentEnabled,
        dailyEarningsEnabled: params.dailyEarningsEnabled ?? false,
        dailyEarningsTime: params.dailyEarningsTime || '20:00',
        timezoneOffsetMinutes:
          typeof params.timezoneOffsetMinutes === 'number'
            ? params.timezoneOffsetMinutes
            : new Date().getTimezoneOffset(),
        dailySummaryText: params.dailySummaryText || '',
        subscription: subJson,
      }),
    });

    return { subscribed: true };
  } catch {
    // Even if remote PushManager service is blocked in sandboxed iframe,
    // ServiceWorker local background notifications still operate while tab is inactive.
    return { subscribed: false, reason: 'push_service_blocked' };
  }
}

export async function unsubscribeServerPush(uid?: string): Promise<void> {
  try {
    let endpoint: string | undefined;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'pushManager' in reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          endpoint = sub.endpoint;
          await sub.unsubscribe().catch(() => {});
        }
      }
    }
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, uid }),
    });
  } catch {
    // Ignore cleanup failure
  }
}

export interface PushDiagnostics {
  supported: boolean;
  permission: BrowserPushPermission;
  swRegistered: boolean;
  swState: 'active' | 'installing' | 'waiting' | 'none';
  pushManagerAvailable: boolean;
  hasActiveSubscription: boolean;
  endpointHost: string;
}

export interface TestPushOutcome {
  shown: boolean;
  channel: 'service_worker' | 'browser_api' | 'blocked' | 'unsupported';
  serverPushSent: number;
  timestamp: string;
  title: string;
}

export async function getPushSubscriptionDiagnostics(): Promise<PushDiagnostics> {
  const supported = isBrowserPushSupported();
  const permission = getBrowserPushPermission();

  if (!supported || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return {
      supported,
      permission,
      swRegistered: false,
      swState: 'none',
      pushManagerAvailable: false,
      hasActiveSubscription: false,
      endpointHost: '',
    };
  }

  try {
    const reg = await ensureServiceWorkerReady();
    const swState: PushDiagnostics['swState'] = reg?.active
      ? 'active'
      : reg?.waiting
      ? 'waiting'
      : reg?.installing
      ? 'installing'
      : 'none';
    const swRegistered = Boolean(reg && swState !== 'none');
    const pushManagerAvailable = Boolean(reg && 'pushManager' in reg);

    let hasActiveSubscription = false;
    let endpointHost = '';
    if (reg && 'pushManager' in reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub?.endpoint) {
        hasActiveSubscription = true;
        try {
          endpointHost = new URL(sub.endpoint).hostname;
        } catch {
          endpointHost = 'web-push';
        }
      }
    }

    return {
      supported,
      permission,
      swRegistered,
      swState,
      pushManagerAvailable,
      hasActiveSubscription,
      endpointHost,
    };
  } catch {
    return {
      supported,
      permission,
      swRegistered: false,
      swState: 'none',
      pushManagerAvailable: false,
      hasActiveSubscription: false,
      endpointHost: '',
    };
  }
}

export async function showBrowserNotificationDetailed(
  payload: UrgentPushPayload
): Promise<{
  shown: boolean;
  channel: 'service_worker' | 'browser_api' | 'blocked' | 'unsupported';
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { shown: false, channel: 'unsupported' };
  }
  if (Notification.permission !== 'granted') {
    return { shown: false, channel: 'blocked' };
  }

  const tag =
    payload.tag ||
    (payload.deliveryId
      ? `urgent-${payload.deliveryId}`
      : `motomandados-${Date.now()}`);

  const reg = await ensureServiceWorkerReady();
  if (reg) {
    try {
      await reg.showNotification(payload.title, {
        body: payload.body,
        icon: `${BASE_URL}pwa-192x192.png`,
        badge: `${BASE_URL}pwa-192x192.png`,
        tag,
        requireInteraction: payload.isUrgent !== false,
        data: {
          url: payload.url || BASE_URL,
          deliveryId: payload.deliveryId || '',
          isUrgent: payload.isUrgent !== false,
        },
      });
      return { shown: true, channel: 'service_worker' };
    } catch {
      if (reg.active) {
        reg.active.postMessage({
          type: 'SHOW_URGENT_NOTIFICATION',
          payload: { ...payload, tag },
        });
        return { shown: true, channel: 'service_worker' };
      }
    }
  }

  try {
    const n = new Notification(payload.title, {
      body: payload.body,
      icon: `${BASE_URL}pwa-192x192.png`,
      tag,
      requireInteraction: payload.isUrgent !== false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return { shown: true, channel: 'browser_api' };
  } catch {
    return { shown: false, channel: 'blocked' };
  }
}

export async function showUrgentBrowserNotification(
  payload: UrgentPushPayload
): Promise<boolean> {
  const res = await showBrowserNotificationDetailed(payload);
  return res.shown;
}

export async function triggerServerPushBroadcast(payload: {
  deliveryId?: string;
  title: string;
  body: string;
  departmentId?: string;
  senderUid?: string;
  testOnlyForUid?: string;
}): Promise<{ ok: boolean; sent?: number }> {
  try {
    const res = await fetch('/api/push/urgent-broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { ok?: boolean; sent?: number };
    return { ok: Boolean(data.ok), sent: data.sent ?? 0 };
  } catch {
    return { ok: false };
  }
}
