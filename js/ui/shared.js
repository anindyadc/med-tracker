export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
export function showToast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2800);
}

export function openModal(contentHtml) {
  const backdrop = document.getElementById('modal-backdrop');
  const container = document.getElementById('modal-content');
  container.innerHTML = contentHtml;
  backdrop.hidden = false;
  return container;
}

export function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.hidden = true;
  document.getElementById('modal-content').innerHTML = '';
}

export function confirmAction(message) {
  return window.confirm(message);
}

document.addEventListener('DOMContentLoaded', () => {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) return;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
});
