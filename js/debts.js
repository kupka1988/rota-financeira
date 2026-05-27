import { state } from './state.js';
import { $, brl, escapeHtml, emptyCard, tag, formatDateBR, getCreditorName, creditorLogoHtml, compactTagsForDebt, paymentForInstallment, dueHint, byDueDate, routeProgressHtml } from './utils.js';
import { debtBalance, debtTotal, debtPaid, paidOffDifference, paidOffDifferenceLabel, paidOffDifferenceClass, paidOffClosedDateKey, isOpenInstallment, openInstallmentsForDebt, debtProgress, nextInstallment, installmentProgress, payoffTodayHtml, routeInstallmentStatusLabel } from './calc.js';
import { renderDashboard } from './dashboard.js';
import { db, writeBatch, doc, serverTimestamp } from './firebase.js';

// --- Helpers de métrica ---

export function debtMetric(label, value, icon, tone) {
  return '<div class="debt-metric"><div class="metric-icon ' + tone + '">' + escapeHtml(icon) + '</div><div><div class="metric-label">' + escapeHtml(label) + '</div><div class="debt-value">' + escapeHtml(value) + '</div></div></div>';
}

function financeItem(label, value, isPrimary) {
  return '<div class="finance-item ' + (isPrimary ? 'primary' : '') + '"><div class="metric-label">' + escapeHtml(label) + '</div><div class="debt-value">' + escapeHtml(value) + '</div></div>';
}

function compactStat(label, value, extraHtml = '') {
  return '<div class="compact-stat"><div class="metric-label">' + escapeHtml(label) + '</div><strong>' + escapeHtml(value) + '</strong>' + extraHtml + '</div>';
}

// --- Ordenação e filtros ---

export function priorityScore(debt) {
  const next = nextInstallment(debt);
  const days = next ? Math.round((new Date(next.dueDate + 'T00:00:00') - new Date()) / 86400000) : 999;
  const overdueScore = days < 0 ? 280 : 0;
  const dueScore = Math.max(0, 180 - Math.max(days, 0) * 6);
  const monthlyImpact = Number(debt.installmentValue || 0);
  const balance = debtBalance(debt);
  const criticalityScore = debt.criticality === 'Máxima' ? 180 : debt.criticality === 'Alta' ? 110 : 45;
  return overdueScore + dueScore + monthlyImpact / 35 + balance / 2500 + criticalityScore;
}

export function sortDebts(items, mode) {
  if (mode === 'trail') return [...items].sort((a, b) => trailOrderValue(a) - trailOrderValue(b));
  if (mode === 'priority') return [...items].sort((a, b) => priorityScore(b) - priorityScore(a));
  if (mode === 'due') return [...items].sort((a, b) => {
    const na = nextInstallment(a), nb = nextInstallment(b);
    return String(na?.dueDate || '9999').localeCompare(String(nb?.dueDate || '9999'));
  });
  if (mode === 'balance') return [...items].sort((a, b) => debtBalance(b) - debtBalance(a));
  if (mode === 'name') return [...items].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  return items;
}

export function trailOrderValue(debt) {
  const order = Number(debt.payoffOrder || 0);
  return order > 0 ? order : 999999;
}

export function orderedTrailDebts() {
  return [...state.debts.filter(d => d.status === 'Ativa' || d.status === 'Quitada')]
    .sort((a, b) => {
      if (a.status === 'Quitada' && b.status !== 'Quitada') return 1;
      if (a.status !== 'Quitada' && b.status === 'Quitada') return -1;
      return trailOrderValue(a) - trailOrderValue(b);
    });
}

export function sortPaidOffDebts(items) {
  return [...items].sort((a, b) => {
    const ka = String(a.paidOffAt || a.updatedAt || '');
    const kb = String(b.paidOffAt || b.updatedAt || '');
    return kb.localeCompare(ka);
  });
}

export function sortedTrailDebts() {
  if (state.selectedTrailDebtSort === 'trail') return orderedTrailDebts();
  return sortDebts(state.debts.filter(d => d.status === 'Ativa'), state.selectedTrailDebtSort);
}

export function eligibleRenegotiationDebts() {
  return state.debts.filter(d => d.status === 'Ativa' || d.status === 'Em espera');
}

export function selectedRenegotiationDebts() {
  return state.debts.filter(d => state.selectedRenegotiationDebtIds.has(d.id));
}

export function nextPayoffOrder() {
  const max = state.debts.reduce((m, d) => Math.max(m, Number(d.payoffOrder || 0)), 0);
  return max + 1;
}

export function nextActiveRouteOrder(exceptId = null) {
  const active = state.debts.filter(d => d.status === 'Ativa' && d.id !== exceptId);
  const max = active.reduce((m, d) => Math.max(m, Number(d.payoffOrder || 0)), 0);
  return max + 1;
}

export function orderedWaitingDebts() {
  return [...state.debts.filter(d => d.status === 'Em espera')]
    .sort((a, b) => trailOrderValue(a) - trailOrderValue(b));
}

export function orderedHiddenDebts() {
  return [...state.debts.filter(d => d.status === 'Fora do radar')]
    .sort((a, b) => trailOrderValue(a) - trailOrderValue(b));
}

// --- Renderers de parcelas e expansão ---

function installmentRowsForDebt(debt) {
  const allItems = state.installmentsByDebt.get(debt.id) || [];
  if (!allItems.length) return '<div class="debt-meta" style="margin-top:14px;">Nenhuma parcela gerada para esta dívida.</div>';

  const pending = allItems.filter(isOpenInstallment).sort(byDueDate);
  const paid = allItems.filter(item => item.status === 'Paga' || item.status === 'Quitada').sort((a, b) => String(b.dueDate || '').localeCompare(String(a.dueDate || '')));
  const currentTab = state.expandedDebtTab === 'paid' ? 'paid' : 'pending';
  const source = currentTab === 'paid' ? paid : pending;
  const isPreview = state.expandedDebtListMode !== 'all';
  const visible = isPreview ? source.slice(0, 5) : source;
  const emptyText = currentTab === 'paid' ? 'Nenhuma parcela paga registrada.' : 'Nenhuma parcela pendente.';
  const buttonText = currentTab === 'paid' ? 'Ver parcelas pagas' : 'Ver todas as parcelas pendentes';
  const countText = currentTab === 'paid' ? '5 últimas' : '5 próximas';

  let html = '<div class="installment-tabs">' +
    '<button class="installment-tab ' + (currentTab === 'pending' ? 'is-active' : '') + '" onclick="window.setDebtInstallmentTab(\'pending\')">Pendentes <span>' + (currentTab === 'pending' ? escapeHtml(countText) : pending.length) + '</span></button>' +
    '<button class="installment-tab ' + (currentTab === 'paid' ? 'is-active' : '') + '" onclick="window.setDebtInstallmentTab(\'paid\')">Pagas <span>' + (currentTab === 'paid' ? escapeHtml(countText) : paid.length) + '</span></button>' +
  '</div>';

  html += '<div class="installment-list compact-installments">' +
    '<div class="installment-row header"><div>Parcela</div><div>Vencimento</div><div>Valor</div><div>Status</div><div>Ação</div></div>';

  if (!visible.length) {
    html += '<div class="installment-empty">' + escapeHtml(emptyText) + '</div>';
  } else {
    visible.forEach(item => {
      const statusClass = item.status === 'Paga' || item.status === 'Quitada' ? 'green' : item.status === 'Renegociada' ? 'blue' : 'amber';
      const payment = paymentForInstallment(item.id);
      const actionHtml = currentTab === 'paid'
        ? (payment ? '<button class="ghost-btn mini-action" onclick="window.openDeleteModal(\'payment\', \'' + payment.id + '\')">Excluir pagamento</button>' : '')
        : '<button class="ghost-btn mini-action" onclick="window.openPaymentForm(\'' + item.id + '\')">Registrar pagamento</button>';
      html += '<div class="installment-row">' +
        '<div data-label="Parcela"><strong>' + item.number + '/' + item.total + '</strong></div>' +
        '<div data-label="Vencimento">' + formatDateBR(item.dueDate) + '</div>' +
        '<div data-label="Valor">' + brl(item.expectedValue) + '</div>' +
        '<div data-label="Status"><span class="tag ' + statusClass + '">' + escapeHtml(item.status || 'Pendente') + '</span></div>' +
        '<div data-label="Ação">' + actionHtml + '</div>' +
      '</div>';
    });
  }

  if (source.length && isPreview) {
    html += '<button class="installment-more" onclick="window.showAllDebtInstallments()">' + escapeHtml(buttonText) + '<span>›</span></button>';
  }

  html += '</div>';
  return html;
}

function debtActionMenu(debt) {
  const actionsByStatus = {
    Ativa: [
      ['Mover para Em Espera', 'changeDebtStatus', 'Em espera'],
      ['Mover para Fora do Radar', 'changeDebtStatus', 'Fora do radar'],
      ['Quitar dívida', 'openPayoffModal'],
      ['Editar dívida', 'openDebtForm'],
      ['Excluir dívida', 'openDeleteModal', 'danger']
    ],
    'Em espera': [
      ['Mover para Rota Financeira', 'changeDebtStatus', 'Ativa'],
      ['Mover para Fora do Radar', 'changeDebtStatus', 'Fora do radar'],
      ['Quitar dívida', 'openPayoffModal'],
      ['Editar dívida', 'openDebtForm'],
      ['Excluir dívida', 'openDeleteModal', 'danger']
    ],
    'Fora do radar': [
      ['Mover para Rota Financeira', 'changeDebtStatus', 'Ativa'],
      ['Mover para Em Espera', 'changeDebtStatus', 'Em espera'],
      ['Quitar dívida', 'openPayoffModal'],
      ['Editar dívida', 'openDebtForm'],
      ['Excluir dívida', 'openDeleteModal', 'danger']
    ],
    Quitada: [
      ['Restaurar para Rota Financeira', 'changeDebtStatus', 'Ativa'],
      ['Restaurar para Em Espera', 'changeDebtStatus', 'Em espera'],
      ['Restaurar para Fora do Radar', 'changeDebtStatus', 'Fora do radar'],
      ['Editar dívida', 'openDebtForm'],
      ['Excluir dívida', 'openDeleteModal', 'danger']
    ]
  };
  const actions = actionsByStatus[debt.status] || actionsByStatus.Ativa;
  const buttons = actions.map(action => {
    const [label, type, valueOrTone, maybeTone] = action;
    const tone = valueOrTone === 'danger' || maybeTone === 'danger' ? ' danger-btn' : '';
    let onclick = '';
    if (type === 'changeDebtStatus') onclick = 'window.changeDebtStatus(\'' + debt.id + '\', \'' + valueOrTone + '\')';
    if (type === 'openPayoffModal') onclick = 'window.openPayoffModal(\'' + debt.id + '\')';
    if (type === 'openDebtForm') onclick = 'window.openDebtForm(\'edit\', \'' + debt.id + '\')';
    if (type === 'openDeleteModal') onclick = 'window.openDeleteModal(\'debt\', \'' + debt.id + '\')';
    return '<button class="ghost-btn' + tone + '" onclick="' + onclick + '">' + escapeHtml(label) + '</button>';
  }).join('');
  return '<details class="more-actions debt-menu"><summary class="ghost-btn">Ações <span>⋮</span></summary><div class="more-menu">' + buttons + '</div></details>';
}

function debtExpandedDetail(debt) {
  const next = nextInstallment(debt);
  const installmentCount = installmentProgress(debt);
  const nextLabel = next ? formatDateBR(next.dueDate) : 'Sem Parcela';
  return '<div class="debt-detail">' +
    '<div class="debt-expanded-head">' +
      '<div class="expanded-facts">' +
        '<div><span>Criada em</span><strong>' + formatAnyDateBR(debt.createdAt) + '</strong></div>' +
        '<div><span>Tipo</span><strong>' + escapeHtml(debt.type || '-') + '</strong></div>' +
        '<div><span>Parcelas pagas</span><strong>' + installmentCount.paid + ' de ' + installmentCount.total + '</strong></div>' +
        '<div><span>Próximo vencimento</span><strong>' + escapeHtml(nextLabel) + '</strong><small>' + escapeHtml(next ? dueHint(next.dueDate) : '') + '</small></div>' +
      '</div>' +
      debtActionMenu(debt) +
    '</div>' +
    installmentRowsForDebt(debt) +
  '</div>';
}

export function debtRouteGridRow(debt, index, mode) {
  const balance = debtBalance(debt);
  const isExpanded = state.expandedDebtId === debt.id;
  const next = nextInstallment(debt);
  const nextLabel = next ? formatDateBR(next.dueDate) : 'Sem parcela';
  const progressValue = debt.status === 'Quitada' ? 100 : debtProgress(debt);
  const config = {
    waiting: { className: 'waiting-route-item', start: 'startWaitingDebtDrag', over: 'waitingDebtDragOver', drop: 'dropWaitingDebt', end: 'endWaitingDebtDrag', move: 'moveWaitingDebt' },
    hidden: { className: 'hidden-route-item', start: 'startHiddenDebtDrag', over: 'hiddenDebtDragOver', drop: 'dropHiddenDebt', end: 'endHiddenDebtDrag', move: 'moveHiddenDebt' }
  }[mode] || {};
  return '<div class="route-item ' + config.className + (isExpanded ? ' expanded' : '') + '" data-debt-id="' + debt.id + '" draggable="true" ondragstart="window.' + config.start + '(event, \'' + debt.id + '\')" ondragover="window.' + config.over + '(event)" ondrop="window.' + config.drop + '(event, \'' + debt.id + '\')" ondragend="window.' + config.end + '()">' +
    '<button class="drag-handle" title="Arrastar para reordenar">⋮⋮</button>' +
    '<div class="route-rank">' + (index + 1) + '</div>' +
    '<div class="route-title">' + creditorLogoHtml(debt.creditorId) + '<div><div class="debt-name clickable" onclick="window.toggleDebt(\'' + debt.id + '\')">' + escapeHtml(getCreditorName(debt.creditorId) + ' · ' + debt.name) + '</div><div class="debt-meta">' + compactTagsForDebt(debt) + '</div></div></div>' +
    routeProgressHtml(progressValue) +
    '<div class="route-stat"><span>Parcela</span><strong>' + brl(debt.installmentValue) + '</strong></div>' +
    '<div class="route-stat"><span>Próxima Parcela</span><strong>' + escapeHtml(nextLabel) + '</strong></div>' +
    '<div class="route-stat"><span>Status</span><strong>' + routeInstallmentStatusLabel(debt) + '</strong></div>' +
    '<div class="route-stat"><span>Saldo</span><strong>' + brl(balance) + '</strong></div>' +
    '<div class="route-stat payoff-stat"><span>Quitação Hoje</span>' + payoffTodayHtml(debt) + '</div>' +
    '<div class="route-actions"><button class="ghost-btn subtle" onclick="window.' + config.move + '(\'' + debt.id + '\', -1)">↑</button><button class="ghost-btn subtle" onclick="window.' + config.move + '(\'' + debt.id + '\', 1)">↓</button><button class="ghost-btn row-toggle" onclick="window.toggleDebt(\'' + debt.id + '\')">' + (isExpanded ? '⌃' : '⌄') + '</button></div>' +
    (isExpanded ? debtExpandedDetail(debt) : '') +
  '</div>';
}

export function paidOffDebtRow(debt, index) {
  const originalValue = debtTotal(debt);
  const paidValue = debtPaid(debt);
  const difference = paidOffDifference(debt);
  const closedDate = paidOffClosedDateKey(debt);
  return '<div class="route-item paid-route-item done" data-debt-id="' + debt.id + '">' +
    '<div class="route-rank">' + (index + 1) + '</div>' +
    '<div class="route-title">' + creditorLogoHtml(debt.creditorId) + '<div><div class="debt-name">' + escapeHtml(getCreditorName(debt.creditorId) + ' · ' + debt.name) + '</div><div class="debt-meta">' + tag('Quitada', 'green') + '</div></div></div>' +
    '<div class="route-stat"><span>Valor Original</span><strong>' + brl(originalValue) + '</strong></div>' +
    '<div class="route-stat"><span>Valor Pago</span><strong>' + brl(paidValue) + '</strong></div>' +
    '<div class="route-stat paid-difference ' + paidOffDifferenceClass(difference) + '"><span>Diferença</span><strong>' + escapeHtml(paidOffDifferenceLabel(difference)) + '</strong></div>' +
    '<div class="route-stat"><span>Encerrada em</span><strong>' + escapeHtml(closedDate ? formatDateBR(closedDate) : '-') + '</strong></div>' +
    '<div class="route-actions paid-off-actions"><button class="ghost-btn danger-btn" onclick="window.openDeleteModal(\'debt\', \'' + debt.id + '\')">Excluir</button></div>' +
  '</div>';
}

// --- Métricas por seção ---

function renderWaitingDebtMetrics(waitingDebts) {
  const container = $('waitingDebtMetrics');
  if (!container) return;
  const waitingIds = new Set(waitingDebts.map(d => d.id));
  const waitingInstallments = state.installments.filter(i => isOpenInstallment(i) && waitingIds.has(i.debtId));
  const totalBalance = waitingDebts.reduce((sum, debt) => sum + debtBalance(debt), 0);
  const month = new Date().toISOString().slice(0, 7);
  const monthlyPressure = waitingInstallments
    .filter(i => String(i.dueDate || '').startsWith(month))
    .reduce((sum, item) => sum + Number(item.expectedValue || 0), 0);
  const maxPriority = waitingDebts.filter(d => d.criticality === 'Máxima').length;
  container.innerHTML =
    debtMetric('Saldo em Espera', brl(totalBalance), '◌', 'blue') +
    debtMetric('Dívidas em Espera', String(waitingDebts.length), '▥', '') +
    debtMetric('Parcelas Pendentes', String(waitingInstallments.length), '◷', 'red') +
    debtMetric('Pressão no Mês', brl(monthlyPressure), maxPriority ? '!' : '▤', maxPriority ? 'red' : 'green');
}

function renderWaitingCreditorFilters(waitingDebts) {
  const container = $('waitingCreditorFilters');
  if (!container) return;
  const creditorIds = [...new Set(waitingDebts.map(d => d.creditorId).filter(Boolean))]
    .sort((a, b) => String(getCreditorName(a)).localeCompare(String(getCreditorName(b)), 'pt-BR', { sensitivity: 'base' }));
  let html = '<button class="ghost-btn ' + (state.selectedWaitingCreditorFilter === 'all' ? 'is-active' : '') + '" onclick="window.filterWaitingByCreditor(\'all\')">◌ Todos <span class="filter-count">' + waitingDebts.length + '</span></button>';
  creditorIds.forEach(id => {
    const count = waitingDebts.filter(d => d.creditorId === id).length;
    html += '<button class="ghost-btn ' + (state.selectedWaitingCreditorFilter === id ? 'is-active' : '') + '" onclick="window.filterWaitingByCreditor(\'' + id + '\')">' + creditorLogoHtml(id) + escapeHtml(getCreditorName(id)) + '<span class="filter-count">' + count + '</span></button>';
  });
  container.innerHTML = html;
}

function renderHiddenDebtMetrics(hiddenDebts) {
  const container = $('hiddenDebtMetrics');
  if (!container) return;
  const hiddenIds = new Set(hiddenDebts.map(d => d.id));
  const hiddenInstallments = state.installments.filter(i => isOpenInstallment(i) && hiddenIds.has(i.debtId));
  const totalBalance = hiddenDebts.reduce((sum, debt) => sum + debtBalance(debt), 0);
  const creditorsCount = new Set(hiddenDebts.map(d => d.creditorId).filter(Boolean)).size;
  container.innerHTML =
    debtMetric('Saldo Fora do Radar', brl(totalBalance), '◎', 'blue') +
    debtMetric('Dívidas Arquivadas', String(hiddenDebts.length), '▥', '') +
    debtMetric('Credores', String(creditorsCount), '◌', 'green') +
    debtMetric('Parcelas Reconhecidas', String(hiddenInstallments.length), '◷', 'red');
}

function renderHiddenCreditorFilters(hiddenDebts) {
  const container = $('hiddenCreditorFilters');
  if (!container) return;
  const creditorIds = [...new Set(hiddenDebts.map(d => d.creditorId).filter(Boolean))]
    .sort((a, b) => String(getCreditorName(a)).localeCompare(String(getCreditorName(b)), 'pt-BR', { sensitivity: 'base' }));
  let html = '<button class="ghost-btn ' + (state.selectedHiddenCreditorFilter === 'all' ? 'is-active' : '') + '" onclick="window.filterHiddenByCreditor(\'all\')">◎ Todos <span class="filter-count">' + hiddenDebts.length + '</span></button>';
  creditorIds.forEach(id => {
    const count = hiddenDebts.filter(d => d.creditorId === id).length;
    html += '<button class="ghost-btn ' + (state.selectedHiddenCreditorFilter === id ? 'is-active' : '') + '" onclick="window.filterHiddenByCreditor(\'' + id + '\')">' + creditorLogoHtml(id) + escapeHtml(getCreditorName(id)) + '<span class="filter-count">' + count + '</span></button>';
  });
  container.innerHTML = html;
}

function renderPaidOffCreditorFilters(paidOffDebts) {
  const container = $('paidOffCreditorFilters');
  if (!container) return;
  const creditorIds = [...new Set(paidOffDebts.map(d => d.creditorId).filter(Boolean))]
    .sort((a, b) => String(getCreditorName(a)).localeCompare(String(getCreditorName(b)), 'pt-BR', { sensitivity: 'base' }));
  let html = '<button class="ghost-btn ' + (state.selectedPaidOffCreditorFilter === 'all' ? 'is-active' : '') + '" onclick="window.filterPaidOffByCreditor(\'all\')">✓ Todos <span class="filter-count">' + paidOffDebts.length + '</span></button>';
  creditorIds.forEach(id => {
    const count = paidOffDebts.filter(d => d.creditorId === id).length;
    html += '<button class="ghost-btn ' + (state.selectedPaidOffCreditorFilter === id ? 'is-active' : '') + '" onclick="window.filterPaidOffByCreditor(\'' + id + '\')">' + creditorLogoHtml(id) + escapeHtml(getCreditorName(id)) + '<span class="filter-count">' + count + '</span></button>';
  });
  container.innerHTML = html;
}

function renderPaidOffDebtMetrics(filteredPaidOffDebts) {
  const container = $('paidOffDebtMetrics');
  if (!container) return;
  const totalOriginal = filteredPaidOffDebts.reduce((sum, debt) => sum + debtTotal(debt), 0);
  const totalPaid = filteredPaidOffDebts.reduce((sum, debt) => sum + debtPaid(debt), 0);
  const creditorsCount = new Set(filteredPaidOffDebts.map(d => d.creditorId).filter(Boolean)).size;
  container.innerHTML =
    debtMetric('Dívidas Quitadas', String(filteredPaidOffDebts.length), '✓', 'green') +
    debtMetric('Valor Original', brl(totalOriginal), '▣', 'blue') +
    debtMetric('Valor Pago', brl(totalPaid), '▤', '') +
    debtMetric('Credores', String(creditorsCount), '◌', '');
}

// --- Render principal ---

export function renderDebts() {
  const waitingAll = state.debts.filter(d => d.status === 'Em espera');
  const waitingFiltered = state.selectedWaitingCreditorFilter === 'all' ? waitingAll : waitingAll.filter(d => d.creditorId === state.selectedWaitingCreditorFilter);
  const waiting = sortDebts(waitingFiltered, state.selectedWaitingDebtSort);
  const hiddenAll = state.debts.filter(d => d.status === 'Fora do radar');
  const hiddenFiltered = state.selectedHiddenCreditorFilter === 'all' ? hiddenAll : hiddenAll.filter(d => d.creditorId === state.selectedHiddenCreditorFilter);
  const hidden = sortDebts(hiddenFiltered, state.selectedHiddenDebtSort);
  const paidOffAll = state.debts.filter(d => d.status === 'Quitada');
  const paidOffFiltered = state.selectedPaidOffCreditorFilter === 'all' ? paidOffAll : paidOffAll.filter(d => d.creditorId === state.selectedPaidOffCreditorFilter);
  const paidOff = sortPaidOffDebts(paidOffFiltered);
  renderWaitingCreditorFilters(waitingAll);
  renderWaitingDebtMetrics(waitingAll);
  renderHiddenCreditorFilters(hiddenAll);
  renderHiddenDebtMetrics(hiddenAll);
  renderPaidOffCreditorFilters(paidOffAll);
  renderPaidOffDebtMetrics(paidOff);
  $('waitingDebts').innerHTML = waiting.length ? waiting.map((debt, index) => debtRouteGridRow(debt, index, 'waiting')).join('') : emptyCard('Nenhuma dívida em espera', state.selectedWaitingCreditorFilter === 'all' ? 'As dívidas fora da frente atual aparecerão aqui.' : 'Não há dívidas em espera para este credor.');
  $('hiddenDebts').innerHTML = hidden.length ? hidden.map((debt, index) => debtRouteGridRow(debt, index, 'hidden')).join('') : emptyCard('Nada fora do radar', state.selectedHiddenCreditorFilter === 'all' ? 'As dívidas que você não quer acompanhar aparecerão aqui.' : 'Não há dívidas fora do radar para este credor.');
  $('paidOffDebts').innerHTML = paidOff.length ? paidOff.map((debt, index) => paidOffDebtRow(debt, index)).join('') : emptyCard('Nenhuma dívida quitada', state.selectedPaidOffCreditorFilter === 'all' ? 'Quando uma dívida ficar sem parcelas abertas, ela aparecerá aqui.' : 'Não há dívidas quitadas para este credor.');
  renderDashboard();
}

// --- Ações de filtro e ordenação ---

window.filterWaitingByCreditor = function(id) {
  state.selectedWaitingCreditorFilter = id;
  state.expandedDebtId = null;
  renderDebts();
};

window.filterHiddenByCreditor = function(id) {
  state.selectedHiddenCreditorFilter = id;
  state.expandedDebtId = null;
  renderDebts();
};

window.filterPaidOffByCreditor = function(id) {
  state.selectedPaidOffCreditorFilter = id;
  state.expandedDebtId = null;
  renderDebts();
};

window.setWaitingDebtSort = function(mode) {
  state.selectedWaitingDebtSort = mode;
  state.expandedDebtId = null;
  renderDebts();
};

window.setHiddenDebtSort = function(mode) {
  state.selectedHiddenDebtSort = mode;
  state.expandedDebtId = null;
  renderDebts();
};

window.toggleDebt = function(id) {
  const nextExpanded = state.expandedDebtId === id ? null : id;
  if (state.expandedDebtId !== id) {
    state.expandedDebtTab = 'pending';
    state.expandedDebtListMode = 'preview';
  }
  state.expandedDebtId = nextExpanded;
  if (state.renderFn) state.renderFn();
};

window.setDebtInstallmentTab = function(tab) {
  state.expandedDebtTab = tab === 'paid' ? 'paid' : 'pending';
  state.expandedDebtListMode = 'preview';
  if (state.renderFn) state.renderFn();
};

window.showAllDebtInstallments = function() {
  state.expandedDebtListMode = 'all';
  if (state.renderFn) state.renderFn();
};

// --- Drag & drop Em espera ---

async function persistWaitingOrder(route) {
  const batch = writeBatch(db);
  route.forEach((debt, index) => {
    const payoffOrder = index + 1;
    batch.update(doc(db, 'debts', debt.id), { payoffOrder, updatedAt: serverTimestamp() });
    const local = state.debts.find(item => item.id === debt.id);
    if (local) local.payoffOrder = payoffOrder;
  });
  await batch.commit();
  state.selectedWaitingDebtSort = 'trail';
  if ($('waitingDebtSort')) $('waitingDebtSort').value = 'trail';
  if (state.renderFn) state.renderFn();
  showToast('Ordem de espera atualizada.');
}

window.moveWaitingDebt = async function(id, direction) {
  const route = orderedWaitingDebts().map((debt, index) => ({ ...debt, payoffOrder: index + 1 }));
  const currentIndex = route.findIndex(debt => debt.id === id);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= route.length) return;
  const current = route[currentIndex];
  route[currentIndex] = route[nextIndex];
  route[nextIndex] = current;
  await persistWaitingOrder(route);
};

window.startWaitingDebtDrag = function(event, id) {
  state.draggedWaitingDebtId = id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }
  const item = event.currentTarget;
  if (item) item.classList.add('dragging');
};

window.waitingDebtDragOver = function(event) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
};

window.dropWaitingDebt = async function(event, targetId) {
  event.preventDefault();
  const sourceId = state.draggedWaitingDebtId || event.dataTransfer?.getData('text/plain');
  state.draggedWaitingDebtId = null;
  document.querySelectorAll('.waiting-route-item.dragging').forEach(item => item.classList.remove('dragging'));
  if (!sourceId || sourceId === targetId) return;
  const route = orderedWaitingDebts();
  const from = route.findIndex(debt => debt.id === sourceId);
  const to = route.findIndex(debt => debt.id === targetId);
  if (from < 0 || to < 0) return;
  const [moved] = route.splice(from, 1);
  route.splice(to, 0, moved);
  await persistWaitingOrder(route);
};

window.endWaitingDebtDrag = function() {
  state.draggedWaitingDebtId = null;
  document.querySelectorAll('.waiting-route-item.dragging').forEach(item => item.classList.remove('dragging'));
};

// --- Drag & drop Fora do radar ---

async function persistHiddenOrder(route) {
  const batch = writeBatch(db);
  route.forEach((debt, index) => {
    const payoffOrder = index + 1;
    batch.update(doc(db, 'debts', debt.id), { payoffOrder, updatedAt: serverTimestamp() });
    const local = state.debts.find(item => item.id === debt.id);
    if (local) local.payoffOrder = payoffOrder;
  });
  await batch.commit();
  if (state.renderFn) state.renderFn();
  showToast('Ordem fora do radar atualizada.');
}

window.moveHiddenDebt = async function(id, direction) {
  const route = orderedHiddenDebts().map((debt, index) => ({ ...debt, payoffOrder: index + 1 }));
  const currentIndex = route.findIndex(debt => debt.id === id);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= route.length) return;
  const current = route[currentIndex];
  route[currentIndex] = route[nextIndex];
  route[nextIndex] = current;
  await persistHiddenOrder(route);
};

window.startHiddenDebtDrag = function(event, id) {
  state.draggedHiddenDebtId = id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }
  const item = event.currentTarget;
  if (item) item.classList.add('dragging');
};

window.hiddenDebtDragOver = function(event) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
};

window.dropHiddenDebt = async function(event, targetId) {
  event.preventDefault();
  const sourceId = state.draggedHiddenDebtId || event.dataTransfer?.getData('text/plain');
  state.draggedHiddenDebtId = null;
  document.querySelectorAll('.hidden-route-item.dragging').forEach(item => item.classList.remove('dragging'));
  if (!sourceId || sourceId === targetId) return;
  const route = orderedHiddenDebts();
  const from = route.findIndex(debt => debt.id === sourceId);
  const to = route.findIndex(debt => debt.id === targetId);
  if (from < 0 || to < 0) return;
  const [moved] = route.splice(from, 1);
  route.splice(to, 0, moved);
  await persistHiddenOrder(route);
};

window.endHiddenDebtDrag = function() {
  state.draggedHiddenDebtId = null;
  document.querySelectorAll('.hidden-route-item.dragging').forEach(item => item.classList.remove('dragging'));
};

// Helper local para showToast sem importação circular
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

// Helper local para formatAnyDateBR
function formatAnyDateBR(value) {
  if (!value) return '-';
  if (typeof value === 'string') return formatDateBR(value.slice(0, 10));
  if (typeof value.toDate === 'function') return value.toDate().toLocaleDateString('pt-BR');
  if (value.seconds) return new Date(value.seconds * 1000).toLocaleDateString('pt-BR');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
}
