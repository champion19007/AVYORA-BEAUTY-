import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_IMAGE, PHOTO_SLOTS } from '../photos';

const all = { hero: HERO_IMAGE, ...PHOTO_SLOTS };

describe('homepage photos', () => {
  it.each(Object.entries(all))('%s points at a file in public/', (_slot, photo) => {
    expect(photo.src).toMatch(/^\/images\/home\/campaign-[\w-]+\.jpg$/);
    expect(existsSync(join(process.cwd(), 'public', photo.src))).toBe(true);
  });

  it('describes every photo that is not purely a backdrop for text', () => {
    for (const [slot, photo] of Object.entries(all)) {
      // A photo under a scrim carries text and is decorative; anything else is content.
      if (!('scrim' in photo)) expect(photo.alt, slot).not.toBe('');
    }
  });
});
