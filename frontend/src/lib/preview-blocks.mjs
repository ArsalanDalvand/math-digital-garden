import {unified} from 'unified';
import remarkParse from 'remark-parse';
const parser=unified().use(remarkParse);
/** @param {string} raw */
export function previewBlocks(raw){
  return parser.parse(raw).children.flatMap(node=>{
    const from=node.position?.start.offset,to=node.position?.end.offset;
    if(from===undefined||to===undefined)return [];
    const source=raw.slice(from,to);
    const callout=node.type==='blockquote'&&/^ {0,3}>[ \t]*\[![^\]\r\n]+\]/.test(source);
    const embed=node.type==='paragraph'&&/^!\[\[[^\]\r\n]+\]\]$/.test(source.trim());
    return callout||embed?[{from,to,raw:source}]:[];
  });
}
