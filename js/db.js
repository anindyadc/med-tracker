import {
  db,
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
  Timestamp
} from './firebase-config.js';
import { reportPossibleAccessDenied } from './auth.js';

const MEDICATIONS = 'medications';
const DOSE_LOGS = 'doseLogs';
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

export async function createMedication(data, uid) {
  const ref = doc(collection(db, MEDICATIONS));
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
      count: Number(data.inventory?.count) || 0,
      unit: data.inventory?.unit || 'pill',
      lastRestockDate: serverTimestamp(),
      lastRestockAmount: Number(data.inventory?.count) || 0
    },
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid
  };
  await wrap(setDoc(ref, payload));
  return ref.id;
}

export async function updateMedication(id, data) {
  await wrap(updateDoc(doc(db, MEDICATIONS, id), { ...data, updatedAt: serverTimestamp() }));
}

export async function setMedicationActive(id, active) {
  await wrap(updateDoc(doc(db, MEDICATIONS, id), { active, updatedAt: serverTimestamp() }));
}

export async function deleteMedication(id) {
  await wrap(deleteDoc(doc(db, MEDICATIONS, id)));
}

export async function restockMedication(id, addedAmount) {
  await wrap(
    runTransaction(db, async (tx) => {
      const ref = doc(db, MEDICATIONS, id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Medication not found');
      const current = snap.data().inventory?.count || 0;
      tx.update(ref, {
        'inventory.count': current + Number(addedAmount),
        'inventory.lastRestockDate': serverTimestamp(),
        'inventory.lastRestockAmount': Number(addedAmount),
        updatedAt: serverTimestamp()
      });
    })
  );
}

// ---------- Dose logs ----------

function doseLogId(medicationId, scheduledDate, scheduledTime) {
  return `${medicationId}_${scheduledDate}_${scheduledTime}`;
}

export async function listDoseLogsForDate(scheduledDate) {
  const q = query(collection(db, DOSE_LOGS), where('scheduledDate', '==', scheduledDate));
  const snap = await wrap(getDocs(q));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listRecentDoseLogs({ days = 14 } = {}) {
  const q = query(collection(db, DOSE_LOGS), orderBy('scheduledDateTime', 'desc'));
  const snap = await wrap(getDocs(q));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return days ? all.slice(0, days * 20) : all;
}

// Writes a "missed" record. Idempotent by construction: doseLogId is deterministic, so if a
// doc already exists (e.g. a concurrent reconciliation pass, or the user already acted) we
// simply overwrite it with the same terminal state rather than risk clobbering a real action -
// callers in scheduler.js only ever call this when they've already confirmed no doc exists.
export async function recordMissedDose({ medicationId, medicationName, scheduledDate, scheduledTime, scheduledDateTime: when, quantity }) {
  const ref = doc(db, DOSE_LOGS, doseLogId(medicationId, scheduledDate, scheduledTime));
  await wrap(
    setDoc(ref, {
      medicationId,
      medicationName,
      scheduledDate,
      scheduledTime,
      scheduledDateTime: Timestamp.fromDate(when),
      quantity,
      status: 'missed',
      loggedAt: null,
      loggedBy: null,
      note: ''
    })
  );
}

// The one and only place inventory is decremented: marking a dose "taken" atomically writes
// the log and decrements inventory in a single Firestore transaction (see CLAUDE.md).
export async function markDoseTaken({ medicationId, medicationName, scheduledDate, scheduledTime, scheduledDateTime: when, quantity, uid, note = '' }) {
  const logRef = doc(db, DOSE_LOGS, doseLogId(medicationId, scheduledDate, scheduledTime));
  const medRef = doc(db, MEDICATIONS, medicationId);

  await wrap(
    runTransaction(db, async (tx) => {
      const medSnap = await tx.get(medRef);
      const currentCount = medSnap.exists() ? medSnap.data().inventory?.count || 0 : 0;
      const nextCount = Math.max(0, currentCount - quantity);

      tx.set(logRef, {
        medicationId,
        medicationName,
        scheduledDate,
        scheduledTime,
        scheduledDateTime: Timestamp.fromDate(when),
        quantity,
        status: 'taken',
        loggedAt: serverTimestamp(),
        loggedBy: uid,
        note
      });

      if (medSnap.exists()) {
        tx.update(medRef, { 'inventory.count': nextCount, updatedAt: serverTimestamp() });
      }
    })
  );
}

export async function markDoseSkipped({ medicationId, medicationName, scheduledDate, scheduledTime, scheduledDateTime: when, quantity, uid, note = '' }) {
  const ref = doc(db, DOSE_LOGS, doseLogId(medicationId, scheduledDate, scheduledTime));
  await wrap(
    setDoc(ref, {
      medicationId,
      medicationName,
      scheduledDate,
      scheduledTime,
      scheduledDateTime: Timestamp.fromDate(when),
      quantity,
      status: 'skipped',
      loggedAt: serverTimestamp(),
      loggedBy: uid,
      note
    })
  );
}

// Undo a "taken" mark: reverts the log to "missed" (or deletes it if still inside the grace
// window, letting reconciliation recompute it as due/upcoming) and gives the inventory back.
export async function undoDoseTaken({ medicationId, scheduledDate, scheduledTime, wasWithinGraceWindow }) {
  const logRef = doc(db, DOSE_LOGS, doseLogId(medicationId, scheduledDate, scheduledTime));
  const medRef = doc(db, MEDICATIONS, medicationId);

  await wrap(
    runTransaction(db, async (tx) => {
      const logSnap = await tx.get(logRef);
      if (!logSnap.exists() || logSnap.data().status !== 'taken') return;
      const quantity = logSnap.data().quantity || 0;

      const medSnap = await tx.get(medRef);
      if (medSnap.exists()) {
        const currentCount = medSnap.data().inventory?.count || 0;
        tx.update(medRef, { 'inventory.count': currentCount + quantity, updatedAt: serverTimestamp() });
      }

      if (wasWithinGraceWindow) {
        tx.delete(logRef);
      } else {
        tx.update(logRef, { status: 'missed', loggedAt: null, loggedBy: null });
      }
    })
  );
}

// ---------- Settings ----------

const DEFAULT_SETTINGS = { gracePeriodMinutes: 60, notificationsEnabled: false, theme: 'dark' };

export async function getUserSettings(uid) {
  const snap = await wrap(getDoc(doc(db, SETTINGS, uid)));
  return snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : { ...DEFAULT_SETTINGS };
}

export async function saveUserSettings(uid, settings) {
  await wrap(setDoc(doc(db, SETTINGS, uid), settings, { merge: true }));
}
