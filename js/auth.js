import {
  auth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  isFirebaseConfigured
} from './firebase-config.js';

let deniedHandler = null;

// scheduler.js/db.js call this whenever a Firestore call comes back `permission-denied`.
// Per CLAUDE.md, that error means "authenticated but not on the allowlist" - the client never
// reads the allowlist collection directly (it's unreadable by rule), so this is the only signal.
export function onAccessDenied(handler) {
  deniedHandler = handler;
}

export function reportPossibleAccessDenied(error) {
  if (error && error.code === 'permission-denied' && deniedHandler) {
    deniedHandler();
  }
}

export function requireFirebaseConfigured() {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured yet. Fill in js/firebase-config.js with your project values (see CLAUDE.md "One-time manual setup").'
    );
  }
}

export async function login(email, password) {
  requireFirebaseConfigured();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logout() {
  await firebaseSignOut(auth);
}

export function watchAuthState(onSignedIn, onSignedOut) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      onSignedIn(user);
    } else {
      onSignedOut();
    }
  });
}

export function currentUser() {
  return auth.currentUser;
}
