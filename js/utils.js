import { state } from './state.js';

export const $ = (id) => document.getElementById(id);

export function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export function parseMoney(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(String(value).replace(/R\$/g, '').replace(/\./g, '').replace(',', '.').trim()) || 0;
}

export function formatDateBR(dateString) { return dateString ? new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR') : '-'; }

export function formatAnyDateBR(value) {
  if (!value) return '-';
  if (typeof value === 'string') return formatDateBR(value.slice(0, 10));
  if (typeof value.toDate === 'function') return value.toDate().toLocaleDateString('pt-BR');
  if (value.seconds) return new Date(value.seconds * 1000).toLocaleDateString('pt-BR');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
}

export function addMonths(dateString, months) {
  const date = new Date(dateString + 'T00:00:00');
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() !== day) date.setDate(0);
  return date.toISOString().slice(0, 10);
}

export function currentMonthKey() { return new Date().toISOString().slice(0, 7); }

export function byDueDate(a, b) { return String(a.dueDate || '').localeCompare(String(b.dueDate || '')); }

export function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function emptyCard(title, text) {
  return '<div class="debt-card"><div class="debt-name">' + escapeHtml(title) + '</div><div class="debt-meta">' + escapeHtml(text) + '</div></div>';
}

export function tag(label, tone) {
  return '<span class="tag ' + tone + '">' + escapeHtml(label) + '</span>';
}

export function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
}

export function getCreditorName(id) {
  const creditor = state.creditors.find(c => c.id === id);
  return creditor ? creditor.name : 'Credor não informado';
}

export function sortedCreditors() {
  return [...state.creditors].sort((a, b) => compareText(a.name, b.name));
}

export function creditorDomain(name) {
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

export function initials(value) {
  return String(value || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
}

export function creditorLogoHtml(creditorId) {
  const creditor = state.creditors.find(c => c.id === creditorId);
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

export function priorityTagForDebt(debt) {
  let critical = tag('Normal', 'gray');
  if (debt.criticality === 'Máxima') critical = tag('Prioridade Máxima', 'amber');
  if (debt.criticality === 'Alta') critical = tag('Prioridade Alta', 'blue');
  return critical;
}

export function compactTagsForDebt(debt, isNextTarget = false) {
  return priorityTagForDebt(debt) + (isNextTarget ? tag('Próximo Alvo', 'red') : '');
}

export function daysUntil(dateString) {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateString + 'T00:00:00');
  return Math.round((due - today) / 86400000);
}

export function dueHint(dateString) {
  const days = daysUntil(dateString);
  if (days === null) return '';
  if (days < 0) return 'Vencida há ' + Math.abs(days) + ' dias';
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Daqui a 1 dia';
  return 'Daqui a ' + days + ' dias';
}

export function paymentForInstallment(installmentId) {
  return state.paymentByInstallment.get(installmentId) || null;
}

export function fact(label, value) {
  return '<span><strong style="color:var(--soft)">' + escapeHtml(label) + ':</strong> ' + escapeHtml(value) + '</span>';
}

export function routeProgressHtml(progress) {
  return '<div class="route-progress">' +
    '<div class="route-progress-top"><span>Progresso</span><strong>' + progress + '%</strong></div>' +
    '<div class="route-progress-track"><div class="route-progress-fill" style="width:' + progress + '%;"></div></div>' +
  '</div>';
}
