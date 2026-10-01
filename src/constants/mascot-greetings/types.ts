export type GreetingPeriod = 'earlyMorning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'lateNight';
export type GreetingLanguage = 'en' | 'fil';
export type GreetingLibrary = Record<GreetingPeriod, readonly string[]>;
