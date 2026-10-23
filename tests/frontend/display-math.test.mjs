import test from 'node:test';import assert from 'node:assert/strict';import {renderMarkdown} from '../../frontend/src/lib/markdown.mjs';
test('double dollars inside prose are display math; code remains code',async()=>{const html=await renderMarkdown('قبل $$x^2$$ بعد\n\n`$$code$$`');assert.match(html,/katex-display/);assert.match(html,/<code>\$\$code\$\$<\/code>/);});
