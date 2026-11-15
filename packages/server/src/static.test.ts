/**
 * Static client serving and security headers (CP07 T1).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import type { Db } from './db/client.js';

describe('static client (CP07 T1)', () => {
  let dir: string;
  let app: FastifyInstance;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ogm-client-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>OGM</title>');
    writeFileSync(join(dir, 'assets', 'index-AbC123.js'), 'console.log(1)');
    writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
    const config = loadConfig({ LOG_LEVEL: 'silent', CLIENT_DIST: dir });
    // No route below touches the database.
    ({ app } = await buildApp({ config, db: {} as Db, logger: false }));
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html uncached at / and for any non-API GET (SPA fallback)', async () => {
    for (const url of ['/', '/play', '/results/abc?x=1']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode, url).toBe(200);
      expect(r.body).toContain('<title>OGM</title>');
      expect(r.headers['cache-control']).toBe('no-cache');
      expect(r.headers['content-type']).toMatch(/text\/html/);
    }
  });

  it('answers HEAD like GET (health checks, link previews)', async () => {
    const r = await app.inject({ method: 'HEAD', url: '/' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-cache');
  });

  it('serves hashed assets as immutable for a year', async () => {
    const r = await app.inject({ method: 'GET', url: '/assets/index-AbC123.js' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const f = await app.inject({ method: 'GET', url: '/favicon.svg' });
    expect(f.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('never serves the SPA for API paths or non-GET requests', async () => {
    const api = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: { code: 'not_found', message: 'No such API route.' } });
    const post = await app.inject({ method: 'POST', url: '/play' });
    expect(post.statusCode).toBe(404);
    expect(post.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('sends a CSP that allows WebGL, blob workers and inline styles, and no stack traces', async () => {
    const r = await app.inject({ method: 'GET', url: '/' });
    const csp = String(r.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['strict-transport-security']).toBeUndefined();
  });
});
