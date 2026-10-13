/**
 * Settings screen (CP09 T7): over the title screen or the pause overlay. Changes apply live
 * and persist (`ogm.settings`; the language in `ogm.lang`).
 */
import { useEffect, type ReactNode } from 'react';
import { useGame } from '../game/store.js';
import { LANGS, useLang, useT, type Lang } from '../i18n/index.js';
import { useSettings, type Settings } from '../settings/settings.js';

function Row({
  id,
  label,
  value,
  children,
}: {
  id: string;
  label: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting">
      <label htmlFor={id}>{label}</label>
      <div className="setting-control">
        {children}
        {value !== undefined && <output htmlFor={id}>{value}</output>}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const reset = useSettings((s) => s.reset);
  const close = () => {
    useGame.setState({ settingsOpen: false });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const num = (key: keyof Settings) => (e: { target: { value: string } }) => {
    update({ [key]: Number(e.target.value) });
  };
  const volume = (key: 'master' | 'music' | 'sfx', label: string) => (
    <Row id={`set-${key}`} label={label} value={`${String(settings[key])} %`}>
      <input
        id={`set-${key}`}
        data-testid={`set-${key}`}
        type="range"
        min={0}
        max={100}
        step={5}
        value={settings[key]}
        onChange={num(key)}
      />
    </Row>
  );
  return (
    <div
      className="screen panel-screen settings-screen"
      data-testid="settings-screen"
      role="dialog"
      aria-modal="true"
    >
      <form
        className="panel settings"
        onSubmit={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <h2>{t('settings.title')}</h2>
        <Row id="set-lang" label={t('settings.language')}>
          <select
            id="set-lang"
            data-testid="set-lang"
            value={lang}
            onChange={(e) => {
              setLang(e.target.value as Lang);
            }}
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`lang.${l}`)}
              </option>
            ))}
          </select>
        </Row>
        <Row
          id="set-sensitivity"
          label={t('settings.sensitivity')}
          value={`${settings.sensitivity.toFixed(2)}×`}
        >
          <input
            id="set-sensitivity"
            data-testid="set-sensitivity"
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={settings.sensitivity}
            onChange={num('sensitivity')}
          />
        </Row>
        <Row id="set-invert" label={t('settings.invertY')}>
          <input
            id="set-invert"
            data-testid="set-invert"
            type="checkbox"
            checked={settings.invertY}
            onChange={(e) => {
              update({ invertY: e.target.checked });
            }}
          />
        </Row>
        <Row id="set-fov" label={t('settings.fov')} value={`${String(settings.fov)}°`}>
          <input
            id="set-fov"
            data-testid="set-fov"
            type="range"
            min={60}
            max={90}
            step={1}
            value={settings.fov}
            onChange={num('fov')}
          />
        </Row>
        <Row id="set-bob" label={t('settings.headBob')}>
          <input
            id="set-bob"
            data-testid="set-bob"
            type="checkbox"
            checked={settings.headBob}
            onChange={(e) => {
              update({ headBob: e.target.checked });
            }}
          />
        </Row>
        {volume('master', t('settings.master'))}
        {volume('music', t('settings.music'))}
        {volume('sfx', t('settings.sfx'))}
        <Row id="set-quality" label={t('settings.quality')}>
          <select
            id="set-quality"
            data-testid="set-quality"
            value={settings.quality}
            onChange={(e) => {
              update({ quality: e.target.value as Settings['quality'] });
            }}
          >
            {(['auto', 'high', 'low'] as const).map((q) => (
              <option key={q} value={q}>
                {t(`settings.quality.${q}`)}
              </option>
            ))}
          </select>
        </Row>
        <div className="actions">
          <button type="button" onClick={reset}>
            {t('settings.reset')}
          </button>
          <button type="submit" className="primary" autoFocus data-testid="settings-done">
            {t('settings.done')}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Opens the settings screen. */
export function SettingsButton() {
  const t = useT();
  return (
    <button
      type="button"
      data-testid="open-settings"
      onClick={() => {
        useGame.setState({ settingsOpen: true });
      }}
    >
      {t('settings.open')}
    </button>
  );
}
