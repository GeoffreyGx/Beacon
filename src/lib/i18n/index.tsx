// App language. By default it follows the OS (its first preferred language we
// have, else English). Users can pick a classical language instead (Settings →
// Apparence: Ancient Greek or Latin, which no OS offers), saved in the prefs.
// Development builds can also force any language (Settings → Développement).
// Priority: debug override > user choice > OS.
//
// t() reads the current language at call time, so strings built during render
// follow it; <I18nProvider> (root layout) remounts the app when the language
// changes (OS change on Android, user / debug choice). Module-level data must
// call t() lazily.
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { getLocales, useLocales, type Locale } from 'expo-localization';
import { getPref, setPref } from '../prefs';
import { createStore } from '../store';
import { ar } from './ar';
import { de } from './de';
import { el } from './el';
import { en } from './en';
import { es } from './es';
import { fi } from './fi';
import { fr, type TranslationKey } from './fr';
import { grc } from './grc';
import { it } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { la } from './la';
import { nb } from './nb';
import { nl } from './nl';
import { pl } from './pl';
import { pt } from './pt';
import { sv } from './sv';
import { zh } from './zh';

const STRINGS = { fr, en, de, es, it, pt, pl, nl, sv, nb, fi, ar, zh, ja, ko, el, grc, la } satisfies Record<
  string,
  Record<TranslationKey, string>
>;

export type Lang = keyof typeof STRINGS;
export type { TranslationKey };

/** Each language under its own name (for pickers). */
export const LANGUAGE_NAMES: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  pl: 'Polski',
  nl: 'Nederlands',
  sv: 'Svenska',
  nb: 'Norsk',
  fi: 'Suomi',
  ar: 'العربية',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  el: 'Ελληνικά',
  grc: 'Ἑλληνική',
  la: 'Latina',
};

/** Languages users can choose over the OS one (the OS can't offer them). */
export const CLASSICAL_LANGS = ['grc', 'la'] as const;
export type ClassicalLang = (typeof CLASSICAL_LANGS)[number];

/** Intl locale per language (Latin digits for Arabic, Gregorian calendar everywhere). */
const INTL: Record<Lang, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  pl: 'pl-PL',
  nl: 'nl-NL',
  sv: 'sv-SE',
  nb: 'nb-NO',
  fi: 'fi-FI',
  ar: 'ar-u-ca-gregory-nu-latn',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  el: 'el-GR',
  // No Intl data: time.ts formats these dates by hand; this is only a fallback.
  grc: 'el-GR',
  la: 'en-GB',
};

/** OS language code → app language. */
function fromCode(code: string | null | undefined): Lang | null {
  if (!code) return null;
  const c = code.toLowerCase();
  if (c === 'no' || c === 'nn' || c === 'nb') return 'nb';
  return c in STRINGS ? (c as Lang) : null;
}

const pick = (locales: readonly Locale[]): Lang => {
  for (const l of locales) {
    const lang = fromCode(l.languageCode);
    if (lang) return lang;
  }
  return 'en';
};

function detect(): Lang {
  try {
    return pick(getLocales());
  } catch {
    return 'fr'; // no locale API (server rendering): the app's original language
  }
}

let lang: Lang = detect();

export const getLang = () => lang;

/** Idempotent, so it is safe to call during render (before the children read it). */
function applyLang(next: Lang) {
  lang = next;
}

/** BCP 47 tag for Intl / toLocaleDateString. */
export const intlLocale = () => INTL[lang];

type Params = Record<string, string | number>;

/** Translated string; `{name}` placeholders are replaced by `params.name`. */
export function t(key: TranslationKey, params?: Params): string {
  const s = STRINGS[lang][key] ?? fr[key];
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

/** Singular / plural form: `${base}_one` for 1 (and 0 in French), `${base}_other` otherwise. */
export function tn(base: 'rooms.count' | 'bus.trip.transfers' | 'trip.stops', count: number, params?: Params): string {
  const one = lang === 'fr' ? count <= 1 : count === 1;
  return t(`${base}_${one ? 'one' : 'other'}`, { count, ...params });
}

// ---- User choice (saved) ------------------------------------------------------

const PREF_KEY = 'language';
const isClassical = (v: string | null): v is ClassicalLang => (CLASSICAL_LANGS as readonly string[]).includes(v ?? '');

/** undefined until read from the prefs; null = follow the OS. */
const userStore = createStore<{ lang: ClassicalLang | null | undefined }>({ lang: undefined });

export function setUserLang(next: ClassicalLang | null) {
  userStore.set({ lang: next });
  setPref(PREF_KEY, next ?? 'system').catch(() => {});
}
export const useUserLang = () => userStore.use().lang ?? null;

// ---- Debug override (development builds) ---------------------------------------

// Language forced instead of everything else (null = none). Kept in memory only;
// only written by the development settings, so inert in release builds.
const forcedStore = createStore<{ lang: Lang | null }>({ lang: null });
export const setForcedLang = (next: Lang | null) => forcedStore.set({ lang: next });
export const useForcedLang = () => forcedStore.use().lang;

/** Picks the language (debug > user > OS); remounts its children when it changes. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const os = pick(useLocales());
  const user = userStore.use().lang;
  const forced = useForcedLang();
  const [ready, setReady] = useState(user !== undefined);

  useEffect(() => {
    if (ready) return;
    getPref(PREF_KEY)
      .catch(() => null)
      .then((v) => {
        if (userStore.get().lang === undefined) userStore.set({ lang: isClassical(v) ? v : null });
        setReady(true);
      });
  }, [ready]);

  // Wait for the saved choice (a quick Keychain read) rather than flashing the OS language.
  if (!ready) return null;
  const current = (__DEV__ && forced) || user || os;
  applyLang(current);
  return <Fragment key={current}>{children}</Fragment>;
}
