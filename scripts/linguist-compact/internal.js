/* Runs only in extension UI pages; the original engine and content scripts stay intact. */
'use strict';
(() => {
  const entries = Object.fromEntries(Object.entries(globalThis.facetInternalMessages).map(([key,value]) => [key.toLowerCase(), value]));
  globalThis.facetInternalLocale = {
    getUILanguage: () => 'zh-CN',
    getMessage(key, substitutions = []) {
      const entry = entries[String(key).toLowerCase()];
      if (!entry) return '';
      const values = Array.isArray(substitutions) ? substitutions : [substitutions];
      const placeholders = Object.fromEntries(Object.entries(entry.placeholders || {}).map(([name,value]) => [name.toLowerCase(),value.content]));
      return entry.message.replace(/\$([a-z_]+)\$/gi, (_,name) => placeholders[name.toLowerCase()] || '').replace(/\$(\d+)/g, (_,index) => String(values[Number(index)-1] ?? '')).replace(/\$\$/g, '$');
    }
  };
  document.documentElement.lang = 'zh-CN';
  document.title = location.pathname.includes('/popup/') ? '翻译' : document.title;
  document.addEventListener('DOMContentLoaded', () => {
    const links = [
      ['返回翻译','/pages/popup/popup.html','home'],
      ['文本翻译','/pages/popup/original.html','text'],
      ['设置','/pages/options/options.html','options'],
      ['历史','/pages/history/history.html','history'],
      ['词典','/pages/dictionary/dictionary.html','dictionary']
    ];
    const nav = document.createElement('nav');
    nav.className = 'FacetInternalNav'; nav.setAttribute('aria-label','翻译工具导航');
    for (const [label,url,id] of links) {
      const a = document.createElement('a'); a.textContent = label; a.href = url; a.id = 'facet-nav-'+id;
      if (location.pathname === url && id !== 'text') a.setAttribute('aria-current','page');
      if (id === 'text') a.hash = 'text';
      nav.append(a);
    }
    document.body.prepend(nav);
    // Keep the current instance context in Electron and Chrome instead of opening a new browser tab.
    document.addEventListener('click', event => {
      const a = event.target.closest?.('a[href]');
      if (!a || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && /^\/pages\/(popup|options|history|dictionary)\//.test(url.pathname)) {
        event.preventDefault(); location.href = url.href;
      }
    }, true);
    if (location.hash === '#text') {
      const observer = new MutationObserver(() => {
        const tab = [...document.querySelectorAll('.TabsMenu-Tab')].find(x => x.textContent.includes('文本翻译'));
        if (tab) { observer.disconnect(); tab.click(); }
      });
      observer.observe(document.getElementById('root'), {childList:true,subtree:true});
      setTimeout(() => observer.disconnect(), 15000);
    }
  });
})();
