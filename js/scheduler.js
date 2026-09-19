// Core domain logic: reconciles each active medication's schedule against today's dose logs
// to produce "upcoming" / "due" / "taken" / "missed" / "skipped" occurrences, and writes the
// "missed" transition to Firestore when a dose's grace period has elapsed unacted-on.
// See CLAUDE.md "Missed-dose <-> inventory algorithm" for the full rationale.

import { dateKey, scheduledDateTime, minutesBetween } from './date-utils.js';
import { listMedications, listDoseLogsForDate, recordMissedDose } from './db.js';

export async function computeTodaysDoses({ gracePeriodMinutes = 60, now = new Date() } = {}) {
  const today = dateKey(now);
  const [medications, logs] = await Promise.all([
    listMedications(),
    listDoseLogsForDate(today)
  ]);

  const logByKey = new Map(logs.map((log) => [`${log.medicationId}_${log.scheduledTime}`, log]));
  const occurrences = [];
  const toMarkMissed = [];

  for (const med of medications) {
    for (const entry of med.schedule || []) {
      const key = `${med.id}_${entry.time}`;
      const when = scheduledDateTime(today, entry.time);
      const existingLog = logByKey.get(key);

      if (existingLog) {
        occurrences.push({
          medicationId: med.id,
          medicationName: med.name,
          scheduledDate: today,
          scheduledTime: entry.time,
          scheduledDateTime: when,
          quantity: existingLog.quantity,
          label: entry.label || '',
          status: existingLog.status,
          loggedAt: existingLog.loggedAt || null,
          note: existingLog.note || ''
        });
        continue;
      }

      const elapsedMinutes = minutesBetween(when, now);
      let status;
      if (elapsedMinutes < 0) {
        status = 'upcoming';
      } else if (elapsedMinutes <= gracePeriodMinutes) {
        status = 'due';
      } else {
        status = 'missed';
        toMarkMissed.push({
          medicationId: med.id,
          medicationName: med.name,
          scheduledDate: today,
          scheduledTime: entry.time,
          scheduledDateTime: when,
          quantity: entry.quantity
        });
      }

      occurrences.push({
        medicationId: med.id,
        medicationName: med.name,
        scheduledDate: today,
        scheduledTime: entry.time,
        scheduledDateTime: when,
        quantity: entry.quantity,
        label: entry.label || '',
        status,
        loggedAt: null,
        note: ''
      });
    }
  }

  // Persist due->missed transitions. Safe to run every tick: recordMissedDose writes to a
  // deterministic doc ID, so re-running this never creates duplicates or double-counts.
  await Promise.all(toMarkMissed.map((occ) => recordMissedDose(occ)));

  occurrences.sort((a, b) => a.scheduledDateTime - b.scheduledDateTime);

  return {
    date: today,
    due: occurrences.filter((o) => o.status === 'due'),
    upcoming: occurrences.filter((o) => o.status === 'upcoming'),
    missed: occurrences.filter((o) => o.status === 'missed'),
    taken: occurrences.filter((o) => o.status === 'taken'),
    skipped: occurrences.filter((o) => o.status === 'skipped'),
    all: occurrences
  };
}
