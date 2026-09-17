import { randomInt, randomUUID } from 'node:crypto';
import {
  GATEWAY_SLOT_BASE_WEIGHTS,
  GATEWAY_SLOT_COIN_REWARDS,
  GATEWAY_SLOT_FREE_SPIN_REWARDS,
  GATEWAY_SLOT_ICON_IDS,
  type GatewaySlotEffectKind,
  type GatewaySlotEffectStep,
  type GatewaySlotIconId
} from '@skribbl-duels/gateway-contracts';

export const SKRIBBL_SLOTS_RULES_VERSION = 1;
export const SKRIBBL_SLOTS_REEL_COUNT = 3 as const;
export const SKRIBBL_SLOTS_SPIN_COST = 1 as const;
export const SKRIBBL_SLOTS_HEART_TARGET = 3 as const;

const EFFECT_ORDER: readonly GatewaySlotEffectKind[] = [
  'fill', 'wizard', 'eraser', 'trash', 'dice'
];
const EFFECT_IDS = new Set<GatewaySlotIconId>([...EFFECT_ORDER]);
const NON_EFFECT_IDS = GATEWAY_SLOT_ICON_IDS.filter(icon => !EFFECT_IDS.has(icon)
  && icon !== 'book' && icon !== 'slimy' && icon !== 'heart');
const DICE_IDS = [...NON_EFFECT_IDS, 'book', 'slimy', 'heart'] as const;

type SlotTriple = [GatewaySlotIconId, GatewaySlotIconId, GatewaySlotIconId];
type RandomIndex = (maximumExclusive: number) => number;

export interface GeneratedSlotOutcome {
  spinId: string;
  initialIcons: SlotTriple;
  effectSteps: GatewaySlotEffectStep[];
  finalIcons: SlotTriple;
  coinReward: number;
  baseFreeSpinReward: number;
  heartCount: number;
}

function weightedPick(
  ids: readonly GatewaySlotIconId[],
  nextIndex: RandomIndex
): GatewaySlotIconId {
  const total = ids.reduce((sum, id) => sum + GATEWAY_SLOT_BASE_WEIGHTS[id], 0);
  let selected = nextIndex(total);
  for (const id of ids) {
    selected -= GATEWAY_SLOT_BASE_WEIGHTS[id];
    if (selected < 0) return id;
  }
  return ids[ids.length - 1]!;
}

function baseIcon(nextIndex: RandomIndex): GatewaySlotIconId {
  return weightedPick(GATEWAY_SLOT_ICON_IDS, nextIndex);
}

function nonEffectIcon(nextIndex: RandomIndex): GatewaySlotIconId {
  return weightedPick(NON_EFFECT_IDS, nextIndex);
}

function diceIcon(nextIndex: RandomIndex): GatewaySlotIconId {
  return weightedPick(DICE_IDS, nextIndex);
}

function triple(values: readonly GatewaySlotIconId[]): SlotTriple {
  return [values[0]!, values[1]!, values[2]!];
}

function recordStep(
  steps: GatewaySlotEffectStep[],
  kind: GatewaySlotEffectKind,
  sourceIndex: number,
  targetIndices: number[],
  icons: SlotTriple
): void {
  steps.push({ kind, sourceIndex, targetIndices, iconsAfter: triple(icons) });
}

export function generateSlotOutcome(
  nextIndex: RandomIndex = maximumExclusive => randomInt(maximumExclusive),
  spinId: string = randomUUID()
): GeneratedSlotOutcome {
  const initialIcons: SlotTriple = [baseIcon(nextIndex), baseIcon(nextIndex), baseIcon(nextIndex)];
  const icons = triple(initialIcons);
  const effectSteps: GatewaySlotEffectStep[] = [];

  for (const kind of EFFECT_ORDER) {
    for (let sourceIndex = 0; sourceIndex < SKRIBBL_SLOTS_REEL_COUNT; sourceIndex += 1) {
      if (icons[sourceIndex] !== kind) continue;
      if (kind === 'fill') {
        const replacement = nonEffectIcon(nextIndex);
        const adjacent: number[] = [];
        if (sourceIndex > 0) adjacent.push(sourceIndex - 1);
        if (sourceIndex < SKRIBBL_SLOTS_REEL_COUNT - 1) adjacent.push(sourceIndex + 1);
        if (adjacent.length > 1 && nextIndex(2) === 1) adjacent.reverse();
        const targets = [sourceIndex, ...adjacent];
        targets.forEach(index => { icons[index] = replacement; });
        recordStep(effectSteps, kind, sourceIndex, targets, icons);
      } else if (kind === 'wizard') {
        const candidates = [0, 1, 2].filter(index => index !== sourceIndex);
        const targetIndex = candidates[nextIndex(candidates.length)]!;
        const replacement = nonEffectIcon(nextIndex);
        icons[sourceIndex] = replacement;
        icons[targetIndex] = replacement;
        recordStep(effectSteps, kind, sourceIndex, [sourceIndex, targetIndex], icons);
      } else if (kind === 'eraser') {
        icons[sourceIndex] = nonEffectIcon(nextIndex);
        recordStep(effectSteps, kind, sourceIndex, [sourceIndex], icons);
      } else if (kind === 'trash') {
        for (let index = 0; index < SKRIBBL_SLOTS_REEL_COUNT; index += 1) {
          icons[index] = nonEffectIcon(nextIndex);
        }
        recordStep(effectSteps, kind, sourceIndex, [0, 1, 2], icons);
      } else {
        icons[sourceIndex] = diceIcon(nextIndex);
        recordStep(effectSteps, kind, sourceIndex, [sourceIndex], icons);
      }
    }
  }

  const matchingIcon = icons[0] === icons[1] && icons[1] === icons[2] ? icons[0] : null;
  return {
    spinId,
    initialIcons,
    effectSteps,
    finalIcons: triple(icons),
    coinReward: matchingIcon ? GATEWAY_SLOT_COIN_REWARDS[matchingIcon] ?? 0 : 0,
    baseFreeSpinReward: matchingIcon ? GATEWAY_SLOT_FREE_SPIN_REWARDS[matchingIcon] ?? 0 : 0,
    heartCount: icons.filter(icon => icon === 'heart').length
  };
}

export const SKRIBBL_SLOTS_RULES_FOR_TESTING = {
  EFFECT_ORDER,
  NON_EFFECT_IDS,
  DICE_IDS,
  weightedPick
} as const;
