(() => {
  'use strict';
  const storageKey = 'leados.ai-workbench.conversations.v1';
  const model = { leads: [], selectedLeadId: null, conversations: {}, lastReply: '', loading: false };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const labels = { NEW: '新线索', QUALIFIED: '已筛选', CONTACTED: '跟进中', OPPORTUNITY: '商机', WON: '已成交', LOST: '已丢单' };
  const marketNames = { LOCAL: '本地获客', EXPORT: '外贸开发' };
  const permissionNames = { UNCONFIRMED: '未确认', AUTHORIZED: '已授权', OPTED_OUT: '已拒绝联系', NOT_APPLICABLE: '不适用' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const selectedLead = () => model.leads.find(item => item.id === model.selectedLeadId) || null;
  const titleOf = lead => lead?.companyName || lead?.contactName || '未命名客户';
  const field = (name, value) => '<div class="assistant-profile-field"><span>' + esc(name) + '</span><strong>' + esc(value || '待补充') + '</strong></div>';
  const scoreLevel = score => Number(score || 0) >= 75 ? 'high' : Number(score || 0) >= 45 ? 'medium' : 'low';
  const notify = (message, type = 'success') => {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else {
      const region = $('#toastRegion');
      if (!region) return;
      const node = document.createElement('div');
      node.className = 'toast ' + (type === 'error' ? 'error' : '');
      node.textContent = message;
      region.append(node);
      setTimeout(() => node.remove(), 3200);
    }
  };
  const api = async (path, options = {}) => {
    const config = { ...options, headers: { ...(options.headers || {}) } };
    if (config.body && typeof config.body !== 'string') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }
    const response = await fetch(path, config);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || '请求失败 (' + response.status + ')');
    return data;
  };
  const readConversations = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      model.conversations = raw ? JSON.parse(raw) : {};
    } catch { model.conversations = {}; }
  };
  const saveConversations = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(model.conversations)); }
    catch { notify('浏览器本地存储不可用，本轮对话无法持久保存。', 'error'); }
  };
  const conversation = () => {
    if (!model.selectedLeadId) return [];
    if (!Array.isArray(model.conversations[model.selectedLeadId])) model.conversations[model.selectedLeadId] = [];
    return model.conversations[model.selectedLeadId];
  };

  async function renderAssistant() {
    const list = $('#assistantLeadList');
    if (!list) return;
    readConversations();
    try {
      const result = await api('/api/leads');
      model.leads = result.items || [];
      if (!model.selectedLeadId || !model.leads.some(item => item.id === model.selectedLeadId)) {
        const requestedMarket = $('#globalMarket')?.value;
        model.selectedLeadId = (requestedMarket && requestedMarket !== 'ALL'
          ? model.leads.find(item => item.marketType === requestedMarket)?.id
          : null) || model.leads[0]?.id || null;
      }
      renderLeadList();
      renderSelectedLead();
    } catch (error) {
      list.innerHTML = '<div class="empty-state">' + esc(error.message) + '</div>';
      notify(error.message, 'error');
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
    $$('[data-assistant-lead]').forEach(button => button.addEventListener('click', () => {
      model.selectedLeadId = button.dataset.assistantLead;
      model.lastReply = '';
      renderLeadList();
      renderSelectedLead();
    }));
  }

  function renderSelectedLead() {
    const lead = selectedLead();
    const messages = $('#assistantMessages');
    if (!lead) {
      $('#assistantCustomerName').textContent = '暂无客户';
      $('#assistantCustomerMeta').textContent = '先在线索中心新增或导入一条线索';
      $('#assistantCustomerAvatar').textContent = '—';
      $('#assistantContextStrip').textContent = '暂无可分析的客户。';
      messages.innerHTML = '<div class="assistant-welcome"><span class="assistant-welcome-icon">✦</span><h2>先添加一位潜在客户</h2><p>有了客户信息后，才能生成有上下文的销售建议。</p></div>';
      $('#assistantProfileContent').innerHTML = '<div class="assistant-profile-empty">暂无客户资料。</div>';
      $('#assistantNextAction').textContent = '先导入线索或创建客户。';
      $('#assistantCreateTaskButton').disabled = true;
      $('#assistantSaveNoteButton').disabled = true;
      $('#assistantAnalyzeButton').disabled = true;
      $('#assistantPermissionText').textContent = '暂无客户信息。';
      return;
    }
    const lastAssistant = conversation().slice().reverse().find(item => item.role === 'assistant');
    model.lastReply = lastAssistant?.content || '';
    $('#assistantCustomerName').textContent = titleOf(lead);
    $('#assistantCustomerMeta').textContent = (marketNames[lead.marketType] || '') + ' · ' + (labels[lead.status] || lead.status) + ' · ' + (lead.owner || '未分配负责人');
    $('#assistantCustomerAvatar').textContent = [...titleOf(lead)][0] || '客';
    $('#assistantContextStrip').innerHTML = '<span>当前上下文</span><strong>' + esc(lead.productInterest || '产品待补充') + '</strong><i>·</i>' + esc(lead.region || '地区待补充') + '<i>·</i>' + esc(lead.contactPermission === 'AUTHORIZED' ? '可按授权范围联系' : '联系权限需核验');
    renderMessages();
    renderProfile(lead);
    $('#assistantCreateTaskButton').disabled = false;
    $('#assistantSaveNoteButton').disabled = !model.lastReply;
    $('#assistantAnalyzeButton').disabled = false;
  }

  function renderMessages() {
    const target = $('#assistantMessages');
    const items = conversation();
    if (!items.length) {
      const lead = selectedLead();
      target.innerHTML = '<div class="assistant-welcome"><span class="assistant-welcome-icon">✦</span><h2>你好，我已经了解当前客户档案。</h2><p>你可以从下方的快捷任务开始，也可以直接描述你希望完成的销售工作。演示版仅使用已录入的信息。</p><div class="assistant-welcome-facts"><span>' + esc(lead?.productInterest || '产品待确认') + '</span><span>' + esc(lead?.region || '地区待确认') + '</span><span>评分 ' + Number(lead?.score || 0) + ' / 100</span></div></div>';
      return;
    }
    target.innerHTML = items.map(item => '<article class="assistant-message ' + (item.role === 'user' ? 'from-user' : 'from-assistant') + '">' +
      '<span class="assistant-message-avatar">' + (item.role === 'user' ? '我' : '✦') + '</span><div class="assistant-message-body"><div class="assistant-message-meta"><strong>' + (item.role === 'user' ? '你' : 'LeadOS 助手') + '</strong><small>' + esc(item.time || '') + (item.role === 'assistant' ? ' · 规则演示' : '') + '</small></div>' +
      '<div class="assistant-message-content">' + esc(item.content).replace(/\n/g, '<br>') + '</div></div></article>').join('');
    target.scrollTop = target.scrollHeight;
  }

  function recommendNextAction(lead) {
    if (lead.contactPermission === 'OPTED_OUT') return { description: '该客户已拒绝联系。建议核对并维护拒绝联系记录，不创建营销触达。' };
    const missing = [];
    if (!lead.productInterest) missing.push('意向产品');
    if (!lead.requirement) missing.push('具体需求');
    if (!lead.budget) missing.push('预算范围');
    if (!lead.timeline) missing.push('决策时间');
    if (lead.contactPermission !== 'AUTHORIZED') missing.push('联系授权');
    if (missing.length) return { description: '优先补全：' + missing.slice(0, 3).join('、') + '。明确需求和联系依据后再安排对外沟通。' };
    if (Number(lead.score || 0) >= 75) return { description: '客户资料较完整且意向评分较高。建议确认决策人、关键异议和下一次沟通时间。' };
    return { description: '建议围绕客户的应用场景、关键痛点和采购时间补充问题，更新客户档案。' };
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
      field('联系人', lead.contactName) + field('邮箱', lead.email) + field('电话', lead.phone) + field('联系权限', permissionNames[lead.contactPermission]) + '</div>' +
      '<div class="assistant-profile-requirement"><span>客户需求</span><p>' + esc(lead.requirement || '尚未记录客户的具体需求。') + '</p></div>';
    $('#assistantNextAction').textContent = recommendNextAction(lead).description;
    $('#assistantPermissionText').textContent = lead.contactPermission === 'OPTED_OUT'
      ? '客户已明确拒绝联系。只允许进行内部资料整理、限制记录和必要的合规处理，不得创建营销触达任务。'
      : lead.contactPermission === 'AUTHORIZED'
        ? '已记录授权状态。实际联系仍需遵守授权范围、渠道规则和频率限制。'
        : '联系权限尚未确认。建议先核实线索来源及联系依据，不要直接发送营销内容。';
  }

  function buildReply(prompt, lead) {
    const text = String(prompt || '').toLowerCase();
    const isExport = lead.marketType === 'EXPORT';
    const facts = [
      '客户：' + titleOf(lead),
      '业务线：' + marketNames[lead.marketType],
      '产品：' + (lead.productInterest || '未提供'),
      (isExport ? '国家 / 地区：' : '所在区域：') + (lead.region || '未提供'),
      '预算：' + (lead.budget || '未确认'),
      '时间：' + (lead.timeline || '未确认'),
      '当前阶段：' + (labels[lead.status] || lead.status),
      '联系权限：' + (permissionNames[lead.contactPermission] || '未确认')
    ];
    const unknown = [];
    if (!lead.requirement) unknown.push('具体使用场景 / 采购目的');
    if (!lead.budget) unknown.push('预算范围');
    if (!lead.timeline) unknown.push('决策或采购时间');
    if (!lead.contactName) unknown.push('真实联系人及决策角色');
    if (lead.contactPermission !== 'AUTHORIZED' && lead.contactPermission !== 'NOT_APPLICABLE') unknown.push('联系授权或其他适用的合法联系依据');
    if (/(总结|画像|分析|梳理)/.test(text)) {
      return '【客户信息摘要】\n' + facts.join('\n') + '\n\n【需求判断】\n' + (lead.requirement || '当前档案没有记录足够的具体需求，暂时不能判断客户真实采购动机。') +
        '\n\n【待确认信息】\n' + (unknown.length ? unknown.map(item => '• ' + item).join('\n') : '关键字段相对完整，建议进一步确认决策人和采购流程。') +
        '\n\n【判断边界】\n以上只根据当前档案字段整理，不代表已核实企业背景或真实采购意向。';
    }
    if (/(话术|沟通|开发信|邮件|微信|文案|回复)/.test(text)) {
      if (lead.contactPermission === 'OPTED_OUT') return '该客户已标记为“拒绝联系”。我不会为其生成营销触达话术。\n\n建议动作：维护拒绝联系记录；如客户主动重新发起沟通，再按新的授权和渠道规则处理。';
      if (lead.contactPermission !== 'AUTHORIZED' && lead.contactPermission !== 'NOT_APPLICABLE') {
        const draft = isExport
          ? 'Subject: Product information request\n\nHello,\n\nThank you for your interest in our products. To make sure we share relevant information, could you help clarify your application scenario, expected specifications and purchasing timeline?\n\nBest regards'
          : '您好，感谢您关注我们的产品。为了给您整理更贴合实际需求的方案，我想先确认一下具体使用场景、关注的产品规格，以及预计安排时间。我们会根据您提供的信息准备相关资料。';
        return '当前联系权限为“' + (permissionNames[lead.contactPermission] || '未确认') + '”。建议先核验线索来源、接收方授权或适用的其他合法联系依据，再使用任何对外话术。\n\n【内部准备稿，仅供审核】\n' + draft + '\n\n请先完成联系权限核验，不要直接发送。';
      }
      return isExport
        ? '【英文开发邮件草稿 · 待人工审核】\nSubject: Exploring your requirements for ' + (lead.productInterest || 'our products') + '\n\nHello ' + (lead.contactName || 'there') + ',\n\nI noticed that ' + titleOf(lead) + ' is associated with ' + (lead.productInterest || 'industrial products') + '. I would like to understand whether you are currently reviewing suppliers or product options in this category.\n\nWould you be open to sharing your key specifications, target market and expected purchasing timeline? I can then prepare relevant product information for your review.\n\nBest regards,\n[Your name]\n\n【审核提示】发送前核验企业和联系人信息、邮件营销适用规则及退订要求。'
        : '【中文跟进话术草稿 · 待人工审核】\n您好' + (lead.contactName ? '，' + lead.contactName : '') + '，之前了解到您关注' + (lead.productInterest || '我们的产品') + '。为了更准确地提供方案，想再确认一下您目前最关注的是产品效果、预算还是交付时间？如果方便，也可以告诉我您预计的安排时间，我好提前准备对应资料。\n\n【审核提示】请结合真实沟通上下文调整内容，并确认联系权限和渠道规则后再使用。';
    }
    if (/(下一步|计划|跟进|行动|策略)/.test(text)) {
      return '【建议跟进计划】\n1. ' + recommendNextAction(lead).description +
        '\n2. 根据客户回答补充档案：' + (unknown.slice(0, 3).join('、') || '决策人、关键异议、采购流程') +
        '\n3. 设置下一次跟进时间，并记录客户反馈和阶段变化。\n\n【当前客户摘要】\n' + facts.slice(0, 6).join('\n') +
        '\n\n【执行提醒】' + (lead.contactPermission === 'OPTED_OUT' ? '该客户已拒绝联系，不得安排营销触达。' : lead.contactPermission === 'AUTHORIZED' ? '对外沟通需在授权范围内执行。' : '先核实联系权限，不要直接发送营销消息。');
    }
    return '我已基于当前客户档案整理了一个初步方向。\n\n' + recommendNextAction(lead).description +
      '\n\n你可以继续让我：\n• 总结客户需求和信息缺口\n• 制定下一步跟进计划\n• 准备一份经人工审核的沟通草稿\n\n说明：当前是规则演示引擎，回复仅使用已录入字段，不会联网核查客户，也不会自动发送消息。';
  }

  function pushMessage(role, content) {
    const item = { role: role, content: content, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) };
    conversation().push(item);
    if (role === 'assistant') model.lastReply = content;
    saveConversations();
    renderMessages();
    $('#assistantSaveNoteButton').disabled = !model.lastReply;
  }

  async function sendPrompt(prompt) {
    const lead = selectedLead();
    if (!lead || model.loading) return;
    const text = String(prompt || '').trim();
    if (!text) return;
    model.loading = true;
    $('#assistantSendButton').disabled = true;
    $('#assistantInput').value = '';
    pushMessage('user', text);
    const typingId = 'typing-' + Date.now();
    const typing = document.createElement('div');
    typing.className = 'assistant-typing';
    typing.id = typingId;
    typing.innerHTML = '<i></i><i></i><i></i><span>正在整理客户上下文</span>';
    $('#assistantMessages').append(typing);
    $('#assistantMessages').scrollTop = $('#assistantMessages').scrollHeight;
    await new Promise(resolve => setTimeout(resolve, 280));
    const reply = buildReply(text, lead);
    document.getElementById(typingId)?.remove();
    pushMessage('assistant', reply);
    model.loading = false;
    $('#assistantSendButton').disabled = false;
  }

  async function createFollowUpTask() {
    const lead = selectedLead();
    if (!lead) return;
    const next = recommendNextAction(lead);
    const optedOut = lead.contactPermission === 'OPTED_OUT';
    const authorized = lead.contactPermission === 'AUTHORIZED' || lead.contactPermission === 'NOT_APPLICABLE';
    const taskTitle = optedOut ? '维护 ' + titleOf(lead) + ' 的拒绝联系记录'
      : !authorized ? '核验 ' + titleOf(lead) + ' 的联系权限'
      : '跟进 ' + titleOf(lead) + '：' + (lead.productInterest || '确认需求');
    try {
      await api('/api/tasks', { method: 'POST', body: {
        title: taskTitle, leadId: lead.id, priority: Number(lead.score || 0) >= 75 ? 'HIGH' : 'MEDIUM',
        status: 'OPEN', description: next.description,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }});
      notify('已创建跟进任务');
      window.dispatchEvent(new Event('leados:data-changed'));
    } catch (error) { notify(error.message, 'error'); }
  }

  async function saveReplyAsNote() {
    const lead = selectedLead();
    if (!lead || !model.lastReply) return;
    try {
      await api('/api/leads/' + encodeURIComponent(lead.id) + '/activities', { method: 'POST', body: {
        type: 'NOTE', content: 'AI 销售建议（规则演示，待人工审核）：\n' + model.lastReply
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
      window.dispatchEvent(new Event('leados:data-changed'));
      notify('客户评分已刷新（规则演示引擎）');
    } catch (error) { notify(error.message, 'error'); }
  }

  function bind() {
    const refreshLeadSelection = () => { renderLeadList(); renderSelectedLead(); };
    $('#assistantLeadSearch')?.addEventListener('input', refreshLeadSelection);
    $('#assistantMarketFilter')?.addEventListener('change', refreshLeadSelection);
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
  }

  bind();
  window.renderAssistant = renderAssistant;
})();