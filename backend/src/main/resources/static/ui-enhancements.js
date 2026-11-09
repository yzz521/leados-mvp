(() => {
  const funnel = document.getElementById('funnelList');
  const total = document.getElementById('funnelTotal');
  const metric = document.getElementById('metricTotal');
  const updateFunnelTotal = () => {
    if (!funnel || !total) return;
    const values = [...funnel.querySelectorAll('.funnel-value')]
      .map(node => Number.parseInt(node.textContent, 10))
      .filter(Number.isFinite);
    total.textContent = metric?.textContent && metric.textContent !== '—'
      ? metric.textContent
      : values.reduce((sum, value) => sum + value, 0);
  };
  if (funnel && total) {
    const observer = new MutationObserver(updateFunnelTotal);
    observer.observe(funnel, { childList: true, subtree: true, characterData: true });
    if (metric) observer.observe(metric, { childList: true, subtree: true, characterData: true });
    requestAnimationFrame(updateFunnelTotal);
  }
  const marketButtons = [...document.querySelectorAll('[data-market]')];
  const select = document.getElementById('globalMarket');
  const syncMarket = value => marketButtons.forEach(button => button.classList.toggle('selected', button.dataset.market === value));
  marketButtons.forEach(button => button.addEventListener('click', () => syncMarket(button.dataset.market)));
  select?.addEventListener('change', () => syncMarket(select.value));
  syncMarket(select?.value || 'ALL');
})();
