import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Bike,
  LayoutDashboard,
  Wallet as WalletIcon,
  User as UserIcon,
  Zap,
  LogOut,
  Menu,
  X,
  Bell,
  QrCode,
  Globe,
  Store,
  Truck,
  WifiOff,
  RefreshCw,
  HardDrive,
  MessageSquare,
  Lock,
  ShieldCheck,
  Sun,
  Moon,
} from 'lucide-react';
import {
  ADMIN_EMAIL,
  OperationType,
  SessionPersistenceMode,
  auth,
  checkEmailVerificationStatus,
  db,
  formatFirebaseAuthError,
  handleFirestoreError,
  reauthenticateCurrentUser,
  reauthenticateWithPassword,
  registerWithEmailPassword,
  resendVerificationEmail,
  sendPasswordReset,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutUser,
  testFirestoreConnection,
} from './firebase';
import {
  AppNotification,
  BankAccount,
  ChatMessage,
  Delivery,
  DeliveryRating,
  DeliveryStatus,
  Department,
  DriverApplication,
  FrequentRoute,
  FrequentRouteInput,
  Merchant,
  QrTopup,
  RiderProfile,
  RiderStatus,
  ServiceCategory,
  ServiceType,
  TariffSettings,
  ThemePreference,
  Transaction,
  UserMode,
  UserPrivateInfo,
  Wallet,
} from './types';
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_MERCHANTS,
  DEFAULT_TARIFFS,
  calculateDeliveryFare,
  clampStr,
  formatCurrency,
  recalculateFromCustomFare,
  toMillis,
} from './utils/tariffs';
import {
  MIN_DRIVER_AGE,
  calculateAgeFromIsoDate,
} from './utils/driverVerification';
import {
  ClaimableRewardPayload,
  computeDriverProgression,
} from './utils/driverProgression';
import { AuthScreen, OnboardingModal } from './components/AuthScreen';
import { MotoLogoEmblem, MotoUnitIdentity, UserAvatar } from './components/MotoBrandMark';
import { ProfilePhotoModal } from './components/ProfilePhotoModal';
import { RiderConsole } from './components/RiderConsole';
import {
  DriverApplicationSubmitPayload,
  DriverVerificationGate,
} from './components/DriverVerificationGate';
import { PassengerConsole } from './components/PassengerConsole';
import { ChatDrawer, ChatTarget } from './components/ChatDrawer';
import { AdminDashboard } from './components/AdminDashboard';
import { FinancePanel } from './components/FinancePanel';
import { ProfilePanel } from './components/ProfilePanel';
import { UrgentDispatchModal } from './components/UrgentDispatchModal';
import { MapsConfiguredContext } from './components/LiveFleetMap';
import {
  AddBankAccountInput,
  CreateBankTopupInput,
  WalletQrPanel,
} from './components/WalletQrPanel';
import {
  NotificationsDrawer,
  RatingModal,
} from './components/NotificationsAndRatings';
import { PWAInstallButton } from './components/PWAInstallButton';
import {
  OfflineQueueItem,
  clearUserOfflineData,
  enqueueOfflineMutation,
  isNetworkOfflineError,
  listOfflineQueue,
  loadOfflineSnapshot,
  removeOfflineQueueItem,
  saveOfflineSnapshot,
} from './utils/offlineSync';
import { PushTestOptions } from './components/PushSubscriptionStudio';
import {
  BrowserPushPermission,
  TestPushOutcome,
  ensureServiceWorkerReady,
  getBrowserPushPermission,
  requestBrowserPushPermission,
  showBrowserNotificationDetailed,
  showUrgentBrowserNotification,
  syncServerPushSubscription,
  triggerServerPushBroadcast,
  unsubscribeServerPush,
} from './utils/pushNotifications';
import {
  ThemeContext,
  applyDocumentTheme,
  getInitialTheme,
  getStoredUserTheme,
  persistLocalTheme,
} from './utils/theme';

type ActiveTab = 'rider' | 'admin' | 'wallet' | 'finance' | 'profile';

function playNotificationTone() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {
    // Ignore audio context autoplay errors
  }
}

function normalizeRider(raw: Partial<RiderProfile>): RiderProfile {
  return {
    uid: raw.uid || '',
    displayName: raw.displayName || 'Motociclista',
    photoUrl: raw.photoUrl || '',
    motoName: raw.motoName || 'Moto Mandados',
    motoModel: raw.motoModel || 'Urbana',
    motoPlate: raw.motoPlate || 'S/P',
    motoColor: raw.motoColor || '#EA580C',
    departmentId: raw.departmentId || 'dept_centro',
    departmentName: raw.departmentName || 'Departamento Centro',
    role: raw.role || 'rider',
    status: raw.status || 'available',
    verificationStatus: raw.verificationStatus || 'unsubmitted',
    completedCount: raw.completedCount ?? 0,
    onTimeRate: raw.onTimeRate ?? 98,
    totalKm: raw.totalKm ?? 0,
    rating: raw.rating ?? 4.95,
    ratingCount: raw.ratingCount ?? 0,
    lat: raw.lat ?? 19.4326,
    lng: raw.lng ?? -99.1332,
    heading: raw.heading ?? 0,
    speedKmh: raw.speedKmh ?? 0,
    locationUpdatedAt: raw.locationUpdatedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function normalizeDelivery(
  id: string,
  raw: Partial<Delivery>
): Delivery {
  return {
    id,
    createdByUid: raw.createdByUid || '',
    assignedRiderUid: raw.assignedRiderUid || '',
    assignedRiderName: raw.assignedRiderName || '',
    assignedMotoName: raw.assignedMotoName || '',
    title: raw.title || 'Servicio Moto Mandados',
    serviceCategory: raw.serviceCategory || 'delivery',
    serviceType: raw.serviceType || 'standard',
    isUrgent: Boolean(raw.isUrgent),
    departmentId: raw.departmentId || 'dept_centro',
    departmentName: raw.departmentName || 'Departamento Centro',
    merchantName: raw.merchantName || '',
    cashOnDelivery: raw.cashOnDelivery ?? 0,
    pickupAddress: raw.pickupAddress || '',
    pickupLat: raw.pickupLat ?? 19.4326,
    pickupLng: raw.pickupLng ?? -99.1332,
    dropoffAddress: raw.dropoffAddress || '',
    dropoffLat: raw.dropoffLat ?? 19.4209,
    dropoffLng: raw.dropoffLng ?? -99.1604,
    customerName: raw.customerName || 'Cliente',
    notes: raw.notes || '',
    distanceKm: raw.distanceKm ?? 1,
    estimatedMinutes: raw.estimatedMinutes ?? 15,
    stopOrder: raw.stopOrder ?? 1,
    baseFare: raw.baseFare ?? 35,
    distanceFare: raw.distanceFare ?? 11,
    urgentSurcharge: raw.urgentSurcharge ?? 0,
    suggestedFare: raw.suggestedFare ?? raw.totalFare ?? 46,
    customFareEdited: Boolean(raw.customFareEdited),
    totalFare: raw.totalFare ?? 46,
    riderEarnings: raw.riderEarnings ?? 43.7,
    platformFee: raw.platformFee ?? 2.3,
    usedFreeTrip: Boolean(raw.usedFreeTrip),
    preferredRiderUid: raw.preferredRiderUid || '',
    preferredRiderName: raw.preferredRiderName || '',
    passengerAccepted: Boolean(raw.passengerAccepted),
    declinedRiderUids: Array.isArray(raw.declinedRiderUids)
      ? raw.declinedRiderUids
      : [],
    rated: Boolean(raw.rated),
    status: raw.status || 'pending',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    deliveredAt: raw.deliveredAt,
  };
}

export default function App() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<
    string | null
  >(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);

  const [currentRider, setCurrentRider] = useState<RiderProfile | null>(null);
  const [riderLoaded, setRiderLoaded] = useState(false);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [savingOnboarding, setSavingOnboarding] = useState(false);

  const [allRiders, setAllRiders] = useState<RiderProfile[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tariffs, setTariffs] = useState<TariffSettings>(DEFAULT_TARIFFS);
  const [departments, setDepartments] = useState<Department[]>(DEFAULT_DEPARTMENTS);
  const [merchants, setMerchants] = useState<Merchant[]>(DEFAULT_MERCHANTS);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [topups, setTopups] = useState<QrTopup[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [ratings, setRatings] = useState<DeliveryRating[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [driverApplications, setDriverApplications] = useState<DriverApplication[]>([]);
  const [frequentRoutes, setFrequentRoutes] = useState<FrequentRoute[]>([]);

  const [userMode, setUserMode] = useState<UserMode>('driver');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<ActiveTab>('rider');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [urgentModalOpen, setUrgentModalOpen] = useState(false);
  const [urgentPreset, setUrgentPreset] = useState<ServiceType>('super_expres');
  const [selectedFrequentRoute, setSelectedFrequentRoute] =
    useState<FrequentRoute | null>(null);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const [ratingTarget, setRatingTarget] = useState<Delivery | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>([]);
  const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);

  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(15);
  const [sessionLocked, setSessionLocked] = useState<boolean>(false);
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState<string>('');

  const [pushPermission, setPushPermission] = useState<BrowserPushPermission>(
    () => getBrowserPushPermission()
  );
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    getInitialTheme()
  );

  const effectiveOnline = browserOnline && !simulatedOffline;

  const prevUnreadCountRef = useRef<number>(0);
  const effectiveOnlineRef = useRef<boolean>(effectiveOnline);
  const offlineQueueRef = useRef<OfflineQueueItem[]>([]);
  const syncingRef = useRef<boolean>(false);
  const hydratedFromOfflineRef = useRef<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const initialDeliveriesLoadedRef = useRef<boolean>(false);
  const notifiedUrgentIdsRef = useRef<Set<string>>(new Set());

  effectiveOnlineRef.current = effectiveOnline;
  offlineQueueRef.current = offlineQueue;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => {
      setBrowserOnline(false);
      showToast(
        'Sin conexión a Internet · Guardando ubicación GPS y entregas en IndexedDB.'
      );
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  useEffect(() => {
    if (mapsApiKey) return;
    fetch('/api/config/maps')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.apiKey) setMapsApiKey(data.apiKey);
      })
      .catch(() => {
        // Static build fallback
      });
  }, [mapsApiKey]);

  useEffect(() => {
    void ensureServiceWorkerReady();
    const syncPerm = () => setPushPermission(getBrowserPushPermission());
    syncPerm();
    window.addEventListener('focus', syncPerm);
    document.addEventListener('visibilitychange', syncPerm);

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        setActiveTab('rider');
        setNotifDrawerOpen(false);
        showToast('Mostrando alerta urgente en tu consola.');
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      window.removeEventListener('focus', syncPerm);
      document.removeEventListener('visibilitychange', syncPerm);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [showToast]);

  const hydrateVerifiedUser = useCallback(async (firebaseUser: User) => {
    setPendingVerificationEmail(null);
    setAuthError(null);
    setUser(firebaseUser);
    lastActivityRef.current = Date.now();
    setSessionLocked(false);
    setUnlockError(null);
    setUnlockPassword('');
    initialDeliveriesLoadedRef.current = false;
    notifiedUrgentIdsRef.current.clear();

    if (hydratedFromOfflineRef.current !== firebaseUser.uid) {
      hydratedFromOfflineRef.current = firebaseUser.uid;
      try {
        const savedMode = window.localStorage.getItem(
          `motomando_mode_${firebaseUser.uid}`
        );
        if (savedMode === 'passenger' || savedMode === 'driver') {
          setUserMode(savedMode);
        }
        const savedLock = window.localStorage.getItem(
          `motomandados_autolock_${firebaseUser.uid}`
        );
        if (savedLock !== null) {
          const parsed = Number(savedLock);
          if ([0, 5, 15, 30, 60].includes(parsed)) {
            setAutoLockMinutes(parsed);
          }
        }
        const savedUserTheme = getStoredUserTheme(firebaseUser.uid);
        if (savedUserTheme) {
          setThemeState(savedUserTheme);
          persistLocalTheme(savedUserTheme, firebaseUser.uid);
        }
      } catch {
        // Ignore localStorage error
      }
      try {
        const [snapshot, queued] = await Promise.all([
          loadOfflineSnapshot(firebaseUser.uid),
          listOfflineQueue(firebaseUser.uid),
        ]);
        setOfflineQueue(queued);
        if (snapshot) {
          if (snapshot.rider) {
            setCurrentRider((prev) => prev || snapshot.rider);
            setRiderLoaded(true);
          }
          if (snapshot.deliveries.length > 0) {
            setDeliveries((prev) =>
              prev.length > 0 ? prev : snapshot.deliveries
            );
          }
          if (snapshot.departments.length > 0) {
            setDepartments((prev) =>
              prev.length > 0 ? prev : snapshot.departments
            );
          }
          if (snapshot.merchants.length > 0) {
            setMerchants((prev) =>
              prev.length > 0 ? prev : snapshot.merchants
            );
          }
          if (snapshot.tariffs) {
            setTariffs((prev) => prev || snapshot.tariffs!);
          }
          if (snapshot.wallet) {
            setWallets((prev) =>
              prev.length > 0 ? prev : [snapshot.wallet!]
            );
          }
        }
      } catch {
        // Ignore IndexedDB hydration errors
      }
    }

    let adminFlag =
      firebaseUser.email === ADMIN_EMAIL && firebaseUser.emailVerified;
    if (!adminFlag && effectiveOnlineRef.current) {
      try {
        const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
        if (adminSnap.exists()) adminFlag = true;
      } catch {
        // Non-admin or offline
      }
    }
    setIsAdminUser(adminFlag);
  }, []);

  useEffect(() => {
    void testFirestoreConnection();
    const unsub = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser && !firebaseUser.emailVerified) {
        setUser(null);
        setPendingVerificationEmail(firebaseUser.email || '');
        setAuthReady(true);
        return;
      }

      if (firebaseUser) {
        await hydrateVerifiedUser(firebaseUser);
      } else {
        setUser(null);
        setPendingVerificationEmail(null);
        hydratedFromOfflineRef.current = null;
        initialDeliveriesLoadedRef.current = false;
        notifiedUrgentIdsRef.current.clear();
        setPushSubscribed(false);
        setSessionLocked(false);
        setUnlockError(null);
        setUnlockPassword('');
        setOfflineQueue([]);
        setSimulatedOffline(false);
        setIsAdminUser(false);
        setCurrentRider(null);
        setPrivateInfo(null);
        setRiderLoaded(false);
        setAllRiders([]);
        setDeliveries([]);
        setTransactions([]);
        setWallets([]);
        setTopups([]);
        setBankAccounts([]);
        setRatings([]);
        setNotifications([]);
        setMessages([]);
        setDriverApplications([]);
        setFrequentRoutes([]);
        setSelectedFrequentRoute(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [hydrateVerifiedUser]);

  // Real-time Firestore subscriptions
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubMyRider = onSnapshot(
      doc(db, 'riders', user.uid),
      (snap) => {
        if (snap.exists()) {
          let nextRider = normalizeRider(snap.data() as Partial<RiderProfile>);
          const pendingLoc = offlineQueueRef.current.find(
            (q) => q.kind === 'location'
          );
          if (pendingLoc && pendingLoc.kind === 'location') {
            nextRider = {
              ...nextRider,
              lat: pendingLoc.payload.lat,
              lng: pendingLoc.payload.lng,
              speedKmh: pendingLoc.payload.speedKmh,
              heading: pendingLoc.payload.heading,
            };
          }
          const pendingStatus = offlineQueueRef.current.find(
            (q) => q.kind === 'rider_status'
          );
          if (pendingStatus && pendingStatus.kind === 'rider_status') {
            nextRider = {
              ...nextRider,
              status: pendingStatus.payload.status,
            };
          }
          setCurrentRider(nextRider);
        } else if (effectiveOnlineRef.current) {
          setCurrentRider(null);
        }
        setRiderLoaded(true);
      },
      (err) => {
        if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
        handleFirestoreError(err, OperationType.GET, `riders/${user.uid}`);
      }
    );

    const unsubPrivate = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserPrivateInfo;
          setPrivateInfo(data);
          if (
            data.themePreference === 'light' ||
            data.themePreference === 'dark'
          ) {
            setThemeState(data.themePreference);
            persistLocalTheme(data.themePreference, user.uid);
          }
        }
      },
      (err) => {
        if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }
    );

    const riderUnsubs: Array<() => void> = [];
    if (isAdminUser) {
      const unsubAllRiders = onSnapshot(
        collection(db, 'riders'),
        (snap) => {
          setAllRiders(
            snap.docs.map((d) =>
              normalizeRider(d.data() as Partial<RiderProfile>)
            )
          );
        },
        (err) => {
          if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
          handleFirestoreError(err, OperationType.LIST, 'riders');
        }
      );
      riderUnsubs.push(unsubAllRiders);
    } else {
      const availableRidersMap: Record<string, RiderProfile> = {};
      const onRouteRidersMap: Record<string, RiderProfile> = {};
      const syncFleetRiders = () => {
        const merged: Record<string, RiderProfile> = {
          ...availableRidersMap,
          ...onRouteRidersMap,
        };
        setAllRiders(Object.values(merged));
      };

      const qAvailable = query(
        collection(db, 'riders'),
        where('status', '==', 'available')
      );
      const qOnRoute = query(
        collection(db, 'riders'),
        where('status', '==', 'on_route')
      );

      riderUnsubs.push(
        onSnapshot(
          qAvailable,
          (snap) => {
            Object.keys(availableRidersMap).forEach(
              (k) => delete availableRidersMap[k]
            );
            snap.docs.forEach((d) => {
              availableRidersMap[d.id] = normalizeRider(
                d.data() as Partial<RiderProfile>
              );
            });
            syncFleetRiders();
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'riders');
          }
        ),
        onSnapshot(
          qOnRoute,
          (snap) => {
            Object.keys(onRouteRidersMap).forEach(
              (k) => delete onRouteRidersMap[k]
            );
            snap.docs.forEach((d) => {
              onRouteRidersMap[d.id] = normalizeRider(
                d.data() as Partial<RiderProfile>
              );
            });
            syncFleetRiders();
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'riders');
          }
        )
      );
    }

    const unsubTariffs = onSnapshot(
      doc(db, 'settings', 'tariffs'),
      (snap) => {
        if (snap.exists()) {
          setTariffs(snap.data() as TariffSettings);
        } else if (effectiveOnlineRef.current) {
          setTariffs(DEFAULT_TARIFFS);
        }
      },
      (err) => {
        if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
        handleFirestoreError(err, OperationType.GET, 'settings/tariffs');
      }
    );

    const deptsQuery = isAdminUser
      ? collection(db, 'departments')
      : query(collection(db, 'departments'), where('active', '==', true));
    const unsubDepts = onSnapshot(
      deptsQuery,
      (snap) => {
        if (!snap.empty) {
          setDepartments(
            snap.docs.map((d) => ({
              ...(d.data() as Omit<Department, 'id'>),
              id: d.id,
            }))
          );
        } else if (effectiveOnlineRef.current) {
          setDepartments(DEFAULT_DEPARTMENTS);
        }
      },
      (err) => {
        if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
        handleFirestoreError(err, OperationType.LIST, 'departments');
      }
    );

    const merchantsQuery = isAdminUser
      ? collection(db, 'merchants')
      : query(collection(db, 'merchants'), where('active', '==', true));
    const unsubMerchants = onSnapshot(
      merchantsQuery,
      (snap) => {
        if (!snap.empty) {
          setMerchants(
            snap.docs.map((d) => ({
              ...(d.data() as Omit<Merchant, 'id'>),
              id: d.id,
            }))
          );
        } else if (effectiveOnlineRef.current) {
          setMerchants(DEFAULT_MERCHANTS);
        }
      },
      (err) => {
        if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
        handleFirestoreError(err, OperationType.LIST, 'merchants');
      }
    );

    const deliveryUnsubs: Array<() => void> = [];
    const deliveryMap: Record<string, Delivery> = {};
    const syncDeliveryState = () => {
      const merged: Record<string, Delivery> = { ...deliveryMap };
      for (const item of offlineQueueRef.current) {
        if (item.kind === 'dispatch_delivery' && !merged[item.payload.deliveryId]) {
          merged[item.payload.deliveryId] = normalizeDelivery(
            item.payload.deliveryId,
            {
              ...item.payload,
              createdByUid: item.uid,
              assignedRiderUid: '',
              assignedRiderName: '',
              assignedMotoName: '',
              stopOrder: 1,
              rated: false,
              status: 'pending',
            }
          );
        } else if (
          item.kind === 'claim_delivery' &&
          merged[item.payload.deliveryId]
        ) {
          merged[item.payload.deliveryId] = {
            ...merged[item.payload.deliveryId],
            assignedRiderUid: item.uid,
            assignedRiderName: item.payload.riderName,
            assignedMotoName: item.payload.motoName,
            status: 'assigned',
            stopOrder: item.payload.stopOrder,
          };
        } else if (item.kind === 'advance_delivery') {
          const targetId = item.payload.delivery.id;
          const base = merged[targetId] || item.payload.delivery;
          merged[targetId] = {
            ...base,
            status: item.payload.nextStatus,
          };
        }
      }
      setDeliveries(Object.values(merged));
    };

    if (isAdminUser) {
      const unsubAllDel = onSnapshot(
        collection(db, 'deliveries'),
        (snap) => {
          Object.keys(deliveryMap).forEach((k) => delete deliveryMap[k]);
          snap.docs.forEach((d) => {
            deliveryMap[d.id] = normalizeDelivery(
              d.id,
              d.data() as Partial<Delivery>
            );
          });
          syncDeliveryState();
        },
        (err) => {
          if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
          handleFirestoreError(err, OperationType.LIST, 'deliveries');
        }
      );
      deliveryUnsubs.push(unsubAllDel);
    } else {
      const qAssigned = query(
        collection(db, 'deliveries'),
        where('assignedRiderUid', '==', user.uid)
      );
      const qPending = query(
        collection(db, 'deliveries'),
        where('status', '==', 'pending')
      );
      const qCreated = query(
        collection(db, 'deliveries'),
        where('createdByUid', '==', user.uid)
      );

      [qAssigned, qPending, qCreated].forEach((q) => {
        const u = onSnapshot(
          q,
          (snap) => {
            snap.docs.forEach((d) => {
              deliveryMap[d.id] = normalizeDelivery(
                d.id,
                d.data() as Partial<Delivery>
              );
            });
            syncDeliveryState();
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'deliveries');
          }
        );
        deliveryUnsubs.push(u);
      });
    }

    const txQuery = isAdminUser
      ? collection(db, 'transactions')
      : query(
          collection(db, 'transactions'),
          where('riderUid', '==', user.uid)
        );
    const unsubTx = onSnapshot(
      txQuery,
      (snap) => {
        setTransactions(
          snap.docs.map((d) => {
            const raw = d.data() as Partial<Transaction>;
            return {
              ...(raw as Omit<Transaction, 'id'>),
              id: d.id,
              departmentId: raw.departmentId || 'dept_centro',
              serviceCategory: raw.serviceCategory || 'delivery',
            };
          })
        );
      },
      (err) => {
        if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
        handleFirestoreError(err, OperationType.LIST, 'transactions');
      }
    );

    const unsubWallets = isAdminUser
      ? onSnapshot(
          collection(db, 'wallets'),
          (snap) => {
            setWallets(snap.docs.map((d) => d.data() as Wallet));
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'wallets');
          }
        )
      : onSnapshot(
          doc(db, 'wallets', user.uid),
          (snap) => {
            if (snap.exists()) {
              setWallets([snap.data() as Wallet]);
            } else if (effectiveOnlineRef.current) {
              setWallets([]);
            }
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.GET, `wallets/${user.uid}`);
          }
        );

    const topupQuery = isAdminUser
      ? collection(db, 'topups')
      : query(collection(db, 'topups'), where('uid', '==', user.uid));
    const unsubTopups = onSnapshot(
      topupQuery,
      (snap) => {
        setTopups(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<QrTopup, 'id'>),
            id: d.id,
          }))
        );
      },
      (err) => {
        if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
        handleFirestoreError(err, OperationType.LIST, 'topups');
      }
    );

    const bankAccQuery = query(
      collection(db, 'bankAccounts'),
      where('uid', '==', user.uid)
    );
    const unsubBankAccounts = onSnapshot(
      bankAccQuery,
      (snap) => {
        setBankAccounts(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<BankAccount, 'id'>),
            id: d.id,
          }))
        );
      },
      (err) => {
        if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
        handleFirestoreError(err, OperationType.LIST, 'bankAccounts');
      }
    );

    const ratingUnsubs: Array<() => void> = [];
    if (isAdminUser) {
      ratingUnsubs.push(
        onSnapshot(
          collection(db, 'ratings'),
          (snap) => {
            setRatings(
              snap.docs.map((d) => ({
                ...(d.data() as Omit<DeliveryRating, 'id'>),
                id: d.id,
              }))
            );
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'ratings');
          }
        )
      );
    } else {
      const riderRatingsMap: Record<string, DeliveryRating> = {};
      const authorRatingsMap: Record<string, DeliveryRating> = {};
      const syncRatings = () => {
        setRatings(
          Object.values({
            ...riderRatingsMap,
            ...authorRatingsMap,
          })
        );
      };

      ratingUnsubs.push(
        onSnapshot(
          query(collection(db, 'ratings'), where('riderUid', '==', user.uid)),
          (snap) => {
            Object.keys(riderRatingsMap).forEach(
              (k) => delete riderRatingsMap[k]
            );
            snap.docs.forEach((d) => {
              riderRatingsMap[d.id] = {
                ...(d.data() as Omit<DeliveryRating, 'id'>),
                id: d.id,
              };
            });
            syncRatings();
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'ratings');
          }
        ),
        onSnapshot(
          query(collection(db, 'ratings'), where('authorUid', '==', user.uid)),
          (snap) => {
            Object.keys(authorRatingsMap).forEach(
              (k) => delete authorRatingsMap[k]
            );
            snap.docs.forEach((d) => {
              authorRatingsMap[d.id] = {
                ...(d.data() as Omit<DeliveryRating, 'id'>),
                id: d.id,
              };
            });
            syncRatings();
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'ratings');
          }
        )
      );
    }

    const unsubNotifs = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('recipientUid', '==', user.uid)
      ),
      (snap) => {
        setNotifications(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<AppNotification, 'id'>),
            id: d.id,
          }))
        );
      },
      (err) => {
        if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
        handleFirestoreError(err, OperationType.LIST, 'notifications');
      }
    );

    const msgUnsubs: Array<() => void> = [];
    if (isAdminUser) {
      msgUnsubs.push(
        onSnapshot(
          collection(db, 'messages'),
          (snap) => {
            setMessages(
              snap.docs.map((d) => ({
                ...(d.data() as Omit<ChatMessage, 'id'>),
                id: d.id,
              }))
            );
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'messages');
          }
        )
      );
    } else {
      const sentMap: Record<string, ChatMessage> = {};
      const recvMap: Record<string, ChatMessage> = {};
      const ownerMap: Record<string, ChatMessage> = {};
      const syncMessages = () => {
        setMessages(
          Object.values({
            ...sentMap,
            ...recvMap,
            ...ownerMap,
          })
        );
      };

      msgUnsubs.push(
        onSnapshot(
          query(collection(db, 'messages'), where('senderUid', '==', user.uid)),
          (snap) => {
            Object.keys(sentMap).forEach((k) => delete sentMap[k]);
            snap.docs.forEach((d) => {
              sentMap[d.id] = {
                ...(d.data() as Omit<ChatMessage, 'id'>),
                id: d.id,
              };
            });
            syncMessages();
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'messages');
          }
        ),
        onSnapshot(
          query(collection(db, 'messages'), where('recipientUid', '==', user.uid)),
          (snap) => {
            Object.keys(recvMap).forEach((k) => delete recvMap[k]);
            snap.docs.forEach((d) => {
              recvMap[d.id] = {
                ...(d.data() as Omit<ChatMessage, 'id'>),
                id: d.id,
              };
            });
            syncMessages();
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'messages');
          }
        ),
        onSnapshot(
          query(
            collection(db, 'messages'),
            where('deliveryOwnerUid', '==', user.uid)
          ),
          (snap) => {
            Object.keys(ownerMap).forEach((k) => delete ownerMap[k]);
            snap.docs.forEach((d) => {
              ownerMap[d.id] = {
                ...(d.data() as Omit<ChatMessage, 'id'>),
                id: d.id,
              };
            });
            syncMessages();
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'messages');
          }
        )
      );
    }

    const unsubDriverApps = isAdminUser
      ? onSnapshot(
          collection(db, 'driverApplications'),
          (snap) => {
            setDriverApplications(
              snap.docs.map((d) => ({
                ...(d.data() as DriverApplication),
                uid: d.id,
              }))
            );
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(err, OperationType.LIST, 'driverApplications');
          }
        )
      : onSnapshot(
          doc(db, 'driverApplications', user.uid),
          (snap) => {
            if (snap.exists()) {
              setDriverApplications([
                {
                  ...(snap.data() as DriverApplication),
                  uid: snap.id,
                },
              ]);
            } else if (effectiveOnlineRef.current) {
              setDriverApplications([]);
            }
          },
          (err) => {
            if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
            handleFirestoreError(
              err,
              OperationType.GET,
              `driverApplications/${user.uid}`
            );
          }
        );

    const freqRoutesQuery = isAdminUser
      ? collection(db, 'frequentRoutes')
      : query(
          collection(db, 'frequentRoutes'),
          where('riderUid', '==', user.uid)
        );
    const unsubFrequentRoutes = onSnapshot(
      freqRoutesQuery,
      (snap) => {
        setFrequentRoutes(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<FrequentRoute, 'id'>),
            id: d.id,
          }))
        );
      },
      (err) => {
        if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) return;
        handleFirestoreError(err, OperationType.LIST, 'frequentRoutes');
      }
    );

    return () => {
      unsubMyRider();
      unsubPrivate();
      riderUnsubs.forEach((u) => u());
      unsubTariffs();
      unsubDepts();
      unsubMerchants();
      deliveryUnsubs.forEach((u) => u());
      unsubTx();
      unsubWallets();
      unsubTopups();
      unsubBankAccounts();
      ratingUnsubs.forEach((u) => u());
      unsubNotifs();
      msgUnsubs.forEach((u) => u());
      unsubDriverApps();
      unsubFrequentRoutes();
    };
  }, [authReady, user, isAdminUser]);

  // Sound notification cue when new unread notification arrives
  const unreadNotifsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  useEffect(() => {
    if (
      unreadNotifsCount > prevUnreadCountRef.current &&
      privateInfo?.notifSound
    ) {
      playNotificationTone();
    }
    prevUnreadCountRef.current = unreadNotifsCount;
  }, [unreadNotifsCount, privateInfo?.notifSound]);

  // Ensure wallet exists lazily for Turn-1 users
  useEffect(() => {
    if (!authReady || !user || !currentRider) return;
    getDoc(doc(db, 'wallets', user.uid))
      .then((snap) => {
        if (!snap.exists()) {
          return setDoc(doc(db, 'wallets', user.uid), {
            uid: user.uid,
            balance: 0,
            totalTopups: 0,
            totalEarned: 0,
            totalFeesDeducted: 0,
            freeTripsBalance: 0,
            freeTripsEarned: 0,
            freeTripsUsed: 0,
            xpPoints: 0,
            currentRank: 'bronce',
            claimedRewardIds: [],
            currency: tariffs.currency || 'MXN',
            updatedAt: serverTimestamp(),
          });
        }
      })
      .catch(() => {
        // Ignore
      });
  }, [authReady, user, currentRider, tariffs.currency]);

  // Seed default tariffs, departments & merchants when admin connects
  useEffect(() => {
    if (!authReady || !user || !isAdminUser) return;

    getDoc(doc(db, 'settings', 'tariffs'))
      .then((snap) => {
        if (!snap.exists()) {
          return setDoc(doc(db, 'settings', 'tariffs'), {
            ...DEFAULT_TARIFFS,
            updatedBy: user.uid,
            updatedAt: serverTimestamp(),
          });
        }
        if (
          snap.data().platformFeePct === 15 &&
          !localStorage.getItem('mm_migrated_fee_5pct_v1')
        ) {
          localStorage.setItem('mm_migrated_fee_5pct_v1', '1');
          return updateDoc(doc(db, 'settings', 'tariffs'), {
            platformFeePct: 5,
            updatedBy: user.uid,
            updatedAt: serverTimestamp(),
          });
        }
      })
      .catch(() => {});

    getDoc(doc(db, 'departments', DEFAULT_DEPARTMENTS[0].id))
      .then((snap) => {
        if (!snap.exists()) {
          const batch = writeBatch(db);
          DEFAULT_DEPARTMENTS.forEach((dept) => {
            batch.set(doc(db, 'departments', dept.id), {
              name: dept.name,
              code: dept.code,
              centerLat: dept.centerLat,
              centerLng: dept.centerLng,
              zoom: dept.zoom,
              baseFareMultiplier: dept.baseFareMultiplier,
              active: dept.active,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });
          DEFAULT_MERCHANTS.forEach((m) => {
            batch.set(doc(db, 'merchants', m.id), {
              name: m.name,
              category: m.category,
              departmentId: m.departmentId,
              departmentName: m.departmentName,
              address: m.address,
              lat: m.lat,
              lng: m.lng,
              active: m.active,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });
          return batch.commit();
        }
      })
      .catch(() => {});
  }, [authReady, user, isAdminUser]);

  const myWallet: Wallet = useMemo(() => {
    const found = wallets.find((w) => w.uid === user?.uid);
    return (
      found || {
        uid: user?.uid || '',
        balance: 0,
        totalTopups: 0,
        totalEarned: 0,
        totalFeesDeducted: 0,
        freeTripsBalance: 0,
        freeTripsEarned: 0,
        freeTripsUsed: 0,
        xpPoints: 0,
        currentRank: 'bronce',
        claimedRewardIds: [],
        currency: tariffs.currency || 'MXN',
      }
    );
  }, [wallets, user?.uid, tariffs.currency]);

  const myDriverApplication: DriverApplication | null = useMemo(
    () => driverApplications.find((a) => a.uid === user?.uid) || null,
    [driverApplications, user?.uid]
  );

  const isDriverApproved = useMemo(
    () =>
      isAdminUser ||
      currentRider?.role === 'admin' ||
      currentRider?.verificationStatus === 'approved',
    [isAdminUser, currentRider?.role, currentRider?.verificationStatus]
  );

  // Persist critical local snapshot (rider GPS, pending deliveries, tariffs, wallet) in IndexedDB
  useEffect(() => {
    if (!authReady || !user || !riderLoaded) return;
    const timer = window.setTimeout(() => {
      void saveOfflineSnapshot({
        uid: user.uid,
        rider: currentRider,
        deliveries,
        departments,
        merchants,
        tariffs,
        wallet: myWallet,
        savedAt: Date.now(),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    authReady,
    user,
    riderLoaded,
    currentRider,
    deliveries,
    departments,
    merchants,
    tariffs,
    myWallet,
  ]);

  // Flush queued offline mutations automatically when connectivity returns
  const flushOfflineQueue = useCallback(async () => {
    if (!user || !effectiveOnlineRef.current || syncingRef.current) return;
    const pending = await listOfflineQueue(user.uid);
    if (pending.length === 0) {
      setOfflineQueue([]);
      return;
    }

    syncingRef.current = true;
    setIsSyncingOffline(true);
    let syncedCount = 0;

    try {
      for (const item of pending) {
        if (!effectiveOnlineRef.current) break;

        try {
          if (item.kind === 'location') {
            await updateDoc(doc(db, 'riders', user.uid), {
              lat: item.payload.lat,
              lng: item.payload.lng,
              speedKmh: item.payload.speedKmh,
              heading: item.payload.heading,
              departmentId: item.payload.departmentId,
              departmentName: item.payload.departmentName,
              locationUpdatedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (item.kind === 'rider_status') {
            await updateDoc(doc(db, 'riders', user.uid), {
              status: item.payload.status,
              departmentId: item.payload.departmentId,
              departmentName: item.payload.departmentName,
              updatedAt: serverTimestamp(),
            });
          } else if (item.kind === 'dispatch_delivery') {
            const delRef = doc(db, 'deliveries', item.payload.deliveryId);
            const existingSnap = await getDoc(delRef);
            if (!existingSnap.exists()) {
              const batch = writeBatch(db);
              batch.set(delRef, {
                createdByUid: user.uid,
                assignedRiderUid: '',
                assignedRiderName: '',
                assignedMotoName: '',
                title: clampStr(item.payload.title, 120),
                serviceCategory: item.payload.serviceCategory,
                serviceType: item.payload.serviceType,
                isUrgent: item.payload.isUrgent,
                departmentId: item.payload.departmentId,
                departmentName: item.payload.departmentName,
                merchantName: clampStr(item.payload.merchantName, 100),
                cashOnDelivery: Math.max(0, item.payload.cashOnDelivery),
                pickupAddress: clampStr(item.payload.pickupAddress, 240),
                pickupLat: item.payload.pickupLat,
                pickupLng: item.payload.pickupLng,
                dropoffAddress: clampStr(item.payload.dropoffAddress, 240),
                dropoffLat: item.payload.dropoffLat,
                dropoffLng: item.payload.dropoffLng,
                customerName: clampStr(item.payload.customerName, 80),
                notes: clampStr(item.payload.notes, 300),
                distanceKm: item.payload.distanceKm,
                estimatedMinutes: item.payload.estimatedMinutes,
                stopOrder: 1,
                baseFare: item.payload.baseFare,
                distanceFare: item.payload.distanceFare,
                urgentSurcharge: item.payload.urgentSurcharge,
                suggestedFare: item.payload.suggestedFare ?? item.payload.totalFare,
                customFareEdited: Boolean(item.payload.customFareEdited),
                totalFare: item.payload.totalFare,
                riderEarnings: item.payload.riderEarnings,
                platformFee: item.payload.platformFee,
                preferredRiderUid: clampStr(item.payload.preferredRiderUid || '', 128),
                preferredRiderName: clampStr(item.payload.preferredRiderName || '', 80),
                passengerAccepted: Boolean(item.payload.preferredRiderUid),
                declinedRiderUids: [],
                rated: false,
                status: 'pending',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              batch.set(
                doc(db, 'notifications', `notif_sync_${Date.now()}`),
                {
                  recipientUid: user.uid,
                  title: 'Solicitud Sincronizada',
                  body: `"${clampStr(item.payload.title, 50)}" en ${item.payload.departmentName}.`,
                  category: item.payload.isUrgent ? 'urgent' : 'route',
                  read: false,
                  createdAt: serverTimestamp(),
                }
              );
              await batch.commit();
            }
          } else if (item.kind === 'claim_delivery') {
            const delRef = doc(db, 'deliveries', item.payload.deliveryId);
            const delSnap = await getDoc(delRef);
            if (delSnap.exists() && delSnap.data().status === 'pending') {
              const batch = writeBatch(db);
              batch.update(delRef, {
                assignedRiderUid: user.uid,
                assignedRiderName: item.payload.riderName,
                assignedMotoName: item.payload.motoName,
                status: 'assigned',
                stopOrder: item.payload.stopOrder,
                updatedAt: serverTimestamp(),
              });
              batch.update(doc(db, 'riders', user.uid), {
                status: 'on_route',
                updatedAt: serverTimestamp(),
              });
              batch.set(
                doc(db, 'notifications', `notif_claimsync_${Date.now()}`),
                {
                  recipientUid: user.uid,
                  title: `Parada sincronizada (${item.payload.motoName})`,
                  body: `Recoge en ${item.payload.pickupAddress.slice(0, 80)}.`,
                  category: 'route',
                  read: false,
                  createdAt: serverTimestamp(),
                }
              );
              await batch.commit();
            } else {
              showToast(
                `La parada "${item.payload.deliveryTitle}" ya no estaba disponible al sincronizar.`
              );
            }
          } else if (item.kind === 'advance_delivery') {
            const del = item.payload.delivery;
            const delRef = doc(db, 'deliveries', del.id);
            const delSnap = await getDoc(delRef);
            if (
              delSnap.exists() &&
              delSnap.data().status !== 'delivered' &&
              delSnap.data().status !== 'cancelled'
            ) {
              if (item.payload.nextStatus === 'delivered') {
                const batch = writeBatch(db);
                const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const walletRef = doc(db, 'wallets', user.uid);
                const walletSnap = await getDoc(walletRef);
                const freshW = walletSnap.exists()
                  ? (walletSnap.data() as Wallet)
                  : null;
                const useFreeTrip = (freshW?.freeTripsBalance ?? 0) > 0;
                const feeRatePct = useFreeTrip ? 0 : tariffs.platformFeePct;
                const actualFee = useFreeTrip
                  ? 0
                  : Number(((del.totalFare * feeRatePct) / 100).toFixed(2));
                const actualRiderNet = Number(
                  (del.totalFare - actualFee).toFixed(2)
                );

                batch.update(delRef, {
                  status: 'delivered',
                  usedFreeTrip: useFreeTrip,
                  platformFee: actualFee,
                  riderEarnings: actualRiderNet,
                  deliveredAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                batch.set(doc(db, 'transactions', txId), {
                  deliveryId: del.id,
                  riderUid: user.uid,
                  riderName: currentRider?.displayName || del.assignedRiderName || 'Motociclista',
                  motoName: currentRider?.motoName || del.assignedMotoName || 'Moto Mandados',
                  departmentId: del.departmentId || currentRider?.departmentId || 'dept_centro',
                  serviceCategory: del.serviceCategory || 'delivery',
                  serviceType: del.serviceType,
                  isUrgent: del.isUrgent,
                  distanceKm: del.distanceKm,
                  baseFare: del.baseFare,
                  distanceFare: del.distanceFare,
                  urgentSurcharge: del.urgentSurcharge,
                  grossAmount: del.totalFare,
                  platformFee: actualFee,
                  riderNetAmount: actualRiderNet,
                  usedFreeTrip: useFreeTrip,
                  feeRatePct,
                  status: 'completed',
                  createdAt: serverTimestamp(),
                });
                batch.update(doc(db, 'riders', user.uid), {
                  completedCount: increment(1),
                  totalKm: increment(del.distanceKm),
                  updatedAt: serverTimestamp(),
                });
                if (walletSnap.exists() && freshW) {
                  const nextXp = Math.max(0, Math.round(freshW.xpPoints ?? 0)) + 60;
                  const nextRank = currentRider
                    ? computeDriverProgression({
                        rider: {
                          ...currentRider,
                          completedCount: (currentRider.completedCount || 0) + 1,
                          totalKm: (currentRider.totalKm || 0) + del.distanceKm,
                        },
                        wallet: { ...freshW, xpPoints: nextXp },
                        application: myDriverApplication,
                      }).currentStage.id
                    : freshW.currentRank || 'bronce';

                  if (useFreeTrip) {
                    batch.update(walletRef, {
                      freeTripsBalance: Math.max(
                        0,
                        Math.round(freshW.freeTripsBalance ?? 0) - 1
                      ),
                      freeTripsUsed:
                        Math.max(0, Math.round(freshW.freeTripsUsed ?? 0)) + 1,
                      totalEarned: increment(actualRiderNet),
                      xpPoints: nextXp,
                      currentRank: nextRank,
                      updatedAt: serverTimestamp(),
                    });
                  } else {
                    const nextBalance = Number(
                      Math.max(0, (freshW.balance ?? 0) - actualFee).toFixed(2)
                    );
                    batch.update(walletRef, {
                      balance: nextBalance,
                      totalFeesDeducted: increment(actualFee),
                      totalEarned: increment(actualRiderNet),
                      xpPoints: nextXp,
                      currentRank: nextRank,
                      updatedAt: serverTimestamp(),
                    });
                  }
                }
                batch.set(
                  doc(db, 'notifications', `notif_donesync_${Date.now()}`),
                  {
                    recipientUid: user.uid,
                    title: useFreeTrip
                      ? `Entrega Sincronizada · Viaje Gratis (${formatCurrency(actualRiderNet, tariffs.currency)})`
                      : `Entrega Sincronizada · Com. ${feeRatePct}% (-${formatCurrency(actualFee, tariffs.currency)})`,
                    body: `"${del.title}" sincronizada tras recuperar conexión.`,
                    category: 'wallet',
                    read: false,
                    createdAt: serverTimestamp(),
                  }
                );
                await batch.commit();
              } else {
                await updateDoc(delRef, {
                  status: item.payload.nextStatus,
                  updatedAt: serverTimestamp(),
                });
              }
            }
          }

          const remaining = await removeOfflineQueueItem(user.uid, item.id);
          setOfflineQueue(remaining);
          syncedCount += 1;
        } catch (err) {
          if (isNetworkOfflineError(err) || !effectiveOnlineRef.current) {
            break;
          }
          // Discard unrecoverable stale item so queue does not block future syncs
          const remaining = await removeOfflineQueueItem(user.uid, item.id);
          setOfflineQueue(remaining);
        }
      }
    } finally {
      syncingRef.current = false;
      setIsSyncingOffline(false);
      if (syncedCount > 0) {
        showToast(
          `Conexión recuperada: ${syncedCount} ${
            syncedCount === 1 ? 'operación sincronizada' : 'operaciones sincronizadas'
          } con Firestore.`
        );
      }
    }
  }, [user, currentRider, myDriverApplication, tariffs.currency, tariffs.platformFeePct, showToast]);

  useEffect(() => {
    if (authReady && user && effectiveOnline && offlineQueue.length > 0) {
      void flushOfflineQueue();
    }
  }, [authReady, user, effectiveOnline, offlineQueue.length, flushOfflineQueue]);

  const todayEarningsStats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    ).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
    const todayTx = transactions.filter((tx) => {
      if (tx.riderUid !== user?.uid) return false;
      const ms = toMillis(tx.createdAt);
      return ms >= startOfToday && ms < endOfToday;
    });
    const netTotal = todayTx.reduce((acc, tx) => acc + (tx.riderNetAmount || 0), 0);
    const grossTotal = todayTx.reduce((acc, tx) => acc + (tx.grossAmount || 0), 0);
    const count = todayTx.length;
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;
    const summaryText = `Hoy: ${count} ${
      count === 1 ? 'entrega' : 'entregas'
    } · Ganancia neta: ${formatCurrency(
      netTotal,
      tariffs.currency
    )} · Saldo: ${formatCurrency(myWallet.balance, tariffs.currency)}.`;
    return { count, netTotal, grossTotal, dateKey, summaryText };
  }, [transactions, user?.uid, tariffs.currency, myWallet.balance]);

  // Sync server Web Push subscription when browser permission is granted
  useEffect(() => {
    if (!authReady || !user || pushPermission !== 'granted') {
      setPushSubscribed(false);
      return;
    }
    let cancelled = false;
    void syncServerPushSubscription({
      uid: user.uid,
      departmentId: currentRider?.departmentId || 'all',
      userMode,
      urgentEnabled: privateInfo?.notifUrgent !== false,
      dailyEarningsEnabled: privateInfo?.notifDailyEarnings !== false,
      dailyEarningsTime: privateInfo?.dailyEarningsTime || '20:00',
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      dailySummaryText: todayEarningsStats.summaryText,
    }).then((res) => {
      if (!cancelled) {
        setPushSubscribed(res.subscribed);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    user,
    pushPermission,
    currentRider?.departmentId,
    userMode,
    privateInfo?.notifUrgent,
    privateInfo?.notifDailyEarnings,
    privateInfo?.dailyEarningsTime,
    todayEarningsStats.summaryText,
  ]);

  // Background & inactive-tab browser push watcher for newly arrived urgent pending deliveries
  useEffect(() => {
    if (!authReady || !user || !riderLoaded) return;

    if (!initialDeliveriesLoadedRef.current) {
      deliveries.forEach((d) => notifiedUrgentIdsRef.current.add(d.id));
      const timer = window.setTimeout(() => {
        initialDeliveriesLoadedRef.current = true;
      }, 1500);
      return () => window.clearTimeout(timer);
    }

    const canReceiveUrgentAlerts =
      (isAdminUser ||
        currentRider?.role === 'admin' ||
        currentRider?.verificationStatus === 'approved') &&
      privateInfo?.notifUrgent !== false;

    const newUrgentDeliveries = deliveries.filter((d) => {
      if (notifiedUrgentIdsRef.current.has(d.id)) return false;
      notifiedUrgentIdsRef.current.add(d.id);
      const isUrgentJob =
        d.status === 'pending' &&
        (d.isUrgent || d.serviceCategory === 'super_expres');
      if (!isUrgentJob) return false;
      const fromAnotherOrHidden =
        d.createdByUid !== user.uid || document.visibilityState === 'hidden';
      return fromAnotherOrHidden;
    });

    if (canReceiveUrgentAlerts && newUrgentDeliveries.length > 0) {
      newUrgentDeliveries.forEach((del) => {
        if (privateInfo?.notifSound !== false) {
          playNotificationTone();
        }
        if (pushPermission === 'granted') {
          void showUrgentBrowserNotification({
            deliveryId: del.id,
            title: `⚡ Nuevo Súper Exprés · ${formatCurrency(
              del.riderEarnings,
              tariffs.currency
            )}`,
            body: `${del.title} · Recoger en ${del.pickupAddress} (${del.departmentName})`,
            isUrgent: true,
            tag: `urgent-${del.id}`,
          });
        }
      });
    }
  }, [
    authReady,
    user,
    riderLoaded,
    deliveries,
    isAdminUser,
    currentRider?.role,
    currentRider?.verificationStatus,
    privateInfo?.notifUrgent,
    privateInfo?.notifSound,
    pushPermission,
    tariffs.currency,
  ]);

  // Inactivity auto-lock tracker
  useEffect(() => {
    if (!authReady || !user || sessionLocked || autoLockMinutes <= 0) return;

    const touch = () => {
      lastActivityRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    events.forEach((ev) => window.addEventListener(ev, touch, { passive: true }));

    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= autoLockMinutes * 60 * 1000) {
        setSessionLocked(true);
      }
    }, 15000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, touch));
      window.clearInterval(interval);
    };
  }, [authReady, user, sessionLocked, autoLockMinutes]);

  const handleLoginGoogle = async (
    persistenceMode: SessionPersistenceMode = 'local'
  ) => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle(persistenceMode);
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLoginEmail = async (
    email: string,
    password: string,
    persistenceMode: SessionPersistenceMode = 'local'
  ) => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const cred = await signInWithEmailPassword(email, password, persistenceMode);
      if (!cred.user.emailVerified) {
        setPendingVerificationEmail(cred.user.email || email);
      }
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegisterEmail = async (
    fullName: string,
    email: string,
    password: string,
    persistenceMode: SessionPersistenceMode = 'local'
  ) => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const cred = await registerWithEmailPassword(
        fullName,
        email,
        password,
        persistenceMode
      );
      setPendingVerificationEmail(cred.user.email || email);
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      await sendPasswordReset(email);
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleResendVerification = async () => {
    setAuthError(null);
    try {
      await resendVerificationEmail();
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleCheckVerification = async () => {
    setAuthError(null);
    try {
      const verified = await checkEmailVerificationStatus();
      if (verified && auth.currentUser) {
        await hydrateVerifiedUser(auth.currentUser);
      } else {
        setAuthError(
          'Tu correo aún aparece pendiente. Abre el enlace de confirmación que enviamos a tu bandeja de entrada o spam e intenta de nuevo.'
        );
      }
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleCancelVerification = async () => {
    setPendingVerificationEmail(null);
    setAuthError(null);
    await signOutUser();
  };

  const handleSecureSignOut = useCallback(async () => {
    const uid = user?.uid;
    await unsubscribeServerPush(uid);
    if (uid) {
      try {
        window.localStorage.removeItem(`motomando_mode_${uid}`);
        window.localStorage.removeItem(`motomandados_autolock_${uid}`);
      } catch {
        // Ignore storage errors
      }
      await clearUserOfflineData(uid);
    }
    setSessionLocked(false);
    setUnlockError(null);
    setUnlockPassword('');
    await signOutUser();
  }, [user?.uid]);

  const handleChangeAutoLockMinutes = useCallback(
    (mins: number) => {
      setAutoLockMinutes(mins);
      lastActivityRef.current = Date.now();
      if (user) {
        try {
          window.localStorage.setItem(
            `motomandados_autolock_${user.uid}`,
            String(mins)
          );
        } catch {
          // Ignore storage error
        }
      }
      showToast(
        mins === 0
          ? 'Bloqueo automático desactivado (solo manual).'
          : `Bloqueo automático configurado a ${mins} minutos de inactividad.`
      );
    },
    [user, showToast]
  );

  const handleUnlockSession = async (method: 'password' | 'google') => {
    if (!user) return;
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const cred =
        method === 'password'
          ? await reauthenticateWithPassword(unlockPassword)
          : await reauthenticateCurrentUser();
      if (cred.user.uid !== user.uid) {
        throw new Error(
          'Debes validar con la misma cuenta con la que iniciaste sesión.'
        );
      }
      lastActivityRef.current = Date.now();
      setSessionLocked(false);
      setUnlockPassword('');
      showToast('Sesión desbloqueada tras verificación segura.');
    } catch (err) {
      setUnlockError(formatFirebaseAuthError(err));
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleEnablePush = useCallback(async () => {
    const perm = await requestBrowserPushPermission();
    setPushPermission(perm);
    if (perm === 'granted' && user) {
      const res = await syncServerPushSubscription({
        uid: user.uid,
        departmentId: currentRider?.departmentId || 'all',
        userMode,
        urgentEnabled: privateInfo?.notifUrgent !== false,
        dailyEarningsEnabled: privateInfo?.notifDailyEarnings !== false,
        dailyEarningsTime: privateInfo?.dailyEarningsTime || '20:00',
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        dailySummaryText: todayEarningsStats.summaryText,
      });
      setPushSubscribed(res.subscribed);
      showToast(
        'Notificaciones Push activadas. Recibirás alertas urgentes incluso en segundo plano.'
      );
    } else if (perm === 'denied') {
      showToast(
        'El navegador bloqueó los permisos. Habilítalos desde el candado de la barra de dirección.'
      );
    }
  }, [
    user,
    currentRider?.departmentId,
    userMode,
    privateInfo?.notifUrgent,
    privateInfo?.notifDailyEarnings,
    privateInfo?.dailyEarningsTime,
    todayEarningsStats.summaryText,
    showToast,
  ]);

  const handleRefreshPush = useCallback(async () => {
    const perm = getBrowserPushPermission();
    setPushPermission(perm);
    if (perm === 'granted' && user) {
      const res = await syncServerPushSubscription({
        uid: user.uid,
        departmentId: currentRider?.departmentId || 'all',
        userMode,
        urgentEnabled: privateInfo?.notifUrgent !== false,
        dailyEarningsEnabled: privateInfo?.notifDailyEarnings !== false,
        dailyEarningsTime: privateInfo?.dailyEarningsTime || '20:00',
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        dailySummaryText: todayEarningsStats.summaryText,
      });
      setPushSubscribed(res.subscribed);
      showToast(
        res.subscribed
          ? 'Suscripción Web Push verificada y sincronizada.'
          : 'Permiso activo · Canal local en navegador listo.'
      );
    } else {
      setPushSubscribed(false);
    }
  }, [
    user,
    currentRider?.departmentId,
    userMode,
    privateInfo?.notifUrgent,
    privateInfo?.notifDailyEarnings,
    privateInfo?.dailyEarningsTime,
    todayEarningsStats.summaryText,
    showToast,
  ]);

  const handleDisablePush = useCallback(async () => {
    if (!user) return;
    await unsubscribeServerPush(user.uid);
    setPushSubscribed(false);
    showToast('Suscripción Web Push pausada en este dispositivo.');
  }, [user, showToast]);

  const handleTestPush = useCallback(
    async (options?: PushTestOptions): Promise<TestPushOutcome> => {
      if (getBrowserPushPermission() !== 'granted') {
        await handleEnablePush();
      }

      const permNow = getBrowserPushPermission();
      const scenario = options?.scenario || 'urgent';
      const defaultTitle =
        scenario === 'daily'
          ? `💰 Resumen Diario · ${formatCurrency(
              todayEarningsStats.netTotal,
              tariffs.currency
            )}`
          : scenario === 'route'
          ? '📍 Proximidad GPS · Llegando al punto'
          : '⚡ Prueba Moto Mandados · Súper Exprés';
      const defaultBody =
        scenario === 'daily'
          ? todayEarningsStats.summaryText
          : scenario === 'route'
          ? 'Estás a 0.12 km del punto de recogida asignado en tu radar.'
          : 'Así recibirás las alertas de entregas urgentes cuando la pestaña esté inactiva.';

      const title = options?.title || defaultTitle;
      const body = options?.body || defaultBody;
      const isUrgent = options?.isUrgent ?? scenario === 'urgent';

      if (privateInfo?.notifSound) {
        playNotificationTone();
      }

      const detailed =
        permNow === 'granted'
          ? await showBrowserNotificationDetailed({
              title,
              body,
              isUrgent,
              tag: `test-${scenario}-${Date.now()}`,
            })
          : {
              shown: false,
              channel:
                permNow === 'unsupported'
                  ? ('unsupported' as const)
                  : ('blocked' as const),
            };

      let serverPushSent = 0;
      if (user && permNow === 'granted') {
        const srv = await triggerServerPushBroadcast({
          title,
          body,
          testOnlyForUid: user.uid,
        });
        serverPushSent = srv.sent ?? 0;
      }

      showToast(
        detailed.shown
          ? 'Notificación de prueba enviada al navegador.'
          : 'Activa o desbloquea el permiso del navegador para ver la notificación.'
      );

      return {
        shown: detailed.shown,
        channel: detailed.channel,
        serverPushSent,
        timestamp: new Date().toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        title,
      };
    },
    [
      handleEnablePush,
      user,
      showToast,
      todayEarningsStats.netTotal,
      todayEarningsStats.summaryText,
      tariffs.currency,
      privateInfo?.notifSound,
    ]
  );

  const dispatchDailyEarningsSummary = useCallback(
    async (isManual = false) => {
      if (!user) return;
      if (isManual && getBrowserPushPermission() !== 'granted') {
        await handleEnablePush();
      }
      const title = `💰 Resumen Diario · ${formatCurrency(
        todayEarningsStats.netTotal,
        tariffs.currency
      )}`;
      const body = todayEarningsStats.summaryText;

      if (privateInfo?.notifSound) {
        playNotificationTone();
      }

      let shown = false;
      if (getBrowserPushPermission() === 'granted') {
        shown = await showUrgentBrowserNotification({
          title,
          body,
          isUrgent: false,
          tag: isManual
            ? `daily-manual-${Date.now()}`
            : `daily-summary-${todayEarningsStats.dateKey}`,
        });
      }

      if (isManual) {
        void triggerServerPushBroadcast({
          title,
          body,
          testOnlyForUid: user.uid,
        });
      }

      if (effectiveOnlineRef.current) {
        try {
          await setDoc(doc(db, 'notifications', `notif_daily_${Date.now()}`), {
            recipientUid: user.uid,
            title: clampStr(title, 100),
            body: clampStr(body, 240),
            category: 'wallet',
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch {
          // Non-fatal if offline or throttled
        }
      }

      if (isManual) {
        showToast(
          shown
            ? `Resumen diario enviado por notificación push (${formatCurrency(
                todayEarningsStats.netTotal,
                tariffs.currency
              )} hoy).`
            : `Resumen registrado en Alertas (${formatCurrency(
                todayEarningsStats.netTotal,
                tariffs.currency
              )} hoy).`
        );
      }
    },
    [
      user,
      handleEnablePush,
      todayEarningsStats.netTotal,
      todayEarningsStats.summaryText,
      todayEarningsStats.dateKey,
      tariffs.currency,
      privateInfo?.notifSound,
      showToast,
    ]
  );

  // Scheduled daily earnings summary push timer (checks every 15s)
  useEffect(() => {
    if (!authReady || !user || !riderLoaded) return;
    if (privateInfo?.notifDailyEarnings === false) return;

    const scheduledTime = privateInfo?.dailyEarningsTime || '20:00';
    const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(scheduledTime);
    if (!match) return;
    const schedMinutes = Number(match[1]) * 60 + Number(match[2]);

    const checkAndDispatch = () => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const diff = nowMinutes - schedMinutes;
      if (diff < 0 || diff > 2) return;

      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const sentKey = `${y}-${m}-${d}@${scheduledTime}`;
      const storageKey = `motomandados_daily_sent_${user.uid}`;
      try {
        if (window.localStorage.getItem(storageKey) === sentKey) return;
        window.localStorage.setItem(storageKey, sentKey);
      } catch {
        // Proceed if storage unavailable
      }
      void dispatchDailyEarningsSummary(false);
    };

    checkAndDispatch();
    const interval = window.setInterval(checkAndDispatch, 15_000);
    return () => window.clearInterval(interval);
  }, [
    authReady,
    user,
    riderLoaded,
    privateInfo?.notifDailyEarnings,
    privateInfo?.dailyEarningsTime,
    dispatchDailyEarningsSummary,
  ]);

  const handleCompleteOnboarding = async (data: {
    displayName: string;
    photoUrl?: string;
    motoName: string;
    motoModel: string;
    motoPlate: string;
    motoColor: string;
    departmentId: string;
    phone: string;
    birthDate: string;
    birthDateMs: number;
  }) => {
    if (!user) return;
    const age = calculateAgeFromIsoDate(data.birthDate);
    if (age === null || age < MIN_DRIVER_AGE) {
      showToast(
        `Debes tener ${MIN_DRIVER_AGE} años o más para registrarte en Moto Mandados.`
      );
      return;
    }
    setSavingOnboarding(true);
    const dept =
      departments.find((d) => d.id === data.departmentId) ||
      DEFAULT_DEPARTMENTS[0];
    try {
      const batch = writeBatch(db);
      const riderRef = doc(db, 'riders', user.uid);
      const userRef = doc(db, 'users', user.uid);
      const walletRef = doc(db, 'wallets', user.uid);
      const notifRef = doc(db, 'notifications', `notif_welcome_${Date.now()}`);

      batch.set(riderRef, {
        uid: user.uid,
        displayName: clampStr(data.displayName, 80),
        photoUrl: clampStr(data.photoUrl || '', 160000),
        motoName: clampStr(data.motoName, 80),
        motoModel: clampStr(data.motoModel, 80),
        motoPlate: clampStr(data.motoPlate, 24),
        motoColor: clampStr(data.motoColor, 24),
        departmentId: dept.id,
        departmentName: dept.name,
        role: isAdminUser ? 'admin' : 'rider',
        status: 'available',
        verificationStatus: isAdminUser ? 'approved' : 'unsubmitted',
        completedCount: 0,
        onTimeRate: 98.5,
        totalKm: 0,
        rating: 4.95,
        ratingCount: 0,
        lat: dept.centerLat,
        lng: dept.centerLng,
        heading: 0,
        speedKmh: 0,
        locationUpdatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(userRef, {
        uid: user.uid,
        email: clampStr(user.email || 'usuario@motomando.app', 200),
        phone: clampStr(data.phone, 32),
        birthDate: data.birthDate,
        birthDateMs: data.birthDateMs,
        notifUrgent: true,
        notifRouteRecalc: true,
        notifDailyEarnings: true,
        notifGpsProximity: true,
        notifSound: false,
        dailyEarningsTime: '20:00',
        themePreference: theme,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(walletRef, {
        uid: user.uid,
        balance: 0,
        totalTopups: 0,
        totalEarned: 0,
        totalFeesDeducted: 0,
        freeTripsBalance: 0,
        freeTripsEarned: 0,
        freeTripsUsed: 0,
        xpPoints: 0,
        currentRank: 'bronce',
        claimedRewardIds: [],
        currency: tariffs.currency || 'MXN',
        updatedAt: serverTimestamp(),
      });

      batch.set(notifRef, {
        recipientUid: user.uid,
        title: `Unidad ${clampStr(data.motoName, 40)} Registrada`,
        body: isAdminUser
          ? `Tu cuenta ya opera en ${dept.name}.`
          : `Completa tus 6 documentos de conductor en Modo Conductor para esperar la confirmación de 12 horas.`,
        category: 'system',
        read: false,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      showToast(
        isAdminUser
          ? `Bienvenido a Moto Mandados · Unidad ${data.motoName} lista.`
          : `Cuenta creada (18+ verificado). Envía tus documentos de conductor para aprobar tu unidad.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `riders/${user.uid}`);
    } finally {
      setSavingOnboarding(false);
    }
  };

  const handleUpdateRiderStatus = async (status: RiderStatus) => {
    if (!user || !currentRider) return;
    if (!isDriverApproved) {
      showToast(
        'Completa tu verificación de conductor y espera la aprobación de 12 horas para operar en línea.'
      );
      return;
    }
    const optimisticRider = { ...currentRider, status };
    setCurrentRider(optimisticRider);
    setAllRiders((prev) =>
      prev.map((r) => (r.uid === user.uid ? optimisticRider : r))
    );

    const queueStatus = async () => {
      const nextQ = await enqueueOfflineMutation({
        id: `status_${Date.now()}`,
        uid: user.uid,
        kind: 'rider_status',
        createdAt: Date.now(),
        payload: {
          status,
          departmentId: currentRider.departmentId,
          departmentName: currentRider.departmentName,
          ratingCount: currentRider.ratingCount ?? 0,
        },
      });
      setOfflineQueue(nextQ);
      showToast('Estado guardado localmente; se sincronizará al recuperar red.');
    };

    if (!effectiveOnlineRef.current) {
      await queueStatus();
      return;
    }

    try {
      await updateDoc(doc(db, 'riders', user.uid), {
        status,
        departmentId: currentRider.departmentId,
        departmentName: currentRider.departmentName,
        ratingCount: currentRider.ratingCount ?? 0,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      if (isNetworkOfflineError(err)) {
        await queueStatus();
        return;
      }
      handleFirestoreError(err, OperationType.UPDATE, `riders/${user.uid}`);
    }
  };

  const handleUpdateRiderLocation = useCallback(
    async (coords: {
      lat: number;
      lng: number;
      speedKmh: number;
      heading: number;
    }) => {
      if (!user || !currentRider) return;
      const optimisticRider: RiderProfile = {
        ...currentRider,
        lat: coords.lat,
        lng: coords.lng,
        speedKmh: coords.speedKmh,
        heading: coords.heading,
      };
      setCurrentRider(optimisticRider);
      setAllRiders((prev) =>
        prev.map((r) => (r.uid === user.uid ? optimisticRider : r))
      );

      const queueLocation = async () => {
        const nextQ = await enqueueOfflineMutation({
          id: `loc_${Date.now()}`,
          uid: user.uid,
          kind: 'location',
          createdAt: Date.now(),
          payload: {
            lat: coords.lat,
            lng: coords.lng,
            speedKmh: coords.speedKmh,
            heading: coords.heading,
            departmentId: currentRider.departmentId,
            departmentName: currentRider.departmentName,
            ratingCount: currentRider.ratingCount ?? 0,
          },
        });
        setOfflineQueue(nextQ);
      };

      if (!effectiveOnlineRef.current) {
        await queueLocation();
        return;
      }

      try {
        await updateDoc(doc(db, 'riders', user.uid), {
          lat: coords.lat,
          lng: coords.lng,
          speedKmh: coords.speedKmh,
          heading: coords.heading,
          departmentId: currentRider.departmentId,
          departmentName: currentRider.departmentName,
          ratingCount: currentRider.ratingCount ?? 0,
          locationUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        if (isNetworkOfflineError(err)) {
          await queueLocation();
          return;
        }
        handleFirestoreError(err, OperationType.UPDATE, `riders/${user.uid}`);
      }
    },
    [user, currentRider]
  );

  const handleDispatchDelivery = async (payload: {
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
    customTotalFare?: number;
    preferredRiderUid?: string;
    preferredRiderName?: string;
  }) => {
    if (!user || !currentRider) return;
    const dept = departments.find((d) => d.id === payload.departmentId);
    const defaultFare = calculateDeliveryFare(
      payload.distanceKm,
      payload.isUrgent,
      tariffs,
      dept?.baseFareMultiplier || 1.0,
      payload.serviceCategory
    );
    const hasCustomFare =
      typeof payload.customTotalFare === 'number' &&
      Number.isFinite(payload.customTotalFare) &&
      payload.customTotalFare >= 10 &&
      Math.abs(payload.customTotalFare - defaultFare.totalFare) >= 0.01;
    const finalBreakdown = hasCustomFare
      ? recalculateFromCustomFare(payload.customTotalFare!, tariffs.platformFeePct)
      : {
          totalFare: defaultFare.totalFare,
          platformFee: defaultFare.platformFee,
          riderEarnings: defaultFare.riderEarnings,
        };
    const id = `del_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const dispatchData = {
      deliveryId: id,
      title: clampStr(payload.title, 120),
      serviceCategory: payload.serviceCategory,
      serviceType: payload.serviceType,
      isUrgent: payload.isUrgent,
      departmentId: payload.departmentId,
      departmentName: payload.departmentName,
      merchantName: clampStr(payload.merchantName, 100),
      cashOnDelivery: Math.max(0, payload.cashOnDelivery),
      pickupAddress: clampStr(payload.pickupAddress, 240),
      pickupLat: payload.pickupLat,
      pickupLng: payload.pickupLng,
      dropoffAddress: clampStr(payload.dropoffAddress, 240),
      dropoffLat: payload.dropoffLat,
      dropoffLng: payload.dropoffLng,
      customerName: clampStr(payload.customerName, 80),
      notes: clampStr(payload.notes, 300),
      distanceKm: defaultFare.distanceKm,
      estimatedMinutes: payload.estimatedMinutes,
      baseFare: defaultFare.baseFare,
      distanceFare: defaultFare.distanceFare,
      urgentSurcharge: defaultFare.urgentSurcharge,
      suggestedFare: defaultFare.totalFare,
      customFareEdited: hasCustomFare,
      totalFare: finalBreakdown.totalFare,
      riderEarnings: finalBreakdown.riderEarnings,
      platformFee: finalBreakdown.platformFee,
      preferredRiderUid: clampStr(payload.preferredRiderUid || '', 128),
      preferredRiderName: clampStr(payload.preferredRiderName || '', 80),
    };

    const optimisticDelivery = normalizeDelivery(id, {
      ...dispatchData,
      createdByUid: user.uid,
      assignedRiderUid: '',
      assignedRiderName: '',
      assignedMotoName: '',
      passengerAccepted: Boolean(dispatchData.preferredRiderUid),
      declinedRiderUids: [],
      stopOrder: 1,
      rated: false,
      status: 'pending',
    });

    const queueDispatch = async () => {
      setDeliveries((prev) => [optimisticDelivery, ...prev]);
      const nextQ = await enqueueOfflineMutation({
        id: `disp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        uid: user.uid,
        kind: 'dispatch_delivery',
        createdAt: Date.now(),
        payload: dispatchData,
      });
      setOfflineQueue(nextQ);
      showToast(
        'Solicitud guardada en IndexedDB sin conexión. Se enviará al recuperar Internet.'
      );
    };

    if (!effectiveOnlineRef.current) {
      await queueDispatch();
      return;
    }

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'deliveries', id), {
        createdByUid: user.uid,
        assignedRiderUid: '',
        assignedRiderName: '',
        assignedMotoName: '',
        title: dispatchData.title,
        serviceCategory: dispatchData.serviceCategory,
        serviceType: dispatchData.serviceType,
        isUrgent: dispatchData.isUrgent,
        departmentId: dispatchData.departmentId,
        departmentName: dispatchData.departmentName,
        merchantName: dispatchData.merchantName,
        cashOnDelivery: dispatchData.cashOnDelivery,
        pickupAddress: dispatchData.pickupAddress,
        pickupLat: dispatchData.pickupLat,
        pickupLng: dispatchData.pickupLng,
        dropoffAddress: dispatchData.dropoffAddress,
        dropoffLat: dispatchData.dropoffLat,
        dropoffLng: dispatchData.dropoffLng,
        customerName: dispatchData.customerName,
        notes: dispatchData.notes,
        distanceKm: dispatchData.distanceKm,
        estimatedMinutes: dispatchData.estimatedMinutes,
        stopOrder: 1,
        baseFare: dispatchData.baseFare,
        distanceFare: dispatchData.distanceFare,
        urgentSurcharge: dispatchData.urgentSurcharge,
        suggestedFare: dispatchData.suggestedFare,
        customFareEdited: dispatchData.customFareEdited,
        totalFare: dispatchData.totalFare,
        riderEarnings: dispatchData.riderEarnings,
        platformFee: dispatchData.platformFee,
        preferredRiderUid: dispatchData.preferredRiderUid,
        preferredRiderName: dispatchData.preferredRiderName,
        passengerAccepted: Boolean(dispatchData.preferredRiderUid),
        declinedRiderUids: [],
        rated: false,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(
        doc(db, 'notifications', `notif_disp_${Date.now()}`),
        {
          recipientUid: user.uid,
          title: `Solicitud ${
            payload.serviceCategory === 'super_expres'
              ? 'Súper Exprés'
              : payload.serviceCategory === 'pasajero'
              ? 'Pasajero Moto'
              : 'Despachada'
          }`,
          body: `"${clampStr(payload.title, 50)}" en ${payload.departmentName} (${formatCurrency(
            finalBreakdown.totalFare,
            tariffs.currency
          )}).`,
          category: payload.isUrgent ? 'urgent' : 'route',
          read: false,
          createdAt: serverTimestamp(),
        }
      );

      await batch.commit();
      if (dispatchData.isUrgent || dispatchData.serviceCategory === 'super_expres') {
        void triggerServerPushBroadcast({
          deliveryId: id,
          title: `⚡ Nuevo Súper Exprés · ${formatCurrency(
            finalBreakdown.riderEarnings,
            tariffs.currency
          )}`,
          body: `${dispatchData.title} · Recoger en ${dispatchData.pickupAddress} (${dispatchData.departmentName})`,
          departmentId: dispatchData.departmentId,
          senderUid: user.uid,
        });
      }
      showToast('Solicitud enviada en tiempo real.');
    } catch (err) {
      if (isNetworkOfflineError(err)) {
        await queueDispatch();
        return;
      }
      handleFirestoreError(err, OperationType.CREATE, `deliveries/${id}`);
    }
  };

  const handleUpdateDeliveryFare = async (
    delivery: Delivery,
    newTotalFare: number
  ) => {
    if (!user) return;
    const recalculated = recalculateFromCustomFare(
      newTotalFare,
      tariffs.platformFeePct
    );
    setDeliveries((prev) =>
      prev.map((d) =>
        d.id === delivery.id
          ? {
              ...d,
              totalFare: recalculated.totalFare,
              platformFee: recalculated.platformFee,
              riderEarnings: recalculated.riderEarnings,
              suggestedFare: d.suggestedFare ?? d.totalFare,
              customFareEdited: true,
            }
          : d
      )
    );

    if (!effectiveOnlineRef.current) {
      showToast('Tarifa actualizada localmente.');
      return;
    }

    try {
      await updateDoc(doc(db, 'deliveries', delivery.id), {
        totalFare: recalculated.totalFare,
        platformFee: recalculated.platformFee,
        riderEarnings: recalculated.riderEarnings,
        suggestedFare: delivery.suggestedFare ?? delivery.totalFare,
        customFareEdited: true,
        updatedAt: serverTimestamp(),
      });
      showToast(
        `Precio actualizado a ${formatCurrency(
          recalculated.totalFare,
          tariffs.currency
        )}.`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `deliveries/${delivery.id}`
      );
    }
  };

  const handleSendMessage = async (payload: {
    deliveryId: string;
    deliveryOwnerUid: string;
    recipientUid: string;
    text: string;
  }) => {
    if (!user || !currentRider) return;
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const senderRole: 'passenger' | 'driver' | 'admin' = isAdminUser
      ? 'admin'
      : userMode;

    try {
      await setDoc(doc(db, 'messages', msgId), {
        deliveryId: payload.deliveryId,
        deliveryOwnerUid: payload.deliveryOwnerUid,
        senderUid: user.uid,
        senderName: clampStr(currentRider.displayName, 80),
        senderRole,
        recipientUid: payload.recipientUid,
        text: clampStr(payload.text, 500),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `messages/${msgId}`);
    }
  };

  const handleOpenChat = (target: ChatTarget) => {
    setChatTarget(target);
    setChatDrawerOpen(true);
  };

  const handleSwitchMode = (nextMode: UserMode) => {
    setUserMode(nextMode);
    setActiveTab('rider');
    if (user) {
      try {
        window.localStorage.setItem(`motomando_mode_${user.uid}`, nextMode);
      } catch {
        // Ignore
      }
    }
    showToast(
      nextMode === 'passenger'
        ? 'Cambiaste a Modo Pasajero / Cliente.'
        : 'Cambiaste a Modo Conductor de Moto.'
    );
  };

  const handleClaimDelivery = async (delivery: Delivery) => {
    if (!user || !currentRider) return;
    if (!isDriverApproved) {
      showToast(
        'Debes esperar la aprobación de tus documentos (12h) antes de tomar entregas como conductor.'
      );
      return;
    }
    const myCount = deliveries.filter(
      (d) =>
        d.assignedRiderUid === user.uid &&
        d.status !== 'delivered' &&
        d.status !== 'cancelled'
    ).length;
    const stopOrder = myCount + 1;

    const autoAccepted = Boolean(
      delivery.preferredRiderUid && delivery.preferredRiderUid === user.uid
    );

    const applyOptimisticClaim = () => {
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === delivery.id
            ? {
                ...d,
                assignedRiderUid: user.uid,
                assignedRiderName: currentRider.displayName,
                assignedMotoName: currentRider.motoName,
                passengerAccepted: autoAccepted,
                status: 'assigned',
                stopOrder,
              }
            : d
        )
      );
      if (currentRider.status === 'available') {
        setCurrentRider((prev) =>
          prev ? { ...prev, status: 'on_route' } : prev
        );
      }
    };

    const queueClaim = async () => {
      applyOptimisticClaim();
      const nextQ = await enqueueOfflineMutation({
        id: `claim_${delivery.id}_${Date.now()}`,
        uid: user.uid,
        kind: 'claim_delivery',
        createdAt: Date.now(),
        payload: {
          deliveryId: delivery.id,
          deliveryTitle: delivery.title,
          riderName: currentRider.displayName,
          motoName: currentRider.motoName,
          stopOrder,
          pickupAddress: delivery.pickupAddress,
        },
      });
      setOfflineQueue(nextQ);
      showToast(
        `Parada "${delivery.title}" asignada localmente (sin conexión). Se sincronizará al reconectar.`
      );
    };

    if (!effectiveOnlineRef.current) {
      await queueClaim();
      return;
    }

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'deliveries', delivery.id), {
        assignedRiderUid: user.uid,
        assignedRiderName: currentRider.displayName,
        assignedMotoName: currentRider.motoName,
        passengerAccepted: autoAccepted,
        status: 'assigned',
        stopOrder,
        updatedAt: serverTimestamp(),
      });
      if (currentRider.status === 'available') {
        batch.update(doc(db, 'riders', user.uid), {
          status: 'on_route',
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(
        doc(db, 'notifications', `notif_claim_${Date.now()}`),
        {
          recipientUid: user.uid,
          title: `Parada asignada a ${currentRider.motoName}`,
          body: `Recoge en ${delivery.pickupAddress.slice(0, 80)}.`,
          category: 'route',
          read: false,
          createdAt: serverTimestamp(),
        }
      );
      await batch.commit();
      showToast(
        autoAccepted
          ? `Solicitud "${delivery.title}" aceptada por ti y confirmada por el pasajero.`
          : `Solicitud "${delivery.title}" aceptada. El pasajero puede confirmar o chatear contigo.`
      );
    } catch (err) {
      if (isNetworkOfflineError(err)) {
        await queueClaim();
        return;
      }
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `deliveries/${delivery.id}`
      );
    }
  };

  const handleConfirmAssignedDriver = async (delivery: Delivery) => {
    if (!user) return;
    setDeliveries((prev) =>
      prev.map((d) =>
        d.id === delivery.id ? { ...d, passengerAccepted: true } : d
      )
    );
    if (!effectiveOnlineRef.current) {
      showToast('Conductor confirmado localmente.');
      return;
    }
    try {
      await updateDoc(doc(db, 'deliveries', delivery.id), {
        passengerAccepted: true,
        updatedAt: serverTimestamp(),
      });
      showToast(
        `Confirmaste a ${delivery.assignedRiderName || 'tu conductor'}. Ya puede iniciar el viaje.`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `deliveries/${delivery.id}`
      );
    }
  };

  const handleRejectAssignedDriver = async (delivery: Delivery) => {
    if (!user) return;
    const prevDriverUid = delivery.assignedRiderUid;
    const existingDeclined = Array.isArray(delivery.declinedRiderUids)
      ? delivery.declinedRiderUids
      : [];
    const nextDeclined =
      prevDriverUid && !existingDeclined.includes(prevDriverUid)
        ? [...existingDeclined, prevDriverUid].slice(-25)
        : existingDeclined.slice(-25);

    setDeliveries((prev) =>
      prev.map((d) =>
        d.id === delivery.id
          ? {
              ...d,
              assignedRiderUid: '',
              assignedRiderName: '',
              assignedMotoName: '',
              passengerAccepted: false,
              declinedRiderUids: nextDeclined,
              status: 'pending',
            }
          : d
      )
    );

    if (!effectiveOnlineRef.current) {
      showToast('Solicitud reabierta localmente en el radar.');
      return;
    }

    try {
      await updateDoc(doc(db, 'deliveries', delivery.id), {
        assignedRiderUid: '',
        assignedRiderName: '',
        assignedMotoName: '',
        passengerAccepted: false,
        declinedRiderUids: nextDeclined,
        status: 'pending',
        updatedAt: serverTimestamp(),
      });
      showToast('Solicitud devuelta al radar para buscar otro conductor.');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `deliveries/${delivery.id}`
      );
    }
  };

  const handleReleaseDelivery = async (delivery: Delivery) => {
    if (!user || !currentRider) return;
    setDeliveries((prev) =>
      prev.map((d) =>
        d.id === delivery.id
          ? {
              ...d,
              assignedRiderUid: '',
              assignedRiderName: '',
              assignedMotoName: '',
              passengerAccepted: false,
              status: 'pending',
            }
          : d
      )
    );

    if (!effectiveOnlineRef.current) {
      showToast('Solicitud liberada localmente.');
      return;
    }

    try {
      await updateDoc(doc(db, 'deliveries', delivery.id), {
        assignedRiderUid: '',
        assignedRiderName: '',
        assignedMotoName: '',
        passengerAccepted: false,
        status: 'pending',
        updatedAt: serverTimestamp(),
      });
      showToast(
        `Liberaste "${delivery.title}". Volvió a estar disponible en el radar.`
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `deliveries/${delivery.id}`
      );
    }
  };

  const handleAssignDelivery = async (
    delivery: Delivery,
    rider: RiderProfile
  ) => {
    try {
      const riderActiveCount = deliveries.filter(
        (d) =>
          d.assignedRiderUid === rider.uid &&
          d.status !== 'delivered' &&
          d.status !== 'cancelled'
      ).length;

      const batch = writeBatch(db);
      batch.update(doc(db, 'deliveries', delivery.id), {
        assignedRiderUid: rider.uid,
        assignedRiderName: rider.displayName,
        assignedMotoName: rider.motoName,
        status: 'assigned',
        stopOrder: riderActiveCount + 1,
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'notifications', `notif_assign_${Date.now()}`),
        {
          recipientUid: rider.uid,
          title: `Nueva entrega asignada`,
          body: `${delivery.title} (${delivery.departmentName}) asignada a ${rider.motoName}.`,
          category: delivery.isUrgent ? 'urgent' : 'route',
          read: false,
          createdAt: serverTimestamp(),
        }
      );
      await batch.commit();
      showToast(`Envío asignado a ${rider.motoName}.`);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `deliveries/${delivery.id}`
      );
    }
  };

  const handleAdvanceDeliveryStatus = async (
    delivery: Delivery,
    nextStatus: DeliveryStatus
  ) => {
    if (!user || !currentRider) return;
    if (!isDriverApproved) {
      showToast(
        'Tu cuenta de conductor está pendiente de aprobación para operar entregas.'
      );
      return;
    }

    const useFreeTrip = (myWallet.freeTripsBalance ?? 0) > 0;
    const feeRatePct = useFreeTrip ? 0 : tariffs.platformFeePct;
    const actualFee = useFreeTrip
      ? 0
      : Number(((delivery.totalFare * feeRatePct) / 100).toFixed(2));
    const actualRiderNet = Number((delivery.totalFare - actualFee).toFixed(2));

    const applyOptimisticAdvance = () => {
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === delivery.id
            ? {
                ...d,
                status: nextStatus,
                ...(nextStatus === 'delivered'
                  ? {
                      usedFreeTrip: useFreeTrip,
                      platformFee: actualFee,
                      riderEarnings: actualRiderNet,
                    }
                  : {}),
              }
            : d
        )
      );
      if (nextStatus === 'delivered') {
        setCurrentRider((prev) =>
          prev
            ? {
                ...prev,
                completedCount: prev.completedCount + 1,
                totalKm: Number((prev.totalKm + delivery.distanceKm).toFixed(2)),
              }
            : prev
        );
        setWallets((prev) =>
          prev.map((w) =>
            w.uid === user.uid
              ? {
                  ...w,
                  balance: useFreeTrip
                    ? w.balance
                    : Number(Math.max(0, w.balance - actualFee).toFixed(2)),
                  totalFeesDeducted: useFreeTrip
                    ? w.totalFeesDeducted ?? 0
                    : Number(
                        ((w.totalFeesDeducted ?? 0) + actualFee).toFixed(2)
                      ),
                  freeTripsBalance: useFreeTrip
                    ? Math.max(0, (w.freeTripsBalance ?? 0) - 1)
                    : w.freeTripsBalance ?? 0,
                  freeTripsUsed: useFreeTrip
                    ? (w.freeTripsUsed ?? 0) + 1
                    : w.freeTripsUsed ?? 0,
                  xpPoints: (w.xpPoints ?? 0) + 60,
                  totalEarned: Number(
                    (w.totalEarned + actualRiderNet).toFixed(2)
                  ),
                }
              : w
          )
        );
      }
    };

    const queueAdvance = async () => {
      applyOptimisticAdvance();
      const nextQ = await enqueueOfflineMutation({
        id: `adv_${delivery.id}_${nextStatus}_${Date.now()}`,
        uid: user.uid,
        kind: 'advance_delivery',
        createdAt: Date.now(),
        payload: {
          delivery,
          nextStatus,
        },
      });
      setOfflineQueue(nextQ);
      showToast(
        nextStatus === 'delivered'
          ? 'Entrega completada localmente en IndexedDB. Se liquidará al recuperar conexión.'
          : 'Cambio de estado guardado localmente; se sincronizará al volver la red.'
      );
    };

    if (!effectiveOnlineRef.current) {
      await queueAdvance();
      return;
    }

    try {
      if (nextStatus === 'delivered') {
        const batch = writeBatch(db);
        const delRef = doc(db, 'deliveries', delivery.id);
        const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const txRef = doc(db, 'transactions', txId);
        const riderRef = doc(db, 'riders', user.uid);
        const walletRef = doc(db, 'wallets', user.uid);
        const freshWalletSnap = await getDoc(walletRef);
        const freshWallet = freshWalletSnap.exists()
          ? (freshWalletSnap.data() as Wallet)
          : myWallet;

        const serverUseFreeTrip = (freshWallet.freeTripsBalance ?? 0) > 0;
        const serverFeeRatePct = serverUseFreeTrip ? 0 : tariffs.platformFeePct;
        const serverActualFee = serverUseFreeTrip
          ? 0
          : Number(((delivery.totalFare * serverFeeRatePct) / 100).toFixed(2));
        const serverActualNet = Number(
          (delivery.totalFare - serverActualFee).toFixed(2)
        );

        batch.update(delRef, {
          status: 'delivered',
          usedFreeTrip: serverUseFreeTrip,
          platformFee: serverActualFee,
          riderEarnings: serverActualNet,
          deliveredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        batch.set(txRef, {
          deliveryId: delivery.id,
          riderUid: user.uid,
          riderName: currentRider.displayName,
          motoName: currentRider.motoName,
          departmentId: delivery.departmentId || currentRider.departmentId,
          serviceCategory: delivery.serviceCategory || 'delivery',
          serviceType: delivery.serviceType,
          isUrgent: delivery.isUrgent,
          distanceKm: delivery.distanceKm,
          baseFare: delivery.baseFare,
          distanceFare: delivery.distanceFare,
          urgentSurcharge: delivery.urgentSurcharge,
          grossAmount: delivery.totalFare,
          platformFee: serverActualFee,
          riderNetAmount: serverActualNet,
          usedFreeTrip: serverUseFreeTrip,
          feeRatePct: serverFeeRatePct,
          status: 'completed',
          createdAt: serverTimestamp(),
        });

        batch.update(riderRef, {
          completedCount: increment(1),
          totalKm: increment(delivery.distanceKm),
          updatedAt: serverTimestamp(),
        });

        if (freshWalletSnap.exists()) {
          const nextXp = Math.max(0, Math.round(freshWallet.xpPoints ?? 0)) + 60;
          const nextProgression = computeDriverProgression({
            rider: {
              ...currentRider,
              completedCount: (currentRider.completedCount || 0) + 1,
              totalKm: (currentRider.totalKm || 0) + delivery.distanceKm,
            },
            wallet: { ...freshWallet, xpPoints: nextXp },
            application: myDriverApplication,
          });

          if (serverUseFreeTrip) {
            batch.update(walletRef, {
              freeTripsBalance: Math.max(
                0,
                Math.round(freshWallet.freeTripsBalance ?? 0) - 1
              ),
              freeTripsUsed:
                Math.max(0, Math.round(freshWallet.freeTripsUsed ?? 0)) + 1,
              totalEarned: increment(serverActualNet),
              xpPoints: nextXp,
              currentRank: nextProgression.currentStage.id,
              updatedAt: serverTimestamp(),
            });
          } else {
            const nextBalance = Number(
              Math.max(0, (freshWallet.balance ?? 0) - serverActualFee).toFixed(2)
            );
            batch.update(walletRef, {
              balance: nextBalance,
              totalFeesDeducted: increment(serverActualFee),
              totalEarned: increment(serverActualNet),
              xpPoints: nextXp,
              currentRank: nextProgression.currentStage.id,
              updatedAt: serverTimestamp(),
            });
          }
        }

        batch.set(
          doc(db, 'notifications', `notif_done_${Date.now()}`),
          {
            recipientUid: user.uid,
            title: serverUseFreeTrip
              ? `Viaje Gratis Aplicado (+${formatCurrency(serverActualNet, tariffs.currency)})`
              : `Entrega Liquidada (-${formatCurrency(serverActualFee, tariffs.currency)} com. ${serverFeeRatePct}%)`,
            body: serverUseFreeTrip
              ? `"${delivery.title}" completada sin deducción del ${tariffs.platformFeePct}% · +60 XP.`
              : `"${delivery.title}" completada · Se dedujo ${serverFeeRatePct}% del saldo · +60 XP.`,
            category: 'wallet',
            read: false,
            createdAt: serverTimestamp(),
          }
        );

        await batch.commit();
        showToast(
          serverUseFreeTrip
            ? `Viaje Gratis aplicado (0% comisión) · Conservas ${formatCurrency(serverActualNet, tariffs.currency)} + 60 XP.`
            : `Entrega completada · Deducción ${serverFeeRatePct}% (-${formatCurrency(serverActualFee, tariffs.currency)}) · +60 XP.`
        );
      } else {
        await updateDoc(doc(db, 'deliveries', delivery.id), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      if (isNetworkOfflineError(err)) {
        await queueAdvance();
        return;
      }
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `deliveries/${delivery.id}`
      );
    }
  };

  const handleClaimReward = async (payload: ClaimableRewardPayload) => {
    if (!user || !currentRider) return;
    if (!effectiveOnlineRef.current) {
      showToast('Conéctate a Internet para reclamar tu premio y viajes gratis.');
      return;
    }
    const existingClaimed = myWallet.claimedRewardIds || [];
    if (existingClaimed.includes(payload.rewardId)) {
      showToast('Este premio ya fue reclamado anteriormente.');
      return;
    }

    try {
      const walletRef = doc(db, 'wallets', user.uid);
      const freshSnap = await getDoc(walletRef);
      if (!freshSnap.exists()) {
        showToast('Tu billetera se está inicializando; intenta en unos segundos.');
        return;
      }
      const freshWallet = freshSnap.data() as Wallet;
      const freshClaimed = freshWallet.claimedRewardIds || [];
      if (freshClaimed.includes(payload.rewardId)) {
        showToast('Este premio ya fue reclamado anteriormente.');
        return;
      }

      const tripsToAdd = Math.max(0, Math.min(25, Math.round(payload.freeTripsToAdd)));
      const xpToAdd = Math.max(0, Math.round(payload.xpToAdd));
      const nextClaimed = [...freshClaimed, payload.rewardId].slice(0, 50);
      const nextFreeBalance =
        Math.max(0, Math.round(freshWallet.freeTripsBalance ?? 0)) + tripsToAdd;
      const nextFreeEarned =
        Math.max(0, Math.round(freshWallet.freeTripsEarned ?? 0)) + tripsToAdd;
      const nextXp = Math.max(0, Math.round(freshWallet.xpPoints ?? 0)) + xpToAdd;
      const progression = computeDriverProgression({
        rider: currentRider,
        wallet: {
          ...freshWallet,
          xpPoints: nextXp,
          claimedRewardIds: nextClaimed,
        },
        application: myDriverApplication,
      });

      const batch = writeBatch(db);
      batch.update(walletRef, {
        freeTripsBalance: nextFreeBalance,
        freeTripsEarned: nextFreeEarned,
        xpPoints: nextXp,
        currentRank: progression.currentStage.id,
        claimedRewardIds: nextClaimed,
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'notifications', `notif_reward_${Date.now()}`),
        {
          recipientUid: user.uid,
          title: clampStr(`Premio Desbloqueado: ${payload.title}`, 100),
          body: clampStr(
            `Se acreditaron +${tripsToAdd} Viajes Gratis (0% comisión) y +${xpToAdd} XP. Etapa: ${progression.currentStage.shortName}.`,
            240
          ),
          category: 'wallet',
          read: false,
          createdAt: serverTimestamp(),
        }
      );
      await batch.commit();
      showToast(
        `Premio acreditado: +${tripsToAdd} Viajes Gratis (0% com.) y +${xpToAdd} XP.`
      );
    } catch (err) {
      if (isNetworkOfflineError(err)) {
        showToast('Sin conexión: intenta reclamar cuando vuelva Internet.');
        return;
      }
      handleFirestoreError(err, OperationType.UPDATE, `wallets/${user.uid}`);
    }
  };

  const handleApplyOptimizedOrder = async (orderedIds: string[]) => {
    if (!effectiveOnlineRef.current) {
      setDeliveries((prev) =>
        prev.map((d) => {
          const idx = orderedIds.indexOf(d.id);
          return idx >= 0 ? { ...d, stopOrder: idx + 1 } : d;
        })
      );
      return;
    }
    try {
      const batch = writeBatch(db);
      orderedIds.forEach((id, idx) => {
        batch.update(doc(db, 'deliveries', id), {
          stopOrder: idx + 1,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      showToast('Orden de paradas optimizado automáticamente.');
    } catch (err) {
      if (isNetworkOfflineError(err)) return;
      handleFirestoreError(err, OperationType.UPDATE, 'deliveries');
    }
  };

  const handleSaveTariffs = async (
    next: Omit<TariffSettings, 'updatedBy' | 'updatedAt'>
  ) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'settings', 'tariffs'), {
        ...next,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
      showToast('Sistema de tarifas actualizado para toda la flota.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/tariffs');
    }
  };

  const handleSaveProfile = async (updates: {
    displayName: string;
    motoName: string;
    motoModel: string;
    motoPlate: string;
    motoColor: string;
    departmentId: string;
    phone: string;
    photoUrl?: string;
  }) => {
    if (!user) return;
    const dept =
      departments.find((d) => d.id === updates.departmentId) ||
      DEFAULT_DEPARTMENTS[0];
    try {
      const batch = writeBatch(db);
      const riderUpdates: Record<string, unknown> = {
        displayName: clampStr(updates.displayName, 80),
        motoName: clampStr(updates.motoName, 80),
        motoModel: clampStr(updates.motoModel, 80),
        motoPlate: clampStr(updates.motoPlate, 24),
        motoColor: clampStr(updates.motoColor, 24),
        departmentId: dept.id,
        departmentName: dept.name,
        updatedAt: serverTimestamp(),
      };
      if (typeof updates.photoUrl === 'string') {
        riderUpdates.photoUrl = clampStr(updates.photoUrl, 160000);
      }
      batch.update(doc(db, 'riders', user.uid), riderUpdates);
      batch.update(doc(db, 'users', user.uid), {
        phone: clampStr(updates.phone, 32),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      showToast('Perfil, departamento y datos de tu motocicleta actualizados.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `riders/${user.uid}`);
    }
  };

  const handleUpdateProfilePhoto = async (nextPhotoUrl: string) => {
    if (!user) return;
    const cleanUrl = clampStr(nextPhotoUrl.trim(), 160000);
    try {
      await updateDoc(doc(db, 'riders', user.uid), {
        photoUrl: cleanUrl,
        updatedAt: serverTimestamp(),
      });
      showToast(
        cleanUrl
          ? 'Foto de perfil actualizada.'
          : 'Foto de perfil eliminada.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `riders/${user.uid}`);
    }
  };

  const handleUpdateNotifications = async (prefs: {
    notifUrgent: boolean;
    notifRouteRecalc: boolean;
    notifDailyEarnings: boolean;
    notifGpsProximity: boolean;
    notifSound: boolean;
    dailyEarningsTime?: string;
  }) => {
    if (!user) return;
    const validTime =
      prefs.dailyEarningsTime &&
      /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(prefs.dailyEarningsTime)
        ? prefs.dailyEarningsTime
        : undefined;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notifUrgent: prefs.notifUrgent,
        notifRouteRecalc: prefs.notifRouteRecalc,
        notifDailyEarnings: prefs.notifDailyEarnings,
        notifGpsProximity: prefs.notifGpsProximity,
        notifSound: prefs.notifSound,
        ...(validTime ? { dailyEarningsTime: validTime } : {}),
        updatedAt: serverTimestamp(),
      });
      showToast(
        validTime && validTime !== privateInfo?.dailyEarningsTime
          ? `Resumen diario programado para las ${validTime} hrs.`
          : 'Preferencias de notificaciones actualizadas.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleChangeTheme = useCallback(
    (nextTheme: ThemePreference) => {
      setThemeState(nextTheme);
      persistLocalTheme(nextTheme, user?.uid);
      showToast(
        nextTheme === 'dark'
          ? 'Modo oscuro activado · Ideal para entregas nocturnas.'
          : 'Modo claro activado.'
      );
      if (user && privateInfo && effectiveOnlineRef.current) {
        updateDoc(doc(db, 'users', user.uid), {
          themePreference: nextTheme,
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          if (isNetworkOfflineError(err)) return;
          handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
        });
      }
    },
    [user, privateInfo, showToast]
  );

  const toggleTheme = useCallback(() => {
    handleChangeTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, handleChangeTheme]);

  const handleCreateTopup = async (amount: number): Promise<QrTopup | null> => {
    if (!user || !currentRider) return null;
    const id = `top_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const referenceCode = `MM-QR-${Date.now().toString().slice(-6)}`;
    const qrPayload = `motomando://recarga?ref=${referenceCode}&uid=${user.uid}&monto=${amount.toFixed(2)}&moneda=${tariffs.currency}`;
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'topups', id), {
        uid: user.uid,
        riderName: currentRider.displayName,
        motoName: currentRider.motoName,
        amount,
        referenceCode,
        qrPayload,
        method: 'qr',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'notifications', `notif_qr_${Date.now()}`),
        {
          recipientUid: user.uid,
          title: `QR de Recarga Generado (${referenceCode})`,
          body: `Ficha por ${formatCurrency(amount, tariffs.currency)} lista para validación administrativa.`,
          category: 'wallet',
          read: false,
          createdAt: serverTimestamp(),
        }
      );
      await batch.commit();
      showToast(`Código QR ${referenceCode} generado por ${formatCurrency(amount, tariffs.currency)}.`);
      return {
        id,
        uid: user.uid,
        riderName: currentRider.displayName,
        motoName: currentRider.motoName,
        amount,
        referenceCode,
        qrPayload,
        method: 'qr',
        status: 'pending',
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `topups/${id}`);
      return null;
    }
  };

  const handleAddBankAccount = async (
    input: AddBankAccountInput
  ): Promise<BankAccount | null> => {
    if (!user) return null;
    const digits = input.accountNumber.replace(/\D/g, '');
    const last4 = digits.slice(-4).padStart(4, '0');
    const clabeMasked = `•••• ${last4}`;
    const id = `bank_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const alias = clampStr(input.alias, 60);
    const bankName = clampStr(input.bankName, 60);
    const accountHolder = clampStr(input.accountHolder, 100);
    const isDefault = bankAccounts.length === 0;

    try {
      await setDoc(doc(db, 'bankAccounts', id), {
        uid: user.uid,
        alias,
        bankName,
        accountHolder,
        accountType: input.accountType,
        last4,
        clabeMasked,
        isDefault,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`Cuenta ${bankName} (•••• ${last4}) vinculada correctamente.`);
      return {
        id,
        uid: user.uid,
        alias,
        bankName,
        accountHolder,
        accountType: input.accountType,
        last4,
        clabeMasked,
        isDefault,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `bankAccounts/${id}`);
      return null;
    }
  };

  const handleDeleteBankAccount = async (accountId: string) => {
    try {
      await deleteDoc(doc(db, 'bankAccounts', accountId));
      showToast('Cuenta bancaria desvinculada de tu perfil.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bankAccounts/${accountId}`);
    }
  };

  const handleSaveFrequentRoute = async (
    input: FrequentRouteInput,
    existingId?: string
  ) => {
    if (!user) return;
    const payload = {
      name: clampStr(input.name, 80),
      serviceCategory: input.serviceCategory,
      serviceType: input.serviceType,
      departmentId: clampStr(input.departmentId, 64),
      departmentName: clampStr(input.departmentName, 80),
      pickupAddress: clampStr(input.pickupAddress, 240),
      pickupLat: Number(input.pickupLat),
      pickupLng: Number(input.pickupLng),
      dropoffAddress: clampStr(input.dropoffAddress, 240),
      dropoffLat: Number(input.dropoffLat),
      dropoffLng: Number(input.dropoffLng),
      defaultCustomerName: clampStr(input.defaultCustomerName || '', 80),
      defaultNotes: clampStr(input.defaultNotes || '', 300),
    };

    if (existingId) {
      try {
        await updateDoc(doc(db, 'frequentRoutes', existingId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        showToast(`Ruta frecuente "${payload.name}" actualizada.`);
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.UPDATE,
          `frequentRoutes/${existingId}`
        );
        throw err;
      }
      return;
    }

    const id = `route_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      await setDoc(doc(db, 'frequentRoutes', id), {
        riderUid: user.uid,
        ...payload,
        usageCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`Ruta frecuente "${payload.name}" guardada.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `frequentRoutes/${id}`);
      throw err;
    }
  };

  const handleDeleteFrequentRoute = async (routeId: string) => {
    try {
      await deleteDoc(doc(db, 'frequentRoutes', routeId));
      showToast('Ruta frecuente eliminada.');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `frequentRoutes/${routeId}`
      );
    }
  };

  const handleUseFrequentRoute = (route: FrequentRoute) => {
    setSelectedFrequentRoute(route);
    setUrgentPreset(route.serviceType || 'super_expres');
    setUrgentModalOpen(true);
    if (effectiveOnlineRef.current) {
      void updateDoc(doc(db, 'frequentRoutes', route.id), {
        usageCount: increment(1),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  };

  const handleCreateBankTopup = async (
    input: CreateBankTopupInput
  ): Promise<QrTopup | null> => {
    if (!user || !currentRider) return null;
    const id = `top_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const referenceCode = `MM-BCO-${Date.now().toString().slice(-6)}`;
    const bankName = clampStr(input.bankName, 60);
    const accountHolder = clampStr(input.accountHolder, 100);
    const accountLast4 = clampStr(input.accountLast4.replace(/\D/g, '').slice(-4), 4);
    const transferReference = clampStr(input.transferReference, 64);
    const destinationBank = clampStr(input.destinationBank, 100);
    const qrPayload = `motomando://recarga-banco?ref=${referenceCode}&banco=${encodeURIComponent(
      bankName
    )}&rastreo=${encodeURIComponent(transferReference)}&monto=${input.amount.toFixed(2)}&moneda=${tariffs.currency}`;

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'topups', id), {
        uid: user.uid,
        riderName: currentRider.displayName,
        motoName: currentRider.motoName,
        amount: input.amount,
        referenceCode,
        qrPayload,
        method: 'bank_transfer',
        bankName,
        accountHolder,
        accountLast4,
        transferReference,
        destinationBank,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'notifications', `notif_bco_${Date.now()}`),
        {
          recipientUid: user.uid,
          title: `Recarga Bancaria Registrada (${referenceCode})`,
          body: `Transferencia desde ${bankName} •••• ${accountLast4} por ${formatCurrency(
            input.amount,
            tariffs.currency
          )} en validación.`,
          category: 'wallet',
          read: false,
          createdAt: serverTimestamp(),
        }
      );
      await batch.commit();
      showToast(
        `Transferencia ${referenceCode} (${bankName} •••• ${accountLast4}) registrada para validación.`
      );
      return {
        id,
        uid: user.uid,
        riderName: currentRider.displayName,
        motoName: currentRider.motoName,
        amount: input.amount,
        referenceCode,
        qrPayload,
        method: 'bank_transfer',
        bankName,
        accountHolder,
        accountLast4,
        transferReference,
        destinationBank,
        status: 'pending',
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `topups/${id}`);
      return null;
    }
  };

  const handleApproveTopup = async (topup: QrTopup) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'topups', topup.id), {
        status: 'approved',
        updatedAt: serverTimestamp(),
      });

      const targetWalletSnap = await getDoc(doc(db, 'wallets', topup.uid));
      if (targetWalletSnap.exists()) {
        batch.update(doc(db, 'wallets', topup.uid), {
          balance: increment(topup.amount),
          totalTopups: increment(topup.amount),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(doc(db, 'wallets', topup.uid), {
          uid: topup.uid,
          balance: topup.amount,
          totalTopups: topup.amount,
          totalEarned: 0,
          totalFeesDeducted: 0,
          freeTripsBalance: 0,
          freeTripsEarned: 0,
          freeTripsUsed: 0,
          xpPoints: 0,
          currentRank: 'bronce',
          claimedRewardIds: [],
          currency: tariffs.currency || 'MXN',
          updatedAt: serverTimestamp(),
        });
      }

      const methodTitle =
        topup.method === 'bank_transfer'
          ? `Recarga Bancaria Acreditada (${topup.referenceCode})`
          : `Recarga QR Acreditada (${topup.referenceCode})`;
      batch.set(
        doc(db, 'notifications', `notif_appqr_${Date.now()}`),
        {
          recipientUid: topup.uid,
          title: methodTitle,
          body: `Se abonaron ${formatCurrency(topup.amount, tariffs.currency)} a tu saldo operativo.`,
          category: 'wallet',
          read: false,
          createdAt: serverTimestamp(),
        }
      );

      await batch.commit();
      showToast(`Recarga ${topup.referenceCode} aprobada y acreditada.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `topups/${topup.id}`);
    }
  };

  const handleRejectTopup = async (topup: QrTopup) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'topups', topup.id), {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });
      const methodTitle =
        topup.method === 'bank_transfer'
          ? `Recarga Bancaria Rechazada (${topup.referenceCode})`
          : `Recarga QR Rechazada (${topup.referenceCode})`;
      batch.set(
        doc(db, 'notifications', `notif_rejqr_${Date.now()}`),
        {
          recipientUid: topup.uid,
          title: methodTitle,
          body: `La solicitud por ${formatCurrency(topup.amount, tariffs.currency)} fue rechazada por administración.`,
          category: 'wallet',
          read: false,
          createdAt: serverTimestamp(),
        }
      );
      await batch.commit();
      showToast(`Recarga ${topup.referenceCode} marcada como rechazada.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `topups/${topup.id}`);
    }
  };

  const handleSubmitDriverApplication = async (
    payload: DriverApplicationSubmitPayload
  ) => {
    if (!user || !currentRider) return;
    const age = calculateAgeFromIsoDate(payload.birthDate);
    if (age === null || age < MIN_DRIVER_AGE) {
      throw new Error(
        `Debes tener ${MIN_DRIVER_AGE} años o más para trabajar como conductor.`
      );
    }
    if (!payload.motoPhotoUrl) {
      throw new Error(
        'Debes subir una foto actualizada de tu motocicleta para la verificación.'
      );
    }

    try {
      const batch = writeBatch(db);
      const appRef = doc(db, 'driverApplications', user.uid);
      const riderRef = doc(db, 'riders', user.uid);
      const userRef = doc(db, 'users', user.uid);
      const notifRef = doc(db, 'notifications', `notif_drvapp_${Date.now()}`);

      batch.set(appRef, {
        uid: user.uid,
        applicantName: clampStr(currentRider.displayName, 80),
        motoName: clampStr(currentRider.motoName, 80),
        motoPlate: clampStr(currentRider.motoPlate, 24),
        departmentId: clampStr(currentRider.departmentId, 64),
        birthDate: payload.birthDate,
        birthDateMs: payload.birthDateMs,
        cedulaNumber: clampStr(payload.cedulaNumber, 40),
        licenseNumber: clampStr(payload.licenseNumber, 40),
        phone: clampStr(payload.phone, 32),
        exactAddress: clampStr(payload.exactAddress, 240),
        insuranceNumber: clampStr(payload.insuranceNumber, 60),
        circulationNumber: clampStr(payload.circulationNumber, 60),
        cedulaPhotoUrl: clampStr(payload.cedulaPhotoUrl || '', 120000),
        licensePhotoUrl: clampStr(payload.licensePhotoUrl || '', 120000),
        insurancePhotoUrl: clampStr(payload.insurancePhotoUrl || '', 120000),
        circulationPhotoUrl: clampStr(payload.circulationPhotoUrl || '', 120000),
        motoPhotoUrl: clampStr(payload.motoPhotoUrl, 120000),
        status: 'pending_review',
        reviewNote: '',
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.update(riderRef, {
        verificationStatus: 'pending_review',
        updatedAt: serverTimestamp(),
      });

      batch.update(userRef, {
        phone: clampStr(payload.phone, 32),
        birthDate: payload.birthDate,
        birthDateMs: payload.birthDateMs,
        updatedAt: serverTimestamp(),
      });

      batch.set(notifRef, {
        recipientUid: user.uid,
        title: 'Documentos y Foto de Moto Enviados · 12h',
        body: 'Recibimos tus documentos y la foto actualizada de tu moto. Confirmaremos tu aprobación en 12 horas.',
        category: 'system',
        read: false,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      showToast(
        'Documentos enviados. Espera 12 horas para confirmar la aprobación de tu solicitud.'
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `driverApplications/${user.uid}`
      );
      throw err;
    }
  };

  const handleApproveDriverApplication = async (
    app: DriverApplication,
    note?: string
  ) => {
    if (!user || !isAdminUser) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'driverApplications', app.uid), {
        status: 'approved',
        reviewNote: clampStr(
          note || 'Documentos y mayoría de edad (18+) verificados.',
          300
        ),
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'riders', app.uid), {
        verificationStatus: 'approved',
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'notifications', `notif_drvok_${Date.now()}`),
        {
          recipientUid: app.uid,
          title: 'Solicitud de Conductor Aprobada',
          body: `Tu unidad ${app.motoName} ya está habilitada para trabajar en Modo Conductor.`,
          category: 'system',
          read: false,
          createdAt: serverTimestamp(),
        }
      );
      await batch.commit();
      showToast(`Conductor ${app.applicantName} aprobado y habilitado.`);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `driverApplications/${app.uid}`
      );
    }
  };

  const handleRejectDriverApplication = async (
    app: DriverApplication,
    reason: string
  ) => {
    if (!user || !isAdminUser) return;
    const cleanReason = clampStr(
      reason || 'Documentos incompletos o ilegibles.',
      300
    );
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'driverApplications', app.uid), {
        status: 'rejected',
        reviewNote: cleanReason,
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'riders', app.uid), {
        verificationStatus: 'rejected',
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, 'notifications', `notif_drvno_${Date.now()}`),
        {
          recipientUid: app.uid,
          title: 'Solicitud de Conductor Requiere Corrección',
          body: cleanReason.slice(0, 220),
          category: 'system',
          read: false,
          createdAt: serverTimestamp(),
        }
      );
      await batch.commit();
      showToast(`Solicitud de ${app.applicantName} marcada para corrección.`);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `driverApplications/${app.uid}`
      );
    }
  };

  const handleSubmitRating = async (payload: {
    delivery: Delivery;
    score: number;
    comment: string;
  }) => {
    if (!user || !currentRider) return;
    const { delivery, score, comment } = payload;
    const riderUid = delivery.assignedRiderUid || currentRider.uid;
    const riderName = delivery.assignedRiderName || currentRider.displayName;
    const motoName = delivery.assignedMotoName || currentRider.motoName;
    const ratingId = `rat_${delivery.id}_${Date.now()}`;

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'ratings', ratingId), {
        deliveryId: delivery.id,
        riderUid,
        riderName,
        motoName,
        authorUid: user.uid,
        authorName: currentRider.displayName,
        score,
        comment: clampStr(comment, 300),
        departmentId: delivery.departmentId || 'dept_centro',
        createdAt: serverTimestamp(),
      });

      batch.update(doc(db, 'deliveries', delivery.id), {
        rated: true,
        updatedAt: serverTimestamp(),
      });

      if (isAdminUser && riderUid) {
        const existingRiderRatings = ratings.filter((r) => r.riderUid === riderUid);
        const prevCount = existingRiderRatings.length;
        const prevSum = existingRiderRatings.reduce((acc, r) => acc + r.score, 0);
        const newCount = prevCount + 1;
        const newAvg = Number(((prevSum + score) / newCount).toFixed(2));
        batch.update(doc(db, 'riders', riderUid), {
          rating: newAvg,
          ratingCount: newCount,
          updatedAt: serverTimestamp(),
        });
      }

      if (isAdminUser || riderUid === user.uid) {
        batch.set(
          doc(db, 'notifications', `notif_rat_${Date.now()}`),
          {
            recipientUid: riderUid,
            title: `Nueva Calificación: ${score} estrellas`,
            body: comment
              ? `"${clampStr(comment, 120)}" en ${delivery.title}`
              : `Entrega "${delivery.title}" evaluada con ${score}/5 estrellas.`,
            category: 'rating',
            read: false,
            createdAt: serverTimestamp(),
          }
        );
      }

      await batch.commit();
      showToast(`Calificación de ${score} estrellas registrada.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `ratings/${ratingId}`);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications');
    }
  };

  const handleCreateDepartment = async (
    dept: Omit<Department, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    const slug = dept.code.toLowerCase().replace(/[^a-z0-9]/g, '');
    const id = `dept_${slug}_${Date.now().toString().slice(-4)}`;
    try {
      await setDoc(doc(db, 'departments', id), {
        ...dept,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`Departamento ${dept.name} habilitado para operaciones.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `departments/${id}`);
    }
  };

  const handleToggleDepartmentActive = async (dept: Department) => {
    try {
      await updateDoc(doc(db, 'departments', dept.id), {
        active: !dept.active,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `departments/${dept.id}`);
    }
  };

  const handleCreateMerchant = async (
    merchant: Omit<Merchant, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    const id = `merch_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    try {
      await setDoc(doc(db, 'merchants', id), {
        ...merchant,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`Comercio "${merchant.name}" afiliado correctamente.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `merchants/${id}`);
    }
  };

  const handleToggleMerchantActive = async (merchant: Merchant) => {
    try {
      await updateDoc(doc(db, 'merchants', merchant.id), {
        active: !merchant.active,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `merchants/${merchant.id}`);
    }
  };

  const handleSeedDemoData = async () => {
    if (!user || !currentRider) return;
    const samples: Array<{
      id: string;
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
      distanceKm: number;
      status: DeliveryStatus;
      assigned: boolean;
    }> = [
      {
        id: `del_demo_1_${Date.now()}`,
        title: 'Súper Exprés Corporativo Reforma',
        serviceCategory: 'super_expres',
        serviceType: 'super_expres',
        isUrgent: true,
        departmentId: 'dept_centro',
        departmentName: 'Departamento Centro',
        merchantName: '',
        cashOnDelivery: 0,
        pickupAddress: 'Torre Reforma 222, Juárez',
        pickupLat: 19.4285,
        pickupLng: -99.1618,
        dropoffAddress: 'Av. Presidente Masaryk 214, Polanco',
        dropoffLat: 19.4319,
        dropoffLng: -99.1932,
        customerName: 'Despacho Jurídico Norte',
        distanceKm: 4.2,
        status: 'assigned',
        assigned: true,
      },
      {
        id: `del_demo_2_${Date.now()}`,
        title: 'Pedido FarmaExpress Roma',
        serviceCategory: 'comercio',
        serviceType: 'comercio_local',
        isUrgent: false,
        departmentId: 'dept_centro',
        departmentName: 'Departamento Centro',
        merchantName: 'FarmaExpress Roma',
        cashOnDelivery: 380,
        pickupAddress: 'Av. Álvaro Obregón 110, Roma Norte',
        pickupLat: 19.4182,
        pickupLng: -99.1595,
        dropoffAddress: 'Av. Insurgentes Sur 810, Del Valle',
        dropoffLat: 19.3895,
        dropoffLng: -99.1731,
        customerName: 'Clínica Médica Sur',
        distanceKm: 3.8,
        status: 'assigned',
        assigned: true,
      },
      {
        id: `del_demo_3_${Date.now()}`,
        title: 'Delivery Paquete Condesa',
        serviceCategory: 'delivery',
        serviceType: 'express_15',
        isUrgent: true,
        departmentId: 'dept_centro',
        departmentName: 'Departamento Centro',
        merchantName: '',
        cashOnDelivery: 0,
        pickupAddress: 'Parque México, Hipódromo Condesa',
        pickupLat: 19.4119,
        pickupLng: -99.1695,
        dropoffAddress: 'Centro Histórico · Madero 45',
        dropoffLat: 19.4337,
        dropoffLng: -99.1381,
        customerName: 'Studio Arte Urbano',
        distanceKm: 4.9,
        status: 'pending',
        assigned: false,
      },
      {
        id: `del_demo_4_${Date.now()}`,
        title: 'Café Tostaduría Reforma',
        serviceCategory: 'comercio',
        serviceType: 'comercio_local',
        isUrgent: false,
        departmentId: 'dept_occidente',
        departmentName: 'Departamento Occidente',
        merchantName: 'TecnoStore Chapultepec',
        cashOnDelivery: 0,
        pickupAddress: 'Av. Chapultepec Sur 240, Americana',
        pickupLat: 20.6712,
        pickupLng: -103.3685,
        dropoffAddress: 'Av. Vallarta 1520, Guadalajara',
        dropoffLat: 20.6749,
        dropoffLng: -103.3724,
        customerName: 'Estudio Occidente',
        distanceKm: 2.7,
        status: 'delivered',
        assigned: true,
      },
    ];

    try {
      const batch = writeBatch(db);
      samples.forEach((s, idx) => {
        const fare = calculateDeliveryFare(
          s.distanceKm,
          s.isUrgent,
          tariffs,
          1.0,
          s.serviceCategory
        );
        const delRef = doc(db, 'deliveries', s.id);
        batch.set(delRef, {
          createdByUid: user.uid,
          assignedRiderUid: s.assigned ? user.uid : '',
          assignedRiderName: s.assigned ? currentRider.displayName : '',
          assignedMotoName: s.assigned ? currentRider.motoName : '',
          title: s.title,
          serviceCategory: s.serviceCategory,
          serviceType: s.serviceType,
          isUrgent: s.isUrgent,
          departmentId: s.departmentId,
          departmentName: s.departmentName,
          merchantName: s.merchantName,
          cashOnDelivery: s.cashOnDelivery,
          pickupAddress: s.pickupAddress,
          pickupLat: s.pickupLat,
          pickupLng: s.pickupLng,
          dropoffAddress: s.dropoffAddress,
          dropoffLat: s.dropoffLat,
          dropoffLng: s.dropoffLng,
          customerName: s.customerName,
          notes: 'Entrega verificada con protocolo Moto Mandados',
          distanceKm: fare.distanceKm,
          estimatedMinutes: Math.round(s.distanceKm * 3.5) + 5,
          stopOrder: idx + 1,
          baseFare: fare.baseFare,
          distanceFare: fare.distanceFare,
          urgentSurcharge: fare.urgentSurcharge,
          totalFare: fare.totalFare,
          riderEarnings: fare.riderEarnings,
          platformFee: fare.platformFee,
          rated: false,
          status: s.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...(s.status === 'delivered' ? { deliveredAt: serverTimestamp() } : {}),
        });

        if (s.status === 'delivered') {
          const txRef = doc(db, 'transactions', `tx_demo_${idx}_${Date.now()}`);
          batch.set(txRef, {
            deliveryId: s.id,
            riderUid: user.uid,
            riderName: currentRider.displayName,
            motoName: currentRider.motoName,
            departmentId: s.departmentId,
            serviceCategory: s.serviceCategory,
            serviceType: s.serviceType,
            isUrgent: s.isUrgent,
            distanceKm: fare.distanceKm,
            baseFare: fare.baseFare,
            distanceFare: fare.distanceFare,
            urgentSurcharge: fare.urgentSurcharge,
            grossAmount: fare.totalFare,
            platformFee: fare.platformFee,
            riderNetAmount: fare.riderEarnings,
            status: 'completed',
            createdAt: serverTimestamp(),
          });
        }
      });

      await batch.commit();
      showToast('Rutas multidepartamentales y transacciones iniciales cargadas.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'deliveries');
    }
  };

  const navItems = useMemo(() => {
    const items: Array<{
      id: ActiveTab;
      label: string;
      shortLabel: string;
      icon: React.ReactNode;
    }> = [
      {
        id: 'rider',
        label: userMode === 'passenger' ? 'Modo Pasajero' : 'Modo Conductor',
        shortLabel: userMode === 'passenger' ? 'Viajes' : 'Consola',
        icon:
          userMode === 'passenger' ? (
            <UserIcon className="w-4 h-4 shrink-0" />
          ) : (
            <Bike className="w-4 h-4 shrink-0" />
          ),
      },
      ...(isAdminUser
        ? [
            {
              id: 'admin' as const,
              label: 'Monitoreo Admin',
              shortLabel: 'Admin',
              icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
            },
          ]
        : []),
      {
        id: 'wallet',
        label: 'Saldo, Bancos y QR',
        shortLabel: 'Saldo',
        icon: <QrCode className="w-4 h-4 shrink-0" />,
      },
      {
        id: 'finance',
        label: 'Finanzas y Tarifas',
        shortLabel: 'Finanzas',
        icon: <WalletIcon className="w-4 h-4 shrink-0" />,
      },
      {
        id: 'profile',
        label: 'Perfil y Reseñas',
        shortLabel: 'Perfil',
        icon: <UserIcon className="w-4 h-4 shrink-0" />,
      },
    ];
    return items;
  }, [isAdminUser, userMode]);

  const tabTitle: Record<ActiveTab, string> = {
    rider:
      userMode === 'passenger'
        ? 'Modo Pasajero / Cliente · Viajes y Precios Editables'
        : 'Modo Conductor · Panel Profesional del Motociclista',
    admin: 'Panel Administrativo Completo',
    wallet: 'Billetera, Cuentas Bancarias y Recargas QR',
    finance: 'Historial de Ganancias y Tarifas',
    profile: 'Perfil, Calificaciones y Alertas',
  };

  const quotaBanner = quotaExceeded && (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
      <span>
        Google Maps Platform quota reached. If you are the app owner, visit{' '}
        <a
          href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold text-amber-950 hover:text-amber-800"
        >
          maps developer site
        </a>{' '}
        for instructions to update your account.
      </span>
    </div>
  );

  let content: React.ReactNode;

  if (!authReady) {
    content = (
      <div className="min-h-screen bg-slate-50 dark-canvas flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <MotoLogoEmblem size={32} />
          <span>Iniciando Moto Mandados...</span>
        </div>
      </div>
    );
  } else if (!user) {
    content = (
      <AuthScreen
        onLoginGoogle={handleLoginGoogle}
        onLoginEmail={handleLoginEmail}
        onRegisterEmail={handleRegisterEmail}
        onResetPassword={handleResetPassword}
        pendingVerificationEmail={pendingVerificationEmail}
        onResendVerification={handleResendVerification}
        onCheckVerification={handleCheckVerification}
        onCancelVerification={handleCancelVerification}
        isLoggingIn={isLoggingIn}
        authError={authError}
        onClearError={() => setAuthError(null)}
      />
    );
  } else if (sessionLocked) {
    const hasPasswordProvider = user.providerData.some(
      (p) => p.providerId === 'password'
    );
    const hasGoogleProvider = user.providerData.some(
      (p) => p.providerId === 'google.com'
    );
    content = (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-orange-600" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-display text-xl font-bold text-slate-900">
              Sesión Bloqueada por Seguridad
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Moto Mandados protegió tu cuenta ({user.email}) tras inactividad o bloqueo manual. Valida tu identidad para continuar.
            </p>
          </div>

          {unlockError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 text-left">
              {unlockError}
            </div>
          )}

          <div className="space-y-3 pt-1">
            {hasPasswordProvider && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleUnlockSession('password');
                }}
                className="space-y-2.5 text-left"
              >
                <label
                  htmlFor="unlock-password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Contraseña de tu cuenta
                </label>
                <input
                  id="unlock-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="submit"
                  disabled={isUnlocking || !unlockPassword}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white py-2.5 text-sm font-semibold transition-colors cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {isUnlocking
                      ? 'Verificando contraseña...'
                      : 'Desbloquear con Contraseña'}
                  </span>
                </button>
              </form>
            )}

            {hasGoogleProvider && (
              <button
                type="button"
                disabled={isUnlocking}
                onClick={() => void handleUnlockSession('google')}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white py-2.5 text-sm font-semibold transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>
                  {isUnlocking
                    ? 'Verificando identidad...'
                    : 'Desbloquear con Google'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleSecureSignOut()}
              className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 py-2.5 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cerrar Sesión Segura y Limpiar Caché
            </button>
          </div>
        </div>
      </div>
    );
  } else if (!riderLoaded) {
    content = (
      <div className="min-h-screen bg-slate-50 dark-canvas flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <MotoLogoEmblem size={32} />
          <span>Cargando tu perfil de unidad...</span>
        </div>
      </div>
    );
  } else if (!currentRider) {
    content = (
      <OnboardingModal
        defaultName={user.displayName || 'Motociclista'}
        defaultPhotoUrl={user.photoURL || ''}
        departments={departments}
        onComplete={handleCompleteOnboarding}
        isSaving={savingOnboarding}
      />
    );
  } else {
    content = (
      <div className="min-h-screen bg-slate-50 dark-canvas flex flex-col lg:flex-row">
        {mobileNavOpen && (
          <div
            className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <aside
          className={`fixed lg:sticky top-0 left-0 z-40 h-dvh w-[85vw] max-w-[280px] lg:w-[264px] shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-200 ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="p-5 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <MotoLogoEmblem color={currentRider.motoColor} size={34} />
                <span className="font-display text-lg font-bold tracking-tight text-slate-900">
                  Moto Mandados
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Cerrar menú"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar
                    photoUrl={currentRider.photoUrl}
                    name={currentRider.displayName}
                    color={currentRider.motoColor}
                    size={40}
                    onEditClick={() => setPhotoModalOpen(true)}
                    editLabel="Cambiar foto de perfil"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {currentRider.displayName}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhotoModalOpen(true)}
                      className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                    >
                      Editar foto
                    </button>
                  </div>
                </div>
              </div>
              <MotoUnitIdentity
                motoName={currentRider.motoName}
                motoModel={currentRider.motoModel}
                motoPlate={currentRider.motoPlate}
                motoColor={currentRider.motoColor}
                compact
                showPhoto
              />
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                <span className="truncate">{currentRider.departmentName}</span>
                <span className="font-mono tabular-nums font-bold text-slate-900">
                  {formatCurrency(myWallet.balance, tariffs.currency)}
                </span>
              </div>
            </div>

            {/* Driver / Passenger Mode Switch */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500 px-1">
                Modo de Operación
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('driver')}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    userMode === 'driver'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Bike className="w-3.5 h-3.5 text-orange-600" />
                  <span>Conductor</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchMode('passenger')}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    userMode === 'passenger'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5 text-orange-600" />
                  <span>Pasajero</span>
                </button>
              </div>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setChatDrawerOpen(true);
                  setMobileNavOpen(false);
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 shrink-0 text-orange-600" />
                  <span>Chat Pasajero/Moto</span>
                </span>
                {messages.length > 0 && (
                  <span className="font-mono tabular-nums text-[11px] font-bold text-orange-600">
                    {messages.length}
                  </span>
                )}
              </button>
            </nav>

            {/* Quick-Access Service Vertical Buttons */}
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-[11px] font-semibold text-slate-500 px-1">
                Despacho Rápido por Vertical
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFrequentRoute(null);
                    setUrgentPreset('super_expres');
                    setUrgentModalOpen(true);
                    setMobileNavOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5" />
                    Súper Exprés
                  </span>
                  <span className="text-[10px] opacity-90">Inmediato</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFrequentRoute(null);
                    setUrgentPreset('comercio_local');
                    setUrgentModalOpen(true);
                    setMobileNavOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Store className="w-3.5 h-3.5 text-sky-600" />
                    Comercio Local
                  </span>
                  <span className="text-[10px] text-slate-500">Tiendas</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFrequentRoute(null);
                    setUrgentPreset('standard');
                    setUrgentModalOpen(true);
                    setMobileNavOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-slate-600" />
                    Delivery Urbano
                  </span>
                  <span className="text-[10px] text-slate-500">Ruta</span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-slate-200 space-y-2">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => {
                setSessionLocked(true);
                setMobileNavOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span>Bloquear Pantalla</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSecureSignOut()}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Cerrar Sesión Segura</span>
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
                aria-label="Abrir navegación"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
                <span className="text-slate-400 hidden sm:inline">Moto Mandados</span>
                <span className="text-slate-300 hidden sm:inline">/</span>
                <h1 className="font-display font-bold text-slate-900 truncate">
                  {tabTitle[activeTab]}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <PWAInstallButton
                variant="compact"
                className="hidden md:inline-flex"
              />
              <div className="hidden md:flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedDepartmentId}
                  onChange={(e) => setSelectedDepartmentId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
                  aria-label="Seleccionar departamento"
                >
                  <option value="all">Todos los Deptos</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={toggleTheme}
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                aria-label={
                  theme === 'dark'
                    ? 'Cambiar a tema claro'
                    : 'Cambiar a modo oscuro nocturno'
                }
                title={
                  theme === 'dark'
                    ? 'Tema claro'
                    : 'Modo oscuro para entregas nocturnas'
                }
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-700" />
                )}
                <span className="hidden xl:inline">
                  {theme === 'dark' ? 'Claro' : 'Nocturno'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setChatDrawerOpen(true)}
                className="relative min-h-[40px] min-w-[40px] inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                aria-label="Abrir chat"
              >
                <MessageSquare className="w-4 h-4 text-orange-600" />
                <span className="hidden sm:inline">Chat</span>
                {messages.length > 0 && (
                  <span className="font-mono tabular-nums text-[11px] font-bold text-orange-600">
                    ({messages.length})
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setNotifDrawerOpen(true)}
                className="relative min-h-[40px] min-w-[40px] inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                aria-label="Notificaciones"
              >
                <Bell className="w-4 h-4 text-orange-600" />
                <span className="hidden sm:inline">Alertas</span>
                {unreadNotifsCount > 0 && (
                  <span className="font-mono tabular-nums text-[11px] font-bold text-orange-600">
                    ({unreadNotifsCount})
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedFrequentRoute(null);
                  setUrgentPreset(
                    userMode === 'passenger' ? 'pasajero_moto' : 'super_expres'
                  );
                  setUrgentModalOpen(true);
                }}
                className="min-h-[40px] inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Zap className="w-3.5 h-3.5" />
                <span className="sm:hidden">
                  {userMode === 'passenger' ? 'Pedir' : 'Exprés'}
                </span>
                <span className="hidden sm:inline">
                  {userMode === 'passenger' ? 'Pedir Moto' : 'Súper Exprés'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPhotoModalOpen(true)}
                className="inline-flex items-center gap-2 p-1 xl:pl-1.5 xl:pr-2.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                title="Cambiar foto de perfil"
                aria-label="Cambiar foto de perfil"
              >
                <UserAvatar
                  photoUrl={currentRider.photoUrl}
                  name={currentRider.displayName}
                  color={currentRider.motoColor}
                  size={28}
                />
                <span className="hidden xl:inline max-w-[110px] truncate">
                  {currentRider.displayName.split(' ')[0]}
                </span>
              </button>
            </div>
          </header>

          {/* Compact mobile department switcher */}
          {activeTab === 'rider' && (
            <div className="md:hidden bg-white border-b border-slate-200 px-3.5 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 shrink-0">
                <Globe className="w-3.5 h-3.5 text-orange-600" />
                <span>Zona:</span>
              </div>
              <select
                value={selectedDepartmentId}
                onChange={(e) => setSelectedDepartmentId(e.target.value)}
                className="flex-1 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800"
                aria-label="Seleccionar departamento móvil"
              >
                <option value="all">Todos los Departamentos</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(!effectiveOnline || offlineQueue.length > 0) && (
            <div
              className={`mx-3.5 sm:mx-6 mt-3 sm:mt-4 px-3.5 sm:px-4 py-2.5 rounded-xl border text-xs font-medium flex flex-wrap items-center justify-between gap-3 ${
                !effectiveOnline
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-950'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {!effectiveOnline ? (
                  <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
                ) : (
                  <RefreshCw
                    className={`w-4 h-4 text-emerald-700 shrink-0 ${
                      isSyncingOffline ? 'animate-spin' : ''
                    }`}
                  />
                )}
                <HardDrive className="w-3.5 h-3.5 opacity-70 shrink-0 hidden sm:block" />
                <span className="truncate">
                  {!effectiveOnline
                    ? `Modo sin conexión activo · Ubicación GPS y entregas resguardadas en IndexedDB (${offlineQueue.length} pendiente${
                        offlineQueue.length === 1 ? '' : 's'
                      }).`
                    : isSyncingOffline
                    ? `Sincronizando ${offlineQueue.length} operación(es) guardadas en IndexedDB...`
                    : `${offlineQueue.length} operación(es) locales listas para sincronizarse con Firestore.`}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {simulatedOffline && browserOnline && (
                  <button
                    type="button"
                    onClick={() => setSimulatedOffline(false)}
                    className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Reconectar Red
                  </button>
                )}
                {effectiveOnline && offlineQueue.length > 0 && (
                  <button
                    type="button"
                    disabled={isSyncingOffline}
                    onClick={() => void flushOfflineQueue()}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {isSyncingOffline ? 'Sincronizando...' : 'Sincronizar ahora'}
                  </button>
                )}
              </div>
            </div>
          )}

          {toastMessage && (
            <div className="mx-3.5 sm:mx-6 mt-3 sm:mt-4 px-3.5 sm:px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium flex items-center justify-between gap-2">
              <span>{toastMessage}</span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="text-slate-400 hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <main className="flex-1 p-3.5 sm:p-6 pb-24 lg:pb-6 max-w-[1440px] w-full mx-auto">
            {activeTab === 'rider' &&
              (userMode === 'passenger' ? (
                <PassengerConsole
                  currentUser={currentRider}
                  allRiders={allRiders}
                  deliveries={deliveries}
                  tariffs={tariffs}
                  departments={departments}
                  merchants={merchants}
                  messages={messages}
                  selectedDepartmentId={selectedDepartmentId}
                  onSelectDepartment={setSelectedDepartmentId}
                  onDispatch={handleDispatchDelivery}
                  onUpdateDeliveryFare={handleUpdateDeliveryFare}
                  onOpenChat={handleOpenChat}
                  onRateDelivery={(del) => setRatingTarget(del)}
                  onConfirmAssignedDriver={handleConfirmAssignedDriver}
                  onRejectAssignedDriver={handleRejectAssignedDriver}
                />
              ) : !isDriverApproved ? (
                <DriverVerificationGate
                  currentRider={currentRider}
                  privateInfo={privateInfo}
                  departments={departments}
                  application={myDriverApplication}
                  onSubmitApplication={handleSubmitDriverApplication}
                  onSwitchToPassenger={() => handleSwitchMode('passenger')}
                />
              ) : (
                <RiderConsole
                  currentRider={currentRider}
                  allRiders={allRiders}
                  deliveries={deliveries}
                  tariffs={tariffs}
                  wallet={myWallet}
                  departments={departments}
                  merchants={merchants}
                  selectedDepartmentId={selectedDepartmentId}
                  onSelectDepartment={setSelectedDepartmentId}
                  onUpdateRiderStatus={handleUpdateRiderStatus}
                  onUpdateRiderLocation={handleUpdateRiderLocation}
                  onClaimDelivery={handleClaimDelivery}
                  onAdvanceDeliveryStatus={handleAdvanceDeliveryStatus}
                  onApplyOptimizedOrder={handleApplyOptimizedOrder}
                  onOpenUrgentModal={() => {
                    setSelectedFrequentRoute(null);
                    setUrgentPreset('super_expres');
                    setUrgentModalOpen(true);
                  }}
                  onRateDelivery={(del) => setRatingTarget(del)}
                  messages={messages}
                  onOpenChat={handleOpenChat}
                  onUpdateDeliveryFare={handleUpdateDeliveryFare}
                  isOffline={!effectiveOnline}
                  simulatedOffline={simulatedOffline}
                  onToggleSimulatedOffline={() => {
                    setSimulatedOffline((prev) => {
                      const next = !prev;
                      if (next) {
                        showToast(
                          'Modo sin conexión activado · Cambios locales en IndexedDB.'
                        );
                      }
                      return next;
                    });
                  }}
                  pushPermission={pushPermission}
                  pushSubscribed={pushSubscribed}
                  onEnablePush={handleEnablePush}
                  onTestPush={handleTestPush}
                  frequentRoutes={frequentRoutes}
                  onSaveFrequentRoute={handleSaveFrequentRoute}
                  onDeleteFrequentRoute={handleDeleteFrequentRoute}
                  onUseFrequentRoute={handleUseFrequentRoute}
                  driverApplication={myDriverApplication}
                  onClaimReward={handleClaimReward}
                  onOpenAchievements={() => setActiveTab('profile')}
                  onReleaseDelivery={handleReleaseDelivery}
                />
              ))}

            {activeTab === 'admin' && isAdminUser && (
              <AdminDashboard
                riders={allRiders}
                deliveries={deliveries}
                transactions={transactions}
                tariffs={tariffs}
                departments={departments}
                merchants={merchants}
                wallets={wallets}
                topups={topups}
                ratings={ratings}
                driverApplications={driverApplications}
                onAssignDelivery={handleAssignDelivery}
                onSaveTariffs={handleSaveTariffs}
                onApproveTopup={handleApproveTopup}
                onRejectTopup={handleRejectTopup}
                onApproveDriverApplication={handleApproveDriverApplication}
                onRejectDriverApplication={handleRejectDriverApplication}
                onCreateDepartment={handleCreateDepartment}
                onToggleDepartmentActive={handleToggleDepartmentActive}
                onCreateMerchant={handleCreateMerchant}
                onToggleMerchantActive={handleToggleMerchantActive}
                onSeedDemoData={handleSeedDemoData}
              />
            )}

            {activeTab === 'wallet' && (
              <WalletQrPanel
                wallet={myWallet}
                topups={topups}
                bankAccounts={bankAccounts}
                currentRider={currentRider}
                tariffs={tariffs}
                isAdminUser={isAdminUser}
                onCreateTopup={handleCreateTopup}
                onCreateBankTopup={handleCreateBankTopup}
                onAddBankAccount={handleAddBankAccount}
                onDeleteBankAccount={handleDeleteBankAccount}
                onApproveTopup={handleApproveTopup}
                onRejectTopup={handleRejectTopup}
              />
            )}

            {activeTab === 'finance' && (
              <FinancePanel
                transactions={transactions}
                tariffs={tariffs}
                departments={departments}
                currentRiderUid={currentRider.uid}
                isAdminView={isAdminUser}
              />
            )}

            {activeTab === 'profile' && (
              <ProfilePanel
                rider={currentRider}
                googlePhotoUrl={user.photoURL || ''}
                privateInfo={privateInfo}
                driverApplication={myDriverApplication}
                deliveries={deliveries}
                tariffs={tariffs}
                departments={departments}
                ratings={ratings}
                onSaveProfile={handleSaveProfile}
                onUpdatePhoto={handleUpdateProfilePhoto}
                onOpenDriverVerification={() => handleSwitchMode('driver')}
                onUpdateNotifications={handleUpdateNotifications}
                onTriggerDailyEarningsSummary={() => dispatchDailyEarningsSummary(true)}
                onRateDelivery={(del) => setRatingTarget(del)}
                pushPermission={pushPermission}
                pushSubscribed={pushSubscribed}
                dailySummaryText={todayEarningsStats.summaryText}
                onEnablePush={handleEnablePush}
                onDisablePush={handleDisablePush}
                onRefreshPush={handleRefreshPush}
                onTestPush={handleTestPush}
                autoLockMinutes={autoLockMinutes}
                onChangeAutoLockMinutes={handleChangeAutoLockMinutes}
                onLockNow={() => setSessionLocked(true)}
                lastSignInTime={user.metadata?.lastSignInTime || undefined}
                theme={theme}
                onChangeTheme={handleChangeTheme}
                wallet={myWallet}
                onClaimReward={handleClaimReward}
              />
            )}
          </main>

          {/* Mobile Sticky Bottom Navigation Bar */}
          <nav
            aria-label="Navegación móvil"
            className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xs border-t border-slate-200 pb-safe"
          >
            <div
              className={`grid ${
                navItems.length === 5 ? 'grid-cols-5' : 'grid-cols-4'
              }`}
            >
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`min-h-[52px] flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'text-orange-600'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {item.icon}
                    <span className="truncate max-w-full">{item.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>

        <UrgentDispatchModal
          isOpen={urgentModalOpen}
          initialServiceType={urgentPreset}
          initialRoute={selectedFrequentRoute}
          frequentRoutes={frequentRoutes}
          tariffs={tariffs}
          departments={departments}
          merchants={merchants}
          defaultDepartmentId={currentRider.departmentId}
          riderLocation={{ lat: currentRider.lat, lng: currentRider.lng }}
          onClose={() => {
            setUrgentModalOpen(false);
            setSelectedFrequentRoute(null);
          }}
          onSaveAsFrequentRoute={handleSaveFrequentRoute}
          onDispatch={handleDispatchDelivery}
        />

        <NotificationsDrawer
          isOpen={notifDrawerOpen}
          notifications={notifications}
          pushPermission={pushPermission}
          pushSubscribed={pushSubscribed}
          onEnablePush={handleEnablePush}
          onTestPush={handleTestPush}
          onClose={() => setNotifDrawerOpen(false)}
          onMarkRead={handleMarkNotificationRead}
          onMarkAllRead={handleMarkAllNotificationsRead}
        />

        <RatingModal
          delivery={ratingTarget}
          onClose={() => setRatingTarget(null)}
          onSubmit={handleSubmitRating}
        />

        <ChatDrawer
          isOpen={chatDrawerOpen}
          initialTarget={chatTarget}
          currentUid={currentRider.uid}
          currentName={currentRider.displayName}
          userMode={userMode}
          deliveries={deliveries}
          riders={allRiders}
          messages={messages}
          tariffs={tariffs}
          onClose={() => setChatDrawerOpen(false)}
          onSendMessage={handleSendMessage}
          onUpdateDeliveryFare={handleUpdateDeliveryFare}
        />

        <ProfilePhotoModal
          isOpen={photoModalOpen}
          currentPhotoUrl={currentRider.photoUrl || ''}
          googlePhotoUrl={user.photoURL || ''}
          displayName={currentRider.displayName}
          accentColor={currentRider.motoColor}
          onClose={() => setPhotoModalOpen(false)}
          onSavePhoto={handleUpdateProfilePhoto}
        />
      </div>
    );
  }

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme: handleChangeTheme, toggleTheme }}
    >
      {quotaBanner}
      <MapsConfiguredContext.Provider value={Boolean(mapsApiKey)}>
        {mapsApiKey ? (
          <APIProvider
            apiKey={mapsApiKey}
            libraries={['places', 'routes', 'geometry', 'marker']}
            language="es"
            region="MX"
          >
            {content}
          </APIProvider>
        ) : (
          content
        )}
      </MapsConfiguredContext.Provider>
    </ThemeContext.Provider>
  );
}
