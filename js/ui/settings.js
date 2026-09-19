import { getUserSettings, saveUserSettings } from '../db.js';
import { currentUser, logout } from '../auth.js';
import { notificationPermission, requestNotificationPermission, notificationsSupported } from '../notifications.js';
import { showToast, confirmAction } from './shared.js';

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export async function renderSettings() {
  const root = document.getElementById('settings-content');
  if (!root) return;

  const uid = currentUser()?.uid;
  const settings = uid ? await getUserSettings(uid) : { theme: 'dark', gracePeriodMinutes: 60, notificationsEnabled: false };
  applyTheme(settings.theme);

  const permission = notificationPermission();

  root.innerHTML = `
    <div class="page-header"><h1>Settings</h1></div>

    <div class="glass-card settings-section">
      <h2>Appearance</h2>
      <div class="settings-row">
        <div class="settings-row-label">
          <span>Theme</span>
          <span class="hint">Choose how MedTracker looks</span>
        </div>
        <div class="theme-toggle-group">
          <button class="btn btn-sm ${settings.theme === 'dark' ? 'btn-primary' : 'btn-secondary'}" data-theme="dark">Dark</button>
          <button class="btn btn-sm ${settings.theme === 'light' ? 'btn-primary' : 'btn-secondary'}" data-theme="light">Light</button>
          <button class="btn btn-sm ${settings.theme === 'system' ? 'btn-primary' : 'btn-secondary'}" data-theme="system">System</button>
        </div>
      </div>
    </div>

    <div class="glass-card settings-section">
      <h2>Reminders</h2>
      <div class="settings-row">
        <div class="settings-row-label">
          <span>Notifications</span>
          <span class="hint">${notificationsSupported() ? `Status: ${permission}` : 'Not supported on this browser'}</span>
        </div>
        <button class="btn btn-secondary btn-sm" id="req-notif" ${permission === 'granted' || !notificationsSupported() ? 'disabled' : ''}>
          ${permission === 'granted' ? 'Enabled' : 'Enable'}
        </button>
      </div>
      <div class="settings-row">
        <div class="settings-row-label">
          <span>Grace period</span>
          <span class="hint">Minutes after a due time before it's marked missed</span>
        </div>
        <input id="grace-input" type="number" min="5" max="240" step="5" value="${settings.gracePeriodMinutes}" style="width:80px; min-height:36px; background:var(--surface); border:1px solid var(--border-soft); border-radius:var(--radius-sm); color:var(--text-primary); padding:0 var(--space-2);" />
      </div>
      <p class="about-text" style="margin-top: var(--space-3);">
        Reminders only fire while MedTracker is open in a browser tab or installed as an app on this
        device. GitHub Pages has no server, so it cannot push notifications when the app is fully closed.
      </p>
    </div>

    <div class="glass-card settings-section">
      <h2>Account</h2>
      <div class="settings-row">
        <div class="settings-row-label">
          <span>${currentUser()?.email || ''}</span>
          <span class="hint">Signed in</span>
        </div>
        <button class="btn btn-danger btn-sm" id="logout-btn">Log out</button>
      </div>
    </div>

    <div class="about-text">MedTracker &middot; a private family medication tracker.</div>
  `;

  root.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      if (uid) await saveUserSettings(uid, { theme });
      renderSettings();
    });
  });

  root.querySelector('#req-notif')?.addEventListener('click', async () => {
    const result = await requestNotificationPermission();
    if (result === 'granted' && uid) await saveUserSettings(uid, { notificationsEnabled: true });
    renderSettings();
  });

  root.querySelector('#grace-input')?.addEventListener('change', async (e) => {
    const minutes = Math.max(5, Number(e.target.value) || 60);
    if (uid) {
      await saveUserSettings(uid, { gracePeriodMinutes: minutes });
      showToast('Grace period updated');
    }
  });

  root.querySelector('#logout-btn')?.addEventListener('click', async () => {
    if (!confirmAction('Log out of MedTracker?')) return;
    await logout();
    window.location.href = 'index.html';
  });
}
