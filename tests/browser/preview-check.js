(async () => {
  const preview=document.querySelector('.note-preview');
  preview.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}));
  if(!preview.open)throw Error('Hover preview did not open');
  preview.querySelector('article a').focus();
  preview.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  if(preview.open)throw Error('Escape from inside preview did not close it');
  if(document.activeElement!==preview.querySelector('summary'))throw Error('Escape did not restore summary focus');
  return {hoverOpened:true,escapeClosed:true};
})()
