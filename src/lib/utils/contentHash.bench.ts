import { bench, describe } from 'vitest';
import { hashContent } from './contentHash';

const SHORT_DOC = '# Title\n\nSome **bold** text with a [link](https://example.com).\n';
const LONG_DOC =
  '# Big Document\n\n' +
  Array.from({ length: 2000 }, (_, i) => `Line ${i} with some content *here* and \`code\`.`).join('\n');
const HUGE_DOC = LONG_DOC.repeat(50);

describe('hashContent', () => {
  bench('short doc (~80 chars)', () => {
    hashContent(SHORT_DOC);
  });

  bench('long doc (~90 KB)', () => {
    hashContent(LONG_DOC);
  });

  bench('huge doc (~4.5 MB)', () => {
    hashContent(HUGE_DOC);
  });
});
