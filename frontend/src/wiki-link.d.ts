import type { Literal, Data } from 'mdast';
import type { Properties, ElementContent } from 'hast';
interface WikiLink extends Literal {
  type: 'wikiLink';
  value: string;
  data: Data & {
    embed?: boolean;
    alias: string;
    hName: string;
    hProperties: Properties;
    hChildren: ElementContent[];
  };
}
declare module 'mdast' {
  interface PhrasingContentMap { wikiLink: WikiLink }
  interface RootContentMap { wikiLink: WikiLink }
}
