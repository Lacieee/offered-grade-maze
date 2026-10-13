/**
 * The UI shell (CP08 T6): every screen of the player journey. All text comes from i18n keys.
 */
import { DIFFICULTIES, parseSeed, type Difficulty } from '@ogm/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GameController } from '../game/controller.js';
import { formatClock, formatResultTime, useGame } from '../game/store.js';
import { LANGS, useLang, useT } from '../i18n/index.js';

declare global {
  interface Window {
    /** Dev only: how often the HUD rendered (e2e: no re-render per frame, CP08). */
    __ogmHudRenders?: number;
  }
}

/** EN | HU switch. */
export function LangToggle() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const t = useT();
  return (
    <div className="lang-toggle" role="group" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className={l === lang ? 'active' : ''}
          aria-pressed={l === lang}
          onClick={() => {
            setLang(l);
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function TitleScreen({ game }: { game: GameController }) {
  const t = useT();
  return (
    <div className="screen panel-screen" data-testid="title-screen">
      <div className="panel">
        <h1>{t('app.name')}</h1>
        <p className="tagline">{t('title.tagline')}</p>
        <button
          type="button"
          className="primary"
          autoFocus
          onClick={() => {
            game.toNewGame();
          }}
        >
          {t('title.newGame')}
        </button>
        <p className="hint">{t('title.controls')}</p>
        <LangToggle />
      </div>
    </div>
  );
}

/** Live seed validation: the decoded difficulty or the error message. */
function useSeedCheck(input: string): { ok: boolean; text: string; canonical: string | null } {
  const t = useT();
  const parsed = parseSeed(input);
  if (parsed.ok) {
    return {
      ok: true,
      canonical: parsed.seed.canonical,
      text: t('seed.decoded', {
        difficulty: t(`difficulty.${parsed.seed.difficulty}`),
        version: parsed.seed.version,
      }),
    };
  }
  return { ok: false, canonical: null, text: t(`seed.error.${parsed.error}`) };
}

export function NewGameScreen({ game }: { game: GameController }) {
  const t = useT();
  const tab = useGame((s) => s.newGameTab);
  const seedInput = useGame((s) => s.seedInput);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const check = useSeedCheck(seedInput);
  const setTab = (newGameTab: 'random' | 'seed') => {
    useGame.setState({ newGameTab });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tab === 'random') void game.newGame({ mode: 'random', difficulty });
    else if (check.canonical) void game.newGame({ mode: 'seed', seed: check.canonical });
  };
  return (
    <div className="screen panel-screen" data-testid="new-game-screen">
      <form className="panel" onSubmit={submit}>
        <h1>{t('newGame.title')}</h1>
        <div className="tabs" role="tablist">
          {(['random', 'seed'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'active' : ''}
              onClick={() => {
                setTab(id);
              }}
            >
              {t(id === 'random' ? 'newGame.tab.random' : 'newGame.tab.seed')}
            </button>
          ))}
        </div>
        {tab === 'random' ? (
          <fieldset className="difficulties">
            <legend className="sr-only">{t('newGame.difficulty')}</legend>
            {DIFFICULTIES.map((d) => (
              <label key={d} className={d === difficulty ? 'choice active' : 'choice'}>
                <input
                  type="radio"
                  name="difficulty"
                  value={d}
                  checked={d === difficulty}
                  onChange={() => {
                    setDifficulty(d);
                  }}
                />
                <span className="choice-name">{t(`difficulty.${d}`)}</span>
                <span className="choice-desc">{t(`difficulty.${d}.desc`)}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <div className="seed-entry">
            <label htmlFor="seed-input">{t('seed.label')}</label>
            <input
              id="seed-input"
              data-testid="seed-input"
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder={t('seed.placeholder')}
              value={seedInput}
              aria-invalid={!check.ok && seedInput.length > 0}
              aria-describedby="seed-check"
              onChange={(e) => {
                useGame.setState({ seedInput: e.target.value });
              }}
            />
            <p
              id="seed-check"
              data-testid="seed-check"
              className={check.ok ? 'seed-check ok' : 'seed-check'}
              aria-live="polite"
            >
              {seedInput.length > 0 || check.ok ? check.text : ' '}
            </p>
          </div>
        )}
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              game.toTitle();
            }}
          >
            {t('newGame.back')}
          </button>
          <button
            type="submit"
            className="primary"
            data-testid="start-button"
            disabled={tab === 'seed' && !check.ok}
          >
            {t('newGame.start')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function LoadingScreen() {
  const t = useT();
  const seed = useGame((s) => s.seed);
  return (
    <div className="screen panel-screen" data-testid="loading-screen" aria-busy="true">
      <div className="panel">
        <div className="spinner" aria-hidden="true" />
        <h2>{t('loading.title')}</h2>
        {seed && <p className="seed-code">{seed}</p>}
      </div>
    </div>
  );
}

/** Ready: the whole screen is the start button (the click locks the pointer). */
export function ReadyScreen({ game }: { game: GameController }) {
  const t = useT();
  const seed = useGame((s) => s.seed);
  return (
    <button
      type="button"
      className="ready-screen"
      data-testid="ready-screen"
      autoFocus
      onClick={() => {
        game.begin();
      }}
    >
      <span className="ready-title">{t('ready.click')}</span>
      <span className="hint">{t('title.controls')}</span>
      {seed && <span className="seed-code">{seed}</span>}
    </button>
  );
}

/**
 * In-game HUD: timer at the top centre, seed bottom-left. The timer updates its text from
 * `requestAnimationFrame` through a ref; React never re-renders per frame.
 */
export function Hud() {
  const t = useT();
  useEffect(() => {
    // Every commit of the HUD (dev only): e2e checks it does not grow per frame.
    if (import.meta.env.DEV) window.__ogmHudRenders = (window.__ogmHudRenders ?? 0) + 1;
  });
  const seed = useGame((s) => s.seed);
  const reconnecting = useGame((s) => s.reconnecting);
  const timer = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { startedAt, stoppedAt } = useGame.getState();
      const el = timer.current;
      if (el && startedAt !== null) {
        const text = formatClock((stoppedAt ?? performance.now()) - startedAt);
        if (el.textContent !== text) el.textContent = text;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <>
      <div className="hud-timer" role="timer" aria-label={t('hud.timer')}>
        <span ref={timer} data-testid="hud-timer">
          00:00
        </span>
      </div>
      {seed && <div className="hud-seed">{seed}</div>}
      {reconnecting && (
        <div className="reconnecting" role="status" data-testid="reconnecting">
          {t('hud.reconnecting')}
        </div>
      )}
    </>
  );
}

/** Seed with a Copy button ("Copied" confirmation; select-text fallback). */
export function SeedCopy({ seed }: { seed: string }) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const code = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state === 'idle') return;
    const id = window.setTimeout(() => {
      setState('idle');
    }, 2500);
    return () => {
      window.clearTimeout(id);
    };
  }, [state]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(seed);
      setState('copied');
    } catch {
      // No clipboard access: select the code so the player can copy it.
      const el = code.current;
      const sel = window.getSelection();
      if (el && sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      setState('failed');
    }
  };
  return (
    <div className="seed-copy">
      <span className="seed-caption">{t('seed.caption')}</span>
      <code ref={code} className="seed-code" data-testid="seed-code">
        {seed}
      </code>
      <button type="button" data-testid="copy-seed" onClick={() => void copy()}>
        {state === 'copied' ? t('seed.copied') : t('seed.copy')}
      </button>
      <span className="copy-note" aria-live="polite">
        {state === 'failed' ? t('seed.copyFailed') : ''}
      </span>
    </div>
  );
}

/** Shown while playing without Pointer Lock. The timer keeps running (PD1). */
export function PauseOverlay({ game }: { game: GameController }) {
  const t = useT();
  const seed = useGame((s) => s.seed);
  return (
    <div className="screen panel-screen pause" data-testid="pause-overlay">
      <div className="panel">
        <h2>{t('pause.title')}</h2>
        <p className="note">{t('pause.timer')}</p>
        <button
          type="button"
          className="primary"
          autoFocus
          onClick={() => {
            game.resume();
          }}
        >
          {t('pause.resume')}
        </button>
        {seed && <SeedCopy seed={seed} />}
        <button
          type="button"
          onClick={() => {
            game.toTitle();
          }}
        >
          {t('pause.quit')}
        </button>
      </div>
    </div>
  );
}

export function CompletingScreen() {
  const t = useT();
  const retrying = useGame((s) => s.savingRetry);
  return (
    <div className="screen panel-screen completing" data-testid="completing">
      <div className="panel">
        <h2>{t('result.headline')}</h2>
        <p className={retrying ? 'note warn' : 'note'}>{t('result.saving')}</p>
      </div>
    </div>
  );
}

export function ResultScreen({ game }: { game: GameController }) {
  const t = useT();
  const result = useGame((s) => s.result);
  if (!result) return null;
  return (
    <div className="screen panel-screen" data-testid="result-screen">
      <div className="panel">
        <h1>{t('result.headline')}</h1>
        <p className="result-time" data-testid="result-time">
          {formatResultTime(result.completionMs)}
        </p>
        <p>
          {t('result.difficulty')}:{' '}
          <span data-testid="result-difficulty">{t(`difficulty.${result.difficulty}`)}</span>
        </p>
        <SeedCopy seed={result.seed} />
        {result.debugUsed && (
          <p className="debug-marker" data-testid="debug-marker">
            {t('result.debugUsed')}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            className="primary"
            autoFocus
            data-testid="play-again"
            onClick={() => void game.playAgain()}
          >
            {t('result.again')}
          </button>
          <button
            type="button"
            onClick={() => {
              game.toNewGame();
            }}
          >
            {t('result.newGame')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UnsupportedScreen() {
  const t = useT();
  return (
    <div className="screen panel-screen" role="alert" data-testid="unsupported">
      <div className="panel">
        <h1>{t('app.name')}</h1>
        <p>{t('unsupported.text')}</p>
      </div>
    </div>
  );
}

export function ErrorScreen({ game }: { game: GameController }) {
  const t = useT();
  const error = useGame((s) => s.error);
  return (
    <div className="screen panel-screen" role="alert" data-testid="error-screen">
      <div className="panel">
        <h2>{t('error.title')}</h2>
        <p>{t(error?.key ?? 'error.generic')}</p>
        {error?.detail && <p className="detail">{error.detail}</p>}
        <div className="actions">
          <button
            type="button"
            onClick={() => {
              game.toNewGame();
            }}
          >
            {t('error.back')}
          </button>
          {error?.retry && (
            <button
              type="button"
              className="primary"
              autoFocus
              onClick={() => {
                error.retry?.();
              }}
            >
              {t('error.retry')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
