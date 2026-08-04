export const PACKET_IDS = {
  PLAYER_ADD: 1,
  PLAYER_REMOVE: 2,
  HOST_KICK: 3,
  HOST_BAN: 4,
  PLAYER_VOTEKICK: 5,
  PLAYER_REPORT: 6,
  PLAYER_MUTE: 7,
  VOTE: 8,
  UPDATE_AVATAR: 9,
  LOBBY_DATA: 10,
  UPDATE_GAME_STATE: 11,
  UPDATE_ROOM_SETTINGS: 12,
  REVEAL_HINT: 13,
  UPDATE_TIME: 14,
  PLAYER_GUESSED: 15,
  CLOSE_WORD: 16,
  SET_OWNER: 17,
  SELECT_WORD: 18,
  DRAW: 19,
  CLEAR_CANVAS: 20,
  UNDO: 21,
  START_GAME: 22,
  END_GAME: 23,
  TEXT: 30,
  GAME_START_ERROR: 31,
  SPAM_DETECTED: 32,
  UPDATE_NAME: 90
} as const;

export const GAME_STATE_NAMES: Record<number, string> = {
  0: 'WAITING_FOR_PLAYERS',
  1: 'GAME_STARTING',
  2: 'ROUND_ANNOUNCEMENT',
  3: 'WORD_SELECTION',
  4: 'DRAWING',
  5: 'ROUND_RESULTS',
  6: 'GAME_RESULTS',
  7: 'PRIVATE_LOBBY_SETUP'
};

export const LANGUAGE_NAMES: Record<number, string> = {
  0: 'English',
  1: 'German',
  2: 'Bulgarian',
  3: 'Czech',
  4: 'Danish',
  5: 'Dutch',
  6: 'Finnish',
  7: 'French',
  8: 'Estonian',
  9: 'Greek',
  10: 'Hebrew',
  11: 'Hungarian',
  12: 'Italian',
  13: 'Japanese',
  14: 'Korean',
  15: 'Latvian',
  16: 'Macedonian',
  17: 'Norwegian',
  18: 'Portuguese',
  19: 'Polish',
  20: 'Romanian',
  21: 'Russian',
  22: 'Serbian',
  23: 'Slovakian',
  24: 'Spanish',
  25: 'Swedish',
  26: 'Tagalog',
  27: 'Turkish'
};

export const LEAVE_REASON_NAMES: Record<number, string> = {
  0: 'DISCONNECT',
  1: 'KICKED',
  2: 'BANNED'
};

export const DRAW_RESULT_NAMES: Record<number, string> = {
  0: 'EVERYONE_GUESSED',
  1: 'TIME_UP',
  2: 'DRAWER_LEFT'
};

export const VOTE_NAMES: Record<number, string> = {
  0: 'DISLIKE',
  1: 'LIKE'
};

export const SETTING_NAMES: Record<number, string> = {
  0: 'LANGUAGE',
  1: 'MAX_PLAYERS',
  2: 'DRAW_TIME',
  3: 'ROUNDS',
  4: 'WORD_COUNT',
  5: 'HINTS',
  6: 'WORD_MODE',
  7: 'CUSTOM_WORDS_ONLY'
};

export const START_ERROR_NAMES: Record<number, string> = {
  0: 'NOT_ENOUGH_PLAYERS',
  100: 'SERVER_RESTART_SOON'
};
