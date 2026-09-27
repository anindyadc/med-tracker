// Today's dose occurrences, derived purely from each active medication's schedule. Nothing is
// logged: a dose whose time has passed is assumed taken (stock is derived the same way in
// inventory.js). "due" is just the reminder window right after a dose time.
// See CLAUDE.md "Stock model".

import { dateKey, scheduledDateTime, minutesBetween } from './date-utils.js';
import { listMedications } from './db.js';

export const DUE_WINDOW_MINUTES = 30;

export function occurrencesForDate(medications, day, now = new Date()) {
  const occurrences = [];
  for (const med of medications) {
    if (med.active === false) continue;
    for (const entry of med.schedule || []) {
      const when = scheduledDateTime(day, entry.time);
      const elapsed = minutesBetween(when, now);
      occurrences.push({
        medicationId: med.id,
        medicationName: med.name,
        scheduledDate: day,
        scheduledTime: entry.time,
        scheduledDateTime: when,
        quantity: entry.quantity,
        label: entry.label || '',
        status: elapsed < 0 ? 'upcoming' : 'taken',
        isDue: elapsed >= 0 && elapsed <= DUE_WINDOW_MINUTES
      });
    }
  }
  return occurrences.sort((a, b) => a.scheduledDateTime - b.scheduledDateTime);
}

export async function computeTodaysDoses({ now = new Date(), medications = null } = {}) {
  const today = dateKey(now);
  const all = occurrencesForDate(medications || (await listMedications()), today, now);
  return {
    date: today,
    due: all.filter((o) => o.isDue),
    upcoming: all.filter((o) => o.status === 'upcoming'),
    taken: all.filter((o) => o.status === 'taken'),
    all
  };
}
