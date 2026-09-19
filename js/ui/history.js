import { listRecentDoseLogs, listMedications } from '../db.js';
import { formatDateLong, formatTime } from '../date-utils.js';
import { escapeHtml } from './shared.js';

let medicationFilter = 'all';

function rowHtml(log) {
  return `
    <div class="glass-card history-row">
      <div class="history-row-info">
        <span class="med-name">${escapeHtml(log.medicationName)}</span>
        ${log.note ? `<span class="note">${escapeHtml(log.note)}</span>` : ''}
      </div>
      <div class="history-row-time">${formatTime(log.scheduledTime)}</div>
      <span class="badge badge-${log.status}">${log.status}</span>
    </div>
  `;
}

export async function renderHistory() {
  const root = document.getElementById('history-content');
  if (!root) return;

  const [logs, medications] = await Promise.all([
    listRecentDoseLogs({ days: 21 }),
    listMedications({ includeInactive: true })
  ]);

  const filtered = medicationFilter === 'all' ? logs : logs.filter((l) => l.medicationId === medicationFilter);

  const byDate = new Map();
  for (const log of filtered) {
    if (!byDate.has(log.scheduledDate)) byDate.set(log.scheduledDate, []);
    byDate.get(log.scheduledDate).push(log);
  }

  const groupsHtml = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, entries]) => `
      <div class="history-day-group">
        <h3>${formatDateLong(date)}</h3>
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
    ${filtered.length === 0
      ? `<div class="empty-state"><p>No dose history yet.</p></div>`
      : groupsHtml}
  `;

  root.querySelector('#h-med-filter').addEventListener('change', (e) => {
    medicationFilter = e.target.value;
    renderHistory();
  });
}
