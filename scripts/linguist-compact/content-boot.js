// Inserted inside Linguist's existing bundle scope; the original engine remains intact.
if (!globalThis.__linguistCompactStarted) {
  globalThis.__linguistCompactStarted = true;
  const api = kr(), config = new Rr(), instance = new mv(config);
  let active = true, started = false, queue = Promise.resolve();
  const apply = async () => {
    const data = await api.storage.local.get(['facetTranslationEnabled','facetAlwaysLanguages','facetSimpleTarget']);
    active = data.facetTranslationEnabled !== false;
    if (!active) {
      if (started) {
        instance.pageTranslationContext.getDOMTranslator()?.stopTranslate();
        const current = await jr(); config.updateData(current);
      }
      return;
    }
    if (!started) {
      await instance.start(); started = true;
      const translator = instance.pageTranslationContext.getDOMTranslator();
      const original = translator.translate.bind(translator);
      translator.translate = (...args) => { if (active) return original(...args); };
    }
    config.updateData(await jr());
    const store = await config.getStore(), lang = await Kr(store.getState().pageTranslator.detectLanguageByContent, true);
    if ((data.facetAlwaysLanguages || []).includes(lang) && data.facetSimpleTarget && lang !== data.facetSimpleTarget) {
      const features = await gd();
      if (features.supportedLanguages.includes(lang) && features.supportedLanguages.includes(data.facetSimpleTarget)) {
        instance.pageTranslationContext.getDOMTranslator().translate({from:lang,to:data.facetSimpleTarget});
      }
    }
  };
  const schedule = () => { queue = queue.then(apply).catch(error => console.error('Linguist compact:', error.message)); };
  api.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.facetTranslationEnabled) schedule(); });
  schedule();
}
