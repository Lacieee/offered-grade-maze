/**
 * English UI strings (CP08 T6): the default language (PD3). Every visible string of the app
 * comes from here; `hu.ts` must provide the same keys.
 */
export const en = {
  'app.name': 'Offered Grade Maze',
  'goal.name': 'Offered Grade',

  'title.tagline': 'Find the Offered Grade in a house that does not add up.',
  'title.newGame': 'New game',
  'title.controls': 'WASD to move · Mouse to look · Esc to release the mouse',
  'lang.label': 'Language',

  'newGame.title': 'New game',
  'newGame.tab.random': 'Random house',
  'newGame.tab.seed': 'Enter seed',
  'newGame.start': 'Start',
  'newGame.back': 'Back',
  'newGame.difficulty': 'Difficulty',

  'difficulty.easy': 'Easy',
  'difficulty.medium': 'Medium',
  'difficulty.hard': 'Hard',
  'difficulty.easy.desc': 'Doors mostly lead where you expect.',
  'difficulty.medium.desc': 'Some doors lead somewhere else, and a few never lead back.',
  'difficulty.hard.desc': 'The house folds in on itself. Trust nothing.',

  'seed.label': 'Seed code',
  'seed.placeholder': 'e.g. M1-7K2Q-X9MP',
  'seed.decoded': '{difficulty} house, generator version {version}',
  'seed.error.empty': 'Type a seed code.',
  'seed.error.length': 'A seed code has 10 letters and digits, like M1-7K2Q-X9MP.',
  'seed.error.difficulty': 'The first letter must be E, M or H.',
  'seed.error.version': 'The second character must be a digit from 1 to 9.',
  'seed.error.unsupported_version': 'This seed was made by a newer version of the game.',
  'seed.error.character': 'The seed contains a character that cannot appear in a seed code.',
  'seed.copy': 'Copy',
  'seed.copied': 'Copied',
  'seed.copyFailed': 'Select the code and copy it.',
  'seed.caption': 'Seed',

  'loading.title': 'Building the house…',
  'ready.click': 'Click to start',

  'hud.timer': 'Time',
  'hud.reconnecting': 'Reconnecting…',

  'pause.title': 'Paused',
  'pause.resume': 'Resume',
  'pause.quit': 'Quit to title',
  'pause.timer': 'The timer keeps running.',

  'result.headline': 'You got the Offered Grade!',
  'result.time': 'Time',
  'result.difficulty': 'Difficulty',
  'result.again': 'Play this seed again',
  'result.newGame': 'New game',
  'result.debugUsed': 'Debug view used',
  'result.saving': 'Saving result…',

  'unsupported.text':
    'Offered Grade Maze needs a desktop browser with WebGL2 (Chrome, Edge, Firefox or Safari).',

  'error.title': 'The game could not start',
  'error.retry': 'Retry',
  'error.back': 'Back',
  'error.network': 'The server could not be reached. Check that it is running and try again.',
  'error.invalid_seed': 'That seed code is not valid.',
  'error.unsupported_version': 'This seed was made by a newer version of the game.',
  'error.seed_not_playable': 'This seed does not produce a playable house.',
  'error.generation_unavailable': 'The server could not build a house right now. Try again.',
  'error.rate_limited': 'Too many new games in a short time. Wait a minute and try again.',
  'error.saveFailed': 'Your result could not be saved.',
  'error.generic': 'Something went wrong.',

  'graphics.reset': 'Graphics reset — restoring…',

  'room.living': 'Living room',
  'room.kitchen': 'Kitchen',
  'room.bedroom': 'Bedroom',
  'room.bathroom': 'Bathroom',
  'room.hallway': 'Hallway',
  'room.study': 'Study',
} as const;

/** Every message key. */
export type MessageKey = keyof typeof en;
