// All schedule math happens in the caregiver's local time. `dateKey` deliberately produces a
// plain YYYY-MM-DD string (not a Timestamp) so "which day does this dose belong to" never
// shifts due to timezone conversion - see CLAUDE.md's data model notes.

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function scheduledDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function formatTime(timeStr) {
  const [hh, mm] = timeStr.split(':').map(Number);
  const period = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, '0')} ${period}`;
}

export function formatDateLong(dateStr) {
  const d = scheduledDateTime(dateStr, '00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatDateShort(dateStr) {
  const d = scheduledDateTime(dateStr, '00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Stock-in dates are picked as a local calendar day but stored as a Firestore Timestamp at local
// midnight (older docs hold the server time of the restock). Accepts a Timestamp, Date or key.
export function dateKeyFromStored(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const date = typeof value.toDate === 'function' ? value.toDate() : value;
  return date instanceof Date && !Number.isNaN(date.getTime()) ? dateKey(date) : '';
}

export function minutesBetween(a, b) {
  return (b.getTime() - a.getTime()) / 60000;
}

export function addDays(dateStr, n) {
  const d = scheduledDateTime(dateStr, '00:00');
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
