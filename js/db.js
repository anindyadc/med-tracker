import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  Timestamp
} from './firebase-config.js';
import { reportPossibleAccessDenied } from './auth.js';
import { scheduledDateTime } from './date-utils.js';
import { remainingAt, baselineAt, stockInInstant } from './inventory.js';

const MEDICATIONS = 'medications';
const SETTINGS = 'settings';

function wrap(promise) {
  return promise.catch((err) => {
    reportPossibleAccessDenied(err);
    throw err;
  });
}

// ---------- Medications ----------

export async function listMedications({ includeInactive = false } = {}) {
  const snap = await wrap(getDocs(collection(db, MEDICATIONS)));
  const meds = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return includeInactive ? meds : meds.filter((m) => m.active !== false);
}

export async function getMedication(id) {
  const snap = await wrap(getDoc(doc(db, MEDICATIONS, id)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Stock model (see CLAUDE.md): `inventory.count` is the quantity on hand as of
// `inventory.countedAt`; remaining stock is derived from the schedule in inventory.js. Every
// write that changes the count, schedule, or active flag rebases so past consumption is kept.

// `dateStr` is a local YYYY-MM-DD from a date input; stored as local midnight. Falls back to now.
export function restockTimestamp(dateStr) {
  return dateStr ? Timestamp.fromDate(scheduledDateTime(dateStr, '00:00')) : serverTimestamp();
}

export async function createMedication(data, uid) {
  const ref = doc(collection(db, MEDICATIONS));
  const count = Number(data.inventory?.count) || 0;
  const payload = {
    name: data.name,
    strength: data.strength || '',
    form: data.form || 'tablet',
    doctor: data.doctor || '',
    instructions: data.instructions || '',
    prescriptionNumber: data.prescriptionNumber || '',
    pharmacy: data.pharmacy || '',
    refillReminderThreshold: Number(data.refillReminderThreshold) || 7,
    schedule: data.schedule || [],
    inventory: {
      count,
      countedAt: Timestamp.fromDate(stockInInstant(data.inventory?.lastRestockDate)),
      unit: data.inventory?.unit || 'pill',
      lastRestockDate: restockTimestamp(data.inventory?.lastRestockDate),
      lastRestockAmount: count
    },
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid
  };
  await wrap(setDoc(ref, payload));
  return ref.id;
}

// `stock` (optional) = { count, date } entered by the caregiver: "`count` on hand as of `date`".
// Without it, the stock is rebased to what's derived right now, so a schedule change only
// affects consumption from this moment on.
export async function updateMedication(id, data, stock = null) {
  const ref = doc(db, MEDICATIONS, id);
  await wrap(
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Medication not found');
      const current = snap.data();
      const now = new Date();
      const inventory = { ...current.inventory, ...(data.inventory || {}) };
      if (stock) {
        inventory.count = Number(stock.count) || 0;
        inventory.countedAt = Timestamp.fromDate(stockInInstant(stock.date, now));
        inventory.lastRestockDate = restockTimestamp(stock.date);
      } else {
        inventory.count = remainingAt(current, now);
        inventory.countedAt = Timestamp.fromDate(now);
      }
      tx.update(ref, { ...data, inventory, updatedAt: serverTimestamp() });
    })
  );
}

export async function setMedicationActive(id, active) {
  const ref = doc(db, MEDICATIONS, id);
  await wrap(
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Medication not found');
      const now = new Date();
      // Freeze (or resume) consumption at this moment.
      tx.update(ref, {
        active,
        'inventory.count': remainingAt(snap.data(), now),
        'inventory.countedAt': Timestamp.fromDate(now),
        updatedAt: serverTimestamp()
      });
    })
  );
}

export async function deleteMedication(id) {
  await wrap(deleteDoc(doc(db, MEDICATIONS, id)));
}

export async function restockMedication(id, addedAmount, restockDate) {
  await wrap(
    runTransaction(db, async (tx) => {
      const ref = doc(db, MEDICATIONS, id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Medication not found');
      const med = snap.data();
      // New baseline at the stock-in instant, but never before the current baseline - moving it
      // earlier would subtract doses that the current count already accounts for.
      const picked = stockInInstant(restockDate);
      const base = baselineAt(med);
      const at = picked > base ? picked : base;
      tx.update(ref, {
        'inventory.count': remainingAt(med, at) + Number(addedAmount),
        'inventory.countedAt': Timestamp.fromDate(at),
        'inventory.lastRestockDate': restockTimestamp(restockDate),
        'inventory.lastRestockAmount': Number(addedAmount),
        updatedAt: serverTimestamp()
      });
    })
  );
}

// ---------- Settings ----------

const DEFAULT_SETTINGS = { notificationsEnabled: false, theme: 'dark' };

export async function getUserSettings(uid) {
  const snap = await wrap(getDoc(doc(db, SETTINGS, uid)));
  return snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : { ...DEFAULT_SETTINGS };
}

export async function saveUserSettings(uid, settings) {
  await wrap(setDoc(doc(db, SETTINGS, uid), settings, { merge: true }));
}
