import { state } from './state.js';
import { $, brl, parseMoney, showToast, getCreditorName, formatDateBR } from './utils.js';
import { debtBalance, openInstallmentsForDebt, synchronizePaidOffDebts } from './calc.js';
import { db, collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from './firebase.js';

// --- Modal payoff (quitar dívida) ---

function payoffSummaryValues() {
  const debt = state.debts.find(d => d.id === state.payoffDebtId);
  const totalRemaining = debt ? debtBalance(debt) : 0;
  const paidValue = parseMoney($('payoffValue')?.value || 0);
  const discount = Math.max(0, totalRemaining - paidValue);
  const interest = Math.max(0, paidValue - totalRemaining);
  return { debt, totalRemaining, paidValue, discount, interest };
}

window.updatePayoffSummary = function() {
  const target = $('payoffSummary');
  if (!target) return;
  const { totalRemaining, paidValue, discount, interest } = payoffSummaryValues();
  const discountPct = totalRemaining ? Math.round((discount / totalRemaining) * 10000) / 100 : 0;
  target.innerHTML =
    '<h3>Resumo da quitação</h3>' +
    '<div class="mini-list payoff-mini-list">' +
      '<div><span>Valor total previsto</span><strong>' + brl(totalRemaining) + '</strong></div>' +
      '<div><span>Valor de quitação</span><strong>' + brl(paidValue) + '</strong></div>' +
    '</div>' +
    '<div class="payoff-discount">' +
      '<span>' + (interest > 0 ? 'Valor acima do previsto' : 'Desconto obtido') + '</span>' +
      '<strong>' + brl(interest > 0 ? interest : discount) + '</strong>' +
      '<small>' + (interest > 0 ? 'Sem desconto aplicado' : discountPct.toLocaleString('pt-BR') + '% de desconto') + '</small>' +
    '</div>' +
    '<p class="payoff-note">Ao confirmar, as parcelas futuras serão encerradas e a dívida será marcada como quitada.</p>';
};

window.openPayoffModal = function(id) {
  const debt = state.debts.find(d => d.id === id);
  if (!debt) return showToast('Dívida não encontrada.');
  window.closeDebtForm();
  window.closePaymentForm();
  window.closeInstallmentModal();
  state.payoffDebtId = id;
  const remaining = debtBalance(debt);
  $('payoffValue').value = brl(debt.payoffToday || remaining);
  $('payoffDate').value = new Date().toISOString().slice(0, 10);
  $('payoffMethod').value = '';
  $('payoffNotes').value = '';
  window.updatePayoffSummary();
  $('payoffModal').classList.add('show');
};

window.closePayoffModal = function() {
  state.payoffDebtId = null;
  $('payoffModal')?.classList.remove('show');
};

window.confirmPayoffDebt = async function() {
  const { debt, totalRemaining, paidValue, discount, interest } = payoffSummaryValues();
  if (!debt) return showToast('Dívida não encontrada.');
  if (!paidValue) return showToast('Informe o valor de quitação.');
  const paymentDate = $('payoffDate').value;
  if (!paymentDate) return showToast('Informe a data do pagamento.');

  const openItems = openInstallmentsForDebt(debt);
  const batch = writeBatch(db);
  openItems.forEach(item => {
    item.status = 'Quitada';
    item.paidAt = paymentDate;
    batch.update(doc(db, 'installments', item.id), { status: 'Quitada', paidAt: paymentDate, updatedAt: serverTimestamp() });
  });
  debt.status = 'Quitada';
  debt.paidOffAt = paymentDate;
  batch.update(doc(db, 'debts', debt.id), { status: 'Quitada', paidOffAt: paymentDate, updatedAt: serverTimestamp() });
  await batch.commit();

  const paymentPayload = {
    debtId: debt.id,
    installmentId: 'payoff-' + debt.id,
    installmentNumber: 'Quitação',
    expectedDate: paymentDate,
    paymentDate,
    expectedValue: totalRemaining,
    paidValue,
    discount,
    interest,
    method: $('payoffMethod').value,
    notes: $('payoffNotes').value.trim(),
    type: 'payoff',
    createdAt: serverTimestamp()
  };
  const created = await addDoc(collection(db, 'payments'), paymentPayload);
  state.payments.push({ id: created.id, ...paymentPayload });
  state.expandedDebtId = debt.id;
  window.closePayoffModal();
  if (state.renderFn) state.renderFn();
  showToast('Dívida quitada com sucesso.');
};

// --- Modal de pagamento de parcela ---

window.openPaymentForm = function(installmentId) {
  window.closeDebtForm();
  window.closePayoffModal();
  const inst = state.installments.find(i => i.id === installmentId);
  if (!inst) return;
  const debt = state.debts.find(d => d.id === inst.debtId);
  if (debt) state.expandedDebtId = debt.id;
  state.paymentInstallmentId = installmentId;
  $('payDebtName').value = debt ? getCreditorName(debt.creditorId) + ' · ' + debt.name : 'Dívida não encontrada';
  $('payInstallmentLabel').value = inst.number + '/' + inst.total;
  $('payDate').value = inst.dueDate;
  $('payValue').value = brl(inst.expectedValue);
  $('paymentForm').classList.add('show');
};

window.closePaymentForm = function() {
  state.paymentInstallmentId = null;
  $('paymentForm').classList.remove('show');
};

window.savePayment = async function() {
  if (!state.paymentInstallmentId) return showToast('Nenhuma parcela selecionada.');
  const inst = state.installments.find(i => i.id === state.paymentInstallmentId);
  if (!inst) return showToast('Parcela não encontrada.');
  const paidValue = parseMoney($('payValue').value);
  if (!paidValue) return showToast('Informe o valor pago.');
  const expectedValue = Number(inst.expectedValue || 0);
  const discount = Math.max(0, expectedValue - paidValue);
  const interest = Math.max(0, paidValue - expectedValue);
  const paymentPayload = {
    debtId: inst.debtId,
    installmentId: inst.id,
    installmentNumber: inst.number,
    expectedDate: inst.dueDate,
    paymentDate: $('payDate').value,
    expectedValue,
    paidValue,
    discount,
    interest,
    notes: '',
    createdAt: serverTimestamp()
  };
  const created = await addDoc(collection(db, 'payments'), paymentPayload);
  await updateDoc(doc(db, 'installments', inst.id), { status: 'Paga', paidAt: $('payDate').value, updatedAt: serverTimestamp() });
  state.payments.push({ id: created.id, ...paymentPayload });
  inst.status = 'Paga';
  inst.paidAt = $('payDate').value;
  state.expandedDebtId = inst.debtId;
  const paidOff = await synchronizePaidOffDebts();
  const debtWasPaidOff = paidOff.some(debt => debt.id === inst.debtId);
  window.closePaymentForm();
  if (state.renderFn) state.renderFn();
  showToast(debtWasPaidOff ? 'Pagamento registrado. Dívida movida para encerradas.' : 'Pagamento registrado com sucesso.');
};

// --- Modal de edição de parcela ---

window.openInstallmentModal = function(installmentId) {
  window.closeDebtForm();
  window.closePaymentForm();
  const inst = state.installments.find(item => item.id === installmentId);
  if (!inst) return showToast('Parcela não encontrada.');
  state.editingInstallmentId = installmentId;
  $('editInstallmentDue').value = inst.dueDate || '';
  $('editInstallmentValue').value = brl(inst.expectedValue || 0);
  $('editInstallmentStatus').value = inst.status || 'Pendente';
  $('installmentModal').classList.add('show');
};

window.closeInstallmentModal = function() {
  state.editingInstallmentId = null;
  $('installmentModal').classList.remove('show');
};

window.saveInstallmentEdit = async function() {
  if (!state.editingInstallmentId) return showToast('Nenhuma parcela selecionada.');
  const inst = state.installments.find(item => item.id === state.editingInstallmentId);
  if (!inst) return showToast('Parcela não encontrada.');
  const dueDate = $('editInstallmentDue').value;
  const expectedValue = parseMoney($('editInstallmentValue').value);
  const status = $('editInstallmentStatus').value;
  if (!dueDate || !expectedValue) return showToast('Informe vencimento e valor previsto.');
  await updateDoc(doc(db, 'installments', state.editingInstallmentId), { dueDate, expectedValue, status, updatedAt: serverTimestamp() });
  inst.dueDate = dueDate;
  inst.expectedValue = expectedValue;
  inst.status = status;
  if (status !== 'Paga') delete inst.paidAt;
  await reactivateDebtIfOpen(inst.debtId);
  await synchronizePaidOffDebts();
  window.closeInstallmentModal();
  if (state.renderFn) state.renderFn();
  showToast('Parcela atualizada com sucesso.');
};

// --- Reativar dívida se parcelas abertas ---

export async function reactivateDebtIfOpen(debtId) {
  const debt = state.debts.find(d => d.id === debtId);
  if (!debt || debt.status !== 'Quitada' || !openInstallmentsForDebt(debt).length) return false;
  debt.status = 'Ativa';
  await updateDoc(doc(db, 'debts', debtId), { status: 'Ativa', updatedAt: serverTimestamp() });
  return true;
}
