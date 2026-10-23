(async () => {
  const button=document.querySelector('starlight-menu-button button');
  button.click();
  await new Promise(requestAnimationFrame);
  const expanded=document.body.hasAttribute('data-mobile-menu-expanded');
  if(button.getAttribute('aria-expanded')!==String(expanded)) throw Error('Menu button aria-expanded does not match visible state');
  button.dispatchEvent(new KeyboardEvent('keyup',{code:'Escape',bubbles:true}));
  await new Promise(requestAnimationFrame);
  if(document.body.hasAttribute('data-mobile-menu-expanded')||button.getAttribute('aria-expanded')!=='false')throw Error('Escape did not close menu');
  return {expanded,escapeClosed:true};
})()
