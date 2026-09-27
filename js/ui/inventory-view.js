import { listMedications, restockMedication } from '../db.js';
import { daysRemaining, dailyUsage, stockFraction, isLowStock } from '../inventory.js';
import { initTilt } from '../tilt.js';
import { escapeHtml, showToast, openModal, closeModal } from './shared.js';
import { dateKey, dateKeyFromStored, formatDateShort } from '../date-utils.js';

function stockedInText(med) {
  const key = dateKeyFromStored(med.inventory?.lastRestockDate);
  if (!key) return '';
  const amount = med.inventory?.lastRestockAmount;
  return `Stocked in ${formatDateShort(key)}${amount ? ` (+${amount})` : ''}`;
}

function inventoryCardHtml(med) {
  const remaining = daysRemaining(med);
  const low = isLowStock(med);
  const fraction = stockFraction(med);
  return `
    <div class="glass-card tilt-card inventory-card" data-id="${med.id}">
      <div class="inventory-card-top">
        <span class="med-name">${escapeHtml(med.name)}</span>
        <span class="days-left ${low ? 'is-low' : ''}">${remaining === Infinity ? 'no schedule' : `${remaining}d left`}</span>
      </div>
      <div class="stock-bar"><div class="stock-bar-fill ${low ? 'is-low' : ''}" style="width:${Math.round(fraction * 100)}%"></div></div>
      <div class="inventory-count-row">
        <span>${med.inventory?.count ?? 0} ${escapeHtml(med.inventory?.unit || 'pill')}s on hand</span>
        <span>${dailyUsage(med)} / day</span>
      </div>
      ${stockedInText(med) ? `<div class="inventory-stocked-in">${escapeHtml(stockedInText(med))}</div>` : ''}
      <div class="inventory-card-actions">
        <button class="btn btn-secondary btn-sm" data-action="restock">Restock</button>
      </div>
    </div>
  `;
}

function restockFormHtml(med) {
  return `
    <h2>Restock ${escapeHtml(med.name)}</h2>
    <p class="about-text" style="margin-bottom: var(--space-4);">Currently ${med.inventory?.count ?? 0} ${escapeHtml(med.inventory?.unit || 'pill')}s on hand.</p>
    <form id="restock-form">
      <div class="field">
        <label for="r-amount">Amount added</label>
        <input id="r-amount" type="number" min="1" step="0.5" value="30" required />
      </div>
      <div class="field">
        <label for="r-date">Purchase / stock-in date</label>
        <input id="r-date" type="date" max="${dateKey()}" value="${dateKey()}" required />
      </div>
      <div style="display:flex; gap: var(--space-3); margin-top: var(--space-5);">
        <button type="button" class="btn btn-ghost" id="cancel-restock">Cancel</button>
        <button type="submit" class="btn btn-primary" style="flex:1;">Add to stock</button>
      </div>
    </form>
  `;
}

export async function renderInventory() {
  const root = document.getElementById('inventory-content');
  if (!root) return;

  const medications = (await listMedications()).sort((a, b) => daysRemaining(a) - daysRemaining(b));

  root.innerHTML = `
    <div class="page-header"><h1>Inventory</h1></div>
    ${medications.length === 0
      ? `<div class="empty-state"><p>No active medications to track yet.</p></div>`
      : `<div class="inventory-list">${medications.map(inventoryCardHtml).join('')}</div>`}
  `;

  root.querySelectorAll('[data-action="restock"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.closest('.inventory-card').dataset.id;
      const med = medications.find((m) => m.id === id);
      const container = openModal(restockFormHtml(med));
      container.querySelector('#cancel-restock').addEventListener('click', closeModal);
      container.querySelector('#restock-form').addEventListener('submit', async (e2) => {
        e2.preventDefault();
        const amount = Number(container.querySelector('#r-amount').value);
        if (amount <= 0) return;
        const restockDate = container.querySelector('#r-date').value || dateKey();
        await restockMedication(med.id, amount, restockDate);
        closeModal();
        showToast(`Restocked ${med.name} (+${amount})`);
        renderInventory();
      });
    });
  });

  initTilt(root);
}
