(() => {
  'use strict';

  const SESSION_KEY = 'leados.ai-workbench.sessions.v2';
  const model = {
    leads: [],
    selectedLeadId: null,
    sessions: {},
    messagesByLead: {},
    actionsByLead: {},
    status: null,
    lastReply: '',
    busy: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const labels = { NEW: '新线索', QUALIFIED: '已筛选', CONTACTED: '跟进中', OPPORTUNITY: '商机', WON: '已成交', LOST: '已丢单' };
  const marketNames = { LOCAL: '本地获客', EXPORT: '外贸开发' };
  const permissionNames = { UNCONFIRMED: '未确认', AUTHORIZED: '已授权', OPTED_OUT: '已拒绝联系', NOT_APPLICABLE: '不适用' };
  const kindNames = { PRODUCT: '产品资料', STRATEGY: '销售策略', FAQ: '常见问题', POLICY: '服务政策' };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const selectedLead = () => model.leads.find(item => item.id === model.selectedLeadId) || null;
  const titleOf = lead => lead?.companyName || lead?.contactName || '未命名客户';
  const scoreLevel = score => Number(score || 0) >= 75 ? 'high' : Number(score || 0) >= 45 ? 'medium' : 'low';
  const field = (name, value) => '<div class="assistant-profile-field"><span>' + esc(name) + '</span><strong>' + esc(value || '待补充') + '</strong></div>';

  function notify(message, type) {
    const region = $('#toastRegion');
    if (!region) return;
    const node = document.createElement('div');
    node.className = 'toast ' + (type === 'error' ? 'error' : '');
    node.textContent = message;
    region.append(node);
    setTimeout(() => node.remove(), 3400);
  }

  async function api(path, options) {
    const config = Object.assign({}, options || {});
    config.headers = Object.assign({}, config.headers || {});
    if (config.body && typeof config.body !== 'string') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }
    const response = await fetch(path, config);
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = data?.error?.message || ('请求失败 (' + response.status + ')');
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function readSessions() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      model.sessions = raw ? JSON.parse(raw) : {};
    } catch {
      model.sessions = {};
    }
  }

  function saveSessions() {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(model.sessions)); }
    catch { notify('浏览器无法保存会话索引；本次服务端会话仍可使用。', 'error'); }
  }

  function currentMessages() {
    if (!model.selectedLeadId) return [];
    if (!Array.isArray(model.messagesByLead[model.selectedLeadId])) model.messagesByLead[model.selectedLeadId] = [];
    return model.messagesByLead[model.selectedLeadId];
  }

  function currentActions() {
    if (!model.selectedLeadId) return [];
    if (!Array.isArray(model.actionsByLead[model.selectedLeadId])) model.actionsByLead[model.selectedLeadId] = [];
    return model.actionsByLead[model.selectedLeadId];
  }

  async function renderAssistant() {
    const list = $('#assistantLeadList');
    if (!list) return;
    readSessions();
    list.innerHTML = '<div class="empty-state">正在加载客户...</div>';
    try {
      const results = await Promise.all([api('/api/leads'), api('/api/ai/status')]);
      model.leads = results[0].items || [];
      model.status = results[1];
      updateEngineBadge();
      if (!model.selectedLeadId || !model.leads.some(item => item.id === model.selectedLeadId)) {
        const preferred = $('#globalMarket')?.value;
        model.selectedLeadId = (preferred && preferred !== 'ALL'
          ? model.leads.find(item => item.marketType === preferred)?.id
          : null) || model.leads[0]?.id || null;
      }
      renderLeadList();
      renderSelectedLead();
      if (model.selectedLeadId) await loadConversation(model.selectedLeadId);
    } catch (error) {
      list.innerHTML = '<div class="empty-state">' + esc(error.message) + '</div>';
      notify(error.message, 'error');
    }
  }

  function updateEngineBadge() {
    const badge = $('#assistantEngineBadge');
    if (!badge) return;
    const enabled = Boolean(model.status?.enabled);
    const modelName = model.status?.model || '';
    badge.innerHTML = '<i></i>' + (enabled ? '模型已连接 · ' + esc(modelName) : '规则演示模式');
    badge.classList.toggle('is-live', enabled);
    const disclaimer = $('.assistant-disclaimer');
    if (disclaimer) {
      disclaimer.textContent = enabled
        ? '当前由服务端模型网关生成建议；客户资料和知识资料会作为上下文。模型输出需人工核验，内部工具操作须逐项确认，不具备对外发送能力。'
        : '当前未配置真实模型，使用规则演示回复。配置服务端模型环境变量后可启用真实模型；不会自动发送邮件、短信或社交消息。';
    }
  }

  function renderLeadList() {
    const list = $('#assistantLeadList');
    const keyword = ($('#assistantLeadSearch')?.value || '').trim().toLowerCase();
    const market = $('#assistantMarketFilter')?.value || 'ALL';
    const items = model.leads.filter(lead => {
      if (market !== 'ALL' && lead.marketType !== market) return false;
      if (!keyword) return true;
      return [lead.companyName, lead.contactName, lead.email, lead.region, lead.productInterest, lead.requirement]
        .join(' ').toLowerCase().includes(keyword);
    }).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

    $('#assistantLeadCount').textContent = String(items.length);
    list.innerHTML = items.length ? items.map(lead => {
      const active = lead.id === model.selectedLeadId;
      const name = titleOf(lead);
      const score = Number(lead.score || 0);
      return '<button type="button" class="assistant-lead-item ' + (active ? 'active' : '') + '" data-assistant-lead="' + esc(lead.id) + '">' +
        '<span class="assistant-lead-avatar ' + (lead.marketType === 'EXPORT' ? 'export' : '') + '">' + esc([...name][0] || '客') + '</span>' +
        '<span class="assistant-lead-main"><strong>' + esc(name) + '</strong><small>' + esc(lead.productInterest || lead.region || '待补充客户需求') + '</small>' +
        '<span class="assistant-lead-tags"><i class="' + (lead.marketType === 'EXPORT' ? 'export' : 'local') + '">' + (marketNames[lead.marketType] || '业务线') + '</i><i>' + (labels[lead.status] || esc(lead.status)) + '</i></span></span>' +
        '<span class="assistant-lead-score ' + scoreLevel(score) + '">' + score + '</span></button>';
    }).join('') : '<div class="empty-state">没有找到匹配的客户</div>';

    $$('[data-assistant-lead]').forEach(button => button.addEventListener('click', async () => {
      const nextId = button.dataset.assistantLead;
      if (nextId === model.selectedLeadId) return;
      model.selectedLeadId = nextId;
      model.lastReply = '';
      renderLeadList();
      renderSelectedLead();
      await loadConversation(nextId);
    }));
  }

  async function loadConversation(leadId) {
    const conversationId = model.sessions[leadId];
    if (!conversationId) {
      model.messagesByLead[leadId] = [];
      model.actionsByLead[leadId] = [];
      if (leadId === model.selectedLeadId) {
        model.lastReply = '';
        renderMessages();
        renderPendingActions();
        $('#assistantSaveNoteButton').disabled = true;
      }
      return;
    }
    try {
      const result = await api('/api/ai/conversations/' + encodeURIComponent(conversationId));
      model.messagesByLead[leadId] = result.messages || [];
      model.actionsByLead[leadId] = result.pendingActions || [];
      if (leadId === model.selectedLeadId) {
        const last = currentMessages().slice().reverse().find(item => item.role === 'assistant');
        model.lastReply = last?.content || '';
        renderMessages();
        renderPendingActions();
        $('#assistantSaveNoteButton').disabled = !model.lastReply;
      }
    } catch (error) {
      if (error.status === 404) {
        delete model.sessions[leadId];
        saveSessions();
        model.messagesByLead[leadId] = [];
        model.actionsByLead[leadId] = [];
        if (leadId === model.selectedLeadId) renderMessages();
      } else {
        notify(error.message, 'error');
      }
    }
  }

  function renderSelectedLead() {
    const lead = selectedLead();
    if (!lead) {
      $('#assistantCustomerName').textContent = '暂无客户';
      $('#assistantCustomerMeta').textContent = '先在线索中心新增或导入一条线索';
      $('#assistantCustomerAvatar').textContent = '—';
      $('#assistantContextStrip').textContent = '暂无可分析的客户。';
      $('#assistantMessages').innerHTML = '<div class="assistant-welcome"><span class="assistant-welcome-icon">✦</span><h2>先添加一位潜在客户</h2><p>有了客户信息后，才能生成有上下文的销售建议。</p></div>';
      $('#assistantProfileContent').innerHTML = '<div class="assistant-profile-empty">暂无客户资料。</div>';
      $('#assistantNextAction').textContent = '先导入线索或创建客户。';
      $('#assistantCreateTaskButton').disabled = true;
      $('#assistantSaveNoteButton').disabled = true;
      $('#assistantAnalyzeButton').disabled = true;
      $('#assistantPermissionText').textContent = '暂无客户信息。';
      $('#assistantInput').disabled = true;
      $('#assistantSendButton').disabled = true;
      return;
    }
    $('#assistantInput').disabled = false;
    $('#assistantSendButton').disabled = false;
    $('#assistantCustomerName').textContent = titleOf(lead);
    $('#assistantCustomerMeta').textContent = (marketNames[lead.marketType] || '') + ' · ' + (labels[lead.status] || lead.status) + ' · ' + (lead.owner || '未分配负责人');
    $('#assistantCustomerAvatar').textContent = [...titleOf(lead)][0] || '客';
    $('#assistantContextStrip').innerHTML = '<span>当前上下文</span><strong>' + esc(lead.productInterest || '产品待补充') + '</strong><i>·</i>' + esc(lead.region || '地区待补充') + '<i>·</i>' + esc(lead.contactPermission === 'AUTHORIZED' ? '已记录授权' : '联系权限需核验');
    renderProfile(lead);
    renderMessages();
    renderPendingActions();
    $('#assistantCreateTaskButton').disabled = false;
    $('#assistantSaveNoteButton').disabled = !model.lastReply;
    $('#assistantAnalyzeButton').disabled = false;
  }

  function renderMessages() {
    const target = $('#assistantMessages');
    const items = currentMessages();
    if (!items.length) {
      const lead = selectedLead();
      target.innerHTML = '<div class="assistant-welcome"><span class="assistant-welcome-icon">✦</span><h2>你好，我已经了解当前客户档案。</h2><p>你可以要求我梳理需求、查看资料依据、制定销售计划或准备沟通草稿。</p><div class="assistant-welcome-facts"><span>' + esc(lead?.productInterest || '产品待确认') + '</span><span>' + esc(lead?.region || '地区待确认') + '</span><span>评分 ' + Number(lead?.score || 0) + ' / 100</span></div></div>';
      return;
    }
    target.innerHTML = items.map(item => {
      const user = item.role === 'user';
      const time = item.createdAt ? new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
      return '<article class="assistant-message ' + (user ? 'from-user' : 'from-assistant') + '">' +
        '<span class="assistant-message-avatar">' + (user ? '我' : '✦') + '</span><div class="assistant-message-body"><div class="assistant-message-meta"><strong>' + (user ? '你' : 'LeadOS 助手') + '</strong><small>' + esc(time) + '</small></div>' +
        '<div class="assistant-message-content">' + esc(item.content || '').replace(/\n/g, '<br>') + '</div></div></article>';
    }).join('');
    target.scrollTop = target.scrollHeight;
  }

  function renderPendingActions() {
    const target = $('#assistantPendingActions');
    if (!target) return;
    const actions = currentActions();
    if (!actions.length) {
      target.innerHTML = '';
      return;
    }
    target.innerHTML = '<div class="assistant-actions-heading">需要你确认的内部操作</div>' + actions.map(action => {
      const args = action.arguments || {};
      const detail = action.name === 'create_follow_up_task'
        ? '<strong>' + esc(args.title || '创建跟进任务') + '</strong><p>' + esc(args.description || '') + '</p><small>优先级：' + esc(args.priority || 'MEDIUM') + ' · 预计 ' + esc(args.dueInHours || 24) + ' 小时内完成</small>'
        : '<strong>保存客户备注</strong><p>' + esc(args.content || '') + '</p>';
      return '<div class="assistant-action-card"><div class="assistant-action-card-main"><span class="assistant-action-icon">✓</span><div>' + detail + '</div></div><div class="assistant-action-card-actions"><span>待确认</span><button type="button" class="button button-primary" data-confirm-action="' + esc(action.id) + '">确认执行</button></div></div>';
    }).join('');
    $$('[data-confirm-action]').forEach(button => button.addEventListener('click', () => executeAction(button.dataset.confirmAction)));
  }

  function renderProfile(lead) {
    const score = Math.max(0, Math.min(100, Number(lead.score || 0)));
    $('#assistantProfileContent').innerHTML = '<div class="assistant-profile-identity"><span class="assistant-profile-avatar">' + esc([...titleOf(lead)][0] || '客') + '</span><div><strong>' + esc(titleOf(lead)) + '</strong><small>' + esc(lead.contactName || lead.email || '联系人待补充') + '</small></div></div>' +
      '<div class="assistant-score-block"><div><span>当前意向评分</span><strong>' + score + '<small>/100</small></strong></div><div class="assistant-score-track"><i class="' + scoreLevel(score) + '" style="width:' + score + '%"></i></div><small>' + esc(lead.scoreReason || '尚未运行分析') + '</small></div>' +
      '<div class="assistant-profile-fields">' +
      field('业务类型', marketNames[lead.marketType]) +
      field(lead.marketType === 'EXPORT' ? '目标国家' : '所在区域', lead.region) +
      field('意向产品', lead.productInterest) + field('预算', lead.budget) +
      field('采购 / 决策时间', lead.timeline) + field('线索来源', lead.source) +
      field('联系人', lead.contactName) + field('邮箱', lead.email) +
      field('电话', lead.phone) + field('联系权限', permissionNames[lead.contactPermission]) + '</div>' +
      '<div class="assistant-profile-requirement"><span>客户需求</span><p>' + esc(lead.requirement || '尚未记录客户的具体需求。') + '</p></div>';
    $('#assistantNextAction').textContent = recommendNextAction(lead);
    $('#assistantPermissionText').textContent = lead.contactPermission === 'OPTED_OUT'
      ? '客户已明确拒绝联系。只允许进行内部资料整理、限制记录和必要的合规处理，不得联系客户。'
      : lead.contactPermission === 'AUTHORIZED'
        ? '已记录授权状态。实际联系仍需遵守授权范围、渠道规则和频率限制。'
        : '联系权限尚未确认。建议先核实线索来源及联系依据，不要直接发送营销内容。';
  }

  function recommendNextAction(lead) {
    if (lead.contactPermission === 'OPTED_OUT') return '该客户已拒绝联系。建议维护拒绝联系状态，不创建营销触达。';
    const missing = [];
    if (!lead.productInterest) missing.push('意向产品');
    if (!lead.requirement) missing.push('具体需求');
    if (!lead.budget) missing.push('预算范围');
    if (!lead.timeline) missing.push('决策时间');
    if (lead.contactPermission !== 'AUTHORIZED' && lead.contactPermission !== 'NOT_APPLICABLE') missing.push('联系授权');
    if (missing.length) return '优先补全：' + missing.slice(0, 3).join('、') + '。明确需求和联系依据后再安排对外沟通。';
    if (Number(lead.score || 0) >= 75) return '客户资料较完整且意向评分较高。建议确认决策人、关键异议和下一次沟通时间。';
    return '建议围绕客户的应用场景、关键痛点和采购时间补充问题，更新客户档案。';
  }

  async function sendPrompt(prompt) {
    const lead = selectedLead();
    if (!lead || model.busy) return;
    const message = String(prompt || '').trim();
    if (!message) return;
    model.busy = true;
    $('#assistantSendButton').disabled = true;
    $('#assistantInput').disabled = true;
    $('#assistantInput').value = '';
    const typing = document.createElement('div');
    typing.className = 'assistant-typing';
    typing.id = 'assistantTyping';
    typing.innerHTML = '<i></i><i></i><i></i><span>正在读取客户档案、历史互动和知识资料</span>';
    $('#assistantMessages').append(typing);
    $('#assistantMessages').scrollTop = $('#assistantMessages').scrollHeight;
    try {
      const conversationId = model.sessions[lead.id] || '';
      const result = await api('/api/ai/chat', { method: 'POST', body: {
        leadId: lead.id,
        message: message,
        conversationId: conversationId
      }});
      model.sessions[lead.id] = result.conversationId;
      saveSessions();
      model.messagesByLead[lead.id] = result.messages || [];
      model.actionsByLead[lead.id] = result.pendingActions || [];
      model.lastReply = result.message || '';
      model.status = Object.assign({}, model.status || {}, { engine: result.engine, model: result.model || model.status?.model });
      updateEngineBadge();
      renderMessages();
      renderPendingActions();
      $('#assistantSaveNoteButton').disabled = !model.lastReply;
    } catch (error) {
      $('#assistantTyping')?.remove();
      notify(error.message, 'error');
    } finally {
      $('#assistantTyping')?.remove();
      model.busy = false;
      $('#assistantSendButton').disabled = false;
      $('#assistantInput').disabled = false;
      $('#assistantInput').focus();
    }
  }

  async function executeAction(actionId) {
    const lead = selectedLead();
    if (!lead) return;
    const conversationId = model.sessions[lead.id];
    if (!conversationId) return;
    const action = currentActions().find(item => item.id === actionId);
    if (!action) return;
    const summary = action.name === 'create_follow_up_task'
      ? '创建内部跟进任务：' + (action.arguments?.title || '')
      : '保存一条客户备注';
    if (!window.confirm('确认执行以下操作？\n\n' + summary + '\n\n此操作不会联系客户。')) return;
    const button = $('[data-confirm-action="' + actionId + '"]');
    if (button) { button.disabled = true; button.textContent = '执行中...'; }
    try {
      const result = await api('/api/ai/actions/execute', { method: 'POST', body: {
        conversationId: conversationId,
        actionId: actionId,
        confirmed: true
      }});
      model.messagesByLead[lead.id] = result.messages || [];
      model.actionsByLead[lead.id] = result.pendingActions || [];
      model.lastReply = model.messagesByLead[lead.id].slice().reverse().find(item => item.role === 'assistant')?.content || '';
      renderMessages();
      renderPendingActions();
      notify(result.result?.summary || '内部操作已完成');
      window.dispatchEvent(new Event('leados:data-changed'));
      $('#assistantSaveNoteButton').disabled = !model.lastReply;
    } catch (error) {
      notify(error.message, 'error');
      if (button) { button.disabled = false; button.textContent = '确认执行'; }
    }
  }

  async function createFollowUpTask() {
    const lead = selectedLead();
    if (!lead) return;
    const permission = lead.contactPermission || 'UNCONFIRMED';
    const next = recommendNextAction(lead);
    let title;
    let description;
    if (permission === 'OPTED_OUT') {
      title = '维护拒绝联系限制：' + titleOf(lead);
      description = '客户已拒绝联系。本任务仅用于维护内部抑制记录，不得联系客户。';
    } else if (permission !== 'AUTHORIZED' && permission !== 'NOT_APPLICABLE') {
      title = '核验联系权限后再跟进：' + titleOf(lead);
      description = '先核验线索来源和联系依据。在确认合法联系依据之前，不得联系客户。建议：' + next;
    } else {
      title = '跟进 ' + titleOf(lead) + '：' + (lead.productInterest || '确认需求');
      description = next;
    }
    try {
      await api('/api/tasks', { method: 'POST', body: {
        title: title,
        leadId: lead.id,
        priority: Number(lead.score || 0) >= 75 ? 'HIGH' : 'MEDIUM',
        status: 'OPEN',
        description: description,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }});
      notify('已创建内部跟进任务');
      window.dispatchEvent(new Event('leados:data-changed'));
    } catch (error) { notify(error.message, 'error'); }
  }

  async function saveReplyAsNote() {
    const lead = selectedLead();
    if (!lead || !model.lastReply) return;
    if (!window.confirm('确认将当前 AI 建议保存为客户内部备注？')) return;
    try {
      await api('/api/leads/' + encodeURIComponent(lead.id) + '/activities', { method: 'POST', body: {
        type: 'NOTE',
        content: 'AI 销售建议（待人工核验）：\n' + model.lastReply
      }});
      notify('建议已保存到客户互动记录');
      window.dispatchEvent(new Event('leados:data-changed'));
    } catch (error) { notify(error.message, 'error'); }
  }

  async function analyzeCurrentLead() {
    const lead = selectedLead();
    if (!lead) return;
    try {
      await api('/api/leads/' + encodeURIComponent(lead.id) + '/analyze', { method: 'POST', body: {} });
      const result = await api('/api/leads');
      model.leads = result.items || [];
      renderLeadList();
      renderSelectedLead();
      notify('客户评分已刷新（规则分析）');
      window.dispatchEvent(new Event('leados:data-changed'));
    } catch (error) { notify(error.message, 'error'); }
  }

  async function openKnowledgeModal() {
    const modal = $('#knowledgeModal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    await loadKnowledge();
  }

  function closeKnowledgeModal() {
    const modal = $('#knowledgeModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function loadKnowledge() {
    const list = $('#knowledgeList');
    list.innerHTML = '<div class="empty-state">正在加载资料...</div>';
    try {
      const result = await api('/api/ai/knowledge?marketType=ALL');
      const items = result.items || [];
      $('#knowledgeCount').textContent = items.length + ' 条';
      list.innerHTML = items.length ? items.map(item => '<article class="knowledge-item">' +
        '<div><div class="knowledge-meta"><span>' + (marketNames[item.marketType] || '全部业务') + '</span><i>' + (kindNames[item.kind] || item.kind) + '</i></div>' +
        '<strong>' + esc(item.title) + '</strong><p>' + esc(item.content) + '</p></div>' +
        '<button type="button" class="mini-button danger" data-delete-knowledge="' + esc(item.id) + '">删除</button></article>').join('') :
        '<div class="empty-state">还没有资料。可以先录入产品参数、服务范围、报价规则或销售策略。</div>';
      $$('[data-delete-knowledge]').forEach(button => button.addEventListener('click', () => deleteKnowledge(button.dataset.deleteKnowledge)));
    } catch (error) {
      list.innerHTML = '<div class="empty-state">' + esc(error.message) + '</div>';
    }
  }

  async function saveKnowledge(event) {
    event.preventDefault();
    const button = $('#saveKnowledgeButton');
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    button.disabled = true;
    button.textContent = '保存中...';
    try {
      await api('/api/ai/knowledge', { method: 'POST', body: data });
      $('#knowledgeTitle').value = '';
      $('#knowledgeContent').value = '';
      await loadKnowledge();
      notify('知识资料已保存');
    } catch (error) { notify(error.message, 'error'); }
    finally { button.disabled = false; button.textContent = '保存资料'; }
  }

  async function deleteKnowledge(id) {
    if (!window.confirm('确定删除这条知识资料？')) return;
    try {
      await api('/api/ai/knowledge/' + encodeURIComponent(id), { method: 'DELETE' });
      await loadKnowledge();
      notify('资料已删除');
    } catch (error) { notify(error.message, 'error'); }
  }

  function bind() {
    $('#assistantLeadSearch')?.addEventListener('input', renderLeadList);
    $('#assistantMarketFilter')?.addEventListener('change', renderLeadList);
    $('#assistantRefreshButton')?.addEventListener('click', renderAssistant);
    $('#assistantComposer')?.addEventListener('submit', event => {
      event.preventDefault();
      sendPrompt($('#assistantInput').value);
    });
    $('#assistantInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        $('#assistantComposer').requestSubmit();
      }
    });
    $$('[data-ai-prompt]').forEach(button => button.addEventListener('click', () => sendPrompt(button.dataset.aiPrompt)));
    $('#assistantCreateTaskButton')?.addEventListener('click', createFollowUpTask);
    $('#assistantSaveNoteButton')?.addEventListener('click', saveReplyAsNote);
    $('#assistantAnalyzeButton')?.addEventListener('click', analyzeCurrentLead);
    $('#assistantKnowledgeButton')?.addEventListener('click', openKnowledgeModal);
    $('#knowledgeForm')?.addEventListener('submit', saveKnowledge);
    $$('[data-close-modal="knowledgeModal"]').forEach(button => button.addEventListener('click', closeKnowledgeModal));
    $('#knowledgeModal')?.addEventListener('click', event => { if (event.target.id === 'knowledgeModal') closeKnowledgeModal(); });
  }

  bind();
  window.renderAssistant = renderAssistant;
  window.addEventListener('leados:data-changed', () => {
    if ($('#page-assistant')?.classList.contains('active')) renderAssistant();
  });
})();
