export type UserRole = 'rider' | 'admin';

export type UserMode = 'driver' | 'passenger';

export type RiderStatus = 'available' | 'on_route' | 'offline';

export type ServiceCategory = 'delivery' | 'comercio' | 'super_expres' | 'pasajero';

export type ServiceType =
  | 'standard'
  | 'express_15'
  | 'priority_pkg'
  | 'urgent_docs'
  | 'medical'
  | 'comercio_local'
  | 'super_expres'
  | 'pasajero_moto';

export type DeliveryStatus =
  | 'pending'
  | 'assigned'
  | 'en_route'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

export interface Department {
  id: string;
  name: string;
  code: string;
  centerLat: number;
  centerLng: number;
  zoom: number;
  baseFareMultiplier: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Merchant {
  id: string;
  name: string;
  category: string;
  departmentId: string;
  departmentName: string;
  address: string;
  lat: number;
  lng: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DriverVerificationStatus =
  | 'unsubmitted'
  | 'pending_review'
  | 'approved'
  | 'rejected';

export interface RiderProfile {
  uid: string;
  displayName: string;
  photoUrl?: string;
  motoName: string;
  motoModel: string;
  motoPlate: string;
  motoColor: string;
  departmentId: string;
  departmentName: string;
  role: UserRole;
  status: RiderStatus;
  verificationStatus?: DriverVerificationStatus;
  completedCount: number;
  onTimeRate: number;
  totalKm: number;
  rating: number;
  ratingCount: number;
  lat: number;
  lng: number;
  heading: number;
  speedKmh: number;
  locationUpdatedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ThemePreference = 'light' | 'dark';

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phone: string;
  birthDate?: string;
  birthDateMs?: number;
  notifUrgent: boolean;
  notifRouteRecalc: boolean;
  notifDailyEarnings: boolean;
  notifGpsProximity: boolean;
  notifSound: boolean;
  dailyEarningsTime?: string;
  themePreference?: ThemePreference;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DriverApplication {
  uid: string;
  applicantName: string;
  motoName: string;
  motoPlate: string;
  departmentId: string;
  birthDate: string;
  birthDateMs: number;
  cedulaNumber: string;
  licenseNumber: string;
  phone: string;
  exactAddress: string;
  insuranceNumber: string;
  circulationNumber: string;
  cedulaPhotoUrl?: string;
  licensePhotoUrl?: string;
  insurancePhotoUrl?: string;
  circulationPhotoUrl?: string;
  motoPhotoUrl?: string;
  status: 'pending_review' | 'approved' | 'rejected';
  reviewNote: string;
  submittedAt?: unknown;
  reviewedAt?: unknown;
  reviewedBy?: string;
  updatedAt?: unknown;
}

export interface TariffSettings {
  baseFare: number;
  perKmRate: number;
  urgentMultiplier: number;
  expressFixedSurcharge: number;
  platformFeePct: number;
  currency: string;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface Delivery {
  id: string;
  createdByUid: string;
  assignedRiderUid: string;
  assignedRiderName: string;
  assignedMotoName: string;
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
  stopOrder: number;
  baseFare: number;
  distanceFare: number;
  urgentSurcharge: number;
  suggestedFare?: number;
  customFareEdited?: boolean;
  totalFare: number;
  riderEarnings: number;
  platformFee: number;
  usedFreeTrip?: boolean;
  preferredRiderUid?: string;
  preferredRiderName?: string;
  passengerAccepted?: boolean;
  declinedRiderUids?: string[];
  rated: boolean;
  status: DeliveryStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
  deliveredAt?: unknown;
}

export interface Transaction {
  id: string;
  deliveryId: string;
  riderUid: string;
  riderName: string;
  motoName: string;
  departmentId: string;
  serviceCategory: ServiceCategory;
  serviceType: ServiceType;
  isUrgent: boolean;
  distanceKm: number;
  baseFare: number;
  distanceFare: number;
  urgentSurcharge: number;
  grossAmount: number;
  platformFee: number;
  riderNetAmount: number;
  usedFreeTrip?: boolean;
  feeRatePct?: number;
  status: 'completed' | 'settled';
  createdAt?: unknown;
}

export type DriverRankId =
  | 'bronce'
  | 'plata'
  | 'oro'
  | 'platino'
  | 'diamante'
  | 'maestro'
  | 'gran_maestro';

export interface Wallet {
  uid: string;
  balance: number;
  totalTopups: number;
  totalEarned: number;
  totalFeesDeducted?: number;
  freeTripsBalance?: number;
  freeTripsEarned?: number;
  freeTripsUsed?: number;
  xpPoints?: number;
  currentRank?: DriverRankId;
  claimedRewardIds?: string[];
  currency: string;
  updatedAt?: unknown;
}

export type TopupMethod = 'qr' | 'bank_transfer';

export interface QrTopup {
  id: string;
  uid: string;
  riderName: string;
  motoName: string;
  amount: number;
  referenceCode: string;
  qrPayload: string;
  method?: TopupMethod;
  bankName?: string;
  accountHolder?: string;
  accountLast4?: string;
  transferReference?: string;
  destinationBank?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type BankAccountType =
  | 'ahorro'
  | 'corriente'
  | 'debito'
  | 'cheques'
  | 'clabe';

export interface BankAccount {
  id: string;
  uid: string;
  alias: string;
  bankName: string;
  accountHolder: string;
  accountType: BankAccountType;
  last4: string;
  clabeMasked: string;
  isDefault: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DeliveryRating {
  id: string;
  deliveryId: string;
  riderUid: string;
  riderName: string;
  motoName: string;
  authorUid: string;
  authorName: string;
  score: number;
  comment: string;
  departmentId: string;
  createdAt?: unknown;
}

export interface AppNotification {
  id: string;
  recipientUid: string;
  title: string;
  body: string;
  category: 'urgent' | 'route' | 'wallet' | 'rating' | 'system';
  read: boolean;
  createdAt?: unknown;
}

export interface OptimizedRouteState {
  encodedPolyline: string;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  orderedDeliveryIds: string[];
  legDetails: Array<{
    distanceMeters: number;
    durationSeconds: number;
  }>;
  computedAt: number;
}

export interface ChatMessage {
  id: string;
  deliveryId: string;
  deliveryOwnerUid: string;
  senderUid: string;
  senderName: string;
  senderRole: 'passenger' | 'driver' | 'admin';
  recipientUid: string;
  text: string;
  createdAt?: unknown;
}

export interface FrequentRoute {
  id: string;
  riderUid: string;
  name: string;
  serviceCategory: ServiceCategory;
  serviceType: ServiceType;
  departmentId: string;
  departmentName: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  defaultCustomerName: string;
  defaultNotes: string;
  usageCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FrequentRouteInput {
  name: string;
  serviceCategory: ServiceCategory;
  serviceType: ServiceType;
  departmentId: string;
  departmentName: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  defaultCustomerName: string;
  defaultNotes: string;
}

