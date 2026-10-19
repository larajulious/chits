export type GreetingPeriod = 'earlyMorning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'lateNight';
export type GreetingLanguage = import('../../localization/runtime').Language;
export type GreetingLibrary = Record<GreetingPeriod, readonly string[]>;
