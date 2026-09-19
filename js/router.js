const views = new Map();
let activeView = null;
const changeListeners = [];

export function registerView(name, { onEnter } = {}) {
  views.set(name, { onEnter });
}

export function onViewChange(fn) {
  changeListeners.push(fn);
}

function currentHashView() {
  const raw = (location.hash || '#dashboard').slice(1);
  return views.has(raw) ? raw : 'dashboard';
}

function render() {
  const name = currentHashView();
  if (name === activeView) return;
  activeView = name;

  document.querySelectorAll('.view').forEach((el) => {
    el.hidden = el.dataset.view !== name;
  });
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.view === name);
  });

  const view = views.get(name);
  if (view && view.onEnter) view.onEnter();
  changeListeners.forEach((fn) => fn(name));
}

export function navigate(name) {
  if (location.hash === `#${name}`) {
    render();
  } else {
    location.hash = `#${name}`;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}

export function activeViewName() {
  return activeView;
}
