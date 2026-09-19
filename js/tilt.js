const MAX_TILT_DEG = 6;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function applyTilt(el, event) {
  const rect = el.getBoundingClientRect();
  const px = (event.clientX - rect.left) / rect.width - 0.5;
  const py = (event.clientY - rect.top) / rect.height - 0.5;
  const rotateY = px * MAX_TILT_DEG * 2;
  const rotateX = -py * MAX_TILT_DEG * 2;
  el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(8px)`;
}

function resetTilt(el) {
  el.style.transform = '';
}

// Applies the pointer-tracked 3D tilt to every element matching `.tilt-card` currently in the
// DOM. Safe to call repeatedly (e.g. after re-rendering a list) - it just won't double-bind
// because we mark bound elements.
export function initTilt(root = document) {
  if (reducedMotion.matches || matchMedia('(hover: none)').matches) return;

  root.querySelectorAll('.tilt-card:not([data-tilt-bound])').forEach((el) => {
    el.dataset.tiltBound = 'true';
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      applyTilt(el, e);
    });
    el.addEventListener('pointerleave', () => resetTilt(el));
  });
}
