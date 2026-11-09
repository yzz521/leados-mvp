const state = {
  page: 'overview',
  market: 'ALL',
  leads: [],
  tasks: [],
  overview: null,
  selectedLead: null
};

const statusLabels = { NEW: '新线索', QUALIFIED: '已筛选', CONTACTED: '跟进中', OPPORTUNITY: '商机', WON: '已成交', LOST: '已丢单' };
const marketLabels = { LOCAL: '本地获客', EXPORT: '外贸开发' };
const permissionLabels = { UNCONFIRMED: '未确认', AUTHORIZED: '已授权', OPTED_OUT: '已拒绝联系', NOT_APPLICABLE: '不适用' };
const priorityLabels = { HIGH: '高优先级', MEDIUM: '普通', LOW: '低优先级' };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

async function api(path, options = {}) {
  const config = { ...options, headers: { ...(options.headers || {}) } };
  if (config.body && typeof config.body !== 'string') {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(path, config);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = payload?.error?.message || `请求失败（${response.status}）`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function firstChar(value) { return [...String(value || '客')][0] || '客'; }
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return date.toLocaleDateString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit' });
}
function formatDateTime(value) {
  if (!value) return '未设置时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return date.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function statusPill(status) { return `<span class="status-pill status-${String(status).toLowerCase()}">${statusLabels[status] || esc(status)}</span>`; }
function marketPill(market) { return `<span class="market-pill market-${String(market).toLowerCase()}">${marketLabels[market] || esc(market)}</span>`; }
function scorePill(lead) {
  const level = lead.scoreLevel || (Number(lead.score) >= 75 ? 'HIGH' : Number(lead.score) >= 45 ? 'MEDIUM' : 'LOW');
  return `<span class="score-pill score-${level.toLowerCase()}">${Number(lead.score || 0)} 分</span>`;
}
function permissionPill(value) { return `<span class="permission-pill permission-${String(value || 'UNCONFIRMED').toLowerCase()}">${permissionLabels[value] || '未确认'}</span>`; }
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  $('#toastRegion').append(toast);
  setTimeout(() => toast.remove(), 3400);
}
function openModal(id) { const el = document.getElementById(id); el.classList.add('open'); el.setAttribute('aria-hidden','false'); }
function closeModal(id) { const el = document.getElementById(id); el.classList.remove('open'); el.setAttribute('aria-hidden','true'); }

function switchPage(page) {
  state.page = page;
  $$('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  $('#pageBreadcrumb').textContent = ({ overview:'总览工作台', leads:'线索中心', tasks:'跟进任务' })[page] || '工作空间';
  if (page === 'leads') renderLeads();
  if (page === 'tasks') renderTasks();
}

function effectiveMarket() {
  const global = state.market;
  const localFilter = $('#leadMarketFilter')?.value || 'ALL';
  return localFilter !== 'ALL' ? localFilter : global;
}

async function loadData() {
  $('#connectionStatus').textContent = '● 正在同步';
  try {
    const [overview, leads, tasks] = await Promise.all([
      api('/api/overview'),
      api('/api/leads'),
      api('/api/tasks')
    ]);
    state.overview = overview;
    state.leads = leads.items || [];
    state.tasks = tasks.items || [];
    renderOverview();
    renderLeads();
    renderTasks();
    $('#navLeadCount').textContent = state.leads.length;
    $('#connectionStatus').textContent = '● 服务正常';
  } catch (error) {
    $('#connectionStatus').textContent = '● 连接异常';
    showToast(error.message, 'error');
  }
}

function marketFiltered(items) {
  return state.market === 'ALL' ? items : items.filter(item => item.marketType === state.market);
}

function renderOverview() {
  const overview = state.overview;
  if (!overview) return;
  const all = marketFiltered(state.leads);
  const tasks = state.tasks.filter(t => t.status !== 'DONE');
  const statusCount = status => all.filter(l => l.status === status).length;
  $('#metricTotal').textContent = all.length;
  $('#metricNew').textContent = statusCount('NEW');
  $('#metricHigh').textContent = all.filter(l => Number(l.score || 0) >= 75 && !['WON','LOST'].includes(l.status)).length;
  $('#metricTasks').textContent = state.market === 'ALL' ? tasks.length : tasks.filter(t => {
    const lead = state.leads.find(l => l.id === t.leadId);
    return lead?.marketType === state.market;
  }).length;
  const stages = [
    ['新线索','NEW'],['已筛选','QUALIFIED'],['跟进中','CONTACTED'],['商机','OPPORTUNITY'],['已成交','WON']
  ];
  const max = Math.max(1, ...stages.map(([,key]) => statusCount(key)));
  $('#funnelList').innerHTML = stages.map(([label,key]) => {
    const count = statusCount(key), width = Math.max(count ? 5 : 0, count / max * 100);
    return `<div class="funnel-row"><span class="funnel-label">${label}</span><div class="funnel-track"><div class="funnel-fill" style="width:${width}%"></div></div><span class="funnel-value">${count}</span></div>`;
  }).join('');
  const upcoming = state.tasks.filter(t => t.status !== 'DONE').filter(t => {
    const lead = state.leads.find(l => l.id === t.leadId);
    return state.market === 'ALL' || lead?.marketType === state.market;
  }).sort((a,b) => String(a.dueAt).localeCompare(String(b.dueAt))).slice(0,5);
  $('#upcomingTasks').innerHTML = upcoming.length ? upcoming.map(task => `<div class="task-preview"><span class="task-bullet"></span><div class="task-preview-body"><strong>${esc(task.title)}</strong><small>${esc(leadTitle(task.leadId))}</small></div><span class="task-time">${formatDateTime(task.dueAt)}</span></div>`).join('') : '<div class="empty-state">暂无待处理任务</div>';
  const recent = all.slice().sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,6);
  $('#recentLeadRows').innerHTML = recent.length ? recent.map(lead => `<tr>
    <td>${customerCell(lead)}</td><td>${marketPill(lead.marketType)}</td><td>${esc(lead.source || '—')}</td>
    <td>${scorePill(lead)}</td><td>${statusPill(lead.status)}</td><td>${esc(lead.owner || '未分配')}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-state">还没有线索，新增或导入一条试试</div></td></tr>';
}

function customerCell(lead) {
  const title = lead.companyName || lead.contactName || '未命名客户';
  const sub = lead.contactName && lead.companyName ? lead.contactName : (lead.email || lead.region || '暂无补充信息');
  return `<div class="customer-cell"><div class="customer-avatar">${esc(firstChar(title))}</div><div class="customer-meta"><strong>${esc(title)}</strong><small>${esc(sub)}</small></div></div>`;
}
function leadTitle(id) {
  const lead = state.leads.find(item => item.id === id);
  return lead ? (lead.companyName || lead.contactName || '客户') : '未关联客户';
}

function renderLeads() {
  const keyword = ($('#leadSearch')?.value || '').trim().toLowerCase();
  const status = $('#statusFilter')?.value || 'ALL';
  const market = effectiveMarket();
  const items = state.leads.filter(lead => {
    if (market !== 'ALL' && lead.marketType !== market) return false;
    if (status !== 'ALL' && lead.status !== status) return false;
    if (!keyword) return true;
    const haystack = [lead.companyName,lead.contactName,lead.email,lead.phone,lead.region,lead.productInterest,lead.requirement].join(' ').toLowerCase();
    return haystack.includes(keyword);
  });
  $('#leadRows').innerHTML = items.length ? items.map(lead => `<tr>
    <td>${customerCell(lead)}</td><td>${marketPill(lead.marketType)}</td><td>${esc(lead.source || '—')}</td>
    <td>${scorePill(lead)}</td><td><select class="inline-status" data-status-lead="${esc(lead.id)}" aria-label="修改线索阶段">${Object.entries(statusLabels).map(([value,label]) => `<option value="${value}" ${value === lead.status ? 'selected' : ''}>${label}</option>`).join('')}</select></td>
    <td>${permissionPill(lead.contactPermission)}</td><td>${formatDate(lead.createdAt)}</td>
    <td><div class="row-actions"><button class="mini-button" data-detail-lead="${esc(lead.id)}">详情</button><button class="mini-button" data-analyze-lead="${esc(lead.id)}">分析</button></div></td></tr>`).join('') : '<tr><td colspan="8"><div class="empty-state">没有找到匹配的线索</div></td></tr>';
  $('#leadResultCount').textContent = `${items.length} 条线索`;
  bindLeadRowActions();
}

function bindLeadRowActions() {
  $$('[data-detail-lead]').forEach(button => button.addEventListener('click', () => openLeadDetail(button.dataset.detailLead)));
  $$('[data-analyze-lead]').forEach(button => button.addEventListener('click', () => analyzeLead(button.dataset.analyzeLead)));
  $$('[data-status-lead]').forEach(select => select.addEventListener('change', async () => {
    try {
      await api(`/api/leads/${encodeURIComponent(select.dataset.statusLead)}`, { method:'PATCH', body:{ status:select.value } });
      showToast('线索阶段已更新'); await loadData();
    } catch (error) { showToast(error.message, 'error'); }
  }));
}

function renderTasks() {
  const filter = $('#taskStatusFilter')?.value || 'ALL';
  const tasks = state.tasks.filter(task => {
    if (filter !== 'ALL' && task.status !== filter) return false;
    const lead = state.leads.find(item => item.id === task.leadId);
    return state.market === 'ALL' || lead?.marketType === state.market || !task.leadId;
  }).sort((a,b) => String(a.dueAt).localeCompare(String(b.dueAt)));
  const open = tasks.filter(t => t.status === 'OPEN').length;
  const progress = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const done = tasks.filter(t => t.status === 'DONE').length;
  $('#taskSummary').innerHTML = `<div class="task-summary-card"><span>待处理</span><strong>${open}</strong></div><div class="task-summary-card"><span>进行中</span><strong>${progress}</strong></div><div class="task-summary-card"><span>已完成</span><strong>${done}</strong></div>`;
  $('#taskRows').innerHTML = tasks.length ? tasks.map(task => `<div class="task-item">
    <button class="task-check ${task.status === 'DONE' ? 'done' : ''}" data-toggle-task="${esc(task.id)}" title="${task.status === 'DONE' ? '标记为待处理' : '标记完成'}">${task.status === 'DONE' ? '✓' : ''}</button>
    <div class="task-content"><strong>${esc(task.title)}</strong><p>${esc(task.description || leadTitle(task.leadId))}</p></div>
    <div class="task-meta"><span class="priority-pill priority-${String(task.priority).toLowerCase()}">${priorityLabels[task.priority] || '普通'}</span><span>${formatDateTime(task.dueAt)}</span><span>${task.status === 'DONE' ? '已完成' : task.status === 'IN_PROGRESS' ? '进行中' : '待处理'}</span></div>
  </div>`).join('') : '<div class="empty-state">暂无任务，创建一个跟进任务开始管理销售行动。</div>';
  $$('[data-toggle-task]').forEach(button => button.addEventListener('click', () => toggleTask(button.dataset.toggleTask)));
  populateTaskLeadSelect();
}

async function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  const next = task.status === 'DONE' ? 'OPEN' : 'DONE';
  try { await api(`/api/tasks/${encodeURIComponent(id)}`, { method:'PATCH', body:{ status:next } }); showToast(next === 'DONE' ? '任务已完成' : '任务已重新打开'); await loadData(); }
  catch (error) { showToast(error.message, 'error'); }
}

async function analyzeLead(id) {
  try {
    const result = await api(`/api/leads/${encodeURIComponent(id)}/analyze`, { method:'POST', body:{} });
    showToast(`客户分析完成：${result.analysis.score} 分（规则演示引擎）`);
    await loadData();
    if ($('#detailModal').classList.contains('open')) await openLeadDetail(id);
  } catch (error) { showToast(error.message, 'error'); }
}

async function openLeadDetail(id) {
  try {
    const payload = await api(`/api/leads/${encodeURIComponent(id)}`);
    const lead = payload.lead;
    state.selectedLead = lead;
    $('#detailTitle').textContent = lead.companyName || lead.contactName || '客户详情';
    $('#detailSubtitle').textContent = `${marketLabels[lead.marketType]} · ${statusLabels[lead.status] || lead.status}`;
    const fields = [
      ['联系人',lead.contactName],['邮箱',lead.email],['电话',lead.phone],['地区 / 国家',lead.region],['来源',lead.source],
      ['意向产品',lead.productInterest],['预算',lead.budget],['时间线',lead.timeline],['负责人',lead.owner],['联系权限',permissionLabels[lead.contactPermission]]
    ];
    const activities = payload.activities || [];
    $('#detailContent').innerHTML = `<div class="detail-layout">
      <div class="detail-card"><h3>客户资料</h3><div class="detail-kv">${fields.map(([k,v])=>`<span>${esc(k)}</span><span>${esc(v || '—')}</span>`).join('')}<span>客户需求</span><span>${esc(lead.requirement || '—')}</span></div></div>
      <div><div class="analysis-box"><div class="eyebrow">LEAD SCORE · RULE-BASED DEMO</div><div class="analysis-score">${Number(lead.score || 0)} / 100</div><p>${esc(lead.scoreReason || '尚未运行分析。')}<br/>${lead.contactPermission === 'OPTED_OUT' ? '该客户已拒绝联系，禁止发起营销触达。' : '评分仅为演示规则结果，不代表真实成交概率。'}</p><button class="button button-secondary" id="detailAnalyzeButton">重新分析</button> <button class="button button-primary" id="detailTaskButton">创建跟进任务</button></div>
      <div class="detail-card" style="margin-top:12px"><h3>互动记录</h3><div class="detail-activity">${activities.length ? activities.map(a=>`<div class="activity-item"><strong>${esc(a.type)}</strong><p>${esc(a.content)}</p><small>${formatDateTime(a.createdAt)}</small></div>`).join('') : '<div class="empty-state">暂无互动记录</div>'}</div><form id="activityForm" style="margin-top:10px"><label class="field"><span>新增备注</span><textarea name="content" rows="2" placeholder="记录本次沟通结果"></textarea></label><button class="mini-button" type="submit">保存备注</button></form></div></div>
    </div>`;
    $('#detailAnalyzeButton').addEventListener('click', () => analyzeLead(id));
    $('#detailTaskButton').addEventListener('click', () => { closeModal('detailModal'); openTaskModal(id); });
    $('#activityForm').addEventListener('submit', async (event) => {
      event.preventDefault(); const content = new FormData(event.currentTarget).get('content').trim(); if (!content) return;
      try { await api(`/api/leads/${encodeURIComponent(id)}/activities`, { method:'POST', body:{ type:'NOTE', content } }); showToast('备注已保存'); await openLeadDetail(id); }
      catch (error) { showToast(error.message, 'error'); }
    });
    openModal('detailModal');
  } catch (error) { showToast(error.message, 'error'); }
}

function openLeadModal() {
  $('#leadForm').reset();
  $('#formMarket').value = state.market === 'ALL' ? 'LOCAL' : state.market;
  updateMarketFormLabels();
  openModal('leadModal');
}
function updateMarketFormLabels() {
  const exportMode = $('#formMarket').value === 'EXPORT';
  $('#regionLabel').textContent = exportMode ? '国家 / 地区' : '城市 / 区域';
  $('input[name="region"]').placeholder = exportMode ? '例如：德国、波兰' : '例如：郑州、开封';
  $('input[name="source"]').placeholder = exportMode ? '例如：企业官网、商业数据供应商、展会' : '例如：官网表单、二维码、人工录入';
}

async function saveLead(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.companyName.trim() && !data.contactName.trim()) { showToast('企业名称和联系人姓名至少填写一项', 'error'); return; }
  const button = $('#saveLeadButton'); button.disabled = true; button.textContent = '保存中…';
  try {
    await api('/api/leads', { method:'POST', body:data });
    closeModal('leadModal'); showToast('线索已创建'); await loadData(); switchPage('leads');
  } catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = '保存线索'; }
}

function populateTaskLeadSelect() {
  const select = $('#taskLeadSelect');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">暂不关联</option>' + state.leads.map(lead => `<option value="${esc(lead.id)}">${esc(lead.companyName || lead.contactName || '未命名客户')} · ${marketLabels[lead.marketType]}</option>`).join('');
  if (current && state.leads.some(l => l.id === current)) select.value = current;
}
function openTaskModal(leadId = '') {
  $('#taskForm').reset(); populateTaskLeadSelect();
  $('#taskLeadSelect').value = leadId;
  const due = new Date(Date.now() + 24 * 3600 * 1000);
  due.setMinutes(due.getMinutes() - due.getTimezoneOffset());
  $('input[name="dueAt"]').value = due.toISOString().slice(0,16);
  openModal('taskModal');
}
async function saveTask(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!values.title.trim()) return;
  const payload = { ...values, dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : new Date().toISOString() };
  try { await api('/api/tasks', { method:'POST', body:payload }); closeModal('taskModal'); showToast('跟进任务已创建'); await loadData(); switchPage('tasks'); }
  catch (error) { showToast(error.message, 'error'); }
}

async function importCsvFile(file) {
  if (!file) return;
  try {
    const csv = await file.text();
    const result = await api('/api/leads/import/csv', { method:'POST', body:{ csv, marketType: state.market === 'ALL' ? 'LOCAL' : state.market } });
    showToast(`导入完成：新增 ${result.imported} 条，重复 ${result.duplicates} 条，无效 ${result.invalid} 条`);
    if (result.errors?.length) console.warn('CSV import validation errors:', result.errors);
    await loadData(); switchPage('leads');
  } catch (error) { showToast(error.message, 'error'); }
  finally { $('#csvFile').value = ''; }
}

function setMarket(market) {
  state.market = market;
  $('#globalMarket').value = market;
  if ($('#leadMarketFilter')) $('#leadMarketFilter').value = 'ALL';
  renderOverview(); renderLeads(); renderTasks();
}

function bindEvents() {
  $$('.nav-item').forEach(button => button.addEventListener('click', () => switchPage(button.dataset.page)));
  $$('[data-goto]').forEach(button => button.addEventListener('click', () => switchPage(button.dataset.goto)));
  $$('[data-open-lead]').forEach(button => button.addEventListener('click', openLeadModal));
  $$('[data-market]').forEach(button => button.addEventListener('click', () => { setMarket(button.dataset.market); switchPage('leads'); }));
  $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop.id); }));
  $('#globalMarket').addEventListener('change', event => setMarket(event.target.value));
  $('#refreshButton').addEventListener('click', loadData);
  $('#leadSearch').addEventListener('input', renderLeads);
  $('#statusFilter').addEventListener('change', renderLeads);
  $('#leadMarketFilter').addEventListener('change', renderLeads);
  $('#taskStatusFilter').addEventListener('change', renderTasks);
  $('#leadForm').addEventListener('submit', saveLead);
  $('#formMarket').addEventListener('change', updateMarketFormLabels);
  $('#taskForm').addEventListener('submit', saveTask);
  $('#newTaskButton').addEventListener('click', () => openTaskModal());
  $('#importButton').addEventListener('click', () => $('#csvFile').click());
  $('#leadsImportButton').addEventListener('click', () => $('#csvFile').click());
  $('#csvFile').addEventListener('change', event => importCsvFile(event.target.files?.[0]));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal-backdrop.open').forEach(el => closeModal(el.id)); });
}

bindEvents();
loadData();
