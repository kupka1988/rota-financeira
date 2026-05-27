import { state } from './state.js';
import { $, showToast } from './utils.js';

export const THEME_KEY = 'rotaFinanceiraTheme';
export const DENSITY_KEY = 'rotaFinanceiraDensity';
export const PREFERENCES_KEY = 'rotaFinanceiraPreferences';

export const defaultPreferences = {
  defaultStrategy: 'Ordem manual',
  notifyDueSoon: true,
  notifyOverdue: true,
  notifyPaidOff: true
};

const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');

export function readPreferences() {
  try {
    return { ...defaultPreferences, ...(JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}')) };
  } catch {
    return { ...defaultPreferences };
  }
}

function updateSegmentedControl(id, value) {
  const control = $(id);
  if (!control) return;
  control.querySelectorAll('button').forEach(button => {
    button.classList.toggle('is-active', button.dataset.value === value);
  });
}

export function applyTheme(theme) {
  const preference = ['light', 'dark', 'auto'].includes(theme) ? theme : 'light';
  const nextTheme = preference === 'auto' ? (themeMedia.matches ? 'dark' : 'light') : preference;
  document.body.dataset.theme = nextTheme;
  document.body.dataset.themePreference = preference;
  updateSegmentedControl('themeSelect', preference);
  localStorage.setItem(THEME_KEY, preference);
}

window.setThemePreference = function(theme) {
  applyTheme(theme);
};

export function applyDensity(density) {
  const nextDensity = density === 'comfortable' ? 'comfortable' : 'compact';
  document.body.dataset.density = nextDensity;
  updateSegmentedControl('densitySelect', nextDensity);
  localStorage.setItem(DENSITY_KEY, nextDensity);
};

window.setDensityPreference = function(density) {
  applyDensity(density);
};

export function renderPreferenceValues() {
  const defaultStrategy = $('defaultStrategy');
  if (!defaultStrategy) return;
  defaultStrategy.value = state.userPreferences.defaultStrategy || 'Ordem manual';
  $('notifyDueSoon').checked = Boolean(state.userPreferences.notifyDueSoon);
  $('notifyOverdue').checked = Boolean(state.userPreferences.notifyOverdue);
  $('notifyPaidOff').checked = Boolean(state.userPreferences.notifyPaidOff);
  updateSegmentedControl('themeSelect', localStorage.getItem(THEME_KEY) || 'light');
  updateSegmentedControl('densitySelect', localStorage.getItem(DENSITY_KEY) || 'compact');
}

window.setPreferenceValue = function(key, value) {
  state.userPreferences = { ...state.userPreferences, [key]: value };
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(state.userPreferences));
  if (state.renderFn) state.renderFn();
};

// Aplicar tema e densidade ao carregar
applyTheme(localStorage.getItem(THEME_KEY) || 'light');
applyDensity(localStorage.getItem(DENSITY_KEY) || 'compact');
themeMedia.addEventListener('change', () => {
  if ((localStorage.getItem(THEME_KEY) || 'light') === 'auto') applyTheme('auto');
});
