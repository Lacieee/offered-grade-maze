import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomTypeSchema } from '@ogm/shared';
import { describe, expect, it } from 'vitest';
import { en } from './en.js';
import { hu } from './hu.js';
import { MESSAGES, format, isMessageKey, translate } from './index.js';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Every `.ts`/`.tsx` file under `src/app` and `src/ui`. */
function sources(): string[] {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
    }
  };
  walk(join(root, 'app'));
  walk(join(root, 'ui'));
  return out;
}

describe('i18n (CP08 T6)', () => {
  it('English and Hungarian have exactly the same keys, none empty, same placeholders', () => {
    expect(Object.keys(hu).sort()).toEqual(Object.keys(en).sort());
    for (const lang of ['en', 'hu'] as const) {
      for (const [key, text] of Object.entries(MESSAGES[lang])) {
        expect(text.trim().length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(hu[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('every key used in the UI exists', () => {
    const used = new Set<string>();
    for (const file of sources()) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([\w.]+)'/g))
        used.add(m[1] ?? '');
    }
    expect(used.size).toBeGreaterThan(20);
    for (const key of used) expect(isMessageKey(key), key).toBe(true);
  });

  it('room labels and difficulties are translated', () => {
    for (const type of RoomTypeSchema.options)
      expect(isMessageKey(`room.${type}`), type).toBe(true);
    for (const d of ['easy', 'medium', 'hard']) {
      expect(isMessageKey(`difficulty.${d}`)).toBe(true);
      expect(isMessageKey(`difficulty.${d}.desc`)).toBe(true);
    }
  });

  it('uses the product owner’s Hungarian wording', () => {
    expect(hu['app.name']).toBe('Offered Grade Maze');
    expect(hu['goal.name']).toBe('Megajánlott jegy');
    expect(hu['result.headline']).toBe('Megszerezted a Megajánlott jegyet!');
    expect(hu['title.newGame']).toBe('Új játék');
    expect(hu['newGame.tab.random']).toBe('Véletlen ház');
    expect(hu['newGame.tab.seed']).toBe('Seed megadása');
    expect([hu['difficulty.easy'], hu['difficulty.medium'], hu['difficulty.hard']]).toEqual([
      'Könnyű',
      'Közepes',
      'Nehéz',
    ]);
    expect(hu['ready.click']).toBe('Kattints a kezdéshez');
    expect(hu['pause.timer']).toBe('Az idő tovább fut.');
    expect(hu['result.again']).toBe('Újrajátszás ezzel a seeddel');
  });

  it('English is the default and placeholders are filled', () => {
    expect(translate('en', 'seed.decoded', { difficulty: 'Hard', version: 1 })).toBe(
      'Hard house, generator version 1',
    );
    expect(format('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });
});
