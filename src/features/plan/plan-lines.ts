// What Chits says in the planner, as indexes into one list for the mascot rig.
export const PLAN_LINES = ['plan.say.morning', 'plan.say.afternoon', 'plan.say.first', 'plan.say.half', 'plan.say.all', 'plan.say.evening', 'plan.say.zero', 'plan.say.added'] as const;
export const PLAN_LINE = { morning: 0, afternoon: 1, first: 2, half: 3, all: 4, evening: 5, zero: 6, added: 7 } as const;
