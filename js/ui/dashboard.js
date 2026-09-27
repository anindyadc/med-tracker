import { computeTodaysDoses } from '../scheduler.js';
import { listMedications } from '../db.js';
import { lowStockMedications, remainingAt } from '../inventory.js';
import { formatTime, formatDateLong } from '../date-utils.js';
import { initTilt } from '../tilt.js';
import { escapeHtml } from './shared.js';

function doseCardHtml(occ, remaining) {
  const status = occ.isDue ? 'due' : occ.status;
  return `
    <div class="glass-card tilt-card dose-card status-${status}">
      <div class="dose-card-time">${formatTime(occ.scheduledTime)}</div>
      <div class="dose-card-info">
        <span class="med-name">${escapeHtml(occ.medicationName)}</span>
        <span class="med-meta">${occ.quantity}${occ.label ? ' &middot; ' + escapeHtml(occ.label) : ''}${remaining !== undefined ? ` &middot; ${remaining} left` : ''}</span>
      </div>
      <span class="badge badge-${status}">${occ.isDue ? 'due now' : status}</span>
    </div>
  `;
}

function section(title, occurrences, remainingById) {
  if (occurrences.length === 0) return '';
  return `
    <section class="dose-section">
      <h2>${title}</h2>
      <div class="dose-grid">
        ${occurrences.map((o) => doseCardHtml(o, remainingById.get(o.medicationId))).join('')}
      </div>
    </section>
  `;
}

export async function renderDashboard() {
  const root = document.getElementById('dashboard-content');
  if (!root) return;

  const medications = await listMedications();
  const result = await computeTodaysDoses({ medications });
  const remainingById = new Map(medications.map((m) => [m.id, remainingAt(m)]));
  const lowStock = lowStockMedications(medications);

  root.innerHTML = `
    <div class="dashboard-header">
      <h1>Today</h1>
      <span class="date">${formatDateLong(result.date)}</span>
    </div>
    ${lowStock.length > 0 ? `
      <div class="alert-banner">
        Low stock: ${lowStock.map((m) => escapeHtml(m.name)).join(', ')}
      </div>
    ` : ''}
    ${section('Upcoming', result.upcoming, remainingById)}
    ${section('Taken today', result.taken, remainingById)}
    ${result.all.length === 0 ? `
      <div class="empty-state">
        <p>No medications scheduled yet.</p>
        <p>Add one from the Medications tab to get started.</p>
      </div>
    ` : `
      <p class="about-text">Doses are assumed taken at their scheduled time; stock updates automatically.</p>
    `}
  `;

  initTilt(root);
}

export async function getDueOccurrencesForNotifications() {
  const result = await computeTodaysDoses();
  return result.due;
}
