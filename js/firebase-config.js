// Firebase is loaded from a pinned CDN version so a Firebase release can never silently
// break this app. Bump FIREBASE_SDK_VERSION deliberately (and test) if you ever upgrade.
const FIREBASE_SDK_VERSION = '10.14.1';
const sdk = (name) => `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/${name}.js`;

const { initializeApp } = await import(sdk('firebase-app'));

const {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} = await import(sdk('firebase-auth'));

const {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment
} = await import(sdk('firebase-firestore'));

// This config is NOT a secret - it identifies your Firebase project the same way a public
// URL does. The actual security boundary is Firestore Security Rules + the allowlist
// collection (see CLAUDE.md). Fill these in from Firebase Console -> Project settings -> Web app.
const firebaseConfig = {
  apiKey: 'REPLACE_WITH_YOUR_API_KEY',
  authDomain: 'REPLACE_WITH_YOUR_PROJECT.firebaseapp.com',
  projectId: 'REPLACE_WITH_YOUR_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_YOUR_PROJECT.appspot.com',
  messagingSenderId: 'REPLACE_WITH_YOUR_SENDER_ID',
  appId: 'REPLACE_WITH_YOUR_APP_ID'
};

export const isFirebaseConfigured = () =>
  !Object.values(firebaseConfig).some((value) => String(value).startsWith('REPLACE_WITH_'));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Could not set auth persistence:', err);
});

export {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment
};
