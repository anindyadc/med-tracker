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
  apiKey: 'AIzaSyAlrJ0DlgQRSKlBeqZkhVF59F5QT4ga884',
  authDomain: 'med-tracker-19b39.firebaseapp.com',
  projectId: 'med-tracker-19b39',
  storageBucket: 'med-tracker-19b39.firebasestorage.app',
  messagingSenderId: '413661836147',
  appId: '1:413661836147:web:c4b9f9e3ac66df5b884b06'
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
