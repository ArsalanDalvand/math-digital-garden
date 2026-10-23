(async () => {
  await document.fonts.ready;
  const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
  const result = {
    rtl: getComputedStyle(document.body).direction,
    headingSize: parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),
    overflow: document.documentElement.scrollWidth > innerWidth,
    duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
    mathIsolated: [...document.querySelectorAll('.katex')].every((node) =>
      getComputedStyle(node).direction === 'ltr' && getComputedStyle(node).unicodeBidi === 'isolate'),
    fontLoaded: document.fonts.check('16px Vazirmatn'),
  };
  if (result.rtl !== 'rtl' || result.headingSize < 25 || result.overflow || result.duplicateIds.length || !result.mathIsolated || !result.fontLoaded) throw Error(JSON.stringify(result));
  return result;
})()
