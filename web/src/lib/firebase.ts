// =============================================================================
// Firebase Configuration
// =============================================================================

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';

// Firebase configuration from environment
const firebaseConfig = JSON.parse(
  process.env.NEXT_PUBLIC_FIREBASE_CONFIG || '{}'
);

// Initialize Firebase (singleton pattern)
let app: FirebaseApp;
let auth: Auth;

if (typeof window !== 'undefined') {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
}

// -----------------------------------------------------------------------------
// Auth Functions
// -----------------------------------------------------------------------------

export async function signIn(email: string, password: string): Promise<User> {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function getIdToken(): Promise<string | null> {
  // Wait for auth to be ready if not yet initialized
  if (!auth?.currentUser) {
    // Wait up to 3 seconds for auth state to be restored
    await new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve();
      });
      // Timeout after 3s
      setTimeout(() => resolve(), 3000);
    });
  }

  const user = auth?.currentUser;
  if (!user) {
    console.log('getIdToken: No user found');
    return null;
  }

  const token = await user.getIdToken();
  console.log('getIdToken: Got token', token ? 'yes' : 'no');
  return token;
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

// Export auth instance for direct access if needed
export { auth };
