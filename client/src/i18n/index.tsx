import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '@shared/types';
import { coreDict } from './core';
import { academicsDict } from '../modules/academics/i18n';
import { campusDict } from '../modules/campus/i18n';
import { careerDict } from '../modules/career/i18n';
import { journeyDict } from '../modules/journey/i18n';
import { todayDict } from '../modules/today/i18n';
import { prereqsDict } from '../modules/prereqs/i18n';
import { mapDict } from '../modules/campus/mapI18n';
import { polishDict } from './polish';
import { careerPortfolioDict } from '../modules/career/i18nPortfolio';
import { communityDict } from '../modules/campus/i18nCommunity';
import { socialDict } from '../modules/campus/i18nSocial';
import { parkingDict } from '../modules/campus/map/parkingI18n';
import { shellDict } from '../shell/i18nShell';
import { plannerDict } from '../modules/academics/plannerI18n';
import { feedbackDict } from '../modules/feedback/i18n';

type Dict = Record<string, string>;
const dicts: Array<{ en: Dict; ar: Dict }> = [coreDict, todayDict, academicsDict, campusDict, careerDict, journeyDict, prereqsDict, mapDict, careerPortfolioDict, polishDict, communityDict, feedbackDict, socialDict, parkingDict, plannerDict, shellDict];
const merged: Record<Locale, Dict> = {
  en: Object.assign({}, ...dicts.map((d) => d.en)),
  ar: Object.assign({}, ...dicts.map((d) => d.ar))
};

interface I18n {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Pick localized field from a record with *_en/*_ar columns. */
  l: (en: string | null | undefined, ar?: string | null) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      return (localStorage.getItem('uj.locale') as Locale) || initial || 'en';
    } catch {
      return initial || 'en';
    }
  });
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem('uj.locale', locale);
    } catch {
      /* ignore */
    }
  }, [locale]);
  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);
  const plural = useMemo(() => new Intl.PluralRules(locale === 'ar' ? 'ar' : 'en'), [locale]);
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = merged[locale][key] ?? merged.en[key] ?? key;
      // Plural forms: "key#one", "key#two", "key#few", "key#many", "key#other" (and "key#zero") picked by Intl.PluralRules.
      if (vars) {
        const count = typeof vars.n === 'number' ? vars.n : (Object.values(vars).find((v) => typeof v === 'number') as number | undefined);
        if (count !== undefined) {
          const dict = merged[locale];
          const form = (count === 0 ? dict[`${key}#zero`] : undefined) ?? dict[`${key}#${plural.select(count)}`] ?? dict[`${key}#other`];
          if (form) s = form;
        }
      }
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      return s;
    },
    [locale, plural]
  );
  const value = useMemo<I18n>(
    () => ({ locale, dir: locale === 'ar' ? 'rtl' : 'ltr', setLocale, t, l: (en, ar) => (locale === 'ar' && ar ? ar : (en ?? '')) }),
    [locale, setLocale, t]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}

export function statusKey(status: string): string {
  return `status.${status}`;
}
