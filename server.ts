import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import * as webpush from 'web-push';
import type { ViteDevServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
  }
  return Number(process.env.PORT) || 3000;
}

const app = express();
const PORT = resolvePort();

app.use(express.json({ limit: '1mb' }));

function getMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  );
}

// --- Web Push (VAPID) Configuration & Subscription Store ---
const VAPID_FILE = path.resolve(__dirname, '.vapid-keys.json');
const SUBSCRIPTIONS_FILE = path.resolve(__dirname, '.push-subscriptions.json');

interface StoredPushSubscription {
  uid: string;
  departmentId: string;
  userMode: 'driver' | 'passenger';
  urgentEnabled: boolean;
  dailyEarningsEnabled?: boolean;
  dailyEarningsTime?: string;
  timezoneOffsetMinutes?: number;
  dailySummaryText?: string;
  lastDailySentKey?: string;
  subscription: webpush.PushSubscription;
  updatedAt: number;
}

function loadOrCreateVapidKeys(): { publicKey: string; privateKey: string } {
  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPublic && envPrivate) {
    return { publicKey: envPublic, privateKey: envPrivate };
  }

  try {
    if (fs.existsSync(VAPID_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8')) as {
        publicKey?: string;
        privateKey?: string;
      };
      if (parsed.publicKey && parsed.privateKey) {
        return { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
      }
    }
  } catch {
    // Regenerate if unreadable
  }

  const generated = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_FILE, JSON.stringify(generated, null, 2), 'utf-8');
  } catch {
    // Non-fatal in read-only filesystem
  }
  return generated;
}

const vapidKeys = loadOrCreateVapidKeys();
webpush.setVapidDetails(
  'mailto:soporte@motomandados.app',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

function loadSubscriptions(): Map<string, StoredPushSubscription> {
  const map = new Map<string, StoredPushSubscription>();
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8')) as StoredPushSubscription[];
      if (Array.isArray(raw)) {
        raw.forEach((item) => {
          if (item?.subscription?.endpoint) {
            map.set(item.subscription.endpoint, item);
          }
        });
      }
    }
  } catch {
    // Ignore corrupt cache file
  }
  return map;
}

const pushSubscriptions = loadSubscriptions();

function persistSubscriptions() {
  try {
    fs.writeFileSync(
      SUBSCRIPTIONS_FILE,
      JSON.stringify(Array.from(pushSubscriptions.values()), null, 2),
      'utf-8'
    );
  } catch {
    // Ignore non-fatal write errors
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'moto-mandados-api' });
});

app.get('/api/config/maps', (_req, res) => {
  const apiKey = getMapsApiKey();
  res.json({ apiKey });
});

app.get('/api/push/vapid-public-key', (_req, res) => {
  res.json({
    enabled: true,
    publicKey: vapidKeys.publicKey,
    subscriberCount: pushSubscriptions.size,
  });
});

app.post('/api/push/subscribe', (req, res) => {
  const body = req.body as {
    uid?: string;
    departmentId?: string;
    userMode?: 'driver' | 'passenger';
    urgentEnabled?: boolean;
    dailyEarningsEnabled?: boolean;
    dailyEarningsTime?: string;
    timezoneOffsetMinutes?: number;
    dailySummaryText?: string;
    subscription?: webpush.PushSubscription;
  };

  const endpoint = body?.subscription?.endpoint;
  const keys = body?.subscription?.keys;
  if (
    !body?.uid ||
    typeof body.uid !== 'string' ||
    !endpoint ||
    typeof endpoint !== 'string' ||
    !endpoint.startsWith('https://') ||
    !keys?.p256dh ||
    !keys?.auth
  ) {
    res.status(400).json({ error: 'INVALID_PUSH_SUBSCRIPTION' });
    return;
  }

  const prev = pushSubscriptions.get(endpoint);
  const validTime =
    typeof body.dailyEarningsTime === 'string' &&
    /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(body.dailyEarningsTime)
      ? body.dailyEarningsTime
      : prev?.dailyEarningsTime || '20:00';
  const keepLastSent =
    prev?.dailyEarningsTime === validTime ? prev?.lastDailySentKey : undefined;

  pushSubscriptions.set(endpoint, {
    uid: body.uid.slice(0, 128),
    departmentId: String(body.departmentId || 'all').slice(0, 64),
    userMode: body.userMode === 'passenger' ? 'passenger' : 'driver',
    urgentEnabled: body.urgentEnabled !== false,
    dailyEarningsEnabled: Boolean(body.dailyEarningsEnabled),
    dailyEarningsTime: validTime,
    timezoneOffsetMinutes:
      typeof body.timezoneOffsetMinutes === 'number' &&
      Number.isFinite(body.timezoneOffsetMinutes)
        ? body.timezoneOffsetMinutes
        : prev?.timezoneOffsetMinutes ?? 0,
    dailySummaryText:
      typeof body.dailySummaryText === 'string'
        ? body.dailySummaryText.slice(0, 240)
        : prev?.dailySummaryText || '',
    lastDailySentKey: keepLastSent,
    subscription: {
      endpoint,
      keys: {
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
      },
    },
    updatedAt: Date.now(),
  });
  persistSubscriptions();
  res.json({ ok: true, subscriberCount: pushSubscriptions.size });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const body = req.body as { endpoint?: string; uid?: string };
  let removed = 0;
  if (body?.endpoint && pushSubscriptions.has(body.endpoint)) {
    pushSubscriptions.delete(body.endpoint);
    removed += 1;
  }
  if (body?.uid) {
    for (const [ep, entry] of pushSubscriptions.entries()) {
      if (entry.uid === body.uid) {
        pushSubscriptions.delete(ep);
        removed += 1;
      }
    }
  }
  if (removed > 0) persistSubscriptions();
  res.json({ ok: true, removed });
});

app.post('/api/push/urgent-broadcast', async (req, res) => {
  const body = req.body as {
    deliveryId?: string;
    title?: string;
    body?: string;
    departmentId?: string;
    senderUid?: string;
    testOnlyForUid?: string;
  };

  const cleanTitle = String(body?.title || 'Entrega Urgente · Moto Mandados').slice(0, 120);
  const cleanBody = String(
    body?.body || 'Nueva solicitud urgente disponible para tu motocicleta.'
  ).slice(0, 240);
  const deliveryId = String(body?.deliveryId || '').slice(0, 128);
  const targetDept = String(body?.departmentId || 'all').slice(0, 64);

  const payload = JSON.stringify({
    title: cleanTitle,
    body: cleanBody,
    tag: deliveryId ? `urgent-${deliveryId}` : `urgent-test-${Date.now()}`,
    deliveryId,
    isUrgent: true,
    url: '/',
  });

  const targets: Array<[string, StoredPushSubscription]> = [];
  for (const [ep, entry] of pushSubscriptions.entries()) {
    if (body?.testOnlyForUid) {
      if (entry.uid === body.testOnlyForUid) {
        targets.push([ep, entry]);
      }
      continue;
    }
    if (!entry.urgentEnabled) continue;
    if (entry.userMode !== 'driver') continue;
    if (body?.senderUid && entry.uid === body.senderUid) continue;
    if (
      targetDept !== 'all' &&
      entry.departmentId !== 'all' &&
      entry.departmentId !== targetDept
    ) {
      continue;
    }
    targets.push([ep, entry]);
  }

  let sent = 0;
  let pruned = 0;
  await Promise.all(
    targets.map(async ([ep, entry]) => {
      try {
        await webpush.sendNotification(entry.subscription, payload, {
          urgency: 'high',
          TTL: 120,
        });
        sent += 1;
      } catch (err: unknown) {
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          pushSubscriptions.delete(ep);
          pruned += 1;
        }
      }
    })
  );

  if (pruned > 0) persistSubscriptions();
  res.json({ ok: true, sent, pruned, matchedTargets: targets.length });
});

// Scheduled daily earnings summary Web Push dispatcher (checks every 30 seconds)
setInterval(() => {
  if (pushSubscriptions.size === 0) return;
  const nowUtcMs = Date.now();
  let dirty = false;

  for (const [ep, entry] of pushSubscriptions.entries()) {
    if (!entry.dailyEarningsEnabled || !entry.dailyEarningsTime) continue;
    const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(entry.dailyEarningsTime);
    if (!match) continue;

    const schedMin = Number(match[1]) * 60 + Number(match[2]);
    const offsetMin = entry.timezoneOffsetMinutes ?? 0;
    const localDate = new Date(nowUtcMs - offsetMin * 60_000);
    const localMin = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
    const diff = localMin - schedMin;

    if (diff >= 0 && diff <= 2) {
      const y = localDate.getUTCFullYear();
      const m = String(localDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(localDate.getUTCDate()).padStart(2, '0');
      const sentKey = `${y}-${m}-${d}@${entry.dailyEarningsTime}`;
      if (entry.lastDailySentKey === sentKey) continue;

      entry.lastDailySentKey = sentKey;
      dirty = true;

      const payload = JSON.stringify({
        title: '💰 Resumen Diario de Ganancias · Moto Mandados',
        body:
          entry.dailySummaryText ||
          'Tu resumen diario de ganancias y saldo operativo está disponible.',
        tag: `daily-summary-${y}-${m}-${d}`,
        isUrgent: false,
        url: '/',
      });

      void webpush
        .sendNotification(entry.subscription, payload, {
          urgency: 'normal',
          TTL: 300,
        })
        .catch((err: unknown) => {
          const statusCode =
            typeof err === 'object' && err !== null && 'statusCode' in err
              ? Number((err as { statusCode: number }).statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            pushSubscriptions.delete(ep);
            persistSubscriptions();
          }
        });
    }
  }

  if (dirty) persistSubscriptions();
}, 30_000);

interface WaypointInput {
  lat: number;
  lng: number;
  label?: string;
}

interface OptimizeRouteBody {
  origin: WaypointInput;
  destination: WaypointInput;
  intermediates?: WaypointInput[];
  travelMode?: 'TWO_WHEELER' | 'DRIVE';
}

app.post('/api/routes/optimize', async (req, res) => {
  const apiKey = getMapsApiKey();
  if (!apiKey) {
    res.status(503).json({
      error: 'GOOGLE_MAPS_API_KEY_MISSING',
      message: 'Google Maps API key is not configured on the server.',
    });
    return;
  }

  const body = req.body as OptimizeRouteBody;
  if (
    !body?.origin ||
    typeof body.origin.lat !== 'number' ||
    typeof body.origin.lng !== 'number' ||
    !body?.destination ||
    typeof body.destination.lat !== 'number' ||
    typeof body.destination.lng !== 'number'
  ) {
    res.status(400).json({ error: 'INVALID_WAYPOINTS' });
    return;
  }

  const intermediates = Array.isArray(body.intermediates)
    ? body.intermediates.slice(0, 15).map((pt) => ({
        location: {
          latLng: { latitude: pt.lat, longitude: pt.lng },
        },
      }))
    : [];

  const callComputeRoutes = async (travelMode: 'TWO_WHEELER' | 'DRIVE') => {
    const payload: Record<string, unknown> = {
      origin: {
        location: {
          latLng: { latitude: body.origin.lat, longitude: body.origin.lng },
        },
      },
      destination: {
        location: {
          latLng: { latitude: body.destination.lat, longitude: body.destination.lng },
        },
      },
      travelMode,
      routingPreference: 'TRAFFIC_AWARE',
    };

    if (intermediates.length > 0) {
      payload.intermediates = intermediates;
      payload.optimizeWaypointOrder = true;
    }

    const fieldMask = [
      'routes.duration',
      'routes.distanceMeters',
      'routes.polyline.encodedPolyline',
      'routes.legs.duration',
      'routes.legs.distanceMeters',
      ...(intermediates.length > 0 ? ['routes.optimizedIntermediateWaypointIndex'] : []),
    ].join(',');

    return fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(payload),
    });
  };

  try {
    const preferredMode = body.travelMode || 'TWO_WHEELER';
    let response = await callComputeRoutes(preferredMode);

    // Fallback to DRIVE if TWO_WHEELER is unsupported in the requested region
    if (!response.ok && preferredMode === 'TWO_WHEELER' && response.status !== 429) {
      response = await callComputeRoutes('DRIVE');
    }

    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { raw: text };
    }

    if (!response.ok) {
      res.status(response.status).json(parsed);
      return;
    }

    res.json(parsed);
  } catch (error) {
    res.status(500).json({
      error: 'ROUTES_PROXY_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function startServer() {
  const httpServer = http.createServer(app);
  let viteInstance: ViteDevServer | null = null;

  if (process.env.NODE_ENV !== 'production') {
    const disableHmr =
      process.env.DISABLE_HMR === 'true' || Boolean(process.env.K_SERVICE);
    const vitePromise = import('vite').then(async ({ createServer: createViteServer }) => {
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: disableHmr ? false : { server: httpServer },
          ws: disableHmr ? false : undefined,
          watch: disableHmr ? null : {},
        },
        appType: 'spa',
      });
      viteInstance = vite;
      return vite;
    });

    vitePromise.catch((err) => {
      console.error('Failed to initialize Vite dev middleware:', err);
    });

    if (disableHmr) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(`
const sheetsMap = new Map();
let lastInsertedStyle;
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
  sheetsMap.delete(id);
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    prune() {},
    dispose() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay {}
`);
      });
    }

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(PORT, '0.0.0.0', () => {
      httpServer.off('error', reject);
      console.log(`Moto Mandados server listening on http://0.0.0.0:${PORT}`);
      resolve();
    });
  });

  const shutdown = async () => {
    try {
      if (viteInstance) {
        await viteInstance.close();
      }
    } catch {
      // Ignore Vite close errors on exit
    }
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.once('SIGTERM', () => {
    void shutdown();
  });
  process.once('SIGINT', () => {
    void shutdown();
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting Moto Mandados server:', err);
  process.exit(1);
});
