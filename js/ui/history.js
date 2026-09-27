import { listMedications } from '../db.js';
import { occurrencesForDate } from '../scheduler.js';
import { baselineAt } from '../inventory.js';
import { dateKey, addDays, formatDateLong, formatTime } from '../date-utils.js';
import { escapeHtml } from './shared.js';

// History is derived, not logged: every scheduled dose that has passed is assumed taken, from
// the day the medication was added. It reflects each medication's *current* schedule.
const HISTORY_DAYS = 21;

let medicationFilter = 'all';

function rowHtml(occ) {
  return `
    <div class="glass-card history-row">
      <div class="history-row-info">
        <span class="med-name">${escapeHtml(occ.medicationName)}</span>
        <span class="note">${occ.quantity}${occ.label ? ' &middot; ' + escapeHtml(occ.label) : ''}</span>
      </div>
      <div class="history-row-time">${formatTime(occ.scheduledTime)}</div>
      <span class="badge badge-taken">taken</span>
    </div>
  `;
}

function startOf(med) {
  const created = typeof med.createdAt?.toDate === 'function' ? med.createdAt.toDate() : null;
  return created || baselineAt(med);
}

export async function renderHistory() {
  const root = document.getElementById('history-content');
  if (!root) return;

  const medications = await listMedications({ includeInactive: true });
  const tracked = medications.filter((m) => medicationFilter === 'all' || m.id === medicationFilter);
  const now = new Date();

  const groups = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const day = addDays(dateKey(now), -i);
    const entries = occurrencesForDate(tracked, day, now)
      .filter((o) => o.status === 'taken')
      .filter((o) => o.scheduledDateTime >= startOf(tracked.find((m) => m.id === o.medicationId)))
      .reverse();
    if (entries.length > 0) groups.push({ day, entries });
  }

  const groupsHtml = groups.map(({ day, entries }) => `
    <div class="history-day-group">
      <h3>${formatDateLong(day)}</h3>
      ${entries.map(rowHtml).join('')}
    </div>
  `).join('');

  root.innerHTML = `
    <div class="page-header"><h1>History</h1></div>
    <div class="history-filters">
      <div class="field">
        <label for="h-med-filter">Medication</label>
        <select id="h-med-filter">
          <option value="all">All medications</option>
          ${medications.map((m) => `<option value="${m.id}" ${medicationFilter === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    ${groups.length === 0
      ? `<div class="empty-state"><p>No doses yet.</p></div>`
      : groupsHtml}
  `;

  root.querySelector('#h-med-filter').addEventListener('change', (e) => {
    medicationFilter = e.target.value;
    renderHistory();
  });
}
