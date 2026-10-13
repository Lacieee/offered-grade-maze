/**
 * Internationalisation (CP08 T6): English by default (PD3), Hungarian available. The chosen
 * language is stored in `localStorage` under `ogm.lang`.
 */
import { create } from 'zustand';
import { en, type MessageKey } from './en.js';
import { hu } from './hu.js';

export type Lang = 'en' | 'hu';
export const LANGS: readonly Lang[] = ['en', 'hu'];
/** `localStorage` key of the chosen language. */
export const LANG_STORAGE_KEY = 'ogm.lang';

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, hu };
export type { MessageKey };

function storedLang(): Lang {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANG_STORAGE_KEY);
    return v === 'hu' || v === 'en' ? v : 'en';
  } catch {
    return 'en';
  }
}

/** Fills `{name}` placeholders. */
export function format(text: string, params: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}

/** Translates `key` in `lang`. */
export function translate(
  lang: Lang,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  return format(MESSAGES[lang][key], params);
}

/** True if `key` is a message key (room labels come from the server as keys). */
export function isMessageKey(key: string): key is MessageKey {
  return key in en;
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLang = create<LangState>()((set) => ({
  lang: storedLang(),
  setLang: (lang) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
    set({ lang });
  },
}));

/** The translate function for the current language (re-renders on a language change). */
export function useT(): (key: MessageKey, params?: Record<string, string | number>) => string {
  const lang = useLang((s) => s.lang);
  return (key, params) => translate(lang, key, params);
}
