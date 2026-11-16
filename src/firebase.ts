import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const ADMIN_EMAIL = 'normanescobar804@gmail.com';

export type SessionPersistenceMode = 'local' | 'session';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    // Permission denied on test/connection still confirms online connectivity
    return true;
  }
}

export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Correo electrónico o contraseña incorrectos. Verifica tus datos e intenta de nuevo.';
  }
  if (code === 'auth/invalid-email') {
    return 'El formato del correo electrónico no es válido.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Este correo electrónico ya está registrado. Inicia sesión o recupera tu contraseña.';
  }
  if (code === 'auth/weak-password') {
    return 'La contraseña es demasiado débil. Usa al menos 8 caracteres con letras y números.';
  }
  if (code === 'auth/missing-password') {
    return 'Ingresa tu contraseña para continuar.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'El acceso con correo y contraseña debe estar habilitado en Firebase Authentication.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Por seguridad, vuelve a confirmar tu contraseña para continuar.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Cancelaste la ventana de verificación segura antes de completar el acceso.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Tu navegador bloqueó la ventana emergente de acceso seguro. Permite ventanas emergentes e intenta nuevamente.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Error de red al conectar con el servidor de autenticación. Verifica tu conexión.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Demasiados intentos recientes. Por seguridad, espera unos minutos antes de volver a intentarlo.';
  }
  if (code === 'auth/user-disabled') {
    return 'Esta cuenta ha sido deshabilitada por seguridad. Contacta al administrador.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Este dominio no está autorizado en Firebase Authentication.';
  }
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la autenticación segura.';
}

async function applyAuthPersistence(
  persistenceMode: SessionPersistenceMode = 'local'
) {
  await setPersistence(
    auth,
    persistenceMode === 'session'
      ? browserSessionPersistence
      : browserLocalPersistence
  );
}

export async function signInWithGoogle(
  persistenceMode: SessionPersistenceMode = 'local'
) {
  await applyAuthPersistence(persistenceMode);
  const credential = await signInWithPopup(auth, googleProvider);
  if (!credential.user.emailVerified) {
    await sendEmailVerification(credential.user).catch(() => {});
  }
  return credential;
}

export async function signInWithEmailPassword(
  email: string,
  password: string,
  persistenceMode: SessionPersistenceMode = 'local'
) {
  await applyAuthPersistence(persistenceMode);
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );
  return credential;
}

export async function registerWithEmailPassword(
  fullName: string,
  email: string,
  password: string,
  persistenceMode: SessionPersistenceMode = 'local'
) {
  await applyAuthPersistence(persistenceMode);
  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );
  const cleanName = fullName.trim().slice(0, 80);
  if (cleanName) {
    await updateProfile(credential.user, { displayName: cleanName }).catch(
      () => {}
    );
  }
  await sendEmailVerification(credential.user);
  return credential;
}

export async function resendVerificationEmail() {
  if (!auth.currentUser) {
    throw new Error('No hay una cuenta pendiente de verificación.');
  }
  await sendEmailVerification(auth.currentUser);
}

export async function checkEmailVerificationStatus(): Promise<boolean> {
  if (!auth.currentUser) {
    throw new Error('No hay una sesión pendiente para comprobar.');
  }
  await auth.currentUser.reload();
  if (auth.currentUser.emailVerified) {
    await auth.currentUser.getIdToken(true);
    return true;
  }
  return false;
}

export async function sendPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function reauthenticateCurrentUser() {
  if (!auth.currentUser) {
    throw new Error('No hay sesión activa para re-autenticar.');
  }
  const credential = await reauthenticateWithPopup(
    auth.currentUser,
    googleProvider
  );
  if (!credential.user.emailVerified) {
    await signOut(auth);
    throw new Error('Correo electrónico no verificado.');
  }
  return credential;
}

export async function reauthenticateWithPassword(password: string) {
  if (!auth.currentUser || !auth.currentUser.email) {
    throw new Error('No hay sesión activa para validar contraseña.');
  }
  const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
  return reauthenticateWithCredential(auth.currentUser, cred);
}

export async function signOutUser() {
  return signOut(auth);
}

