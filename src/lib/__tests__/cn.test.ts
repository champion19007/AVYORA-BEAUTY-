import { describe, expect, it } from 'vitest';
import { cn } from '../utils';

describe('cn with the redesign font sizes', () => {
  it('keeps a text colour next to a custom font size', () => {
    expect(cn('bg-nv-ink text-white', 'text-nv-label')).toBe('bg-nv-ink text-white text-nv-label');
  });
  it('still lets a later font size replace an earlier one', () => {
    expect(cn('text-nv-label', 'text-nv-title')).toBe('text-nv-title');
  });
});
