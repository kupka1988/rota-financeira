import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
    import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

    const firebaseConfig = {
      apiKey: "AIzaSyCgl40mgzun6Ut08wo30_KqJ-z62KHVxdw",
      authDomain: "rota-financeira-1475a.firebaseapp.com",
      projectId: "rota-financeira-1475a",
      storageBucket: "rota-financeira-1475a.firebasestorage.app",
      messagingSenderId: "196415753061",
      appId: "1:196415753061:web:999bb5ce542ce8b3baef8c",
      measurementId: "G-46FT3P8V2H"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    let debts = [];
    let creditors = [];
    let installments = [];
    let payments = [];
    let installmentsByDebt = new Map();
    let paymentsByDebt = new Map();
    let paymentByInstallment = new Map();
    let editingDebtId = null;
    let editingCreditorId = null;
    let paymentInstallmentId = null;
    let deleteContext = null;
    let selectedCreditorFilter = 'all';
    let selectedPriorityFilter = 'all';
    let selectedWaitingCreditorFilter = 'all';
    let selectedDebtSort = 'priority';
    let selectedWaitingDebtSort = 'priority';
    let expandedDebtId = null;

    const $ = (id) => document.getElementById(id);

    function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    function parseMoney(value) {
      if (typeof value === 'number') return value;
      if (!value) return 0;
      return Number(String(value).replace(/R\$/g, '').replace(/\./g, '').replace(',', '.').trim()) || 0;
    }
    function formatDateBR(dateString) { return dateString ? new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR') : '-'; }
    function addMonths(dateString, months) {
      const date = new Date(dateString + 'T00:00:00');
      const day = date.getDate();
      date.setMonth(date.getMonth() + months);
      if (date.getDate() !== day) date.setDate(0);
      return date.toISOString().slice(0, 10);
    }
    function currentMonthKey() { return new Date().toISOString().slice(0, 7); }
    function byDueDate(a, b) { return String(a.dueDate || '').localeCompare(String(b.dueDate || '')); }

    function showToast(message) {
      const toast = $('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2600);
    }

    function emptyCard(title, text) {
      return '<div class="debt-card"><div class="debt-name">' + escapeHtml(title) + '</div><div class="debt-meta">' + escapeHtml(text) + '</div></div>';
    }

    function getCreditorName(id) {
      const creditor = creditors.find(c => c.id === id);
      return creditor ? creditor.name : 'Credor não informado';
    }

    function compareText(a, b) {
      return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
    }

    function sortedCreditors() {
      return [...creditors].sort((a, b) => compareText(a.name, b.name));
    }

    function groupBy(items, key) {
      const grouped = new Map();
      items.forEach(item => {
        const value = item[key];
        if (!grouped.has(value)) grouped.set(value, []);
        grouped.get(value).push(item);
      });
      return grouped;
    }
    function rebuildIndexes() {
      installmentsByDebt = groupBy(installments, 'debtId');
      paymentsByDebt = groupBy(payments, 'debtId');
      paymentByInstallment = new Map(payments.map(item => [item.installmentId, item]));
    }
    function debtInstallments(debtId) { return installmentsByDebt.get(debtId) || []; }
    function debtPayments(debtId) { return paymentsByDebt.get(debtId) || []; }
    function debtTotal(debt) { return debtInstallments(debt.id).reduce((sum, item) => sum + Number(item.expectedValue || 0), 0); }
    function debtPaid(debt) { return debtPayments(debt.id).reduce((sum, item) => sum + Number(item.paidValue || 0), 0); }
    function debtDiscount(debt) { return debtPayments(debt.id).reduce((sum, item) => sum + Number(item.discount || 0), 0); }
    function debtInterest(debt) { return debtPayments(debt.id).reduce((sum, item) => sum + Number(item.interest || 0), 0); }
    function debtBalance(debt) { return Math.max(0, debtTotal(debt) - debtPaid(debt)); }
    function debtProgress(debt) {
      const total = debtTotal(debt);
      return total ? Math.min(100, Math.round((debtPaid(debt) / total) * 100)) : 0;
    }
    function nextInstallment(debt) {
      return debtInstallments(debt.id).filter(i => i.status !== 'Paga').sort(byDueDate)[0] || null;
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function tag(label, tone) {
      return '<span class="tag ' + tone + '">' + escapeHtml(label) + '</span>';
    }

    function normalizeText(value) {
      return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    function creditorDomain(name) {
      const value = normalizeText(name);
      const domains = [
        ['mercado pago', 'mercadopago.com.br'],
        ['mercadopago', 'mercadopago.com.br'],
        ['nubank', 'nubank.com.br'],
        ['nu bank', 'nubank.com.br'],
        ['itau', 'itau.com.br'],
        ['santander', 'santander.com.br'],
        ['banco inter', 'bancointer.com.br'],
        ['inter', 'bancointer.com.br'],
        ['bradesco', 'bradesco.com.br'],
        ['caixa', 'caixa.gov.br'],
        ['cef', 'caixa.gov.br'],
        ['banco do brasil', 'bb.com.br'],
        ['bb', 'bb.com.br'],
        ['sicredi', 'sicredi.com.br'],
        ['sicoob', 'sicoob.com.br'],
        ['banrisul', 'banrisul.com.br'],
        ['btg', 'btgpactual.com'],
        ['btg pactual', 'btgpactual.com'],
        ['xp', 'xpinc.com'],
        ['rico', 'rico.com.vc'],
        ['clear', 'clear.com.br'],
        ['modal', 'modalmais.com.br'],
        ['modalmais', 'modalmais.com.br'],
        ['pagbank', 'pagbank.com.br'],
        ['pagseguro', 'pagseguro.uol.com.br'],
        ['stone', 'stone.com.br'],
        ['ton', 'ton.com.br'],
        ['cora', 'cora.com.br'],
        ['infinitepay', 'infinitepay.io'],
        ['infinite pay', 'infinitepay.io'],
        ['iti', 'iti.itau'],
        ['original', 'original.com.br'],
        ['bmg', 'bancobmg.com.br'],
        ['sofisa', 'sofisa.com.br'],
        ['daycoval', 'daycoval.com.br'],
        ['safra', 'safra.com.br'],
        ['agibank', 'agibank.com.br'],
        ['digio', 'digio.com.br'],
        ['bv', 'bv.com.br'],
        ['banco bv', 'bv.com.br'],
        ['serasa', 'serasa.com.br'],
        ['picpay', 'picpay.com'],
        ['c6', 'c6bank.com.br'],
        ['c6 bank', 'c6bank.com.br'],
        ['will', 'willbank.com.br'],
        ['will bank', 'willbank.com.br'],
        ['neon', 'neon.com.br'],
        ['next', 'next.me'],
        ['pan', 'bancopan.com.br'],
        ['banco pan', 'bancopan.com.br'],
        ['porto', 'portoseguro.com.br'],
        ['porto seguro', 'portoseguro.com.br'],
        ['renner', 'lojasrenner.com.br'],
        ['riachuelo', 'riachuelo.com.br'],
        ['magalu', 'magazineluiza.com.br'],
        ['magazine luiza', 'magazineluiza.com.br'],
        ['casas bahia', 'casasbahia.com.br'],
        ['ponto frio', 'pontofrio.com.br'],
        ['ponto', 'pontofrio.com.br'],
        ['carrefour', 'carrefour.com.br'],
        ['atacadao', 'atacadao.com.br'],
        ['americanas', 'americanas.com.br'],
        ['amazon', 'amazon.com.br'],
        ['shopee', 'shopee.com.br']
      ];
      const found = domains.find(item => value.includes(item[0]));
      return found ? found[1] : '';
    }

    function initials(value) {
      return String(value || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
    }

    function creditorLogoHtml(creditorId) {
      const creditor = creditors.find(c => c.id === creditorId);
      const name = getCreditorName(creditorId);
      const customLogo = String(creditor?.logoUrl || '').trim();
      if (customLogo) {
        return '<div class="creditor-logo"><img alt="' + escapeHtml(name) + '" src="' + escapeHtml(customLogo) + '" onerror="this.replaceWith(document.createTextNode(\'' + escapeHtml(initials(name)) + '\'))"></div>';
      }
      const domain = creditorDomain(name);
      if (!domain) return '<div class="creditor-logo">' + escapeHtml(initials(name)) + '</div>';
      const src = 'https://www.google.com/s2/favicons?domain_url=https://' + encodeURIComponent(domain) + '&sz=64';
      return '<div class="creditor-logo"><img alt="' + escapeHtml(name) + '" src="' + src + '" onerror="this.replaceWith(document.createTextNode(\'' + escapeHtml(initials(name)) + '\'))"></div>';
    }

    function tagsForDebt(debt) {
      let critical = tag('Normal', 'gray');
      if (debt.criticality === 'Máxima') critical = tag('Prioridade Máxima', 'amber');
      if (debt.criticality === 'Alta') critical = tag('Criticidade Alta', 'blue');

      let behavior = tag('Parcelada', 'green');
      if (debt.behavior === 'Rolagem') behavior = tag('Rolagem', 'amber');
      if (debt.behavior === 'Quitação única') behavior = tag('Quitação', 'blue');

      return critical + behavior + tag(debt.type || '-', 'gray') + tag(debt.paymentMethod || '-', 'gray');
    }

    function compactTagsForDebt(debt) {
      let critical = tag('Normal', 'gray');
      if (debt.criticality === 'Máxima') critical = tag('Prioridade Máxima', 'amber');
      if (debt.criticality === 'Alta') critical = tag('Alta', 'blue');

      let behavior = tag('Parcelada', 'green');
      if (debt.behavior === 'Rolagem') behavior = tag('Rolagem', 'amber');
      if (debt.behavior === 'Quitação única') behavior = tag('Quitação', 'blue');

      return critical + behavior;
    }

    function daysUntil(dateString) {
      if (!dateString) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dateString + 'T00:00:00');
      return Math.round((due - today) / 86400000);
    }

    function dueHint(dateString) {
      const days = daysUntil(dateString);
      if (days === null) return '';
      if (days < 0) return 'Vencida há ' + Math.abs(days) + ' dias';
      if (days === 0) return 'Vence hoje';
      if (days === 1) return 'Daqui a 1 dia';
      return 'Daqui a ' + days + ' dias';
    }

    function paymentForInstallment(installmentId) {
      return paymentByInstallment.get(installmentId) || null;
    }

    function fact(label, value) {
      return '<span><strong style="color:var(--soft)">' + escapeHtml(label) + ':</strong> ' + escapeHtml(value) + '</span>';
    }

    function installmentRowsForDebt(debt) {
      const items = debtInstallments(debt.id).sort(byDueDate);
      if (!items.length) return '<div class="debt-meta" style="margin-top:14px;">Nenhuma parcela gerada para esta dívida.</div>';

      let html = '<div class="installment-list"><div class="installment-title">Parcelas (' + items.length + ')</div>' +
        '<div class="installment-row header"><div>Parcela</div><div>Vencimento</div><div>Valor Previsto</div><div>Valor Pago</div><div>Desconto / Juros</div><div>Status</div><div>Ação</div></div>';
      items.forEach(item => {
        const pay = paymentForInstallment(item.id);
        const paidValue = pay ? Number(pay.paidValue || 0) : 0;
        const discount = pay ? Number(pay.discount || 0) : 0;
        const interest = pay ? Number(pay.interest || 0) : 0;
        const statusClass = item.status === 'Paga' ? 'green' : 'amber';
        const payButton = item.status !== 'Paga'
          ? '<button class="ghost-btn" onclick="window.openPaymentForm(\'' + item.id + '\')">Registrar Pagamento</button>'
          : '';
        let diffText = '-';
        if (discount > 0) diffText = 'Desconto ' + brl(discount);
        if (interest > 0) diffText = 'Juros ' + brl(interest);

        html += '<div class="installment-row">' +
          '<div data-label="Parcela"><strong>' + item.number + '/' + item.total + '</strong></div>' +
          '<div data-label="Vencimento">' + formatDateBR(item.dueDate) + '</div>' +
          '<div data-label="Valor Previsto">' + brl(item.expectedValue) + '</div>' +
          '<div data-label="Valor Pago">' + (pay ? brl(paidValue) : '-') + '</div>' +
          '<div data-label="Desconto / Juros">' + escapeHtml(diffText) + '</div>' +
          '<div data-label="Status"><span class="tag ' + statusClass + '">' + escapeHtml(item.status || 'Pendente') + '</span></div>' +
          '<div data-label="Ação">' + payButton + '</div>' +
        '</div>';
      });

      html += '</div>';
      return html;
    }

    function financeItem(label, value, isPrimary) {
      return '<div class="finance-item ' + (isPrimary ? 'primary' : '') + '"><div class="metric-label">' + escapeHtml(label) + '</div><div class="debt-value">' + escapeHtml(value) + '</div></div>';
    }

    function compactStat(label, value, extraHtml = '') {
      return '<div class="compact-stat"><div class="metric-label">' + escapeHtml(label) + '</div><strong>' + escapeHtml(value) + '</strong>' + extraHtml + '</div>';
    }

    function debtCard(debt) {
      const next = nextInstallment(debt);
      const progress = debtProgress(debt);
      const isExpanded = expandedDebtId === debt.id;
      const title = escapeHtml(getCreditorName(debt.creditorId)) + ' · ' + escapeHtml(debt.name);
      const statusAction = debt.status === 'Em espera'
        ? '<button class="ghost-btn" onclick="window.changeDebtStatus(\'' + debt.id + '\', \'Ativa\')">Ativar</button>'
        : '<button class="ghost-btn" onclick="window.changeDebtStatus(\'' + debt.id + '\', \'Em espera\')">Mover Para Espera</button>';
      const payAction = next
        ? '<button class="ghost-btn" onclick="window.openPaymentForm(\'' + next.id + '\')">Registrar Pagamento</button>'
        : '';
      const expandedAction = isExpanded ? 'Ocultar Parcelas' : 'Ver Parcelas';
      const toneClass = debt.criticality === 'Máxima' ? ' priority-max' : debt.criticality === 'Alta' ? ' priority-high' : ' priority-normal';
      const cardClass = 'debt-card' + toneClass + (isExpanded ? ' expanded' : '');
      const total = debtTotal(debt);
      const paid = debtPaid(debt);
      const balance = debtBalance(debt);
      const discount = debtDiscount(debt);
      const interest = debtInterest(debt);
      const nextLabel = next ? formatDateBR(next.dueDate) : 'Sem Parcela';
      const priorityTitle = debt.criticality === 'Máxima' ? 'Foco total nesta dívida' : debt.criticality === 'Alta' ? 'Acompanhar de perto' : 'Manter na rota';
      const priorityText = debt.criticality === 'Máxima'
        ? 'É sua dívida mais sensível. Quitar as próximas parcelas no prazo evita juros e acelera sua liberdade financeira.'
        : 'Mantenha a parcela em dia e acompanhe qualquer oportunidade de quitação com desconto.';
      const actionText = next
        ? 'Pague até ' + formatDateBR(next.dueDate) + ' para manter o controle da rota.'
        : 'Sem parcela pendente para esta dívida.';
      const metaHtml = isExpanded
        ? tagsForDebt(debt)
        : compactTagsForDebt(debt) + '<span>' + escapeHtml(debt.behavior || '-') + '</span><span>' + escapeHtml(debt.type || '-') + '</span>';

      return '<div class="' + cardClass + '">' +
        '<div class="debt-row">' +
          '<div class="debt-head">' +
            creditorLogoHtml(debt.creditorId) +
            '<div class="debt-title">' +
              '<div class="debt-name clickable" onclick="window.toggleDebt(\'' + debt.id + '\')">' + title + '</div>' +
              '<div class="debt-meta">' + metaHtml + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="row-stat"><div class="metric-label">Saldo Devedor</div><strong>' + brl(balance) + '</strong></div>' +
          '<div class="row-stat"><div class="metric-label">Parcela</div><strong>' + brl(debt.installmentValue) + '</strong></div>' +
          '<div class="row-stat next"><div class="metric-label">Próxima Parcela</div><strong>' + escapeHtml(nextLabel) + '</strong><small>' + escapeHtml(next ? dueHint(next.dueDate) : '') + '</small></div>' +
          '<div class="row-stat progress"><div class="metric-label">Progresso</div><strong>' + progress + '%</strong><div class="compact-progress"><div class="progress-fill" style="width:' + progress + '%;"></div></div></div>' +
          '<button class="ghost-btn row-toggle" onclick="window.toggleDebt(\'' + debt.id + '\')">' + (isExpanded ? '⌃' : '⌄') + '</button>' +
        '</div>' +
        (isExpanded ? '<div class="debt-detail"><div class="debt-summary">' +
          financeItem('Parcela Prevista', brl(debt.installmentValue), true) +
          '<div class="finance-grid">' +
            financeItem('Saldo Devedor', brl(balance), false) +
            financeItem('Valor Pago', brl(paid), false) +
            financeItem('Valor Total', brl(total), false) +
            financeItem('Quitação Hoje', brl(debt.payoffToday), false) +
            financeItem('Desconto Acumulado', brl(discount), false) +
            financeItem('Juros Pagos', brl(interest), false) +
          '</div>' +
        '</div>' +
        '<div class="progress-box">' +
          '<div style="display:flex; justify-content:space-between; color:var(--muted); font-size:12px; margin-bottom:7px;"><span>Progresso</span><strong style="color:var(--soft)">' + progress + '%</strong></div>' +
          '<div class="progress-line"><div class="progress-fill" style="width:' + progress + '%;"></div></div>' +
        '</div>' +
        '<div class="debt-insights">' +
          '<div class="insight-card"><div class="metric-icon">◎</div><div><div class="insight-title">' + escapeHtml(priorityTitle) + '</div><div class="strategy-text" style="margin-top:0;">' + escapeHtml(priorityText) + '</div></div></div>' +
          '<div class="insight-card compact"><div class="insight-title">Resumo desta dívida</div><div class="mini-list"><div><span>Valor Total</span><strong>' + brl(total) + '</strong></div><div><span>Quitação Hoje</span><strong>' + brl(debt.payoffToday) + '</strong></div><div><span>Parcelas em Aberto</span><strong>' + debtInstallments(debt.id).filter(i => i.status !== 'Paga').length + ' de ' + debtInstallments(debt.id).length + '</strong></div></div></div>' +
          '<div class="insight-card"><div class="metric-icon green">✓</div><div><div class="insight-title">Próxima ação sugerida</div><div class="strategy-text" style="margin-top:0;">' + escapeHtml(actionText) + '</div></div></div>' +
        '</div>' + installmentRowsForDebt(debt) +
        '<div class="debt-actions">' +
          '<div class="action-group"><button class="ghost-btn" onclick="window.toggleDebt(\'' + debt.id + '\')">' + expandedAction + '</button>' + payAction + '</div>' +
          '<div class="action-group"><button class="ghost-btn" onclick="window.moveDebtInTrail(\'' + debt.id + '\', -1)">Subir na Trilha</button><button class="ghost-btn" onclick="window.moveDebtInTrail(\'' + debt.id + '\', 1)">Descer na Trilha</button><button class="ghost-btn" onclick="window.openDebtForm(\'edit\', \'' + debt.id + '\')">Editar</button>' + statusAction + '<button class="ghost-btn danger-btn" onclick="window.openDeleteModal(\'debt\', \'' + debt.id + '\')">Excluir Dívida</button></div>' +
        '</div></div>' : '') +
      '</div>';
    }

    function renderDebts() {
      const activeAll = debts.filter(d => d.status === 'Ativa');
      const activeByPriority = selectedPriorityFilter === 'all' ? activeAll : activeAll.filter(d => d.criticality === selectedPriorityFilter);
      const activeFiltered = selectedCreditorFilter === 'all' ? activeByPriority : activeByPriority.filter(d => d.creditorId === selectedCreditorFilter);
      const active = sortDebts(activeFiltered, selectedDebtSort);
      const waitingAll = debts.filter(d => d.status === 'Em espera');
      const waitingFiltered = selectedWaitingCreditorFilter === 'all' ? waitingAll : waitingAll.filter(d => d.creditorId === selectedWaitingCreditorFilter);
      const waiting = sortDebts(waitingFiltered, selectedWaitingDebtSort);
      renderDebtMetrics(activeByPriority);
      renderWaitingCreditorFilters(waitingAll);
      renderWaitingDebtMetrics(waitingAll);
      $('activeDebts').innerHTML = active.length ? active.map(debtCard).join('') : emptyCard('Nenhuma Dívida Encontrada', selectedCreditorFilter === 'all' ? 'Não há dívidas ativas para este filtro.' : 'Não há dívidas ativas para este credor neste filtro.');
      $('waitingDebts').innerHTML = waiting.length ? waiting.map(debtCard).join('') : emptyCard('Nenhuma dívida em espera', selectedWaitingCreditorFilter === 'all' ? 'As dívidas fora da frente atual aparecerão aqui.' : 'Não há dívidas em espera para este credor.');
      renderDashboard();
    }

    function debtMetric(label, value, icon, tone) {
      return '<div class="debt-metric"><div class="metric-icon ' + tone + '">' + escapeHtml(icon) + '</div><div><div class="metric-label">' + escapeHtml(label) + '</div><div class="debt-value">' + escapeHtml(value) + '</div></div></div>';
    }

    function renderDebtMetrics(activeDebts) {
      const container = $('debtMetrics');
      if (!container) return;
      const activeIds = new Set(activeDebts.map(d => d.id));
      const openInstallments = installments.filter(i => i.status !== 'Paga' && activeIds.has(i.debtId));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const limit = new Date(today);
      limit.setDate(limit.getDate() + 30);
      const next30 = openInstallments.filter(i => {
        const due = new Date(i.dueDate + 'T00:00:00');
        return due >= today && due <= limit;
      });
      const totalBalance = activeDebts.reduce((sum, debt) => sum + debtBalance(debt), 0);
      const next30Value = next30.reduce((sum, item) => sum + Number(item.expectedValue || 0), 0);
      const avoidInterest = activeDebts.filter(d => d.criticality === 'Máxima' || d.behavior === 'Rolagem').reduce((sum, debt) => sum + Number(debt.installmentValue || 0), 0);

      container.innerHTML =
        priorityFilterPanel(activeDebts) +
        creditorDebtPanel(activeDebts) +
        debtMetric('Parcelas em Aberto', String(openInstallments.length), '◷', 'red') +
        debtMetric('Próximas Parcelas (30 dias)', brl(next30Value), '▤', 'green') +
        debtMetric('Juros a Evitar', brl(avoidInterest), '⌁', '');
    }

    function priorityFilterPanel(activeDebts) {
      const priorities = ['all', 'Máxima', 'Alta', 'Normal'];
      const labels = { all: 'Todas', 'Máxima': 'Máxima', Alta: 'Alta', Normal: 'Normal' };
      return '<div class="debt-metric filter-panel"><div class="metric-label">Prioridade</div><div class="panel-filter-row">' + priorities.map(priority => {
        const count = priority === 'all' ? debts.filter(d => d.status === 'Ativa').length : debts.filter(d => d.status === 'Ativa' && d.criticality === priority).length;
        const active = selectedPriorityFilter === priority ? ' is-active' : '';
        return '<button class="mini-filter' + active + '" onclick="window.filterByPriority(\'' + priority + '\')">' + escapeHtml(labels[priority]) + '<span>' + count + '</span></button>';
      }).join('') + '</div></div>';
    }

    function creditorDebtPanel(activeDebts) {
      const totalBalance = activeDebts.reduce((sum, debt) => sum + debtBalance(debt), 0);
      const creditorIds = [...new Set(activeDebts.map(d => d.creditorId).filter(Boolean))]
        .sort((a, b) => compareText(getCreditorName(a), getCreditorName(b)));
      let html = '<div class="debt-metric creditor-panel"><div class="metric-label">Credores da Frente</div><div class="creditor-summary-grid">';
      html += '<button class="creditor-summary ' + (selectedCreditorFilter === 'all' ? 'is-active' : '') + '" onclick="window.filterByCreditor(\'all\')"><span class="creditor-logo">Σ</span><strong>Todos</strong><small>' + activeDebts.length + ' dívidas · ' + brl(totalBalance) + '</small></button>';
      creditorIds.forEach(id => {
        const creditorDebts = activeDebts.filter(d => d.creditorId === id);
        const balance = creditorDebts.reduce((sum, debt) => sum + debtBalance(debt), 0);
        html += '<button class="creditor-summary ' + (selectedCreditorFilter === id ? 'is-active' : '') + '" onclick="window.filterByCreditor(\'' + id + '\')">' + creditorLogoHtml(id) + '<strong>' + escapeHtml(getCreditorName(id)) + '</strong><small>' + creditorDebts.length + ' dívidas · ' + brl(balance) + '</small></button>';
      });
      html += '</div></div>';
      return html;
    }

    function renderWaitingDebtMetrics(waitingDebts) {
      const container = $('waitingDebtMetrics');
      if (!container) return;
      const waitingIds = new Set(waitingDebts.map(d => d.id));
      const waitingInstallments = installments.filter(i => i.status !== 'Paga' && waitingIds.has(i.debtId));
      const totalBalance = waitingDebts.reduce((sum, debt) => sum + debtBalance(debt), 0);
      const monthlyPressure = waitingInstallments
        .filter(i => String(i.dueDate || '').startsWith(currentMonthKey()))
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
        .sort((a, b) => compareText(getCreditorName(a), getCreditorName(b)));
      let html = '<button class="ghost-btn ' + (selectedWaitingCreditorFilter === 'all' ? 'is-active' : '') + '" onclick="window.filterWaitingByCreditor(\'all\')">◌ Todos em espera <span class="filter-count">' + waitingDebts.length + '</span></button>';
      creditorIds.forEach(id => {
        const count = waitingDebts.filter(d => d.creditorId === id).length;
        html += '<button class="ghost-btn ' + (selectedWaitingCreditorFilter === id ? 'is-active' : '') + '" onclick="window.filterWaitingByCreditor(\'' + id + '\')">' + creditorLogoHtml(id) + escapeHtml(getCreditorName(id)) + '<span class="filter-count">' + count + '</span></button>';
      });
      container.innerHTML = html;
    }

    function renderPayments() {
      renderPaymentMetrics();
      renderHistory();
      const sorted = [...payments].sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || '')));
      if (!sorted.length) {
        $('paymentsList').innerHTML = emptyCard('Nenhum pagamento registrado', 'Os pagamentos baixados aparecerão aqui.');
        return;
      }

      $('paymentsList').innerHTML = sorted.map(item => {
        const debt = debts.find(d => d.id === item.debtId);
        const title = debt ? getCreditorName(debt.creditorId) + ' · ' + debt.name : 'Dívida removida';
        const discount = Number(item.discount || 0);
        const interest = Number(item.interest || 0);
        const adjustment = discount > 0 ? tag('Desconto ' + brl(discount), 'green') : interest > 0 ? tag('Juros ' + brl(interest), 'red') : tag('Sem Ajuste', 'gray');
        return '<div class="payment-row">' +
          '<div><strong>' + escapeHtml(title) + '</strong><small>Prestação ' + escapeHtml(item.installmentNumber || '-') + '</small></div>' +
          '<div><div class="metric-label">Pago Em</div><strong>' + formatDateBR(item.paymentDate) + '</strong></div>' +
          '<div><div class="metric-label">Valor Pago</div><strong>' + brl(item.paidValue) + '</strong></div>' +
          '<div><div class="metric-label">Valor Previsto</div><strong>' + brl(item.expectedValue) + '</strong></div>' +
          '<div>' + adjustment + '</div>' +
        '</div>';
      }).join('');
    }

    function renderPaymentMetrics() {
      const container = $('paymentMetrics');
      if (!container) return;
      const month = currentMonthKey();
      const monthPayments = payments.filter(p => String(p.paymentDate || '').startsWith(month));
      const paidMonth = monthPayments.reduce((sum, item) => sum + Number(item.paidValue || 0), 0);
      const discountMonth = monthPayments.reduce((sum, item) => sum + Number(item.discount || 0), 0);
      const interestMonth = monthPayments.reduce((sum, item) => sum + Number(item.interest || 0), 0);
      const totalPaid = payments.reduce((sum, item) => sum + Number(item.paidValue || 0), 0);

      container.innerHTML =
        debtMetric('Pago no Mês', brl(paidMonth), '✓', 'green') +
        debtMetric('Desconto no Mês', brl(discountMonth), '↓', 'green') +
        debtMetric('Juros no Mês', brl(interestMonth), '!', 'red') +
        debtMetric('Total Já Pago', brl(totalPaid), '▣', 'blue');
    }

    function monthLabel(monthKey) {
      if (!monthKey) return '-';
      const [year, month] = monthKey.split('-').map(Number);
      const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }

    function priorityScore(debt) {
      if (debt.criticality === 'Máxima') return 3;
      if (debt.criticality === 'Alta') return 2;
      return 1;
    }

    function sortDebts(items, mode) {
      return [...items].sort((a, b) => {
        const nextA = nextInstallment(a);
        const nextB = nextInstallment(b);
        if (mode === 'installment-desc') return Number(b.installmentValue || 0) - Number(a.installmentValue || 0);
        if (mode === 'installment-asc') return Number(a.installmentValue || 0) - Number(b.installmentValue || 0);
        if (mode === 'balance-desc') return debtBalance(b) - debtBalance(a);
        if (mode === 'balance-asc') return debtBalance(a) - debtBalance(b);
        if (mode === 'progress-desc') return debtProgress(b) - debtProgress(a);
        if (mode === 'progress-asc') return debtProgress(a) - debtProgress(b);
        if (mode === 'next-due') return String(nextA?.dueDate || '9999-12-31').localeCompare(String(nextB?.dueDate || '9999-12-31'));
        if (mode === 'trail') return trailOrderValue(a) - trailOrderValue(b);
        return (priorityScore(b) - priorityScore(a)) || (debtBalance(b) - debtBalance(a));
      });
    }

    function trailOrderValue(debt) {
      const order = Number(debt.payoffOrder || 0);
      return order > 0 ? order : 9000 + (3 - priorityScore(debt)) * 100 + debtBalance(debt) / 1000000;
    }

    function orderedTrailDebts() {
      return [...debts].sort((a, b) => trailOrderValue(a) - trailOrderValue(b));
    }

    function nextPayoffOrder() {
      const max = debts.reduce((value, debt) => Math.max(value, Number(debt.payoffOrder || 0)), 0);
      return max + 1;
    }

    function renderHistory() {
      const metrics = $('historyMetrics');
      const list = $('historyList');
      if (!metrics || !list) return;
      if (!payments.length) {
        metrics.innerHTML =
          debtMetric('Meses com Pagamento', '0', '↺', 'blue') +
          debtMetric('Total Pago', brl(0), '✓', 'green') +
          debtMetric('Descontos', brl(0), '↓', 'green') +
          debtMetric('Juros', brl(0), '!', 'red');
        list.innerHTML = emptyCard('Sem histórico ainda', 'Os fechamentos mensais aparecerão conforme os pagamentos forem registrados.');
        return;
      }

      const monthly = new Map();
      payments.forEach(item => {
        const key = String(item.paymentDate || item.expectedDate || '').slice(0, 7) || 'Sem data';
        if (!monthly.has(key)) monthly.set(key, { paid: 0, expected: 0, discount: 0, interest: 0, count: 0 });
        const bucket = monthly.get(key);
        bucket.paid += Number(item.paidValue || 0);
        bucket.expected += Number(item.expectedValue || 0);
        bucket.discount += Number(item.discount || 0);
        bucket.interest += Number(item.interest || 0);
        bucket.count += 1;
      });

      const rows = [...monthly.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
      const totalPaid = rows.reduce((sum, [, item]) => sum + item.paid, 0);
      const totalDiscount = rows.reduce((sum, [, item]) => sum + item.discount, 0);
      const totalInterest = rows.reduce((sum, [, item]) => sum + item.interest, 0);
      const maxPaid = Math.max(...rows.map(([, item]) => item.paid), 1);

      metrics.innerHTML =
        debtMetric('Meses com Pagamento', String(rows.length), '↺', 'blue') +
        debtMetric('Total Pago', brl(totalPaid), '✓', 'green') +
        debtMetric('Economia Total', brl(totalDiscount), '↓', 'green') +
        debtMetric('Custo com Juros', brl(totalInterest), '!', 'red');

      list.innerHTML = rows.map(([key, item]) => {
        const paidPct = Math.max(4, Math.round((item.paid / maxPaid) * 100));
        const netSaving = item.discount - item.interest;
        const resultTag = netSaving > 0
          ? tag('Economia ' + brl(netSaving), 'green')
          : netSaving < 0
            ? tag('Impacto de Juros ' + brl(Math.abs(netSaving)), 'red')
            : tag('Equilíbrio', 'gray');
        return '<div class="history-month">' +
          '<div class="history-month-head"><div><div class="debt-name">' + escapeHtml(monthLabel(key)) + '</div><div class="debt-meta"><span>' + item.count + ' pagamentos</span>' + resultTag + '</div></div><strong>' + brl(item.paid) + '</strong></div>' +
          '<div class="history-bars">' +
            '<div class="history-bar"><span>Pago</span><div class="bar-track"><div class="bar-fill" style="width:' + paidPct + '%;"></div></div><strong>' + brl(item.paid) + '</strong></div>' +
            '<div class="history-bar"><span>Economia</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.min(100, Math.round((item.discount / Math.max(item.paid, 1)) * 100)) + '%;"></div></div><strong>' + brl(item.discount) + '</strong></div>' +
            '<div class="history-bar"><span>Juros</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.min(100, Math.round((item.interest / Math.max(item.paid, 1)) * 100)) + '%; background: linear-gradient(90deg, var(--amber), var(--danger));"></div></div><strong>' + brl(item.interest) + '</strong></div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function renderCreditors() {
      renderCreditorMetrics();
      if (!creditors.length) {
        $('creditorsList').innerHTML = emptyCard('Nenhum credor cadastrado', 'Cadastre credores para usar na criação das dívidas.');
      } else {
        $('creditorsList').innerHTML = sortedCreditors().map(creditor => {
          const notes = creditor.notes ? '<span>' + escapeHtml(creditor.notes) + '</span>' : '';
          const linkedDebts = debts.filter(d => d.creditorId === creditor.id);
          const linkedBalance = linkedDebts.reduce((sum, debt) => sum + debtBalance(debt), 0);
          const deleteButton = linkedDebts.length
            ? '<button class="ghost-btn danger-btn" onclick="showToast(\'Este credor está vinculado a dívidas.\')">Exclusão bloqueada</button>'
            : '<button class="ghost-btn danger-btn" onclick="window.openDeleteModal(\'creditor\', \'' + creditor.id + '\')">Excluir</button>';
          return '<div class="debt-card"><div class="debt-row creditor-row">' +
            '<div class="debt-head">' + creditorLogoHtml(creditor.id) + '<div><div class="debt-name">' + escapeHtml(creditor.name) + '</div><div class="debt-meta"><span>' + escapeHtml(creditor.type) + '</span>' + notes + '</div></div></div>' +
            '<div class="row-stat"><div class="metric-label">Dívidas</div><strong>' + linkedDebts.length + '</strong></div>' +
            '<div class="row-stat"><div class="metric-label">Saldo Vinculado</div><strong>' + brl(linkedBalance) + '</strong></div>' +
            '<div class="action-group creditor-actions"><button class="ghost-btn" onclick="window.editCreditor(\'' + creditor.id + '\')">Editar</button>' + deleteButton + '</div>' +
          '</div></div>';
        }).join('');
      }

      $('debtCreditorSelect').innerHTML = creditors.length
        ? sortedCreditors().map(c => '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>').join('')
        : '<option value="">Cadastre um credor primeiro</option>';
    }

    function renderCreditorMetrics() {
      const container = $('creditorMetrics');
      if (!container) return;
      const linkedIds = new Set(debts.map(d => d.creditorId).filter(Boolean));
      const linkedCreditors = creditors.filter(c => linkedIds.has(c.id)).length;
      const freeCreditors = creditors.length - linkedCreditors;
      const activeCreditors = new Set(debts.filter(d => d.status === 'Ativa').map(d => d.creditorId).filter(Boolean)).size;
      const waitingCreditors = new Set(debts.filter(d => d.status === 'Em espera').map(d => d.creditorId).filter(Boolean)).size;
      container.innerHTML =
        debtMetric('Credores Cadastrados', String(creditors.length), '▣', 'blue') +
        debtMetric('Com Dívidas', String(linkedCreditors), '⌁', 'red') +
        debtMetric('Na Frente Ativa', String(activeCreditors), '✓', 'green') +
        debtMetric('Livres Para Excluir', String(freeCreditors), '◌', waitingCreditors ? '' : 'green');
    }

    function renderTrail() {
      const metrics = $('trailMetrics');
      const road = $('trailRoad');
      const position = $('trailPositionTitle');
      if (!metrics || !road || !position) return;

      const route = orderedTrailDebts();
      const totalBalance = route.reduce((sum, debt) => sum + debtBalance(debt), 0);
      const completed = route.filter(debt => debt.status === 'Quitada' || debtBalance(debt) === 0).length;
      const next = route.find(debt => debt.status !== 'Quitada' && debtBalance(debt) > 0) || null;
      const progress = route.length ? Math.round((completed / route.length) * 100) : 0;

      metrics.innerHTML =
        debtMetric('Marcos na Trilha', String(route.length), '◇', 'blue') +
        debtMetric('Marcos Concluídos', String(completed), '✓', 'green') +
        debtMetric('Saldo da Jornada', brl(totalBalance), '▣', 'red') +
        debtMetric('Progresso Geral', progress + '%', '⌁', progress >= 50 ? 'green' : '');

      position.textContent = next
        ? 'Próximo marco: ' + getCreditorName(next.creditorId) + ' · ' + next.name
        : route.length ? 'Todas as dívidas da trilha foram vencidas' : 'Defina sua primeira dívida na trilha';

      if (!route.length) {
        road.innerHTML = emptyCard('Trilha vazia', 'Cadastre dívidas e defina a ordem de quitação para montar seu caminho.');
        return;
      }

      road.innerHTML = route.map((debt, index) => {
        const balance = debtBalance(debt);
        const done = debt.status === 'Quitada' || balance === 0;
        const current = !done && debt.id === next?.id;
        const stepClass = 'trail-step' + (done ? ' done' : '') + (current ? ' current' : '');
        const order = Number(debt.payoffOrder || 0) || index + 1;
        const nextItem = nextInstallment(debt);
        return '<div class="' + stepClass + '">' +
          '<div class="trail-marker">' + (done ? '✓' : order) + '</div>' +
          '<div class="trail-card">' +
            '<div class="trail-card-head">' +
              creditorLogoHtml(debt.creditorId) +
              '<div><div class="debt-name">' + escapeHtml(getCreditorName(debt.creditorId) + ' · ' + debt.name) + '</div>' +
              '<div class="debt-meta">' + compactTagsForDebt(debt) + '<span>' + escapeHtml(debt.status || '-') + '</span></div></div>' +
            '</div>' +
            '<div class="trail-facts">' +
              '<div><span>Saldo</span><strong>' + brl(balance) + '</strong></div>' +
              '<div><span>Parcela</span><strong>' + brl(debt.installmentValue) + '</strong></div>' +
              '<div><span>Próximo passo</span><strong>' + escapeHtml(nextItem ? formatDateBR(nextItem.dueDate) : 'Sem Parcela') + '</strong></div>' +
            '</div>' +
            '<div class="trail-actions">' +
              '<button class="ghost-btn" onclick="window.moveDebtInTrail(\'' + debt.id + '\', -1)">Subir</button>' +
              '<button class="ghost-btn" onclick="window.moveDebtInTrail(\'' + debt.id + '\', 1)">Descer</button>' +
              '<button class="ghost-btn" onclick="window.openDebtFromTrail(\'' + debt.id + '\')">Abrir dívida</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function renderDashboard() {
      const active = debts.filter(d => d.status === 'Ativa');
      const totalActive = active.reduce((sum, d) => sum + debtBalance(d), 0);
      const totalRecognized = debts.reduce((sum, d) => sum + debtBalance(d), 0);
      const priority = active.filter(d => d.criticality === 'Máxima').reduce((sum, d) => sum + debtBalance(d), 0);
      const month = currentMonthKey();
      const activeIds = new Set(active.map(d => d.id));
      const monthCommitment = installments
        .filter(i => i.status !== 'Paga' && String(i.dueDate || '').startsWith(month) && activeIds.has(i.debtId))
        .reduce((sum, i) => sum + Number(i.expectedValue || 0), 0);
      const next = active.map(nextInstallment).filter(Boolean).sort(byDueDate)[0] || null;

      $('dashPriority').textContent = brl(priority);
      $('dashActiveDebt').textContent = brl(totalActive);
      $('dashMonthCommitment').textContent = brl(monthCommitment);
      $('dashTotalDebt').textContent = brl(totalRecognized);
      $('strategyMain').textContent = next ? 'Pagar próxima prestação' : (active.length ? 'Manter foco na frente ativa' : 'Cadastre a primeira dívida');
      $('strategyText').textContent = next ? 'Próxima prestação em ' + formatDateBR(next.dueDate) + ', no valor de ' + brl(next.expectedValue) + '.' : (active.length ? 'Acompanhe as próximas parcelas, priorize criticidade máxima e registre os pagamentos reais.' : 'A rota de quitação será calculada a partir das dívidas ativas, criticidade, parcelas e pagamentos registrados.');
      $('monthReading').textContent = monthCommitment > 0 ? 'Há parcelas no mês atual' : 'Sem pressão registrada no mês';
      $('monthReadingText').textContent = monthCommitment > 0 ? 'Compromisso pendente do mês atual: ' + brl(monthCommitment) + '.' : 'Nenhuma parcela pendente encontrada para o mês atual.';
      renderDashboardDecision(active);
    }

    function renderDashboardDecision(activeDebts) {
      const focusContainer = $('dashboardFocus');
      const riskContainer = $('dashboardRisk');
      const upcomingContainer = $('dashboardUpcoming');
      if (!focusContainer || !riskContainer || !upcomingContainer) return;

      if (!activeDebts.length) {
        focusContainer.innerHTML = emptyCard('Nenhuma dívida ativa', 'Cadastre ou ative uma dívida para montar sua frente de quitação.');
        riskContainer.innerHTML = '';
        upcomingContainer.innerHTML = emptyCard('Sem vencimentos ativos', 'Os próximos compromissos aparecerão aqui.');
        return;
      }

      const ranked = [...activeDebts].sort((a, b) => {
        const score = debt => (debt.criticality === 'Máxima' ? 3 : debt.criticality === 'Alta' ? 2 : 1) * 100000 + debtBalance(debt);
        return score(b) - score(a);
      });
      const focus = ranked[0];
      const focusNext = nextInstallment(focus);
      const openInstallments = installments
        .filter(i => i.status !== 'Paga' && activeDebts.some(d => d.id === i.debtId))
        .sort(byDueDate)
        .slice(0, 5);

      focusContainer.innerHTML =
        '<div class="focus-card">' +
          creditorLogoHtml(focus.creditorId) +
          '<div><div class="debt-name">' + escapeHtml(getCreditorName(focus.creditorId) + ' · ' + focus.name) + '</div>' +
          '<div class="debt-meta">' + compactTagsForDebt(focus) + '<span>Saldo ' + brl(debtBalance(focus)) + '</span><span>Parcela ' + brl(focus.installmentValue) + '</span></div>' +
          '<div class="strategy-text">Próxima ação: ' + (focusNext ? 'pagar até ' + formatDateBR(focusNext.dueDate) + ' (' + dueHint(focusNext.dueDate) + ').' : 'sem parcela pendente.') + '</div></div>' +
          '<button class="primary-action" onclick="window.openDebtFromDashboard(\'' + focus.id + '\')">Abrir dívida</button>' +
        '</div>';

      const maxCount = activeDebts.filter(d => d.criticality === 'Máxima').length;
      const highCount = activeDebts.filter(d => d.criticality === 'Alta').length;
      const rollingCount = activeDebts.filter(d => d.behavior === 'Rolagem').length;
      riskContainer.innerHTML =
        '<div class="risk-item"><div class="metric-label">Prioridade Máxima</div><strong>' + maxCount + '</strong></div>' +
        '<div class="risk-item"><div class="metric-label">Criticidade Alta</div><strong>' + highCount + '</strong></div>' +
        '<div class="risk-item"><div class="metric-label">Rolagem</div><strong>' + rollingCount + '</strong></div>';

      upcomingContainer.innerHTML = openInstallments.length ? openInstallments.map(item => {
        const debt = debts.find(d => d.id === item.debtId);
        const title = debt ? getCreditorName(debt.creditorId) + ' · ' + debt.name : 'Dívida não encontrada';
        return '<div class="decision-row"><div><strong>' + escapeHtml(title) + '</strong><small>' + formatDateBR(item.dueDate) + ' · ' + dueHint(item.dueDate) + '</small></div><strong>' + brl(item.expectedValue) + '</strong></div>';
      }).join('') : emptyCard('Sem parcelas pendentes', 'Nenhuma parcela ativa encontrada na frente atual.');
    }

    async function loadAll() {
      creditors = (await getDocs(collection(db, 'creditors'))).docs.map(d => ({ id: d.id, ...d.data() }));
      debts = (await getDocs(collection(db, 'debts'))).docs.map(d => ({ id: d.id, ...d.data() }));
      installments = (await getDocs(collection(db, 'installments'))).docs.map(d => ({ id: d.id, ...d.data() }));
      payments = (await getDocs(collection(db, 'payments'))).docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
    }

    function renderAll() {
      rebuildIndexes();
      renderCreditors();
      renderDebts();
      renderTrail();
      renderPayments();
    }

    window.openDebtForm = function(mode = 'new', id = null, defaultStatus = 'Ativa') {
      showPage('dividas');
      closePaymentForm();
      editingDebtId = mode === 'edit' ? id : null;
      $('debtFormTitle').textContent = editingDebtId ? 'Editar dívida' : 'Nova dívida';
      if (editingDebtId) {
        const debt = debts.find(d => d.id === editingDebtId);
        if (!debt) return;
        $('debtCreditorSelect').value = debt.creditorId || '';
        $('debtName').value = debt.name || '';
        $('debtType').value = debt.type || 'Cartão';
        $('debtPaymentMethod').value = debt.paymentMethod || 'Boleto';
        $('debtFirstDue').value = debt.firstDue || '';
        $('debtInstallmentsQty').value = debt.installmentsQty || '';
        $('debtInstallmentValue').value = brl(debt.installmentValue || 0);
        $('debtStatus').value = debt.status || 'Ativa';
        $('debtCriticality').value = debt.criticality || 'Normal';
        $('debtBehavior').value = debt.behavior || 'Parcelada';
        $('debtPayoffToday').value = brl(debt.payoffToday || 0);
        $('debtPayoffOrder').value = debt.payoffOrder || '';
        $('debtNotes').value = debt.notes || '';
      } else {
        $('debtCreditorSelect').value = sortedCreditors()[0]?.id || '';
        $('debtName').value = '';
        $('debtType').value = 'Cartão';
        $('debtPaymentMethod').value = 'Boleto';
        $('debtFirstDue').value = '';
        $('debtInstallmentsQty').value = '';
        $('debtInstallmentValue').value = '';
        $('debtStatus').value = defaultStatus;
        $('debtCriticality').value = 'Normal';
        $('debtBehavior').value = 'Parcelada';
        $('debtPayoffToday').value = '';
        $('debtPayoffOrder').value = nextPayoffOrder();
        $('debtNotes').value = '';
      }
      $('debtForm').classList.add('show');
      $('debtForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.closeDebtForm = function() {
      editingDebtId = null;
      $('debtForm').classList.remove('show');
    };

    window.toggleDebt = function(id) {
      expandedDebtId = expandedDebtId === id ? null : id;
      renderDebts();
    };

    window.filterByCreditor = function(id) {
      selectedCreditorFilter = id;
      expandedDebtId = null;
      renderDebts();
    };

    window.filterByPriority = function(priority) {
      selectedPriorityFilter = priority;
      selectedCreditorFilter = 'all';
      expandedDebtId = null;
      renderDebts();
    };

    window.filterWaitingByCreditor = function(id) {
      selectedWaitingCreditorFilter = id;
      expandedDebtId = null;
      renderDebts();
    };

    window.setDebtSort = function(mode) {
      selectedDebtSort = mode;
      expandedDebtId = null;
      renderDebts();
    };

    window.setWaitingDebtSort = function(mode) {
      selectedWaitingDebtSort = mode;
      expandedDebtId = null;
      renderDebts();
    };

    window.saveDebt = async function() {
      if (!creditors.length) return showToast('Cadastre um credor antes da dívida.');
      const creditorId = $('debtCreditorSelect').value;
      const name = $('debtName').value.trim();
      const firstDue = $('debtFirstDue').value;
      const installmentsQty = Number($('debtInstallmentsQty').value || 0);
      const installmentValue = parseMoney($('debtInstallmentValue').value);
      if (!creditorId || !name || !firstDue || !installmentsQty || !installmentValue) return showToast('Preencha credor, nome, primeira parcela, quantidade e valor.');
      const payload = {
        creditorId, name, firstDue, installmentsQty, installmentValue,
        type: $('debtType').value,
        paymentMethod: $('debtPaymentMethod').value,
        status: $('debtStatus').value,
        criticality: $('debtCriticality').value,
        behavior: $('debtBehavior').value,
        payoffToday: parseMoney($('debtPayoffToday').value),
        payoffOrder: Number($('debtPayoffOrder').value || 0),
        notes: $('debtNotes').value.trim(),
        updatedAt: serverTimestamp()
      };

      if (editingDebtId) {
        await updateDoc(doc(db, 'debts', editingDebtId), payload);
        await reconcileInstallmentsForDebt(editingDebtId, installmentsQty, installmentValue, firstDue);
        closeDebtForm();
        showToast('Dívida atualizada com sucesso.');
      } else {
        const created = await addDoc(collection(db, 'debts'), { ...payload, createdAt: serverTimestamp() });
        await generateInstallments(created.id, installmentsQty, installmentValue, firstDue);
        closeDebtForm();
        await loadAll();
        showToast('Dívida cadastrada com sucesso.');
      }
    };

    async function reconcileInstallmentsForDebt(debtId, qty, value, firstDue) {
      const q = query(collection(db, 'installments'), where('debtId', '==', debtId));
      const snap = await getDocs(q);
      const existing = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
      const byNumber = new Map(existing.map(item => [Number(item.number), item]));
      const paidInstallmentIds = new Set(payments.filter(p => p.debtId === debtId).map(p => p.installmentId));
      const batch = writeBatch(db);
      for (let i = 0; i < qty; i++) {
        const number = i + 1;
        const current = byNumber.get(number);
        const nextData = { debtId, number, total: qty, dueDate: addMonths(firstDue, i), expectedValue: value, status: current?.status || 'Pendente', updatedAt: serverTimestamp() };
        if (current) {
          const hasPayment = current.status === 'Paga' || paidInstallmentIds.has(current.id);
          batch.update(current.ref, hasPayment ? { total: qty, updatedAt: serverTimestamp() } : nextData);
        } else {
          const ref = doc(collection(db, 'installments'));
          batch.set(ref, { ...nextData, createdAt: serverTimestamp() });
        }
      }
      existing.filter(item => Number(item.number) > qty).forEach(item => {
        const hasPayment = item.status === 'Paga' || paidInstallmentIds.has(item.id);
        if (hasPayment) batch.update(item.ref, { total: qty, updatedAt: serverTimestamp() });
        else batch.delete(item.ref);
      });
      await batch.commit();
      await loadAll();
    }

    async function generateInstallments(debtId, qty, value, firstDue) {
      const batch = writeBatch(db);
      for (let i = 0; i < qty; i++) {
        const ref = doc(collection(db, 'installments'));
        batch.set(ref, { debtId, number: i + 1, total: qty, dueDate: addMonths(firstDue, i), expectedValue: value, status: 'Pendente', createdAt: serverTimestamp() });
      }
      await batch.commit();
    }

    window.changeDebtStatus = async function(id, status) {
      await updateDoc(doc(db, 'debts', id), { status, updatedAt: serverTimestamp() });
      const debt = debts.find(d => d.id === id);
      if (debt) debt.status = status;
      if (status !== 'Ativa' && selectedCreditorFilter !== 'all') selectedCreditorFilter = 'all';
      renderAll();
      showToast(status === 'Ativa' ? 'Dívida ativada com sucesso.' : 'Dívida movida para espera.');
    };

    window.openPaymentForm = function(installmentId) {
      closeDebtForm();
      const inst = installments.find(i => i.id === installmentId);
      if (!inst) return;
      const debt = debts.find(d => d.id === inst.debtId);
      paymentInstallmentId = installmentId;
      $('payDebtName').value = debt ? getCreditorName(debt.creditorId) + ' · ' + debt.name : 'Dívida não encontrada';
      $('payInstallmentLabel').value = inst.number + '/' + inst.total;
      $('payDate').value = inst.dueDate;
      $('payValue').value = brl(inst.expectedValue);
      $('paymentForm').classList.add('show');
      showPage('pagamentos');
      $('paymentForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.closePaymentForm = function() {
      paymentInstallmentId = null;
      $('paymentForm').classList.remove('show');
    };

    window.savePayment = async function() {
      if (!paymentInstallmentId) return showToast('Nenhuma parcela selecionada.');
      const inst = installments.find(i => i.id === paymentInstallmentId);
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
      payments.push({ id: created.id, ...paymentPayload });
      inst.status = 'Paga';
      inst.paidAt = $('payDate').value;
      closePaymentForm();
      renderAll();
      showToast('Pagamento registrado com sucesso.');
    };

    window.saveCreditor = async function() {
      const name = $('creditorName').value.trim();
      if (!name) return showToast('Informe o nome do credor.');
      const payload = { name, type: $('creditorType').value, logoUrl: $('creditorLogoUrl').value.trim(), notes: $('creditorNotes').value.trim(), updatedAt: serverTimestamp() };
      if (editingCreditorId) {
        await updateDoc(doc(db, 'creditors', editingCreditorId), payload);
        const index = creditors.findIndex(c => c.id === editingCreditorId);
        if (index >= 0) creditors[index] = { ...creditors[index], ...payload };
        showToast('Credor atualizado com sucesso.');
      } else {
        const exists = creditors.some(c => c.name.toLowerCase() === name.toLowerCase());
        if (exists) return showToast('Este credor já está cadastrado.');
        const created = await addDoc(collection(db, 'creditors'), { ...payload, createdAt: serverTimestamp() });
        creditors.push({ id: created.id, ...payload });
        showToast('Credor cadastrado com sucesso.');
      }
      resetCreditorForm();
      renderAll();
    };

    window.editCreditor = function(id) {
      const creditor = creditors.find(c => c.id === id);
      if (!creditor) return;
      editingCreditorId = id;
      $('creditorFormTitle').textContent = 'Editar credor';
      $('creditorName').value = creditor.name || '';
      $('creditorType').value = creditor.type || 'Banco';
      $('creditorLogoUrl').value = creditor.logoUrl || '';
      renderCreditorLogoPreview(creditor.logoUrl || '', creditor.name || '');
      $('creditorNotes').value = creditor.notes || '';
    };

    window.resetCreditorForm = function() {
      editingCreditorId = null;
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

    window.openDeleteModal = function(type, id) {
      deleteContext = { type, id };
      if (type === 'debt') {
        const debt = debts.find(d => d.id === id);
        if (!debt) return;
        $('deleteModalTitle').textContent = 'Excluir dívida';
        $('deleteModalText').textContent = 'Deseja excluir definitivamente ' + getCreditorName(debt.creditorId) + ' · ' + debt.name + '?';
        $('deleteModalWarning').textContent = 'Essa ação removerá também parcelas e pagamentos vinculados a esta dívida.';
      } else {
        const creditor = creditors.find(c => c.id === id);
        if (!creditor) return;
        $('deleteModalTitle').textContent = 'Excluir credor';
        $('deleteModalText').textContent = 'Deseja excluir definitivamente ' + creditor.name + '?';
        $('deleteModalWarning').textContent = 'Só exclua credores que não estejam vinculados a dívidas.';
      }
      $('deleteModal').classList.add('show');
    };

    window.closeDeleteModal = function() {
      deleteContext = null;
      $('deleteModal').classList.remove('show');
    };

    window.confirmDelete = async function() {
      if (!deleteContext) return;
      if (deleteContext.type === 'debt') {
        const debtId = deleteContext.id;
        const batch = writeBatch(db);
        batch.delete(doc(db, 'debts', debtId));
        const debtInstallmentSnap = await getDocs(query(collection(db, 'installments'), where('debtId', '==', debtId)));
        const debtPaymentSnap = await getDocs(query(collection(db, 'payments'), where('debtId', '==', debtId)));
        debtInstallmentSnap.forEach(d => batch.delete(d.ref));
        debtPaymentSnap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        debts = debts.filter(d => d.id !== debtId);
        installments = installments.filter(i => i.debtId !== debtId);
        payments = payments.filter(p => p.debtId !== debtId);
        if (expandedDebtId === debtId) expandedDebtId = null;
        closeDeleteModal();
        renderAll();
        showToast('Dívida removida com sucesso.');
      } else {
        const hasDebt = debts.some(d => d.creditorId === deleteContext.id);
        if (hasDebt) {
          closeDeleteModal();
          return showToast('Este credor está vinculado a dívidas.');
        }
        await deleteDoc(doc(db, 'creditors', deleteContext.id));
        creditors = creditors.filter(c => c.id !== deleteContext.id);
        closeDeleteModal();
        renderAll();
        showToast('Credor removido com sucesso.');
      }
    };

    function showPage(pageId) {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
      document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
    }

    window.goToDebtsAndNew = function(defaultStatus = 'Ativa') {
      showPage('dividas');
      window.openDebtForm('new', null, defaultStatus);
    };

    window.openDebtFromDashboard = function(id) {
      showPage('dividas');
      expandedDebtId = id;
      renderDebts();
      $('activeDebts').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.openDebtFromTrail = function(id) {
      const debt = debts.find(item => item.id === id);
      showPage(debt?.status === 'Em espera' ? 'espera' : 'dividas');
      expandedDebtId = id;
      renderDebts();
      const target = debt?.status === 'Em espera' ? $('waitingDebts') : $('activeDebts');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.moveDebtInTrail = async function(id, direction) {
      const route = orderedTrailDebts();
      const currentIndex = route.findIndex(debt => debt.id === id);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= route.length) return;

      const normalized = route.map((debt, index) => ({ ...debt, payoffOrder: index + 1 }));
      const current = normalized[currentIndex];
      normalized[currentIndex] = normalized[nextIndex];
      normalized[nextIndex] = current;

      const batch = writeBatch(db);
      normalized.forEach((debt, index) => {
        const payoffOrder = index + 1;
        batch.update(doc(db, 'debts', debt.id), { payoffOrder, updatedAt: serverTimestamp() });
        const local = debts.find(item => item.id === debt.id);
        if (local) local.payoffOrder = payoffOrder;
      });
      await batch.commit();
      renderAll();
      showToast('Ordem da trilha atualizada.');
    };

    document.querySelectorAll('.nav-item').forEach(button => {
      button.addEventListener('click', () => {
        showPage(button.dataset.page);
        closeDebtForm();
        closePaymentForm();
        closeDeleteModal();
      });
    });

    function runTests() {
      console.assert(parseMoney('R$ 1.234,56') === 1234.56, 'parseMoney deve converter moeda BR');
      console.assert(brl(10) === 'R$ 10,00' || brl(10) === 'R$ 10,00', 'brl deve formatar moeda BR');
      console.assert(addMonths('2026-01-31', 1) === '2026-02-28', 'addMonths deve ajustar fim de mês');
      console.assert(escapeHtml('<script>') === '&lt;script&gt;', 'escapeHtml deve escapar HTML');
    }

    runTests();

    loadAll().catch(error => {
      console.error(error);
      showToast('Erro ao carregar dados.');
    });
  
