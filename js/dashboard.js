import { state } from './state.js';
import { $, brl, escapeHtml, emptyCard, tag, currentMonthKey, formatDateBR, daysUntil, dueHint, creditorLogoHtml, compactTagsForDebt, getCreditorName } from './utils.js';
import { debtBalance, nextInstallment, isOpenInstallment, installmentProgress, monthsToClearDebt, debtPaid, debtPayments } from './calc.js';

export function renderDashboard() {
  const active = state.debts.filter(d => d.status === 'Ativa');
  const waiting = state.debts.filter(d => d.status === 'Em espera');
  const activeIds = new Set(active.map(d => d.id));
  const totalActive = active.reduce((sum, d) => sum + debtBalance(d), 0);
  const totalWaiting = waiting.reduce((sum, d) => sum + debtBalance(d), 0);
  const month = currentMonthKey();
  const monthInstallments = state.installments
    .filter(i => isOpenInstallment(i) && String(i.dueDate || '').startsWith(month) && activeIds.has(i.debtId))
    .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
  const monthCommitment = monthInstallments.reduce((sum, i) => sum + Number(i.expectedValue || 0), 0);
  const openInstallments = state.installments
    .filter(i => isOpenInstallment(i) && activeIds.has(i.debtId))
    .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));

  renderDashboardAction(active, openInstallments);
  renderDashboardSummary({ totalActive, totalWaiting, monthCommitment, monthInstallments, active });
  renderDeadlinePressure(active);
  renderDashboardDecision(active, openInstallments);
  renderDashboardInsights(active, openInstallments, totalActive);
}

function renderDeadlinePressure(activeDebts) {
  const container = $('deadlinePressure');
  if (!container) return;
  const groups = [
    { key: 'short', title: 'Curto prazo', hint: 'Até 6 meses', test: months => months <= 6 },
    { key: 'medium', title: 'Médio prazo', hint: 'De 6 a 12 meses', test: months => months > 6 && months <= 12 },
    { key: 'long', title: 'Longo prazo', hint: 'Acima de 12 meses', test: months => months > 12 }
  ].map(group => {
    const items = activeDebts.filter(debt => debtBalance(debt) > 0 && group.test(monthsToClearDebt(debt)));
    return { ...group, items, balance: items.reduce((sum, debt) => sum + debtBalance(debt), 0) };
  });

  container.innerHTML = groups.map(group => {
    return '<div class="pressure-card ' + group.key + '">' +
      '<div class="pressure-title">' + escapeHtml(group.title) + '</div>' +
      '<div class="metric-note">' + escapeHtml(group.hint) + '</div>' +
      '<div class="pressure-value">' + brl(group.balance) + '</div>' +
      '<div class="pressure-count">' + group.items.length + ' dívida(s)</div>' +
    '</div>';
  }).join('');
}

export function renderRenegotiatedHistory() {
  const container = $('renegotiatedHistoryList');
  if (!container) return;
  const renegotiated = state.debts
    .filter(debt => debt.status === 'Renegociada')
    .sort((a, b) => String(b.renegotiatedAt || b.updatedAt || '').localeCompare(String(a.renegotiatedAt || a.updatedAt || '')));

  if (!renegotiated.length) {
    container.innerHTML = emptyCard('Nenhuma dívida renegociada', 'Quando um acordo for salvo, as dívidas originais aparecerão aqui.');
    return;
  }

  container.innerHTML = renegotiated.map(debt => {
    const paid = debtPaid(debt);
    const balance = debtBalance(debt);
    const sourceInfo = debt.renegotiatedIntoDebtId ? '<span>Novo acordo vinculado</span>' : '';
    return '<div class="debt-card history-debt"><div class="debt-row">' +
      '<div class="debt-head">' + creditorLogoHtml(debt.creditorId) + '<div><div class="debt-name">' + escapeHtml(getCreditorName(debt.creditorId) + ' · ' + debt.name) + '</div><div class="debt-meta">' + tag('Renegociada', 'blue') + sourceInfo + '</div></div></div>' +
      '<div class="row-stat"><div class="metric-label">Saldo Anterior</div><strong>' + brl(balance) + '</strong></div>' +
      '<div class="row-stat"><div class="metric-label">Valor Pago</div><strong>' + brl(paid) + '</strong></div>' +
      '<div class="row-stat"><div class="metric-label">Parcelas</div><strong>' + installmentProgress(debt).paid + '/' + installmentProgress(debt).total + '</strong></div>' +
    '</div></div>';
  }).join('');
}

function renderDashboardAction(activeDebts, openInstallments) {
  const container = $('dashboardNextAction');
  if (!container) return;
  if (!activeDebts.length) {
    container.innerHTML = emptyCard('Nenhuma ação pendente', 'Cadastre ou ative uma dívida para montar sua próxima ação.');
    return;
  }
  const next = openInstallments[0] || null;
  if (!next) {
    container.innerHTML = '<div class="next-action-card"><div><div class="action-pill">Próxima ação recomendada</div><h2>Sem parcelas pendentes</h2><p>Todas as dívidas ativas estão sem cobrança aberta no momento.</p></div><button class="primary-action" onclick="goToDebtsAndNew()">Nova dívida</button></div>';
    return;
  }
  const debt = activeDebts.find(d => d.id === next.debtId);
  const title = debt ? getCreditorName(debt.creditorId) + ' · ' + debt.name : 'Dívida não encontrada';
  const impact = daysUntil(next.dueDate) < 0 ? 'regulariza atraso e reduz pressão imediata' : daysUntil(next.dueDate) <= 6 ? 'evita atraso e reduz pressão de curto prazo' : 'mantém sua rota em dia';
  container.innerHTML =
    '<div class="next-action-card">' +
      '<div class="next-action-content">' +
        '<div class="action-pill">Próxima ação recomendada</div>' +
        '<h2>Pagar ' + escapeHtml(title) + '</h2>' +
        '<p>Vence ' + dueHint(next.dueDate).toLowerCase() + ' · ' + formatDateBR(next.dueDate) + '</p>' +
        '<div class="next-action-value">' + brl(next.expectedValue) + '</div>' +
        '<div class="impact-line">Impacto: ' + escapeHtml(impact) + '.</div>' +
      '</div>' +
      '<button class="primary-action" onclick="window.openPaymentForm(\'' + next.id + '\')">Registrar pagamento</button>' +
    '</div>';
}

function renderDashboardSummary(data) {
  const container = $('dashboardSummary');
  if (!container) return;
  const statusText = data.active.length ? (data.monthCommitment > 0 ? 'Você está no caminho certo' : 'Sem pressão no mês atual') : 'Cadastre uma dívida ativa';
  container.innerHTML =
    '<div class="summary-card">' +
      '<h2 class="panel-title">Resumo geral</h2>' +
      '<div class="summary-grid">' +
        '<div><span>Na rota agora</span><strong>' + brl(data.totalActive) + '</strong></div>' +
        '<div><span>Em espera</span><strong>' + brl(data.totalWaiting) + '</strong></div>' +
        '<div><span>Compromisso do mês</span><strong>' + brl(data.monthCommitment) + '</strong></div>' +
        '<div><span>Parcelas do mês</span><strong>' + data.monthInstallments.length + '</strong><small>' + brl(data.monthCommitment) + '</small></div>' +
      '</div>' +
      '<div class="summary-status">' + escapeHtml(statusText) + '</div>' +
    '</div>';
}

function dashboardPriorityScore(debt) {
  const next = nextInstallment(debt);
  const days = next ? daysUntil(next.dueDate) : 999;
  const overdueScore = days < 0 ? 280 : 0;
  const dueScore = Math.max(0, 180 - Math.max(days, 0) * 6);
  const monthlyImpact = Number(debt.installmentValue || (next ? next.expectedValue : 0) || 0);
  const balance = debtBalance(debt);
  const payoffOpportunity = balance > 0 ? Math.max(0, 100 - balance / 1000) : 0;
  const criticalityScore = debt.criticality === 'Máxima' ? 180 : debt.criticality === 'Alta' ? 110 : 45;
  return overdueScore + dueScore + monthlyImpact / 35 + balance / 2500 + payoffOpportunity + criticalityScore;
}

function priorityReason(debt) {
  const next = nextInstallment(debt);
  const days = next ? daysUntil(next.dueDate) : null;
  if (days !== null && days < 0) return 'Parcela vencida pede regularização imediata';
  if (days !== null && days <= 6) return 'Vencimento muito próximo';
  if (debt.criticality === 'Máxima') return 'Criticidade máxima definida manualmente';
  if (Number(debt.installmentValue || 0) >= 1000) return 'Alto impacto mensal';
  if (monthsToClearDebt(debt) <= 6) return 'Ajuda a reduzir pressão de curto prazo';
  return 'Boa relação entre urgência e saldo';
}

function priorityTone(index) {
  if (index < 2) return { label: 'Alta prioridade', tone: 'danger' };
  if (index < 4) return { label: 'Média prioridade', tone: 'amber' };
  return { label: 'Baixa prioridade', tone: 'green' };
}

function renderDashboardDecision(activeDebts, openInstallments) {
  const upcomingContainer = $('dashboardUpcoming');
  const frontContainer = $('paymentFront');
  if (!upcomingContainer || !frontContainer) return;

  if (!activeDebts.length) {
    upcomingContainer.innerHTML = emptyCard('Sem vencimentos ativos', 'Os próximos compromissos aparecerão aqui.');
    frontContainer.innerHTML = emptyCard('Sem frente de pagamento', 'Ative uma dívida para calcular a estratégia.');
    return;
  }

  upcomingContainer.innerHTML = openInstallments.slice(0, 5).length ? openInstallments.slice(0, 5).map(item => {
    const debt = state.debts.find(d => d.id === item.debtId);
    const title = debt ? getCreditorName(debt.creditorId) + ' · ' + debt.name : 'Dívida não encontrada';
    return '<div class="decision-row due-row"><div><strong>' + escapeHtml(title) + '</strong><small>' + formatDateBR(item.dueDate) + ' · ' + dueHint(item.dueDate) + '</small></div><strong>' + brl(item.expectedValue) + '</strong><button class="ghost-btn" onclick="window.openDebtFromDashboard(\'' + item.debtId + '\')">Abrir</button></div>';
  }).join('') : emptyCard('Sem parcelas pendentes', 'Nenhuma parcela ativa encontrada na frente atual.');

  const ranked = [...activeDebts]
    .filter(debt => debtBalance(debt) > 0)
    .sort((a, b) => dashboardPriorityScore(b) - dashboardPriorityScore(a))
    .slice(0, 5);

  frontContainer.innerHTML = ranked.length ? ranked.map((debt, index) => {
    const next = nextInstallment(debt);
    const tone = priorityTone(index);
    const relevantValue = Number(debt.installmentValue || (next ? next.expectedValue : 0) || 0);
    return '<div class="front-row">' +
      '<div class="front-rank">' + (index + 1) + '</div>' +
      '<div><strong>' + escapeHtml(getCreditorName(debt.creditorId) + ' · ' + debt.name) + '</strong><small>' + escapeHtml(priorityReason(debt)) + (next ? ' · ' + dueHint(next.dueDate) : '') + '</small></div>' +
      '<span class="priority-badge ' + tone.tone + '">' + tone.label + '</span>' +
      '<div class="front-value">' + brl(relevantValue || debtBalance(debt)) + '</div>' +
      '<button class="ghost-btn" onclick="window.openDebtFromDashboard(\'' + debt.id + '\')">Abrir dívida</button>' +
    '</div>';
  }).join('') : emptyCard('Sem frente de pagamento', 'Nenhuma dívida ativa com saldo em aberto.');
}

function renderDashboardInsights(activeDebts, openInstallments, totalActive) {
  const container = $('dashboardInsights');
  if (!container) return;
  if (!activeDebts.length) {
    container.innerHTML = emptyCard('Sem insights ainda', 'Cadastre ou ative dívidas para gerar recomendações.');
    return;
  }
  const biggest = [...activeDebts].sort((a, b) => debtBalance(b) - debtBalance(a))[0];
  const critical = [...activeDebts].sort((a, b) => dashboardPriorityScore(b) - dashboardPriorityScore(a))[0];
  const opportunity = [...activeDebts].filter(d => debtBalance(d) > 0).sort((a, b) => debtBalance(a) - debtBalance(b))[0];
  const overdue = openInstallments.filter(item => daysUntil(item.dueDate) < 0);
  const rows = [
    { title: 'Maior pressão hoje', main: biggest ? getCreditorName(biggest.creditorId) : '-', value: biggest ? brl(debtBalance(biggest)) : brl(0), note: totalActive ? Math.round((debtBalance(biggest) / totalActive) * 100) + '% do total ativo' : 'Sem saldo ativo' },
    { title: 'Melhor oportunidade', main: opportunity ? getCreditorName(opportunity.creditorId) + ' · ' + opportunity.name : '-', value: opportunity ? brl(debtBalance(opportunity)) : brl(0), note: 'Menor saldo restante para quitação' },
    { title: 'Dívida mais crítica', main: critical ? getCreditorName(critical.creditorId) + ' · ' + critical.name : '-', value: nextInstallment(critical) ? brl(nextInstallment(critical).expectedValue) : brl(debtBalance(critical)), note: nextInstallment(critical) ? dueHint(nextInstallment(critical).dueDate) : 'Sem parcela pendente' },
    { title: 'Atrasos', main: overdue.length ? overdue.length + ' parcela(s)' : 'Nenhum atraso', value: brl(overdue.reduce((sum, item) => sum + Number(item.expectedValue || 0), 0)), note: overdue.length ? 'Regularize antes de avançar' : 'Continue mantendo a rota em dia' }
  ];
  container.innerHTML = rows.map(item => (
    '<div class="insight-tile"><div class="metric-label">' + escapeHtml(item.title) + '</div><strong>' + escapeHtml(item.main) + '</strong><div class="insight-value">' + escapeHtml(item.value) + '</div><small>' + escapeHtml(item.note) + '</small></div>'
  )).join('');
}

