import type { ChallengeDefinitionSummary } from '@skribbl-duels/challenge-engine';
import type {
  ChallengeCapability,
  ChallengeManifestEntry,
  ChallengeManifestSnapshot,
  ChallengeManifestSource,
  DuelFormat
} from './types';

interface ManifestOverride {
  capabilities?: readonly ChallengeCapability[];
  conflictKeys?: readonly string[];
  overlapGroups?: readonly string[];
  tags?: readonly string[];
  formats?: readonly DuelFormat[];
}

const WORD_LIST_IDS = new Set([
  'mogged',
  'smol-words',
  'big-word',
  'spamguessing'
]);

const TYPO_CHALLENGE_IDS = new Set([
  'blind-guess',
  'drunk-vision',
  'deaf-guess'
]);

const TYPO_DROP_IDS = new Set([
  'reflexes-like-a-cat',
  'drop-down'
]);

const FAST_GUESS_IDS = new Set([
  'quickscope',
  'bullet-skribbl-io',
  'better-late-than-never',
  'ouch',
  'as-close-as-it-gets',
  'hint-reflexes'
]);

const overrides: Readonly<Record<string, ManifestOverride>> = {
  'blind-guess': {
    conflictKeys: ['primary-visual-obstruction'],
    overlapGroups: ['typo-guess-modifier'],
    tags: ['typo', 'visual-obstruction']
  },
  'drunk-vision': {
    conflictKeys: ['primary-visual-obstruction'],
    overlapGroups: ['typo-guess-modifier'],
    tags: ['typo', 'visual-obstruction']
  },
  'deaf-guess': {
    overlapGroups: ['typo-guess-modifier'],
    tags: ['typo', 'information-obstruction']
  },
  'reflexes-like-a-cat': {
    tags: ['typo', 'drop']
  },
  'drop-down': {
    tags: ['typo', 'drop']
  },
  'autodraw-detected': {
    capabilities: ['skribbl-telemetry', 'typo', 'typo-image-lab'],
    tags: ['typo', 'image-lab']
  }
};

function localizedText(definition: ChallengeDefinitionSummary, language: string): {
  name: string;
  description: string;
} {
  const localized = definition.metadata.localization[language]
    ?? definition.metadata.localization.en
    ?? Object.values(definition.metadata.localization)[0];
  return {
    name: localized?.name ?? definition.id,
    description: localized?.description ?? ''
  };
}

function capabilitiesFor(id: string): readonly ChallengeCapability[] {
  const custom = overrides[id]?.capabilities;
  if (custom) return custom;

  const capabilities: ChallengeCapability[] = ['skribbl-telemetry'];
  if (WORD_LIST_IDS.has(id)) capabilities.push('official-word-list');
  if (TYPO_CHALLENGE_IDS.has(id)) capabilities.push('typo', 'typo-challenges');
  if (TYPO_DROP_IDS.has(id)) capabilities.push('typo', 'typo-drops');
  return capabilities;
}

function overlapGroupsFor(id: string): readonly string[] {
  const groups = [...(overrides[id]?.overlapGroups ?? [])];
  if (FAST_GUESS_IDS.has(id)) groups.push('fast-guess');
  return [...new Set(groups)];
}

export function createChallengeManifest(
  source: ChallengeManifestSource,
  language = 'en',
  now = Date.now()
): ChallengeManifestSnapshot {
  const entries = source.definitions.map(definition => {
    const text = localizedText(definition, language);
    const override = overrides[definition.id];
    const formats = override?.formats
      ?? (definition.metadata.rankedEligible ? ['casual', 'ranked'] : ['casual']);

    const entry: ChallengeManifestEntry = {
      id: definition.id,
      definitionVersion: definition.version,
      name: text.name,
      description: text.description,
      category: definition.metadata.category,
      difficulty: definition.metadata.difficulty,
      rankedEligible: definition.metadata.rankedEligible,
      formats,
      capabilities: capabilitiesFor(definition.id),
      conflictKeys: override?.conflictKeys ?? [],
      overlapGroups: overlapGroupsFor(definition.id),
      tags: override?.tags ?? []
    };
    return entry;
  });

  return {
    manifestVersion: 1,
    createdAt: now,
    definitionsVersion: source.definitionsVersion,
    entries
  };
}
