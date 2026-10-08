import { describe, expect, it } from 'vitest';
import { generateLevel } from '../generate.js';
import { histogram, issuesText, percentile, summary } from './report.js';
import { counterSeed, goldenSeeds } from './seeds.js';
import { levelSvg } from './svg.js';

describe('CLI helpers', () => {
  const level = generateLevel('H1-7K2Q-X9MP');

  it('summary lists every room and door, and the metrics', () => {
    const text = summary(level, 1.25);
    expect(text).toContain('H1-7K2Q-X9MP  hard  generator v1  attempts');
    for (const r of level.rooms) expect(text).toContain(`${r.id}  depth`);
    expect(text).toMatch(/asymmetric \d+\.\d %/);
  });

  it('svg has a box per room and a path per link', () => {
    const svg = levelSvg(level);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.match(/<rect x=/g)).toHaveLength(level.rooms.length);
    expect(svg.match(/<path d="M[\d.]+ [\d.]+ [Qc]/g)).toHaveLength(level.meta.metrics.links);
  });

  it('statistics helpers', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(percentile([], 50)).toBe(0);
    expect(histogram([3, 1, 3, 2])).toBe('1:1 2:1 3:2');
    expect(issuesText([])).toBe('valid');
    expect(issuesText([{ check: 'V1', message: 'x' }])).toBe('V1  x');
  });

  it('seed lists', () => {
    expect(counterSeed('easy', 0)).toBe('E1-0000-0000');
    expect(counterSeed('medium', 1)).toBe('M1-0000-0001');
    expect(new Set(goldenSeeds()).size).toBe(30);
  });
});
