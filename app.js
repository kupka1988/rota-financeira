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
    let selectedPaidOffCreditorFilter = 'all';
    let selectedDebtSort = 'priority';
    let selectedWaitingDebtSort = 'priority';
    let selectedHiddenDebtSort = 'priority';
    let selectedRenegotiationDebtIds = new Set();
    let expandedDebtId = null;
    let expandedDebtTab = 'pending';
    let expandedDebtListMode = 'preview';
    let payoffDebtId = null;
    let editingInstallmentId = null;
    let draggedRouteDebtId = null;
    let draggedWaitingDebtId = null;

    const $ = (id) => document.getElementById(id);
    const THEME_KEY = 'rotaFinanceiraTheme';

    function applyTheme(theme) {
      const nextTheme = theme === 'light' ? 'light' : 'dark';
      document.body.dataset.theme = nextTheme;
      const select = $('themeSelect');
      if (select) select.value = nextTheme;
      localStorage.setItem(THEME_KEY, nextTheme);
    }

    window.setThemePreference = function(theme) {
      applyTheme(theme);
    };

    applyTheme(localStorage.getItem(THEME_KEY) || 'light');

    function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    function parseMoney(value) {
      if (typeof value === 'number') return value;
      if (!value) return 0;
      return Number(String(value).replace(/R\$/g, '').replace(/\./g, '').replace(',', '.').trim()) || 0;
    }
    function formatDateBR(dateString) { return dateString ? new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR') : '-'; }
    function formatAnyDateBR(value) {
      if (!value) return '-';
      if (typeof value === 'string') return formatDateBR(value.slice(0, 10));
      if (typeof value.toDate === 'function') return value.toDate().toLocaleDateString('pt-BR');
      if (value.seconds) return new Date(value.seconds * 1000).toLocaleDateString('pt-BR');
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
    }
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
    function isOpenInstallment(item) { return !['Paga', 'Renegociada', 'Quitada', 'Cancelada'].includes(item.status); }
    function openInstallmentsForDebt(debt) {
      return debtInstallments(debt.id).filter(isOpenInstallment);
    }
    function debtBalance(debt) {
      return openInstallmentsForDebt(debt).reduce((sum, item) => sum + Number(item.expectedValue || 0), 0);
    }
    function debtProgress(debt) {
      const progress = installmentProgress(debt);
      return progress.total ? Math.min(100, Math.round((progress.paid / progress.total) * 100)) : 0;
    }
    function nextInstallment(debt) {
      return openInstallmentsForDebt(debt).sort(byDueDate)[0] || null;
    }

    function remainingInstallmentsCount(debt) {
      const items = debtInstallments(debt.id);
      if (!items.length) return Number(debt.installmentsQty || 0) || 0;
      return items.filter(isOpenInstallment).length;
    }

    function monthsToClearDebt(debt) {
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

    function installmentProgress(debt) {
      const items = debtInstallments(debt.id);
      const paid = items.filter(item => item.status === 'Paga' || item.status === 'Quitada').length;
      return { paid, total: items.length || Number(debt.installmentsQty || 0) || 0 };
    }

    function isPaidOffDebt(debt) {
      const items = debtInstallments(debt.id);
      return items.length > 0 && openInstallmentsForDebt(debt).length === 0;
    }

    async function synchronizePaidOffDebts() {
      const completed = debts.filter(debt => ['Ativa', 'Em espera', 'Fora do radar'].includes(debt.status) && isPaidOffDebt(debt));
      if (!completed.length) return [];
      const batch = writeBatch(db);
      completed.forEach(debt => {
        debt.status = 'Quitada';
        batch.update(doc(db, 'debts', debt.id), { status: 'Quitada', paidOffAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      await batch.commit();
      return completed;
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

    function priorityTagForDebt(debt) {
      let critical = tag('Normal', 'gray');
      if (debt.criticality === 'Máxima') critical = tag('Prioridade Máxima', 'amber');
      if (debt.criticality === 'Alta') critical = tag('Prioridade Alta', 'blue');
      return critical;
    }

    function compactTagsForDebt(debt, isNextTarget = false) {
      return priorityTagForDebt(debt) + (isNextTarget ? tag('Próximo Alvo', 'red') : '');
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
      const allItems = debtInstallments(debt.id);
      if (!allItems.length) return '<div class="debt-meta" style="margin-top:14px;">Nenhuma parcela gerada para esta dívida.</div>';

      const pending = allItems.filter(isOpenInstallment).sort(byDueDate);
      const paid = allItems.filter(item => item.status === 'Paga' || item.status === 'Quitada').sort((a, b) => String(b.dueDate || '').localeCompare(String(a.dueDate || '')));
      const currentTab = expandedDebtTab === 'paid' ? 'paid' : 'pending';
      const source = currentTab === 'paid' ? paid : pending;
      const isPreview = expandedDebtListMode !== 'all';
      const visible = isPreview ? source.slice(0, 5) : source;
      const emptyText = currentTab === 'paid' ? 'Nenhuma parcela paga registrada.' : 'Nenhuma parcela pendente.';
      const buttonText = currentTab === 'paid' ? 'Ver histórico completo' : 'Ver todas as parcelas pendentes';
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

    function financeItem(label, value, isPrimary) {
      return '<div class="finance-item ' + (isPrimary ? 'primary' : '') + '"><div class="metric-label">' + escapeHtml(label) + '</div><div class="debt-value">' + escapeHtml(value) + '</div></div>';
    }

    function compactStat(label, value, extraHtml = '') {
      return '<div class="compact-stat"><div class="metric-label">' + escapeHtml(label) + '</div><strong>' + escapeHtml(value) + '</strong>' + extraHtml + '</div>';
    }

    function debtCard(debt) {
      const next = nextInstallment(debt);
      const progress = debtProgress(debt);
      const installmentCount = installmentProgress(debt);
      const isExpanded = expandedDebtId === debt.id;
      const title = escapeHtml(getCreditorName(debt.creditorId)) + ' · ' + escapeHtml(debt.name);
      const toneClass = debt.criticality === 'Máxima' ? ' priority-max' : debt.criticality === 'Alta' ? ' priority-high' : ' priority-normal';
      const cardClass = 'debt-card' + toneClass + (isExpanded ? ' expanded' : '');
      const balance = debtBalance(debt);
      const nextLabel = next ? formatDateBR(next.dueDate) : 'Sem Parcela';
      const metaHtml = compactTagsForDebt(debt);

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
          '<div class="row-stat progress"><div class="metric-label">Progresso</div><strong>' + installmentCount.paid + '/' + installmentCount.total + '</strong><small>' + progress + '% das parcelas</small><div class="compact-progress"><div class="progress-fill" style="width:' + progress + '%;"></div></div></div>' +
          '<button class="ghost-btn row-toggle" onclick="window.toggleDebt(\'' + debt.id + '\')">' + (isExpanded ? '⌃' : '⌄') + '</button>' +
        '</div>' +
        (isExpanded ? debtExpandedDetail(debt) : '') +
      '</div>';
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

    function waitingDebtRouteRow(debt, index) {
      const balance = debtBalance(debt);
      const isExpanded = expandedDebtId === debt.id;
      const next = nextInstallment(debt);
      const nextLabel = next ? formatDateBR(next.dueDate) : 'Sem parcela';
      const progressValue = debtProgress(debt);
      return '<div class="route-item waiting-route-item' + (isExpanded ? ' expanded' : '') + '" data-debt-id="' + debt.id + '" draggable="true" ondragstart="window.startWaitingDebtDrag(event, \'' + debt.id + '\')" ondragover="window.waitingDebtDragOver(event)" ondrop="window.dropWaitingDebt(event, \'' + debt.id + '\')" ondragend="window.endWaitingDebtDrag()">' +
        '<button class="drag-handle" title="Arrastar para reordenar">⋮⋮</button>' +
        '<div class="route-rank">' + (index + 1) + '</div>' +
        '<div class="route-title">' + creditorLogoHtml(debt.creditorId) + '<div><div class="debt-name clickable" onclick="window.toggleDebt(\'' + debt.id + '\')">' + escapeHtml(getCreditorName(debt.creditorId) + ' · ' + debt.name) + '</div><div class="debt-meta">' + compactTagsForDebt(debt) + '</div></div></div>' +
        routeProgressHtml(progressValue) +
        '<div class="route-stat"><span>Saldo</span><strong>' + brl(balance) + '</strong></div>' +
        '<div class="route-stat"><span>Parcela</span><strong>' + brl(debt.installmentValue) + '</strong></div>' +
        '<div class="route-stat"><span>Próxima Parcela</span><strong>' + escapeHtml(nextLabel) + '</strong></div>' +
        '<div class="route-stat"><span>Status</span><strong>' + routeInstallmentStatusLabel(debt) + '</strong></div>' +
        '<div class="route-actions"><button class="ghost-btn subtle" onclick="window.moveWaitingDebt(\'' + debt.id + '\', -1)">↑</button><button class="ghost-btn subtle" onclick="window.moveWaitingDebt(\'' + debt.id + '\', 1)">↓</button><button class="ghost-btn row-toggle" onclick="window.toggleDebt(\'' + debt.id + '\')">' + (isExpanded ? '⌃' : '⌄') + '</button></div>' +
        (isExpanded ? debtExpandedDetail(debt) : '') +
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
      const hiddenAll = debts.filter(d => d.status === 'Fora do radar');
      const hidden = sortDebts(hiddenAll, selectedHiddenDebtSort);
      const paidOffAll = debts.filter(d => d.status === 'Quitada');
      const paidOff = selectedPaidOffCreditorFilter === 'all' ? paidOffAll : paidOffAll.filter(d => d.creditorId === selectedPaidOffCreditorFilter);
      renderDebtMetrics(activeByPriority);
      renderWaitingCreditorFilters(waitingAll);
      renderWaitingDebtMetrics(waitingAll);
      renderHiddenDebtMetrics(hiddenAll);
      renderPaidOffCreditorFilters(paidOffAll);
      renderPaidOffDebtMetrics(paidOff);
      $('activeDebts').innerHTML = active.length ? active.map(debtCard).join('') : emptyCard('Nenhuma Dívida Encontrada', selectedCreditorFilter === 'all' ? 'Não há dívidas ativas para este filtro.' : 'Não há dívidas ativas para este credor neste filtro.');
      $('waitingDebts').innerHTML = waiting.length ? waiting.map(waitingDebtRouteRow).join('') : emptyCard('Nenhuma dívida em espera', selectedWaitingCreditorFilter === 'all' ? 'As dívidas fora da frente atual aparecerão aqui.' : 'Não há dívidas em espera para este credor.');
      $('hiddenDebts').innerHTML = hidden.length ? hidden.map(debtCard).join('') : emptyCard('Nada fora do radar', 'As dívidas que você não quer acompanhar aparecerão aqui.');
      $('paidOffDebts').innerHTML = paidOff.length ? sortDebts(paidOff, 'progress-desc').map(debtCard).join('') : emptyCard('Nenhuma dívida quitada', selectedPaidOffCreditorFilter === 'all' ? 'Quando uma dívida ficar sem parcelas abertas, ela aparecerá aqui.' : 'Não há dívidas quitadas para este credor.');
      renderDashboard();
    }

    function debtMetric(label, value, icon, tone) {
      return '<div class="debt-metric"><div class="metric-icon ' + tone + '">' + escapeHtml(icon) + '</div><div><div class="metric-label">' + escapeHtml(label) + '</div><div class="debt-value">' + escapeHtml(value) + '</div></div></div>';
    }

    function renderDebtMetrics(activeDebts) {
      const container = $('debtMetrics');
      if (!container) return;
      const activeIds = new Set(activeDebts.map(d => d.id));
      const openInstallments = installments.filter(i => isOpenInstallment(i) && activeIds.has(i.debtId));
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
      const waitingInstallments = installments.filter(i => isOpenInstallment(i) && waitingIds.has(i.debtId));
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
      let html = '<button class="ghost-btn ' + (selectedWaitingCreditorFilter === 'all' ? 'is-active' : '') + '" onclick="window.filterWaitingByCreditor(\'all\')">◌ Todos <span class="filter-count">' + waitingDebts.length + '</span></button>';
      creditorIds.forEach(id => {
        const count = waitingDebts.filter(d => d.creditorId === id).length;
        html += '<button class="ghost-btn ' + (selectedWaitingCreditorFilter === id ? 'is-active' : '') + '" onclick="window.filterWaitingByCreditor(\'' + id + '\')">' + creditorLogoHtml(id) + escapeHtml(getCreditorName(id)) + '<span class="filter-count">' + count + '</span></button>';
      });
      container.innerHTML = html;
    }

    function renderHiddenDebtMetrics(hiddenDebts) {
      const container = $('hiddenDebtMetrics');
      if (!container) return;
      const hiddenIds = new Set(hiddenDebts.map(d => d.id));
      const hiddenInstallments = installments.filter(i => isOpenInstallment(i) && hiddenIds.has(i.debtId));
      const totalBalance = hiddenDebts.reduce((sum, debt) => sum + debtBalance(debt), 0);
      const creditorsCount = new Set(hiddenDebts.map(d => d.creditorId).filter(Boolean)).size;
      container.innerHTML =
        debtMetric('Saldo Fora do Radar', brl(totalBalance), '◎', 'blue') +
        debtMetric('Dívidas Arquivadas', String(hiddenDebts.length), '▥', '') +
        debtMetric('Credores', String(creditorsCount), '◌', 'green') +
        debtMetric('Parcelas Reconhecidas', String(hiddenInstallments.length), '◷', 'red');
    }

    function renderPaidOffCreditorFilters(paidOffDebts) {
      const container = $('paidOffCreditorFilters');
      if (!container) return;
      const creditorIds = [...new Set(paidOffDebts.map(d => d.creditorId).filter(Boolean))]
        .sort((a, b) => compareText(getCreditorName(a), getCreditorName(b)));
      let html = '<button class="ghost-btn ' + (selectedPaidOffCreditorFilter === 'all' ? 'is-active' : '') + '" onclick="window.filterPaidOffByCreditor(\'all\')">✓ Todas quitadas <span class="filter-count">' + paidOffDebts.length + '</span></button>';
      creditorIds.forEach(id => {
        const count = paidOffDebts.filter(d => d.creditorId === id).length;
        html += '<button class="ghost-btn ' + (selectedPaidOffCreditorFilter === id ? 'is-active' : '') + '" onclick="window.filterPaidOffByCreditor(\'' + id + '\')">' + creditorLogoHtml(id) + escapeHtml(getCreditorName(id)) + '<span class="filter-count">' + count + '</span></button>';
      });
      container.innerHTML = html;
    }

    function renderPaidOffDebtMetrics(filteredPaidOffDebts) {
      const container = $('paidOffDebtMetrics');
      if (!container) return;
      const paidValue = filteredPaidOffDebts.reduce((sum, debt) => sum + debtPaid(debt), 0);
      const expectedValue = filteredPaidOffDebts.reduce((sum, debt) => sum + debtTotal(debt), 0);
      const discountValue = filteredPaidOffDebts.reduce((sum, debt) => sum + debtDiscount(debt), 0);
      const creditorsCount = new Set(filteredPaidOffDebts.map(d => d.creditorId).filter(Boolean)).size;
      container.innerHTML =
        debtMetric('Dívidas Quitadas', String(filteredPaidOffDebts.length), '✓', 'green') +
        debtMetric('Total Quitado', brl(paidValue), '▣', 'blue') +
        debtMetric('Valor Original', brl(expectedValue), '◇', '') +
        debtMetric('Economia', brl(discountValue), '↓', discountValue ? 'green' : '') +
        debtMetric('Credores', String(creditorsCount), '◌', creditorsCount ? 'blue' : '');
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
      const active = debts
        .filter(debt => debt.status === 'Ativa')
        .sort((a, b) => trailOrderValue(a) - trailOrderValue(b));
      const paidOff = debts
        .filter(debt => debt.status === 'Quitada')
        .sort((a, b) => trailOrderValue(a) - trailOrderValue(b));
      return [...active, ...paidOff];
    }

    function eligibleRenegotiationDebts() {
      return sortDebts(debts.filter(debt => debt.status === 'Ativa' || debt.status === 'Em espera'), 'priority');
    }

    function selectedRenegotiationDebts() {
      return eligibleRenegotiationDebts().filter(debt => selectedRenegotiationDebtIds.has(debt.id));
    }

    function nextPayoffOrder() {
      const max = debts.reduce((value, debt) => Math.max(value, Number(debt.payoffOrder || 0)), 0);
      return max + 1;
    }

    function nextActiveRouteOrder(exceptId = null) {
      const max = debts
        .filter(debt => debt.id !== exceptId && debt.status === 'Ativa')
        .reduce((value, debt) => Math.max(value, Number(debt.payoffOrder || 0)), 0);
      return max + 1;
    }

    function orderedWaitingDebts() {
      return debts
        .filter(debt => debt.status === 'Em espera')
        .sort((a, b) => trailOrderValue(a) - trailOrderValue(b));
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
      const visibleDebts = debts.filter(d => d.status !== 'Fora do radar');
      const activeCreditors = new Set(visibleDebts.filter(d => d.status === 'Ativa').map(d => d.creditorId).filter(Boolean)).size;
      const waitingCreditors = new Set(visibleDebts.filter(d => d.status === 'Em espera').map(d => d.creditorId).filter(Boolean)).size;
      container.innerHTML =
        debtMetric('Credores Cadastrados', String(creditors.length), '▣', 'blue') +
        debtMetric('Com Dívidas', String(linkedCreditors), '⌁', 'red') +
        debtMetric('Na Frente Ativa', String(activeCreditors), '✓', 'green') +
        debtMetric('Livres Para Excluir', String(freeCreditors), '◌', waitingCreditors ? '' : 'green');
    }

    function renderRenegotiation() {
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
        const checked = selectedRenegotiationDebtIds.has(debt.id) ? 'checked' : '';
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

    function routeProgressHtml(progress) {
      return '<div class="route-progress">' +
        '<div class="route-progress-top"><span>Progresso</span><strong>' + progress + '%</strong></div>' +
        '<div class="route-progress-track"><div class="route-progress-fill" style="width:' + progress + '%;"></div></div>' +
      '</div>';
    }

    function routeInstallmentStatusLabel(debt) {
      const progress = installmentProgress(debt);
      return progress.paid + '/' + progress.total;
    }

    function renderTrail() {
      const metrics = $('trailMetrics');
      const road = $('trailRoad');
      const position = $('trailPositionTitle');
      const nextTarget = $('nextTarget');
      if (!metrics || !road || !position || !nextTarget) return;

      const route = orderedTrailDebts();
      const totalBalance = route.reduce((sum, debt) => sum + debtBalance(debt), 0);
      const monthlyCommitment = route
        .filter(debt => debt.status === 'Ativa' && debtBalance(debt) > 0)
        .reduce((sum, debt) => sum + Number(debt.installmentValue || 0), 0);
      const completed = route.filter(debt => debt.status === 'Quitada' || debtBalance(debt) === 0).length;
      const next = route.find(debt => debt.status !== 'Quitada' && debtBalance(debt) > 0) || null;
      const progress = route.length ? Math.round((completed / route.length) * 100) : 0;

      metrics.innerHTML =
        '<div class="route-donut" style="--route-progress:' + progress + '%;"><strong>' + progress + '%</strong><span>jornada</span></div>' +
        '<div class="route-summary-copy"><div class="metric-label">Progresso da sua jornada</div><strong>Você já quitou ' + completed + ' de ' + route.length + ' dívidas</strong><span>' + (route.length ? 'Continue avançando na ordem definida para sua rota.' : 'Cadastre uma dívida ativa para iniciar sua rota.') + '</span></div>' +
        '<div class="route-summary-metrics">' +
        debtMetric('Total de dívidas', String(route.length), '⇄', 'blue') +
        debtMetric('Saldo total', brl(totalBalance), '▣', 'red') +
        debtMetric('Concluídas', String(completed), '✓', 'green') +
        debtMetric('Compromisso mensal', brl(monthlyCommitment), '▤', 'green') +
        '</div>';

      position.textContent = next
        ? 'Próximo alvo: ' + getCreditorName(next.creditorId) + ' · ' + next.name
        : route.length ? 'Todas as dívidas da rota foram concluídas' : 'Defina sua primeira dívida na rota';

      if (!route.length) {
        nextTarget.innerHTML = '';
        road.innerHTML = emptyCard('Rota vazia', 'Cadastre dívidas na Rota Financeira para montar sua ordem de quitação.');
        return;
      }

      if (next) {
        const nextProgress = debtProgress(next);
        nextTarget.innerHTML = '<div class="next-target-card">' +
          '<div class="next-target-main">' +
            '<div class="target-icon">!</div>' +
            '<div><div class="eyebrow">Próximo alvo</div><h2>' + escapeHtml(getCreditorName(next.creditorId) + ' · ' + next.name) + '</h2><div class="debt-meta">' + compactTagsForDebt(next, true) + '</div></div>' +
          '</div>' +
          routeProgressHtml(nextProgress) +
          '<div class="next-target-stat"><span>Saldo</span><strong>' + brl(debtBalance(next)) + '</strong></div>' +
          '<div class="next-target-stat"><span>Parcela</span><strong>' + brl(next.installmentValue) + '</strong></div>' +
          '<div class="next-target-stat"><span>Status</span><strong>' + routeInstallmentStatusLabel(next) + '</strong></div>' +
        '</div>';
      } else {
        nextTarget.innerHTML = '<div class="next-target-card complete"><div class="next-target-main"><div class="target-icon">✓</div><div><div class="eyebrow">Jornada concluída</div><h2>Todas as dívidas da rota foram quitadas</h2><div class="debt-meta">Seu histórico permanece aqui para mostrar o caminho percorrido.</div></div></div></div>';
      }

      road.innerHTML = route.map((debt, index) => {
        const balance = debtBalance(debt);
        const done = debt.status === 'Quitada' || balance === 0;
        const current = !done && debt.id === next?.id;
        const isExpanded = expandedDebtId === debt.id;
        const nextItem = nextInstallment(debt);
        const nextLabel = nextItem ? formatDateBR(nextItem.dueDate) : 'Sem parcela';
        const progressValue = done ? 100 : debtProgress(debt);
        const rank = done ? '✓' : route.filter(item => item.status === 'Ativa').findIndex(item => item.id === debt.id) + 1;
        const dragAttrs = done ? 'draggable="false"' : 'draggable="true" ondragstart="window.startRouteDrag(event, \'' + debt.id + '\')" ondragover="window.routeDragOver(event, \'' + debt.id + '\')" ondrop="window.dropRouteDebt(event, \'' + debt.id + '\')" ondragend="window.endRouteDrag()"';
        const reorderActions = done
          ? ''
          : '<button class="ghost-btn subtle" onclick="window.moveDebtInTrail(\'' + debt.id + '\', -1)">↑</button><button class="ghost-btn subtle" onclick="window.moveDebtInTrail(\'' + debt.id + '\', 1)">↓</button>';
        return '<div class="route-item' + (done ? ' done' : '') + (current ? ' current' : '') + (isExpanded ? ' expanded' : '') + '" data-debt-id="' + debt.id + '" ' + dragAttrs + '>' +
          '<button class="drag-handle" title="' + (done ? 'Dívida concluída' : 'Arrastar para reordenar') + '"' + (done ? ' disabled' : '') + '>⋮⋮</button>' +
          '<div class="route-rank">' + rank + '</div>' +
          '<div class="route-title">' + creditorLogoHtml(debt.creditorId) + '<div><div class="debt-name clickable" onclick="window.toggleDebt(\'' + debt.id + '\')">' + escapeHtml(getCreditorName(debt.creditorId) + ' · ' + debt.name) + '</div><div class="debt-meta">' + compactTagsForDebt(debt, current) + '</div></div></div>' +
          routeProgressHtml(progressValue) +
          '<div class="route-stat"><span>Saldo</span><strong>' + brl(balance) + '</strong></div>' +
          '<div class="route-stat"><span>Parcela</span><strong>' + brl(debt.installmentValue) + '</strong></div>' +
          '<div class="route-stat"><span>Próxima Parcela</span><strong>' + escapeHtml(nextLabel) + '</strong></div>' +
          '<div class="route-stat"><span>Status</span><strong>' + routeInstallmentStatusLabel(debt) + '</strong></div>' +
          '<div class="route-actions">' + reorderActions + '<button class="ghost-btn row-toggle" onclick="window.toggleDebt(\'' + debt.id + '\')">' + (isExpanded ? '⌃' : '⌄') + '</button></div>' +
          (isExpanded ? debtExpandedDetail(debt) : '') +
        '</div>';
      }).join('');
    }

    function renderDashboard() {
      const active = debts.filter(d => d.status === 'Ativa');
      const activeIds = new Set(active.map(d => d.id));
      const totalActive = active.reduce((sum, d) => sum + debtBalance(d), 0);
      const totalRecognized = debts.filter(d => d.status !== 'Renegociada' && d.status !== 'Fora do radar' && d.status !== 'Quitada').reduce((sum, d) => sum + debtBalance(d), 0);
      const month = currentMonthKey();
      const monthInstallments = installments
        .filter(i => isOpenInstallment(i) && String(i.dueDate || '').startsWith(month) && activeIds.has(i.debtId))
        .sort(byDueDate);
      const monthCommitment = monthInstallments.reduce((sum, i) => sum + Number(i.expectedValue || 0), 0);
      const openInstallments = installments
        .filter(i => isOpenInstallment(i) && activeIds.has(i.debtId))
        .sort(byDueDate);

      renderDashboardAction(active, openInstallments);
      renderDashboardSummary({ totalRecognized, totalActive, monthCommitment, monthInstallments, active });
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

    function renderRenegotiatedHistory() {
      const container = $('renegotiatedHistoryList');
      if (!container) return;
      const renegotiated = debts
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
            '<div><span>Dívida total reconhecida</span><strong>' + brl(data.totalRecognized) + '</strong></div>' +
            '<div><span>Total em aberto</span><strong>' + brl(data.totalActive) + '</strong></div>' +
            '<div><span>Compromisso mensal</span><strong>' + brl(data.monthCommitment) + '</strong></div>' +
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
        const debt = debts.find(d => d.id === item.debtId);
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
      const paid = payments.reduce((sum, item) => sum + Number(item.paidValue || 0), 0);
      const rows = [
        { title: 'Maior pressão hoje', main: biggest ? getCreditorName(biggest.creditorId) : '-', value: biggest ? brl(debtBalance(biggest)) : brl(0), note: totalActive ? Math.round((debtBalance(biggest) / totalActive) * 100) + '% do total ativo' : 'Sem saldo ativo' },
        { title: 'Melhor oportunidade', main: opportunity ? getCreditorName(opportunity.creditorId) + ' · ' + opportunity.name : '-', value: opportunity ? brl(debtBalance(opportunity)) : brl(0), note: 'Menor saldo restante para quitação' },
        { title: 'Dívida mais crítica', main: critical ? getCreditorName(critical.creditorId) + ' · ' + critical.name : '-', value: nextInstallment(critical) ? brl(nextInstallment(critical).expectedValue) : brl(debtBalance(critical)), note: nextInstallment(critical) ? dueHint(nextInstallment(critical).dueDate) : 'Sem parcela pendente' },
        { title: 'Atrasos', main: overdue.length ? overdue.length + ' parcela(s)' : 'Nenhum atraso', value: brl(overdue.reduce((sum, item) => sum + Number(item.expectedValue || 0), 0)), note: overdue.length ? 'Regularize antes de avançar' : 'Continue mantendo a rota em dia' },
        { title: 'Evolução', main: 'Você já pagou', value: brl(paid), note: paid > 0 ? 'Continue registrando pagamentos' : 'Primeiros pagamentos aparecerão aqui' }
      ];
      container.innerHTML = rows.map(item => (
        '<div class="insight-tile"><div class="metric-label">' + escapeHtml(item.title) + '</div><strong>' + escapeHtml(item.main) + '</strong><div class="insight-value">' + escapeHtml(item.value) + '</div><small>' + escapeHtml(item.note) + '</small></div>'
      )).join('');
    }

    async function loadAll() {
      creditors = (await getDocs(collection(db, 'creditors'))).docs.map(d => ({ id: d.id, ...d.data() }));
      debts = (await getDocs(collection(db, 'debts'))).docs.map(d => ({ id: d.id, ...d.data() }));
      installments = (await getDocs(collection(db, 'installments'))).docs.map(d => ({ id: d.id, ...d.data() }));
      payments = (await getDocs(collection(db, 'payments'))).docs.map(d => ({ id: d.id, ...d.data() }));
      rebuildIndexes();
      await synchronizePaidOffDebts();
      renderAll();
    }

    function renderAll() {
      rebuildIndexes();
      renderCreditors();
      renderDebts();
      renderRenegotiation();
      renderTrail();
      renderPayments();
      renderHistory();
      renderRenegotiatedHistory();
    }

    window.openDebtForm = function(mode = 'new', id = null, defaultStatus = 'Ativa') {
      showPage('trilha');
      closePaymentForm();
      window.closePayoffModal();
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
      const nextExpanded = expandedDebtId === id ? null : id;
      if (expandedDebtId !== id) {
        expandedDebtTab = 'pending';
        expandedDebtListMode = 'preview';
      }
      expandedDebtId = nextExpanded;
      renderDebts();
      renderTrail();
    };

    window.setDebtInstallmentTab = function(tab) {
      expandedDebtTab = tab === 'paid' ? 'paid' : 'pending';
      expandedDebtListMode = 'preview';
      renderDebts();
      renderTrail();
    };

    window.showAllDebtInstallments = function() {
      expandedDebtListMode = 'all';
      renderDebts();
      renderTrail();
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

    window.filterPaidOffByCreditor = function(id) {
      selectedPaidOffCreditorFilter = id;
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

    window.setHiddenDebtSort = function(mode) {
      selectedHiddenDebtSort = mode;
      expandedDebtId = null;
      renderDebts();
    };

    window.toggleRenegotiationDebt = function(id) {
      if (selectedRenegotiationDebtIds.has(id)) selectedRenegotiationDebtIds.delete(id);
      else selectedRenegotiationDebtIds.add(id);
      renderRenegotiation();
    };

    window.clearRenegotiationSelection = function() {
      selectedRenegotiationDebtIds.clear();
      renderRenegotiation();
    };

    window.openRenegotiationModal = function() {
      const selected = selectedRenegotiationDebts();
      if (!selected.length) return showToast('Selecione ao menos uma dívida para renegociar.');
      closeDebtForm();
      closePaymentForm();
      closeInstallmentModal();
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
        creditorId,
        name,
        firstDue,
        installmentsQty,
        installmentValue,
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
      installments
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

      selectedRenegotiationDebtIds.clear();
      closeRenegotiationModal();
      await loadAll();
      showToast('Acordo salvo com sucesso.');
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

    async function reactivateDebtIfOpen(debtId) {
      const debt = debts.find(d => d.id === debtId);
      if (!debt || debt.status !== 'Quitada' || !openInstallmentsForDebt(debt).length) return false;
      debt.status = 'Ativa';
      await updateDoc(doc(db, 'debts', debtId), { status: 'Ativa', updatedAt: serverTimestamp() });
      return true;
    }

    window.changeDebtStatus = async function(id, status) {
      const debt = debts.find(d => d.id === id);
      const payload = { status, updatedAt: serverTimestamp() };
      if (status === 'Ativa') payload.payoffOrder = nextActiveRouteOrder(id);
      await updateDoc(doc(db, 'debts', id), payload);
      if (debt) {
        debt.status = status;
        if (payload.payoffOrder) debt.payoffOrder = payload.payoffOrder;
      }
      if (status !== 'Ativa' && selectedCreditorFilter !== 'all') selectedCreditorFilter = 'all';
      renderAll();
      const messages = {
        Ativa: 'Dívida movida para Rota Financeira.',
        'Em espera': 'Dívida movida para espera.',
        'Fora do radar': 'Dívida movida para fora do radar.',
        Quitada: 'Dívida movida para quitadas.'
      };
      showToast(messages[status] || 'Situação atualizada com sucesso.');
    };

    function payoffSummaryValues() {
      const debt = debts.find(d => d.id === payoffDebtId);
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
      const debt = debts.find(d => d.id === id);
      if (!debt) return showToast('Dívida não encontrada.');
      closeDebtForm();
      closePaymentForm();
      closeInstallmentModal();
      payoffDebtId = id;
      const remaining = debtBalance(debt);
      $('payoffValue').value = brl(debt.payoffToday || remaining);
      $('payoffDate').value = new Date().toISOString().slice(0, 10);
      $('payoffMethod').value = '';
      $('payoffNotes').value = '';
      updatePayoffSummary();
      $('payoffModal').classList.add('show');
    };

    window.closePayoffModal = function() {
      payoffDebtId = null;
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
      payments.push({ id: created.id, ...paymentPayload });
      expandedDebtId = debt.id;
      window.closePayoffModal();
      rebuildIndexes();
      renderAll();
      showToast('Dívida quitada com sucesso.');
    };

    window.openPaymentForm = function(installmentId) {
      closeDebtForm();
      window.closePayoffModal();
      const inst = installments.find(i => i.id === installmentId);
      if (!inst) return;
      const debt = debts.find(d => d.id === inst.debtId);
      if (debt) expandedDebtId = debt.id;
      paymentInstallmentId = installmentId;
      $('payDebtName').value = debt ? getCreditorName(debt.creditorId) + ' · ' + debt.name : 'Dívida não encontrada';
      $('payInstallmentLabel').value = inst.number + '/' + inst.total;
      $('payDate').value = inst.dueDate;
      $('payValue').value = brl(inst.expectedValue);
      $('paymentForm').classList.add('show');
    };

    window.closePaymentForm = function() {
      paymentInstallmentId = null;
      $('paymentForm').classList.remove('show');
    };

    window.openInstallmentModal = function(installmentId) {
      closeDebtForm();
      closePaymentForm();
      const inst = installments.find(item => item.id === installmentId);
      if (!inst) return showToast('Parcela não encontrada.');
      editingInstallmentId = installmentId;
      $('editInstallmentDue').value = inst.dueDate || '';
      $('editInstallmentValue').value = brl(inst.expectedValue || 0);
      $('editInstallmentStatus').value = inst.status || 'Pendente';
      $('installmentModal').classList.add('show');
    };

    window.closeInstallmentModal = function() {
      editingInstallmentId = null;
      $('installmentModal').classList.remove('show');
    };

    window.saveInstallmentEdit = async function() {
      if (!editingInstallmentId) return showToast('Nenhuma parcela selecionada.');
      const inst = installments.find(item => item.id === editingInstallmentId);
      if (!inst) return showToast('Parcela não encontrada.');
      const dueDate = $('editInstallmentDue').value;
      const expectedValue = parseMoney($('editInstallmentValue').value);
      const status = $('editInstallmentStatus').value;
      if (!dueDate || !expectedValue) return showToast('Informe vencimento e valor previsto.');
      await updateDoc(doc(db, 'installments', editingInstallmentId), {
        dueDate,
        expectedValue,
        status,
        updatedAt: serverTimestamp()
      });
      inst.dueDate = dueDate;
      inst.expectedValue = expectedValue;
      inst.status = status;
      if (status !== 'Paga') delete inst.paidAt;
      await reactivateDebtIfOpen(inst.debtId);
      await synchronizePaidOffDebts();
      closeInstallmentModal();
      renderAll();
      showToast('Parcela atualizada com sucesso.');
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
      expandedDebtId = inst.debtId;
      const paidOff = await synchronizePaidOffDebts();
      const debtWasPaidOff = paidOff.some(debt => debt.id === inst.debtId);
      closePaymentForm();
      renderAll();
      showToast(debtWasPaidOff ? 'Pagamento registrado. Dívida concluída na Rota Financeira.' : 'Pagamento registrado com sucesso.');
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
      } else if (type === 'payment') {
        const payment = payments.find(p => p.id === id);
        const inst = payment ? installments.find(i => i.id === payment.installmentId) : null;
        const debt = inst ? debts.find(d => d.id === inst.debtId) : null;
        if (!payment || !inst) return;
        deleteContext = { type, id, installmentId: inst.id, debtId: inst.debtId };
        $('deleteModalTitle').textContent = 'Excluir pagamento';
        $('deleteModalText').textContent = 'Deseja excluir o pagamento da parcela ' + inst.number + '/' + inst.total + (debt ? ' de ' + getCreditorName(debt.creditorId) + ' · ' + debt.name : '') + '?';
        $('deleteModalWarning').textContent = 'A parcela voltará para pendente e o registro sairá da lista de pagamentos.';
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
      } else if (deleteContext.type === 'payment') {
        const paymentId = deleteContext.id;
        const installmentId = deleteContext.installmentId;
        const debtId = deleteContext.debtId;
        await deleteDoc(doc(db, 'payments', paymentId));
        await updateDoc(doc(db, 'installments', installmentId), { status: 'Pendente', paidAt: null, updatedAt: serverTimestamp() });
        payments = payments.filter(p => p.id !== paymentId);
        const inst = installments.find(i => i.id === installmentId);
        if (inst) {
          inst.status = 'Pendente';
          delete inst.paidAt;
        }
        await reactivateDebtIfOpen(debtId);
        expandedDebtId = debtId;
        closeDeleteModal();
        renderAll();
        showToast('Pagamento excluído com sucesso.');
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
      showPage('trilha');
      window.openDebtForm('new', null, defaultStatus);
    };

    window.openDebtFromDashboard = function(id) {
      showPage('trilha');
      expandedDebtId = id;
      renderAll();
      $('trailRoad').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.openDebtFromTrail = function(id) {
      const debt = debts.find(item => item.id === id);
      showPage(debt && debt.status === 'Quitada' ? 'quitadas' : debt && debt.status === 'Fora do radar' ? 'radar' : debt && debt.status === 'Em espera' ? 'espera' : 'trilha');
      expandedDebtId = id;
      renderAll();
      const target = debt && debt.status === 'Quitada' ? $('paidOffDebts') : debt && debt.status === 'Fora do radar' ? $('hiddenDebts') : debt && debt.status === 'Em espera' ? $('waitingDebts') : $('trailRoad');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.rollDebt = function(id) {
      const debt = debts.find(item => item.id === id);
      if (!debt) return showToast('Dívida não encontrada.');
      const baseDue = debt.firstDue || nextInstallment(debt)?.dueDate || new Date().toISOString().slice(0, 10);
      window.openDebtForm('new', null, debt.status || 'Ativa');
      $('debtCreditorSelect').value = debt.creditorId || '';
      $('debtName').value = debt.name || '';
      $('debtType').value = debt.type || 'Cartão';
      $('debtPaymentMethod').value = debt.paymentMethod || 'Boleto';
      $('debtFirstDue').value = addMonths(baseDue, 1);
      $('debtInstallmentsQty').value = debt.installmentsQty || '';
      $('debtInstallmentValue').value = brl(debt.installmentValue || 0);
      $('debtStatus').value = debt.status || 'Ativa';
      $('debtCriticality').value = debt.criticality || 'Normal';
      $('debtBehavior').value = 'Rolagem';
      $('debtPayoffToday').value = brl(debt.payoffToday || 0);
      $('debtPayoffOrder').value = nextPayoffOrder();
      $('debtNotes').value = debt.notes || '';
      showToast('Rolagem preparada para edição.');
    };

    async function persistRouteOrder(route) {
      const batch = writeBatch(db);
      route.forEach((debt, index) => {
        const payoffOrder = index + 1;
        batch.update(doc(db, 'debts', debt.id), { payoffOrder, updatedAt: serverTimestamp() });
        const local = debts.find(item => item.id === debt.id);
        if (local) local.payoffOrder = payoffOrder;
      });
      await batch.commit();
      renderAll();
      showToast('Ordem da rota atualizada.');
    }

    async function persistWaitingOrder(route) {
      const batch = writeBatch(db);
      route.forEach((debt, index) => {
        const payoffOrder = index + 1;
        batch.update(doc(db, 'debts', debt.id), { payoffOrder, updatedAt: serverTimestamp() });
        const local = debts.find(item => item.id === debt.id);
        if (local) local.payoffOrder = payoffOrder;
      });
      await batch.commit();
      selectedWaitingDebtSort = 'trail';
      if ($('waitingDebtSort')) $('waitingDebtSort').value = 'trail';
      renderAll();
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
      const debt = debts.find(item => item.id === id);
      if (!debt || debt.status !== 'Em espera') return;
      draggedWaitingDebtId = id;
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
      const sourceId = draggedWaitingDebtId || event.dataTransfer?.getData('text/plain');
      draggedWaitingDebtId = null;
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
      draggedWaitingDebtId = null;
      document.querySelectorAll('.waiting-route-item.dragging').forEach(item => item.classList.remove('dragging'));
    };

    window.moveDebtInTrail = async function(id, direction) {
      const targetDebt = debts.find(debt => debt.id === id);
      if (!targetDebt || targetDebt.status === 'Quitada') return;
      const route = orderedTrailDebts()
        .filter(debt => debt.status === 'Ativa')
        .map((debt, index) => ({ ...debt, payoffOrder: index + 1 }));
      const currentIndex = route.findIndex(debt => debt.id === id);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= route.length) return;

      const current = route[currentIndex];
      route[currentIndex] = route[nextIndex];
      route[nextIndex] = current;
      await persistRouteOrder(route);
    };

    window.startRouteDrag = function(event, id) {
      const debt = debts.find(item => item.id === id);
      if (!debt || debt.status === 'Quitada') return;
      draggedRouteDebtId = id;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
      }
      const item = event.currentTarget;
      if (item) item.classList.add('dragging');
    };

    window.routeDragOver = function(event) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    };

    window.dropRouteDebt = async function(event, targetId) {
      event.preventDefault();
      const sourceId = draggedRouteDebtId || event.dataTransfer?.getData('text/plain');
      draggedRouteDebtId = null;
      document.querySelectorAll('.route-item.dragging').forEach(item => item.classList.remove('dragging'));
      if (!sourceId || sourceId === targetId) return;

      const targetDebt = debts.find(debt => debt.id === targetId);
      if (!targetDebt || targetDebt.status === 'Quitada') return;
      const route = orderedTrailDebts().filter(debt => debt.status === 'Ativa');
      const from = route.findIndex(debt => debt.id === sourceId);
      const to = route.findIndex(debt => debt.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = route.splice(from, 1);
      route.splice(to, 0, moved);
      await persistRouteOrder(route);
    };

    window.endRouteDrag = function() {
      draggedRouteDebtId = null;
      document.querySelectorAll('.route-item.dragging').forEach(item => item.classList.remove('dragging'));
    };

    document.querySelectorAll('.nav-item').forEach(button => {
      button.addEventListener('click', () => {
        showPage(button.dataset.page);
        closeDebtForm();
        closePaymentForm();
        closeInstallmentModal();
        closeRenegotiationModal();
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
  
