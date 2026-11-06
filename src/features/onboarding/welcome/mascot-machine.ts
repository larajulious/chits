// The welcome mascot's behaviour as a small state machine. Every animation is
// started from a state change (see use-mascot-rig.ts), so two behaviours can
// never fight over the same part of the character.
//
// This file is pure data so tests can check it without React Native.

export const MASCOT_STATES = ['hidden', 'peeking', 'waving', 'idle', 'reacting', 'shy', 'exiting', 'watching', 'celebrating', 'sleeping'] as const;
export type MascotState = typeof MASCOT_STATES[number];
export type MascotEvent = 'gesture' | 'cancel' | 'sleep' | 'enter' | 'skipEntrance' | 'noticed' | 'settled' | 'tap' | 'reacted' | 'hold' | 'release' | 'leave' | 'returned' | 'watch' | 'celebrate' | 'rest';

const TRANSITIONS: Record<MascotState, Partial<Record<MascotEvent, MascotState>>> = {
  hidden: { enter: 'peeking', skipEntrance: 'idle' },
  peeking: { noticed: 'waving', settled: 'idle', leave: 'exiting', watch: 'watching' },
  waving: { settled: 'idle', leave: 'exiting', watch: 'watching' },
  idle: { tap: 'reacting', sleep: 'sleeping', hold: 'shy', leave: 'exiting', watch: 'watching', celebrate: 'celebrating' },
  reacting: { reacted: 'idle', hold: 'shy', leave: 'exiting', watch: 'watching', celebrate: 'celebrating' },
  shy: { release: 'peeking', leave: 'exiting', watch: 'watching' },
  exiting: { returned: 'peeking' },
  // Something on screen has Chits' attention, such as Spin's wheel.
  watching: { rest: 'idle', celebrate: 'celebrating', leave: 'exiting' },
  celebrating: { reacted: 'idle', watch: 'watching', leave: 'exiting' },
  // Only a tap wakes Chits, into the same reaction as any other tap.
  sleeping: { tap: 'reacting', leave: 'exiting', watch: 'watching', celebrate: 'celebrating' },
};

/** Inapplicable events leave the state unchanged. The rig's admission gate can
 * replace a reaction with the rapid-tap egg without admitting a second track. */
export function nextMascotState(state: MascotState, event: MascotEvent): MascotState {
  if (event === 'cancel') return ['reacting', 'celebrating', 'shy', 'peeking', 'waving'].includes(state) ? 'idle' : state;
  if (event === 'gesture' && ['idle', 'sleeping', 'watching'].includes(state)) return 'reacting';
  return TRANSITIONS[state][event] ?? state;
}

/** The staged entrance, in milliseconds: sneak 0–600, wave 600–1400, settle 1400–2200. */
export const ENTRANCE_MS = { sneak: 600, wave: 800, settle: 800 } as const;
/** The existing speech bubble reading interval; ordinary taps cannot overlap it. */
export const SPEECH_MS = 2600;
/** The stack's fade into Welcome, with margin. Home stays covered and Chits stays hidden until it ends. */
export const WELCOME_FADE_MS = 460;
/** A celebration: long enough to read as joy, short enough to stay out of the way. */
export const CELEBRATE_MS = 1500;
/** How long Chits stays out of sight between onboarding steps. */
export const STEP_EXIT_MS = 380;

/** A different line from the last one, so a second tap always gets a fresh reply. */
export function nextSpeechIndex(previous: number, count: number, random: () => number = Math.random) {
  if (count < 2) return 0;
  const offset = 1 + Math.floor(random() * (count - 1));
  return previous < 0 ? offset % count : (previous + offset) % count;
}
