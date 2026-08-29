import type {
  AnyChallengeDefinition,
  ChallengeEnginePublicApi,
  ChallengeRuntimeSnapshot
} from '@skribbl-duels/challenge-engine';
import { betterLateThanNeverDefinition } from './definitions/betterLateThanNever';
import { coolNumberDetectedDefinition } from './definitions/coolNumberDetected';
import { quickscopeDefinition } from './definitions/quickscope';
import { ouchDefinition } from './definitions/ouch';
import { tldrDefinition } from './definitions/tldr';
import { sniperDefinition } from './definitions/sniper';
import { omgHackerDefinition } from './definitions/omgHacker';
import { fanboyDefinition } from './definitions/fanboy';
import { inAndOutDefinition } from './definitions/inAndOut';
import { picassoDefinition } from './definitions/picasso';
import { copyAndPasteDefinition } from './definitions/copyAndPaste';
import { caughtIn4kDefinition } from './definitions/caughtIn4k';
import { ownerOfTheLobbyDefinition } from './definitions/ownerOfTheLobby';
import { myFavoriteColorIsRedDefinition } from './definitions/myFavoriteColorIsRed';
import { myEyesAreBleedingDefinition } from './definitions/myEyesAreBleeding';
import { throughThickAndThinDefinition } from './definitions/throughThickAndThin';
import { colorPickerDefinition } from './definitions/colorPicker';
import { needSomeSpaceDefinition } from './definitions/needSomeSpace';
import { alliterationDefinition } from './definitions/alliteration';
import { isThatAModDefinition } from './definitions/isThatAMod';
import { bloodlineDefinition } from './definitions/bloodline';
import { timeWasteDefinition } from './definitions/timeWaste';
import { ultimateComebackDefinition } from './definitions/ultimateComeback';
import { moggedDefinition } from './definitions/mogged';
import { smolWordsDefinition } from './definitions/smolWords';
import { bigWordDefinition } from './definitions/bigWord';
import { oneLineDefinition } from './definitions/oneLine';
import { monochromismDefinition } from './definitions/monochromism';
import { madeYouSquintDefinition } from './definitions/madeYouSquint';
import { paparazzidDefinition } from './definitions/paparazzid';
import { asCloseAsItGetsDefinition } from './definitions/asCloseAsItGets';
import { hintReflexesDefinition } from './definitions/hintReflexes';
import { noobVsProVsHackerDefinition } from './definitions/noobVsProVsHacker';
import { reflexesLikeACatDefinition } from './definitions/reflexesLikeACat';
import { dropDownDefinition } from './definitions/dropDown';
import { instaLikeDefinition } from './definitions/instaLike';
import { bulletSkribblIoDefinition } from './definitions/bulletSkribblIo';
import { deservedDefinition } from './definitions/deserved';
import { backToBackDefinition } from './definitions/backToBack';
import { solitaryDefinition } from './definitions/solitary';
import { pointsmaxxingDefinition } from './definitions/pointsmaxxing';
import { spamguessingDefinition } from './definitions/spamguessing';
import { autodrawDetectedDefinition } from './definitions/autodrawDetected';
import { blindGuessDefinition } from './definitions/blindGuess';
import { drunkVisionDefinition } from './definitions/drunkVision';
import { deafGuessDefinition } from './definitions/deafGuess';
import { transcendedDefinition } from './definitions/transcended';
import { ateAndLeftNoCrumbsDefinition } from './definitions/ateAndLeftNoCrumbs';
import { guessingOatDefinition } from './definitions/guessingOat';

export const CHALLENGE_DEFINITIONS_VERSION = '2.14.0' as const;

export const starterChallengeDefinitions: readonly AnyChallengeDefinition[] = [
  quickscopeDefinition,
  bulletSkribblIoDefinition,
  deservedDefinition,
  backToBackDefinition,
  solitaryDefinition,
  pointsmaxxingDefinition,
  spamguessingDefinition,
  autodrawDetectedDefinition,
  blindGuessDefinition,
  drunkVisionDefinition,
  deafGuessDefinition,
  betterLateThanNeverDefinition,
  coolNumberDetectedDefinition,
  tldrDefinition,
  ouchDefinition,
  sniperDefinition,
  omgHackerDefinition,
  fanboyDefinition,
  instaLikeDefinition,
  inAndOutDefinition,
  picassoDefinition,
  copyAndPasteDefinition,
  caughtIn4kDefinition,
  ownerOfTheLobbyDefinition,
  myFavoriteColorIsRedDefinition,
  myEyesAreBleedingDefinition,
  throughThickAndThinDefinition,
  colorPickerDefinition,
  needSomeSpaceDefinition,
  alliterationDefinition,
  isThatAModDefinition,
  bloodlineDefinition,
  timeWasteDefinition,
  ultimateComebackDefinition,
  moggedDefinition,
  smolWordsDefinition,
  bigWordDefinition,
  oneLineDefinition,
  monochromismDefinition,
  madeYouSquintDefinition,
  paparazzidDefinition,
  asCloseAsItGetsDefinition,
  hintReflexesDefinition,
  noobVsProVsHackerDefinition,
  reflexesLikeACatDefinition,
  dropDownDefinition,
  transcendedDefinition,
  ateAndLeftNoCrumbsDefinition,
  guessingOatDefinition
];

export const STARTER_CHALLENGE_IDS = [
  'quickscope',
  'bullet-skribbl-io',
  'deserved',
  'back-to-back',
  'solitary',
  'pointsmaxxing',
  'spamguessing',
  'autodraw-detected',
  'blind-guess',
  'drunk-vision',
  'deaf-guess',
  'better-late-than-never',
  'cool-number-detected',
  'tldr',
  'ouch',
  'sniper',
  'omg-hacker',
  'fanboy',
  'instalike',
  'in-and-out',
  'picasso',
  'copy-and-paste',
  'caught-in-4k',
  'owner-of-the-lobby',
  'my-favorite-color-is-red',
  'my-eyes-are-bleeding',
  'through-thick-and-thin',
  'color-picker',
  'need-some-space',
  'alliteration',
  'is-that-a-mod',
  'bloodline',
  'time-waste',
  'ultimate-comeback',
  'mogged',
  'smol-words',
  'big-word',
  'one-line',
  'monochromism',
  'made-you-squint',
  'paparazzid',
  'as-close-as-it-gets',
  'hint-reflexes',
  'noob-vs-pro-vs-hacker',
  'reflexes-like-a-cat',
  'drop-down',
  'transcended',
  'ate-and-left-no-crumbs',
  'guessingoat'
] as const;

export type StarterChallengeId = typeof STARTER_CHALLENGE_IDS[number];

export const starterSandboxInstanceIds = {
  quickscope: 'sandbox-field-quickscope',
  'bullet-skribbl-io': 'sandbox-field-bullet-skribbl-io',
  deserved: 'sandbox-field-deserved',
  'back-to-back': 'sandbox-field-back-to-back',
  solitary: 'sandbox-field-solitary',
  pointsmaxxing: 'sandbox-field-pointsmaxxing',
  spamguessing: 'sandbox-field-spamguessing',
  'autodraw-detected': 'sandbox-field-autodraw-detected',
  'blind-guess': 'sandbox-field-blind-guess',
  'drunk-vision': 'sandbox-field-drunk-vision',
  'deaf-guess': 'sandbox-field-deaf-guess',
  'better-late-than-never': 'sandbox-field-better-late-than-never',
  'cool-number-detected': 'sandbox-field-cool-number-detected',
  tldr: 'sandbox-field-tldr',
  ouch: 'sandbox-field-ouch',
  sniper: 'sandbox-field-sniper',
  'omg-hacker': 'sandbox-field-omg-hacker',
  fanboy: 'sandbox-field-fanboy',
  instalike: 'sandbox-field-instalike',
  'in-and-out': 'sandbox-field-in-and-out',
  picasso: 'sandbox-field-picasso',
  'copy-and-paste': 'sandbox-field-copy-and-paste',
  'caught-in-4k': 'sandbox-field-caught-in-4k',
  'owner-of-the-lobby': 'sandbox-field-owner-of-the-lobby',
  'my-favorite-color-is-red': 'sandbox-field-my-favorite-color-is-red',
  'my-eyes-are-bleeding': 'sandbox-field-my-eyes-are-bleeding',
  'through-thick-and-thin': 'sandbox-field-through-thick-and-thin',
  'color-picker': 'sandbox-field-color-picker',
  'need-some-space': 'sandbox-field-need-some-space',
  alliteration: 'sandbox-field-alliteration',
  'is-that-a-mod': 'sandbox-field-is-that-a-mod',
  bloodline: 'sandbox-field-bloodline',
  'time-waste': 'sandbox-field-time-waste',
  'ultimate-comeback': 'sandbox-field-ultimate-comeback',
  mogged: 'sandbox-field-mogged',
  'smol-words': 'sandbox-field-smol-words',
  'big-word': 'sandbox-field-big-word',
  'one-line': 'sandbox-field-one-line',
  monochromism: 'sandbox-field-monochromism',
  'made-you-squint': 'sandbox-field-made-you-squint',
  paparazzid: 'sandbox-field-paparazzid',
  'as-close-as-it-gets': 'sandbox-field-as-close-as-it-gets',
  'hint-reflexes': 'sandbox-field-hint-reflexes',
  'noob-vs-pro-vs-hacker': 'sandbox-field-noob-vs-pro-vs-hacker',
  'reflexes-like-a-cat': 'sandbox-field-reflexes-like-a-cat',
  'drop-down': 'sandbox-field-drop-down',
  transcended: 'sandbox-field-transcended',
  'ate-and-left-no-crumbs': 'sandbox-field-ate-and-left-no-crumbs',
  guessingoat: 'sandbox-field-guessingoat'
} as const satisfies Record<StarterChallengeId, string>;

interface DefinitionEngine extends Pick<
  ChallengeEnginePublicApi,
  'getDefinitionIds' | 'activate' | 'getInstance' | 'deactivate'
> {
  register(definition: AnyChallengeDefinition): void;
}

export function registerStarterChallengeDefinitions(engine: DefinitionEngine): string[] {
  const registered = new Set(engine.getDefinitionIds());
  const added: string[] = [];

  for (const definition of starterChallengeDefinitions) {
    if (registered.has(definition.id)) continue;
    engine.register(definition);
    registered.add(definition.id);
    added.push(definition.id);
  }

  return added;
}

export function activateStarterSandbox(engine: DefinitionEngine): ChallengeRuntimeSnapshot[] {
  const instances: ChallengeRuntimeSnapshot[] = [];

  for (const definition of starterChallengeDefinitions) {
    const instanceId = starterSandboxInstanceIds[definition.id as StarterChallengeId];
    const existing = engine.getInstance(instanceId);
    instances.push(existing ?? engine.activate({
      instanceId,
      challengeId: definition.id
    }));
  }

  return instances;
}

export function deactivateStarterSandbox(engine: DefinitionEngine): number {
  let removed = 0;
  for (const instanceId of Object.values(starterSandboxInstanceIds)) {
    if (engine.deactivate(instanceId, 'starter-sandbox-deactivated')) removed += 1;
  }
  return removed;
}
