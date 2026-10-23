/**
 * Keep reading and editing surfaces mutually exclusive without destroying editor state.
 * @param {{article: {hidden: boolean}, panel: {hidden: boolean}, indicator: {textContent: string|null}|null}} elements
 */
export function activateEditor({article,panel,indicator}) {
  article.hidden=true;
  panel.hidden=false;
  if(indicator) indicator.textContent='ویرایش نسخهٔ شخصی';
}
