import {
  listMedications,
  createMedication,
  updateMedication,
  setMedicationActive,
  deleteMedication,
  restockTimestamp
} from '../db.js';
import { currentUser } from '../auth.js';
import { initTilt } from '../tilt.js';
import { escapeHtml, showToast, openModal, closeModal, confirmAction } from './shared.js';
import { dateKey, dateKeyFromStored } from '../date-utils.js';

let filter = 'active';
let layout = readLayoutPref();
let scheduleRows = [];

const LAYOUT_KEY = 'medtracker.medsLayout';

function readLayoutPref() {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

function saveLayoutPref(value) {
  try {
    localStorage.setItem(LAYOUT_KEY, value);
  } catch {
    // Storage unavailable (private mode etc.) - the choice just won't persist.
  }
}

function stockLabel(med) {
  const count = med.inventory?.count ?? 0;
  return `${count} ${escapeHtml(med.inventory?.unit || 'pill')}${count === 1 ? '' : 's'}`;
}

function medCardHtml(med) {
  const chips = (med.schedule || [])
    .map((s) => `<span class="time-chip">${s.time}${s.label ? ` &middot; ${escapeHtml(s.label)}` : ''} (${s.quantity})</span>`)
    .join('');
  return `
    <div class="glass-card tilt-card med-card ${med.active === false ? 'is-inactive' : ''}" data-id="${med.id}">
      <div class="med-card-top">
        <div>
          <div class="med-name">${escapeHtml(med.name)}</div>
          <div class="med-strength">${escapeHtml(med.strength || '')} ${med.doctor ? '&middot; ' + escapeHtml(med.doctor) : ''}</div>
        </div>
        <span class="badge badge-upcoming">${stockLabel(med)}</span>
      </div>
      <div class="med-schedule-chips">${chips}</div>
    </div>
  `;
}

function medRowHtml(med) {
  const times = (med.schedule || []).map((s) => s.time).join(', ') || 'No schedule';
  return `
    <button type="button" class="med-row ${med.active === false ? 'is-inactive' : ''}" data-id="${med.id}">
      <span class="med-row-main">
        <span class="med-name">${escapeHtml(med.name)}</span>
        <span class="med-strength">${escapeHtml(med.strength || '')}${med.strength && med.form ? ' &middot; ' : ''}${escapeHtml(med.form || '')}</span>
      </span>
      <span class="med-row-times">${times}</span>
      <span class="badge badge-upcoming">${stockLabel(med)}</span>
    </button>
  `;
}

function scheduleRowHtml(row, index) {
  return `
    <div class="schedule-editor-row" data-index="${index}">
      <div class="field">
        <label>Time</label>
        <input type="time" value="${row.time || '08:00'}" data-field="time" />
      </div>
      <div class="field">
        <label>Qty</label>
        <input type="number" min="0" step="0.5" value="${row.quantity ?? 1}" data-field="quantity" />
      </div>
      <div class="field">
        <label>Label</label>
        <input type="text" placeholder="Morning" value="${escapeHtml(row.label || '')}" data-field="label" />
      </div>
      <button type="button" class="btn btn-icon" data-action="remove-row" aria-label="Remove time">&times;</button>
    </div>
  `;
}

function renderScheduleEditor(container) {
  container.innerHTML = scheduleRows.map(scheduleRowHtml).join('');
  container.querySelectorAll('[data-action="remove-row"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.target.closest('[data-index]').dataset.index);
      scheduleRows.splice(idx, 1);
      renderScheduleEditor(container);
    });
  });
  container.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (e) => {
      const idx = Number(e.target.closest('[data-index]').dataset.index);
      scheduleRows[idx][e.target.dataset.field] = e.target.value;
    });
  });
}

function medicationFormHtml(med) {
  scheduleRows = (med?.schedule || [{ time: '08:00', quantity: 1, label: '' }]).map((s) => ({ ...s }));
  return `
    <h2>${med ? 'Edit medication' : 'Add medication'}</h2>
    <form id="med-form">
      <div class="field-row">
        <div class="field">
          <label for="f-name">Name</label>
          <input id="f-name" required value="${escapeHtml(med?.name || '')}" />
        </div>
        <div class="field">
          <label for="f-strength">Strength</label>
          <input id="f-strength" placeholder="500mg" value="${escapeHtml(med?.strength || '')}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-form">Form</label>
          <select id="f-form">
            ${['tablet', 'capsule', 'liquid', 'injection', 'patch', 'other']
              .map((f) => `<option value="${f}" ${med?.form === f ? 'selected' : ''}>${f}</option>`)
              .join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-doctor">Prescribing doctor</label>
          <input id="f-doctor" value="${escapeHtml(med?.doctor || '')}" />
        </div>
      </div>
      <div class="field">
        <label for="f-instructions">Instructions</label>
        <textarea id="f-instructions">${escapeHtml(med?.instructions || '')}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="f-rx">Prescription #</label>
          <input id="f-rx" value="${escapeHtml(med?.prescriptionNumber || '')}" />
        </div>
        <div class="field">
          <label for="f-pharmacy">Pharmacy</label>
          <input id="f-pharmacy" value="${escapeHtml(med?.pharmacy || '')}" />
        </div>
      </div>

      <h3 style="font-size: var(--font-md); margin: var(--space-4) 0 var(--space-2);">Dose schedule</h3>
      <div id="schedule-editor"></div>
      <button type="button" id="add-time" class="btn btn-secondary btn-sm" style="margin-bottom: var(--space-4);">+ Add time</button>

      <div class="field-row">
        <div class="field">
          <label for="f-count">Current stock</label>
          <input id="f-count" type="number" min="0" value="${med?.inventory?.count ?? 30}" />
        </div>
        <div class="field">
          <label for="f-unit">Unit</label>
          <input id="f-unit" value="${escapeHtml(med?.inventory?.unit || 'pill')}" />
        </div>
      </div>
      <div class="field">
        <label for="f-restock-date">Purchase / stock-in date</label>
        <input id="f-restock-date" type="date" max="${dateKey()}" value="${dateKeyFromStored(med?.inventory?.lastRestockDate) || dateKey()}" />
      </div>
      <div class="field">
        <label for="f-threshold">Low-stock alert (days remaining)</label>
        <input id="f-threshold" type="number" min="0" value="${med?.refillReminderThreshold ?? 7}" />
      </div>

      <div style="display:flex; gap: var(--space-3); margin-top: var(--space-5);">
        <button type="button" class="btn btn-ghost" id="cancel-form">Cancel</button>
        <button type="submit" class="btn btn-primary" style="flex:1;">${med ? 'Save changes' : 'Add medication'}</button>
      </div>
      ${med ? `
        <div style="display:flex; gap: var(--space-3); margin-top: var(--space-3);">
          <button type="button" class="btn btn-secondary" id="toggle-active" style="flex:1;">${med.active === false ? 'Reactivate' : 'Deactivate'}</button>
          <button type="button" class="btn btn-danger" id="delete-med" style="flex:1;">Delete</button>
        </div>
      ` : ''}
    </form>
  `;
}

function openMedicationForm(med, onSaved) {
  const container = openModal(medicationFormHtml(med));
  renderScheduleEditor(container.querySelector('#schedule-editor'));

  container.querySelector('#add-time').addEventListener('click', () => {
    scheduleRows.push({ time: '08:00', quantity: 1, label: '' });
    renderScheduleEditor(container.querySelector('#schedule-editor'));
  });

  container.querySelector('#cancel-form').addEventListener('click', closeModal);

  if (med) {
    container.querySelector('#toggle-active').addEventListener('click', async () => {
      await setMedicationActive(med.id, med.active === false);
      closeModal();
      onSaved();
    });
    container.querySelector('#delete-med').addEventListener('click', async () => {
      if (!confirmAction(`Delete ${med.name}? This does not delete its dose history.`)) return;
      await deleteMedication(med.id);
      closeModal();
      onSaved();
      showToast(`Deleted ${med.name}`);
    });
  }

  container.querySelector('#med-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = (sel) => container.querySelector(sel).value;
    const payload = {
      name: q('#f-name').trim(),
      strength: q('#f-strength').trim(),
      form: q('#f-form'),
      doctor: q('#f-doctor').trim(),
      instructions: q('#f-instructions').trim(),
      prescriptionNumber: q('#f-rx').trim(),
      pharmacy: q('#f-pharmacy').trim(),
      refillReminderThreshold: Number(q('#f-threshold')),
      schedule: scheduleRows
        .filter((r) => r.time)
        .map((r) => ({ time: r.time, quantity: Number(r.quantity) || 1, label: (r.label || '').trim() })),
      inventory: { count: Number(q('#f-count')), unit: q('#f-unit').trim() || 'pill' }
    };
    const restockDate = q('#f-restock-date');

    if (!payload.name) return;

    try {
      if (med) {
        await updateMedication(med.id, {
          ...payload,
          inventory: {
            ...med.inventory,
            count: payload.inventory.count,
            unit: payload.inventory.unit,
            // Only rewrite the date if the caregiver changed it, so an older precise timestamp survives.
            ...(restockDate && restockDate !== dateKeyFromStored(med.inventory?.lastRestockDate)
              ? { lastRestockDate: restockTimestamp(restockDate) }
              : {})
          }
        });
        showToast(`Saved ${payload.name}`);
      } else {
        await createMedication(
          { ...payload, inventory: { ...payload.inventory, lastRestockDate: restockDate } },
          currentUser()?.uid
        );
        showToast(`Added ${payload.name}`);
      }
      closeModal();
      onSaved();
    } catch (err) {
      console.error(err);
      showToast('Could not save medication.');
    }
  });
}

export async function renderMedications() {
  const root = document.getElementById('medications-content');
  if (!root) return;

  const medications = await listMedications({ includeInactive: true });
  const visible = filter === 'active' ? medications.filter((m) => m.active !== false) : medications;

  root.innerHTML = `
    <div class="page-header">
      <h1>Medications</h1>
      <button class="btn btn-primary" id="add-med-btn">+ Add</button>
    </div>
    <div class="med-toolbar">
      <div class="filter-tabs">
        <button class="filter-tab ${filter === 'active' ? 'is-active' : ''}" data-filter="active">Active</button>
        <button class="filter-tab ${filter === 'all' ? 'is-active' : ''}" data-filter="all">All</button>
      </div>
      <div class="filter-tabs" role="group" aria-label="Layout">
        <button class="filter-tab ${layout === 'cards' ? 'is-active' : ''}" data-layout="cards" aria-pressed="${layout === 'cards'}">Cards</button>
        <button class="filter-tab ${layout === 'list' ? 'is-active' : ''}" data-layout="list" aria-pressed="${layout === 'list'}">List</button>
      </div>
    </div>
    ${visible.length === 0
      ? `<div class="empty-state"><p>No medications yet. Tap "+ Add" to create the first one.</p></div>`
      : layout === 'list'
        ? `<div class="glass-card med-rows">${visible.map(medRowHtml).join('')}</div>`
        : `<div class="med-list">${visible.map(medCardHtml).join('')}</div>`}
  `;

  root.querySelectorAll('[data-layout]').forEach((tab) => {
    tab.addEventListener('click', () => {
      layout = tab.dataset.layout;
      saveLayoutPref(layout);
      renderMedications();
    });
  });

  root.querySelectorAll('[data-filter]').forEach((tab) => {
    tab.addEventListener('click', () => {
      filter = tab.dataset.filter;
      renderMedications();
    });
  });

  root.querySelector('#add-med-btn').addEventListener('click', () => {
    openMedicationForm(null, renderMedications);
  });

  root.querySelectorAll('.med-card, .med-row').forEach((card) => {
    card.addEventListener('click', () => {
      const med = medications.find((m) => m.id === card.dataset.id);
      openMedicationForm(med, renderMedications);
    });
  });

  initTilt(root);
}
