import { describe, expect, it } from 'vitest';
import { matchCalloutLine } from './markdownExtensions';

describe('matchCalloutLine', () => {
  it('matches a callout marker and reports the marker offset', () => {
    const m = matchCalloutLine('> [!NOTE] Body text');
    expect(m).toEqual({ start: 2, raw: '[!NOTE]', kind: 'note' });
  });

  it('matches markers case-insensitively', () => {
    expect(matchCalloutLine('> [!important]')?.kind).toBe('important');
    expect(matchCalloutLine('> [!Caution]')?.kind).toBe('caution');
  });

  it('handles indented markers and empty bodies', () => {
    const m = matchCalloutLine('   > [!TIP]');
    expect(m?.start).toBe(5);
    expect(m?.kind).toBe('tip');
  });

  it('rejects non-callout quotes and unsupported types', () => {
    expect(matchCalloutLine('> regular quote')).toBeNull();
    expect(matchCalloutLine('> [!CUSTOM]')).toBeNull();
    expect(matchCalloutLine('plain text')).toBeNull();
  });

  it('rejects markers not at the start of the line', () => {
    expect(matchCalloutLine('text > [!NOTE]')).toBeNull();
  });
});
