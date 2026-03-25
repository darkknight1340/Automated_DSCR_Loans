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
  // Check if auth is initialized
  if (typeof window === 'undefined' || !auth) {
    return null;
  }

  // If we have a current user, get their token
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }

  // Wait for auth state to be restored (happens on page refresh)
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        const token = await user.getIdToken();
        resolve(token);
      } else {
        resolve(null);
      }
    });
    // Timeout after 5s
    setTimeout(() => resolve(null), 5000);
  });
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

// Export auth instance for direct access if needed
export { auth };
