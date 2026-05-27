export const state = {
  debts: [],
  creditors: [],
  installments: [],
  payments: [],
  installmentsByDebt: new Map(),
  paymentsByDebt: new Map(),
  paymentByInstallment: new Map(),
  editingDebtId: null,
  editingCreditorId: null,
  paymentInstallmentId: null,
  deleteContext: null,
  selectedWaitingCreditorFilter: 'all',
  selectedHiddenCreditorFilter: 'all',
  selectedPaidOffCreditorFilter: 'all',
  selectedTrailDebtSort: 'trail',
  selectedWaitingDebtSort: 'priority',
  selectedHiddenDebtSort: 'priority',
  selectedRenegotiationDebtIds: new Set(),
  expandedDebtId: null,
  expandedDebtTab: 'pending',
  expandedDebtListMode: 'preview',
  payoffDebtId: null,
  editingInstallmentId: null,
  draggedRouteDebtId: null,
  draggedWaitingDebtId: null,
  draggedHiddenDebtId: null,
  userPreferences: {},
  renderFn: null,
  loadAllFn: null
};

export function groupBy(items, key) {
  const grouped = new Map();
  items.forEach(item => {
    const value = item[key];
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(item);
  });
  return grouped;
}

export function rebuildIndexes() {
  state.installmentsByDebt = groupBy(state.installments, 'debtId');
  state.paymentsByDebt = groupBy(state.payments, 'debtId');
  state.paymentByInstallment = new Map(state.payments.map(item => [item.installmentId, item]));
}
