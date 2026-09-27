// Stock is derived, never logged per dose: each medication stores a baseline
// (`inventory.count` pills on hand as of `inventory.countedAt`), and every scheduled dose whose
// time has passed since then is assumed taken. See CLAUDE.md "Stock model".

import { dateKey, scheduledDateTime, addDays } from './date-utils.js';

function toDate(value) {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The instant `inventory.count` was accurate. Docs written before the derived model have no
// `countedAt`; their count was kept current by per-dose decrements up to their last write.
export function baselineAt(medication) {
  const inv = medication.inventory || {};
  return toDate(inv.countedAt) || toDate(medication.updatedAt) || toDate(inv.lastRestockDate) || new Date();
}

export function dailyUsage(medication) {
  return (medication.schedule || []).reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
}

// Pills consumed by scheduled doses falling in (from, to].
export function consumedBetween(medication, from, to) {
  if (!(to > from)) return 0;
  let total = 0;
  for (let day = dateKey(from), last = dateKey(to); day <= last; day = addDays(day, 1)) {
    for (const entry of medication.schedule || []) {
      const when = scheduledDateTime(day, entry.time);
      if (when > from && when <= to) total += Number(entry.quantity) || 0;
    }
  }
  return total;
}

export function remainingAt(medication, at = new Date()) {
  const base = Number(medication.inventory?.count) || 0;
  if (medication.active === false) return base;
  return Math.max(0, base - consumedBetween(medication, baselineAt(medication), at));
}

export function daysRemaining(medication) {
  const usage = dailyUsage(medication);
  if (usage <= 0) return Infinity;
  return Math.floor(remainingAt(medication) / usage);
}

export function isLowStock(medication) {
  const threshold = medication.refillReminderThreshold ?? 7;
  const remaining = daysRemaining(medication);
  return remaining !== Infinity && remaining <= threshold;
}

export function stockFraction(medication, horizonDays = 30) {
  const usage = dailyUsage(medication);
  if (usage <= 0) return 1;
  return Math.max(0, Math.min(1, remainingAt(medication) / (usage * horizonDays)));
}

export function lowStockMedications(medications) {
  return medications.filter((m) => m.active !== false && isLowStock(m));
}

// A picked stock-in day becomes an instant: today means "right now" (doses already passed today
// came out of the old stock); a past day means that day's midnight (all its doses came out of it).
export function stockInInstant(dateStr, now = new Date()) {
  if (!dateStr || dateStr >= dateKey(now)) return now;
  return scheduledDateTime(dateStr, '00:00');
}
