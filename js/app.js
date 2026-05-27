import { state, rebuildIndexes } from './state.js';
import { parseMoney, brl, addMonths, escapeHtml } from './utils.js';
import { synchronizePaidOffDebts } from './calc.js';
import { renderPreferenceValues, readPreferences } from './preferences.js';
import { renderDashboard, renderRenegotiatedHistory } from './dashboard.js';
import { renderTrail } from './trail.js';
import { renderDebts } from './debts.js';
import { renderRenegotiation } from './renegotiation.js';
import { renderCreditors } from './creditors.js';
import { db, collection, getDocs } from './firebase.js';

// Importar módulos de ação (registram window.*)
import './debt-form.js';
import './payment.js';
import './data.js';

// --- Inicializar preferências ---
state.userPreferences = readPreferences();

// --- Boot: loadAll e renderAll ---

export async function loadAll() {
  state.creditors = (await getDocs(collection(db, 'creditors'))).docs.map(d => ({ id: d.id, ...d.data() }));
  state.debts = (await getDocs(collection(db, 'debts'))).docs.map(d => ({ id: d.id, ...d.data() }));
  state.installments = (await getDocs(collection(db, 'installments'))).docs.map(d => ({ id: d.id, ...d.data() }));
  state.payments = (await getDocs(collection(db, 'payments'))).docs.map(d => ({ id: d.id, ...d.data() }));
  rebuildIndexes();
  await synchronizePaidOffDebts();
  renderAll();
}

export function renderAll() {
  rebuildIndexes();
  renderPreferenceValues();
  renderCreditors();
  renderDebts();
  renderRenegotiation();
  renderTrail();
  renderRenegotiatedHistory();
}

// Registrar no state para uso pelos módulos
state.renderFn = renderAll;
state.loadAllFn = loadAll;

// --- Navegação ---

function showPage(pageId) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
}

document.querySelectorAll('.nav-item').forEach(button => {
  button.addEventListener('click', () => {
    showPage(button.dataset.page);
    window.closeDebtForm();
    window.closePaymentForm();
    window.closeInstallmentModal();
    window.closeRenegotiationModal();
    window.closeDeleteModal();
  });
});

// --- Testes básicos ---

function runTests() {
  console.assert(parseMoney('R$ 1.234,56') === 1234.56, 'parseMoney deve converter moeda BR');
  console.assert(brl(10) === 'R$ 10,00' || brl(10) === 'R$ 10,00', 'brl deve formatar moeda BR');
  console.assert(addMonths('2026-01-31', 1) === '2026-02-28', 'addMonths deve ajustar fim de mês');
  console.assert(escapeHtml('<script>') === '&lt;script&gt;', 'escapeHtml deve escapar HTML');
}

runTests();

// --- Iniciar ---

loadAll().catch(error => {
  console.error(error);
  document.getElementById('toast') && (document.getElementById('toast').textContent = 'Erro ao carregar dados.');
});
