import {fetchCatalogue} from '../../lib/catalogue.mjs';
import {folderTree} from '../../lib/folder-tree.mjs';

export const prerender=false;
export async function GET() {
  try {
    return Response.json(folderTree(await fetchCatalogue()), {headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json({detail:'دریافت کتابخانه انجام نشد؛ دوباره تلاش کنید.'}, {status:503,headers:{'Cache-Control':'no-store'}});
  }
}
