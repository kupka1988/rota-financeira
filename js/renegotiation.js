import { state } from './state.js';
import { $, brl, escapeHtml, emptyCard, formatDateBR, getCreditorName, creditorLogoHtml, compactTagsForDebt, sortedCreditors, showToast, addMonths } from './utils.js';
import { debtBalance, openInstallmentsForDebt, nextInstallment } from './calc.js';
import { eligibleRenegotiationDebts, selectedRenegotiationDebts, nextPayoffOrder, debtMetric } from './debts.js';
import { db, collection, addDoc, doc, writeBatch, serverTimestamp } from './firebase.js';

export function renderRenegotiation() {
  const metrics = $('renegotiationMetrics');
  const list = $('renegotiationList');
  const selectionText = $('renegotiationSelectionText');
  if (!metrics || !list || !selectionText) return;

  const eligible = eligibleRenegotiationDebts();
  const selected = selectedRenegotiationDebts();
  const totalSelected = selected.reduce((sum, debt) => sum + debtBalance(debt), 0);
  const openInstallments = selected.reduce((sum, debt) => sum + openInstallmentsForDebt(debt).length, 0);

  metrics.innerHTML =
    debtMetric('Elegíveis', String(eligible.length), '⇄', 'blue') +
    debtMetric('Selecionadas', String(selected.length), '✓', selected.length ? 'green' : '') +
    debtMetric('Saldo Selecionado', brl(totalSelected), '▣', totalSelected ? 'red' : '') +
    debtMetric('Parcelas em Aberto', String(openInstallments), '◌', 'amber');

  selectionText.textContent = selected.length
    ? selected.length + ' dívida(s) selecionada(s), somando ' + brl(totalSelected) + '.'
    : 'Nenhuma dívida selecionada.';

  if (!eligible.length) {
    list.innerHTML = emptyCard('Nenhuma dívida disponível', 'Apenas dívidas ativas ou em espera podem entrar em uma renegociação.');
    return;
  }

  list.innerHTML = eligible.map(debt => {
    const checked = state.selectedRenegotiationDebtIds.has(debt.id) ? 'checked' : '';
    const next = nextInstallment(debt);
    return '<label class="renegotiation-row">' +
      '<input type="checkbox" ' + checked + ' onchange="window.toggleRenegotiationDebt(\'' + debt.id + '\')" />' +
      '<div class="debt-head">' + creditorLogoHtml(debt.creditorId) + '<div><div class="debt-name">' + escapeHtml(getCreditorName(debt.creditorId) + ' · ' + debt.name) + '</div><div class="debt-meta">' + compactTagsForDebt(debt) + '<span>' + escapeHtml(debt.status) + '</span></div></div></div>' +
      '<div><div class="metric-label">Saldo</div><strong>' + brl(debtBalance(debt)) + '</strong></div>' +
      '<div><div class="metric-label">Parcela</div><strong>' + brl(debt.installmentValue) + '</strong></div>' +
      '<div><div class="metric-label">Próxima</div><strong>' + escapeHtml(next ? formatDateBR(next.dueDate) : 'Sem Parcela') + '</strong></div>' +
    '</label>';
  }).join('');
}

window.toggleRenegotiationDebt = function(id) {
  if (state.selectedRenegotiationDebtIds.has(id)) state.selectedRenegotiationDebtIds.delete(id);
  else state.selectedRenegotiationDebtIds.add(id);
  renderRenegotiation();
};

window.clearRenegotiationSelection = function() {
  state.selectedRenegotiationDebtIds.clear();
  renderRenegotiation();
};

window.openRenegotiationModal = function() {
  const selected = selectedRenegotiationDebts();
  if (!selected.length) return showToast('Selecione ao menos uma dívida para renegociar.');
  window.closeDebtForm();
  window.closePaymentForm();
  window.closeInstallmentModal();
  window.closePayoffModal();

  const total = selected.reduce((sum, debt) => sum + debtBalance(debt), 0);
  const creditorIds = [...new Set(selected.map(debt => debt.creditorId).filter(Boolean))];
  $('renCreditorSelect').innerHTML = sortedCreditors().map(c => '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>').join('');
  $('renCreditorSelect').value = creditorIds.length === 1 ? creditorIds[0] : (sortedCreditors()[0]?.id || '');
  $('renDebtName').value = selected.length === 1 ? 'Acordo - ' + selected[0].name : 'Acordo consolidado';
  $('renDebtType').value = 'Empréstimo';
  $('renPaymentMethod').value = 'Boleto';
  $('renFirstDue').value = '';
  $('renInstallmentsQty').value = '';
  $('renInstallmentValue').value = '';
  $('renCriticality').value = selected.some(debt => debt.criticality === 'Máxima') ? 'Máxima' : selected.some(debt => debt.criticality === 'Alta') ? 'Alta' : 'Normal';
  $('renPayoffToday').value = brl(total);
  $('renNotes').value = 'Renegociação de: ' + selected.map(debt => getCreditorName(debt.creditorId) + ' · ' + debt.name).join('; ');
  $('renegotiationSummary').innerHTML =
    '<div class="mini-list">' +
      '<div><span>Dívidas selecionadas</span><strong>' + selected.length + '</strong></div>' +
      '<div><span>Saldo anterior</span><strong>' + brl(total) + '</strong></div>' +
      '<div><span>Credores envolvidos</span><strong>' + creditorIds.length + '</strong></div>' +
    '</div>';
  $('renegotiationModal').classList.add('show');
};

window.closeRenegotiationModal = function() {
  $('renegotiationModal').classList.remove('show');
};

window.saveRenegotiation = async function() {
  const selected = selectedRenegotiationDebts();
  if (!selected.length) return showToast('Selecione ao menos uma dívida para renegociar.');
  const creditorId = $('renCreditorSelect').value;
  const name = $('renDebtName').value.trim();
  const firstDue = $('renFirstDue').value;
  const installmentsQty = Number($('renInstallmentsQty').value || 0);
  const installmentValue = parseMoney($('renInstallmentValue').value);
  if (!creditorId || !name || !firstDue || !installmentsQty || !installmentValue) return showToast('Preencha credor, nome, primeira parcela, quantidade e valor.');

  const sourceDebtIds = selected.map(debt => debt.id);
  const previousBalance = selected.reduce((sum, debt) => sum + debtBalance(debt), 0);
  const payload = {
    creditorId, name, firstDue, installmentsQty, installmentValue,
    type: $('renDebtType').value,
    paymentMethod: $('renPaymentMethod').value,
    status: 'Ativa',
    criticality: $('renCriticality').value,
    behavior: 'Parcelada',
    payoffToday: parseMoney($('renPayoffToday').value),
    payoffOrder: nextPayoffOrder(),
    notes: $('renNotes').value.trim(),
    sourceDebtIds,
    renegotiationSource: true,
    updatedAt: serverTimestamp()
  };

  const created = await addDoc(collection(db, 'debts'), { ...payload, createdAt: serverTimestamp() });
  await generateInstallments(created.id, installmentsQty, installmentValue, firstDue);

  const batch = writeBatch(db);
  sourceDebtIds.forEach(id => {
    batch.update(doc(db, 'debts', id), {
      status: 'Renegociada',
      renegotiatedAt: serverTimestamp(),
      renegotiatedIntoDebtId: created.id,
      updatedAt: serverTimestamp()
    });
  });
  state.installments
    .filter(item => sourceDebtIds.includes(item.debtId) && item.status !== 'Paga')
    .forEach(item => batch.update(doc(db, 'installments', item.id), { status: 'Renegociada', updatedAt: serverTimestamp() }));
  await batch.commit();

  await addDoc(collection(db, 'renegotiations'), {
    type: sourceDebtIds.length > 1 ? 'consolidation' : 'single',
    sourceDebtIds,
    newDebtId: created.id,
    previousBalance,
    newTotal: installmentsQty * installmentValue,
    notes: $('renNotes').value.trim(),
    createdAt: serverTimestamp()
  });

  state.selectedRenegotiationDebtIds.clear();
  window.closeRenegotiationModal();
  await state.loadAllFn();
  showToast('Acordo salvo com sucesso.');
};

async function generateInstallments(debtId, qty, value, firstDue) {
  const batch = writeBatch(db);
  for (let i = 0; i < qty; i++) {
    const ref = doc(collection(db, 'installments'));
    batch.set(ref, { debtId, number: i + 1, total: qty, dueDate: addMonths(firstDue, i), expectedValue: value, status: 'Pendente', createdAt: serverTimestamp() });
  }
  await batch.commit();
}

function parseMoney(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(String(value).replace(/R\$/g, '').replace(/\./g, '').replace(',', '.').trim()) || 0;
}
