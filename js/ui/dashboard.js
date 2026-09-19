import { computeTodaysDoses } from '../scheduler.js';
import { listMedications } from '../db.js';
import { markDoseTaken, markDoseSkipped, undoDoseTaken } from '../db.js';
import { lowStockMedications } from '../inventory.js';
import { formatTime, formatDateLong, minutesBetween } from '../date-utils.js';
import { initTilt } from '../tilt.js';
import { escapeHtml, showToast, confirmAction } from './shared.js';
import { currentUser } from '../auth.js';
import { getUserSettings } from '../db.js';

let cachedGracePeriod = 60;

function doseCardHtml(occ) {
  const isPast = occ.status === 'missed' || occ.status === 'taken' || occ.status === 'skipped';
  const canAct = occ.status !== 'taken';
  return `
    <div class="glass-card tilt-card dose-card status-${occ.status}" data-med="${occ.medicationId}" data-time="${occ.scheduledTime}" data-date="${occ.scheduledDate}">
      <div class="dose-card-time">${formatTime(occ.scheduledTime)}</div>
      <div class="dose-card-info">
        <span class="med-name">${escapeHtml(occ.medicationName)}</span>
        <span class="med-meta">${occ.quantity} ${occ.label ? '&middot; ' + escapeHtml(occ.label) : ''}</span>
        <span class="badge badge-${occ.status}">${occ.status}</span>
      </div>
      <div class="dose-card-actions">
        ${occ.status === 'taken'
          ? `<button class="btn btn-ghost btn-sm" data-action="undo">Undo</button>`
          : `
            <button class="btn btn-secondary btn-sm" data-action="skip">Skip</button>
            <button class="btn btn-primary btn-sm" data-action="take">${isPast ? 'Mark Taken' : 'Take'}</button>
          `}
      </div>
    </div>
  `;
}

function section(title, occurrences, emptyText) {
  if (occurrences.length === 0) return '';
  return `
    <section class="dose-section">
      <h2>${title}</h2>
      <div class="dose-grid">
        ${occurrences.map(doseCardHtml).join('')}
      </div>
    </section>
  `;
}

async function handleDoseAction(button, result) {
  const card = button.closest('.dose-card');
  const medicationId = card.dataset.med;
  const scheduledTime = card.dataset.time;
  const scheduledDate = card.dataset.date;
  const action = button.dataset.action;
  const occ = result.all.find((o) => o.medicationId === medicationId && o.scheduledTime === scheduledTime);
  if (!occ) return;

  const uid = currentUser()?.uid;

  try {
    if (action === 'take') {
      await markDoseTaken({
        medicationId,
        medicationName: occ.medicationName,
        scheduledDate,
        scheduledTime,
        scheduledDateTime: occ.scheduledDateTime,
        quantity: occ.quantity,
        uid
      });
      showToast(`Marked ${occ.medicationName} as taken`);
    } else if (action === 'skip') {
      if (!confirmAction(`Skip this dose of ${occ.medicationName}?`)) return;
      await markDoseSkipped({
        medicationId,
        medicationName: occ.medicationName,
        scheduledDate,
        scheduledTime,
        scheduledDateTime: occ.scheduledDateTime,
        quantity: occ.quantity,
        uid
      });
      showToast(`Skipped ${occ.medicationName}`);
    } else if (action === 'undo') {
      if (!confirmAction(`Undo "taken" for this dose of ${occ.medicationName}? Inventory will be restored.`)) return;
      const withinGrace = Math.abs(minutesBetween(occ.scheduledDateTime, new Date())) <= cachedGracePeriod;
      await undoDoseTaken({ medicationId, scheduledDate, scheduledTime, wasWithinGraceWindow: withinGrace });
      showToast(`Undid taken mark for ${occ.medicationName}`);
    }
    await renderDashboard();
  } catch (err) {
    console.error(err);
    showToast(err.message?.includes('not authorized') ? err.message : 'Something went wrong. Please try again.');
  }
}

export async function renderDashboard() {
  const root = document.getElementById('dashboard-content');
  if (!root) return;

  const uid = currentUser()?.uid;
  if (uid) {
    const settings = await getUserSettings(uid);
    cachedGracePeriod = settings.gracePeriodMinutes;
  }

  const [result, medications] = await Promise.all([
    computeTodaysDoses({ gracePeriodMinutes: cachedGracePeriod }),
    listMedications()
  ]);

  const lowStock = lowStockMedications(medications);
  const dateLabel = formatDateLong(result.date);

  root.innerHTML = `
    <div class="dashboard-header">
      <h1>Today</h1>
      <span class="date">${dateLabel}</span>
    </div>
    ${lowStock.length > 0 ? `
      <div class="alert-banner">
        Low stock: ${lowStock.map((m) => escapeHtml(m.name)).join(', ')}
      </div>
    ` : ''}
    ${section('Due now', result.due)}
    ${section('Missed today', result.missed)}
    ${section('Upcoming', result.upcoming)}
    ${section('Completed', [...result.taken, ...result.skipped])}
    ${result.all.length === 0 ? `
      <div class="empty-state">
        <p>No medications scheduled yet.</p>
        <p>Add one from the Medications tab to get started.</p>
      </div>
    ` : ''}
  `;

  root.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleDoseAction(btn, result));
  });

  initTilt(root);
}

export async function getDueOccurrencesForNotifications() {
  const uid = currentUser()?.uid;
  const settings = uid ? await getUserSettings(uid) : { gracePeriodMinutes: 60 };
  const result = await computeTodaysDoses({ gracePeriodMinutes: settings.gracePeriodMinutes });
  return result.due;
}
