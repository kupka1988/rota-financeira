import { state } from './state.js';
import { $, brl, escapeHtml, emptyCard, showToast, getCreditorName, sortedCreditors, creditorLogoHtml, initials } from './utils.js';
import { debtBalance } from './calc.js';
import { debtMetric } from './debts.js';
import { db, collection, addDoc, doc, updateDoc, serverTimestamp } from './firebase.js';

export function renderCreditors() {
  renderCreditorMetrics();
  if (!state.creditors.length) {
    $('creditorsList').innerHTML = emptyCard('Nenhum credor cadastrado', 'Cadastre credores para usar na criação das dívidas.');
  } else {
    $('creditorsList').innerHTML =
      '<div class="creditor-table-head"><span>Credor</span><span>Dívidas</span><span>Saldo</span><span>Ações</span></div>' +
      sortedCreditors().map(creditor => {
        const linkedDebts = state.debts.filter(d => d.creditorId === creditor.id);
        const linkedBalance = linkedDebts.reduce((sum, debt) => sum + debtBalance(debt), 0);
        const deleteButton = linkedDebts.length
          ? '<button class="ghost-btn icon-only danger-btn" title="Exclusão bloqueada" onclick="window.showToastGlobal(\'Este credor está vinculado a dívidas.\')">⊘</button>'
          : '<button class="ghost-btn icon-only danger-btn" title="Excluir" onclick="window.openDeleteModal(\'creditor\', \'' + creditor.id + '\')">⌫</button>';
        return '<div class="creditor-table-row">' +
          '<div class="debt-head">' + creditorLogoHtml(creditor.id) + '<div><div class="debt-name">' + escapeHtml(creditor.name) + '</div><div class="debt-meta"><span>' + escapeHtml(creditor.type) + '</span></div></div></div>' +
          '<strong>' + linkedDebts.length + '</strong>' +
          '<strong>' + brl(linkedBalance) + '</strong>' +
          '<div class="action-group creditor-actions"><button class="ghost-btn icon-only" title="Editar" onclick="window.editCreditor(\'' + creditor.id + '\')">✎</button>' + deleteButton + '</div>' +
        '</div>';
      }).join('');
  }

  $('debtCreditorSelect').innerHTML = state.creditors.length
    ? sortedCreditors().map(c => '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>').join('')
    : '<option value="">Cadastre um credor primeiro</option>';
}

export function renderCreditorMetrics() {
  const container = $('creditorMetrics');
  if (!container) return;
  const linkedIds = new Set(state.debts.map(d => d.creditorId).filter(Boolean));
  const linkedCreditors = state.creditors.filter(c => linkedIds.has(c.id)).length;
  const freeCreditors = state.creditors.length - linkedCreditors;
  const visibleDebts = state.debts.filter(d => d.status !== 'Fora do radar');
  const activeCreditors = new Set(visibleDebts.filter(d => d.status === 'Ativa').map(d => d.creditorId).filter(Boolean)).size;
  const waitingCreditors = new Set(visibleDebts.filter(d => d.status === 'Em espera').map(d => d.creditorId).filter(Boolean)).size;
  container.innerHTML =
    debtMetric('Credores Cadastrados', String(state.creditors.length), '▣', 'blue') +
    debtMetric('Com Dívidas', String(linkedCreditors), '⌁', 'red') +
    debtMetric('Na Frente Ativa', String(activeCreditors), '✓', 'green') +
    debtMetric('Livres Para Excluir', String(freeCreditors), '◌', waitingCreditors ? '' : 'green');
}

window.saveCreditor = async function() {
  const name = $('creditorName').value.trim();
  if (!name) return showToast('Informe o nome do credor.');
  const payload = { name, type: $('creditorType').value, logoUrl: $('creditorLogoUrl').value.trim(), notes: $('creditorNotes').value.trim(), updatedAt: serverTimestamp() };
  if (state.editingCreditorId) {
    await updateDoc(doc(db, 'creditors', state.editingCreditorId), payload);
    const index = state.creditors.findIndex(c => c.id === state.editingCreditorId);
    if (index >= 0) state.creditors[index] = { ...state.creditors[index], ...payload };
    showToast('Credor atualizado com sucesso.');
  } else {
    const exists = state.creditors.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) return showToast('Este credor já está cadastrado.');
    const created = await addDoc(collection(db, 'creditors'), { ...payload, createdAt: serverTimestamp() });
    state.creditors.push({ id: created.id, ...payload });
    showToast('Credor cadastrado com sucesso.');
  }
  window.resetCreditorForm();
  window.closeCreditorModal();
  if (state.renderFn) state.renderFn();
};

window.openCreditorModal = function() {
  window.resetCreditorForm();
  $('creditorModal').classList.add('show');
};

window.closeCreditorModal = function() {
  $('creditorModal').classList.remove('show');
  window.resetCreditorForm();
};

window.editCreditor = function(id) {
  const creditor = state.creditors.find(c => c.id === id);
  if (!creditor) return;
  state.editingCreditorId = id;
  $('creditorModal').classList.add('show');
  $('creditorFormTitle').textContent = 'Editar credor';
  $('creditorName').value = creditor.name || '';
  $('creditorType').value = creditor.type || 'Banco';
  $('creditorLogoUrl').value = creditor.logoUrl || '';
  renderCreditorLogoPreview(creditor.logoUrl || '', creditor.name || '');
  $('creditorNotes').value = creditor.notes || '';
};

window.resetCreditorForm = function() {
  state.editingCreditorId = null;
  $('creditorFormTitle').textContent = 'Novo credor';
  $('creditorName').value = '';
  $('creditorType').value = 'Banco';
  $('creditorLogoUrl').value = '';
  $('creditorLogoFile').value = '';
  renderCreditorLogoPreview('', 'RF');
  $('creditorNotes').value = '';
};

function renderCreditorLogoPreview(src, fallbackName) {
  const preview = $('creditorLogoPreview');
  if (!preview) return;
  if (src) {
    preview.innerHTML = '<img alt="Logo" src="' + escapeHtml(src) + '">';
  } else {
    preview.textContent = initials(fallbackName || $('creditorName')?.value || 'RF');
  }
}

window.handleCreditorLogoUpload = function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    event.target.value = '';
    return showToast('Selecione um arquivo de imagem.');
  }
  if (file.size > 250000) {
    event.target.value = '';
    return showToast('Use uma logo menor, até 250 KB.');
  }
  const reader = new FileReader();
  reader.onload = () => {
    $('creditorLogoUrl').value = String(reader.result || '');
    renderCreditorLogoPreview($('creditorLogoUrl').value, $('creditorName').value || 'RF');
  };
  reader.readAsDataURL(file);
};

window.clearCreditorLogo = function() {
  $('creditorLogoUrl').value = '';
  $('creditorLogoFile').value = '';
  renderCreditorLogoPreview('', $('creditorName').value || 'RF');
};

// Expor showToast globalmente para uso inline no HTML
window.showToastGlobal = function(msg) { showToast(msg); };
