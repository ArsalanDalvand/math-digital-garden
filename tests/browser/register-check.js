(async()=>{
  const email='garden-e2e-'+Date.now()+'@example.org';
  const form=document.querySelector('[data-auth-form]');
  form.elements.email.value=email;
  form.elements.password.value='e2e-'+crypto.randomUUID();
  form.elements.full_name.value='آزمون توسعه';
  form.requestSubmit(form.querySelector('[value=register]'));
  for(let i=0;i<200;i++){
    if(document.querySelector('[data-logout]') && !document.querySelector('[data-logout]').hidden)return {registered:true,email};
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error(document.querySelector('[data-account-status]').textContent);
})()
