export const gameModes = [
  {
    name: 'Classic',
    description:
      'Build momentum, chain jumps, and climb before the rising frost catches you. Completed runs can be submitted to the Classic leaderboard for replay verification.',
  },
  {
    name: 'Party',
    description:
      'Lower gravity, pink spring platforms, and crystals that grant eight seconds of double jumps. Release and press jump again in midair for the extra jump. Party has its own leaderboard.',
  },
  {
    name: 'Practice',
    description:
      'Learn with guided tips and no automatic frost chase. Hazards remain, and falling into the frost still ends the run. Practice runs are unranked.',
  },
  {
    name: 'Daily tower',
    description:
      'Everyone gets the same Classic tower for each UTC date, with unlimited retries. Your best attempt is saved in this browser. Daily runs can join the Classic leaderboard; there is no separate online daily ranking.',
  },
];

export const gameplayFaq = [
  {
    question: 'What is Icy Tower — Frostbound?',
    answer:
      'Frostbound is a free, independent Icy Tower-inspired 2.5D browser game set in a frozen cathedral. Build momentum, jump between ledges, collect crystals, and climb above the rising frost. It is a browser prototype with no original game assets or affiliation with the original Icy Tower.',
  },
  {
    question: 'Do I need to download anything or create an account?',
    answer:
      'No download or account is required. Play in a browser with JavaScript and WebGL enabled. Leaderboard submissions use a public display name without a login.',
  },
  {
    question: 'Can I play on a phone or tablet?',
    answer:
      'Yes. Touch controls support portrait and landscape layouts. Hold left or right with one thumb and tap JUMP with the other. Touch devices start in Performance quality; quality, sound, music, and reduced motion are available under Menu → Settings.',
  },
  {
    question: 'How do I jump higher and keep a combo?',
    answer:
      'Run to build momentum before jumping. Release the jump key or button before jumping again. While airborne beside a wall, release and tap jump to launch up and away. Keep a combo by chaining jumps that climb two or more floors, landing within 3.8 seconds each time; a one-floor hop ends the chain. Automatic scrolling starts at floor 5 in Classic and Party.',
  },
  {
    question: 'Can I race a friend online?',
    answer:
      'Yes. Open Menu → Race a friend, create a private two-player lobby, and share the invite. Choose a finish floor from 5 to 100, a time limit, and optional shoves. Both players ready up before the race; falls return you to the last five-floor checkpoint. Race results are separate from solo leaderboards.',
  },
  {
    question: 'Where are my records, outfits, and ghosts saved?',
    answer:
      'Personal progress, unlocked outfits, daily bests, and your saved ghost stay in this browser and do not sync across devices. Clearing browser storage resets them. Scores you submit to the online Classic or Party leaderboard are stored separately on the server.',
  },
];
