import { describe, expect, it } from 'vitest';
import { formatTimestampForDisplay, getCurrentTimestamp } from '../date';

describe('getCurrentTimestamp', () => {
    it('returns a string in YYYYMMDD / HHMMSS format', () => {
        const ts = getCurrentTimestamp();
        expect(ts).toMatch(/^\d{8} \/ \d{6}$/);
    });
});

describe('formatTimestampForDisplay', () => {
    it('formats a valid timestamp correctly', () => {
        expect(formatTimestampForDisplay('20240522 / 143022')).toBe('20240522, 14:30:22');
    });

    it('returns empty string for falsy input', () => {
        expect(formatTimestampForDisplay('')).toBe('');
    });

    it('passes through already-formatted strings unchanged', () => {
        expect(formatTimestampForDisplay('hello')).toBe('hello');
    });
});
