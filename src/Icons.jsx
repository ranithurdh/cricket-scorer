// Small line icons for the top bar. They take their colour from the tab (currentColor).
const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

// cricket ball with its seam
export const ScoreIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6.2 6.2c3.4 2.6 3.4 8.9 0 11.6M17.8 6.2c-3.4 2.6-3.4 8.9 0 11.6" />
  </Svg>
);

// podium
export const LeaderboardIcon = () => (
  <Svg>
    <path d="M3.5 20.5v-6h5.2v6M8.7 20.5V8.5h6.6v12M15.3 20.5v-9h5.2v9M2.5 20.5h19" />
  </Svg>
);

// scorecard / list
export const MatchesIcon = () => (
  <Svg>
    <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
    <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
  </Svg>
);

export const SettingsIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </Svg>
);

// house
export const HomeIcon = () => (
  <Svg>
    <path d="M3.5 11.2 12 4l8.5 7.2M6 9.8V20h12V9.8M10 20v-5.5h4V20" />
  </Svg>
);

// crossed bats (1v1)
export const VersusIcon = () => (
  <Svg>
    <path d="M4.5 4.5l8 8M19.5 4.5l-8 8M10.5 13.5l-5 5M13.5 13.5l5 5" />
    <circle cx="4.5" cy="19.5" r="1.4" /><circle cx="19.5" cy="19.5" r="1.4" />
  </Svg>
);
