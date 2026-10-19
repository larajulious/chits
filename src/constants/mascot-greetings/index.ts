import { matchSupportedLanguage } from '../../localization/runtime';
import { greetings as idGreetings } from './id';
import { greetings as frGreetings } from './fr';
import { greetings as deGreetings } from './de';
import { greetings as jaGreetings } from './ja';
import { greetings as koGreetings } from './ko';
import { greetings as itGreetings } from './it';
import { greetings as viGreetings } from './vi';
import { greetings as hiGreetings } from './hi';
import { greetings as trGreetings } from './tr';
import { greetings as arGreetings } from './ar';
import { spanishGreetings } from './es';
import { portugueseGreetings } from './pt-BR';
import { englishGreetings } from './en';
import { filipinoGreetings } from './fil';
import type { GreetingLanguage, GreetingPeriod } from './types';

export type { GreetingLanguage, GreetingPeriod } from './types';

export function getGreetingPeriod(date: Date): GreetingPeriod {
  const hour = date.getHours();
  if (hour < 4) return 'lateNight';
  if (hour < 7) return 'earlyMorning';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

export function getGreetingLanguage(locale: string | null | undefined): GreetingLanguage {
  return matchSupportedLanguage(locale ?? '') ?? 'en';
}

export function getGreetingsForPeriod(language: GreetingLanguage, period: GreetingPeriod): readonly string[] {
  const libraries = { en: englishGreetings, fil: filipinoGreetings, 'pt-BR': portugueseGreetings, es: spanishGreetings, id: idGreetings, fr: frGreetings, de: deGreetings, ja: jaGreetings, ko: koGreetings, it: itGreetings, vi: viGreetings, hi: hiGreetings, tr: trGreetings, ar: arGreetings };
  return (libraries[language] ?? englishGreetings)[period];
}

export function chooseGreeting(greetings: readonly string[], recent: readonly string[], random = Math.random): string {
  const available = greetings.filter((greeting) => !recent.includes(greeting));
  const pool = available.length ? available : greetings;
  if (!pool.length) return '';
  return pool[Math.floor(Math.min(Math.max(random(), 0), 0.999999999) * pool.length)];
}

export function nextRecentGreetings(recent: readonly string[], selected: string): string[] {
  return [selected, ...recent.filter((item) => item !== selected)].slice(0, 5);
}
