// House rules that aren't on the setup screen yet, plus the starting values for it.
export const RULES = {
  wideRuns: 1,
  noBallRuns: 1,
  allowConsecutiveOvers: false,
};

// Squads start empty: players are picked from the dorm roster (src/members.js) or added as guests in Setup.
export const DEFAULT_CONFIG = {
  ...RULES,
  overs: 4,
  ballsPerOver: 6,
  battingFirst: 0, // index into teams
  lastManBats: false,
  teams: [
    { name: 'Team A', players: [] },
    { name: 'Team B', players: [] },
  ],
};
