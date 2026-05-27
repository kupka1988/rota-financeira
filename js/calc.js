import { state } from './state.js';
import { brl, byDueDate, escapeHtml } from './utils.js';
import { db, writeBatch, doc, serverTimestamp } from './firebase.js';

export function debtInstallments(debtId) { return state.installmentsByDebt.get(debtId) || []; }
export function debtPayments(debtId) { return state.paymentsByDebt.get(debtId) || []; }
export function debtTotal(debt) { return debtInstallments(debt.id).reduce((sum, item) => sum + Number(item.expectedValue || 0), 0); }
export function debtPaid(debt) { return debtPayments(debt.id).reduce((sum, item) => sum + Number(item.paidValue || 0), 0); }
export function debtDiscount(debt) { return debtPayments(debt.id).reduce((sum, item) => sum + Number(item.discount || 0), 0); }
export function debtInterest(debt) { return debtPayments(debt.id).reduce((sum, item) => sum + Number(item.interest || 0), 0); }
export function paidOffDifference(debt) { return debtTotal(debt) - debtPaid(debt); }

export function paidOffDifferenceLabel(value) {
  if (value > 0) return 'Desconto ' + brl(value);
  if (value < 0) return 'Pago a mais ' + brl(Math.abs(value));
  return 'Exato';
}

export function paidOffDifferenceClass(value) {
  if (value > 0) return 'green';
  if (value < 0) return 'red';
  return '';
}

export function dateKeyFromValue(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  if (value.seconds) return new Date(value.seconds * 1000).toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function paidOffClosedDateKey(debt) {
  if (debt.paidOffAt) return dateKeyFromValue(debt.paidOffAt);
  const paidPayments = debtPayments(debt.id).filter(p => p.paymentDate);
  if (!paidPayments.length) return null;
  const sorted = [...paidPayments].sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)));
  return sorted[0].paymentDate;
}

export function isOpenInstallment(item) { return !['Paga', 'Renegociada', 'Quitada', 'Cancelada'].includes(item.status); }

export function openInstallmentsForDebt(debt) {
  return debtInstallments(debt.id).filter(isOpenInstallment);
}

export function debtBalance(debt) {
  return openInstallmentsForDebt(debt).reduce((sum, item) => sum + Number(item.expectedValue || 0), 0);
}

export function payoffTodayValue(debt) { return Number(debt.payoffToday || 0); }
export function hasPayoffToday(debt) { return payoffTodayValue(debt) > 0; }

export function payoffTodayHtml(debt) {
  const value = payoffTodayValue(debt);
  const balance = debtBalance(debt);
  if (!value) return '<strong class="muted-value">—</strong>';
  const economy = balance - value;
  return '<strong>' + brl(value) + '</strong>' +
    (economy > 0 ? '<small class="payoff-economy">economia ' + brl(economy) + '</small>' : '');
}

export function installmentProgress(debt) {
  const items = debtInstallments(debt.id);
  const paid = items.filter(item => item.status === 'Paga' || item.status === 'Quitada').length;
  return { paid, total: items.length || Number(debt.installmentsQty || 0) || 0 };
}

export function debtProgress(debt) {
  const progress = installmentProgress(debt);
  return progress.total ? Math.min(100, Math.round((progress.paid / progress.total) * 100)) : 0;
}

export function nextInstallment(debt) {
  return openInstallmentsForDebt(debt).sort(byDueDate)[0] || null;
}

export function remainingInstallmentsCount(debt) {
  const items = debtInstallments(debt.id);
  if (!items.length) return Number(debt.installmentsQty || 0) || 0;
  return items.filter(isOpenInstallment).length;
}

export function monthsToClearDebt(debt) {
  const openItems = debtInstallments(debt.id).filter(isOpenInstallment).sort(byDueDate);
  if (!openItems.length) return 0;
  const lastDue = openItems[openItems.length - 1].dueDate;
  if (!lastDue) return Math.ceil(openItems.length / 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = new Date(lastDue + 'T00:00:00');
  const monthDiff = (last.getFullYear() - today.getFullYear()) * 12 + (last.getMonth() - today.getMonth());
  return Math.max(1, monthDiff + 1);
}

export function isPaidOffDebt(debt) {
  const items = debtInstallments(debt.id);
  return items.length > 0 && openInstallmentsForDebt(debt).length === 0;
}

export async function synchronizePaidOffDebts() {
  const completed = state.debts.filter(debt => ['Ativa', 'Em espera', 'Fora do radar'].includes(debt.status) && isPaidOffDebt(debt));
  if (!completed.length) return [];
  const batch = writeBatch(db);
  completed.forEach(debt => {
    debt.status = 'Quitada';
    batch.update(doc(db, 'debts', debt.id), { status: 'Quitada', paidOffAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  await batch.commit();
  return completed;
}

export function routeInstallmentStatusLabel(debt) {
  const progress = installmentProgress(debt);
  return progress.paid + '/' + progress.total;
}
