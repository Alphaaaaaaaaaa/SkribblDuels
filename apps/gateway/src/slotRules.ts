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

export const SKRIBBL_SLOTS_RULES_VERSION = 2;
export const SKRIBBL_SLOTS_REEL_COUNT = 3 as const;
export const SKRIBBL_SLOTS_SPIN_COST = 1 as const;
export const SKRIBBL_SLOTS_HEART_TARGET = 3 as const;

const EFFECT_ORDER: readonly GatewaySlotEffectKind[] = [
  'fill', 'wizard', 'eraser', 'trash', 'dice'
];
const COIN_REWARD_IDS = [
  'skribbl-coin', '7', 'trophy', 'crown', 'pen', 'skribbl-duels-logo',
  'potion', 'drop', 'pizza', 'pumpkin', 'eggplant', 'pineapple', 'peach', 'ribbon'
] as const satisfies readonly GatewaySlotIconId[];
const PROFITABLE_IDS = ['book', 'slimy', ...COIN_REWARD_IDS] as const;
const DICE_IDS = ['book', 'slimy', 'heart', ...COIN_REWARD_IDS] as const;
const CASCADE_IDS = DICE_IDS;

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

function profitableIcon(nextIndex: RandomIndex): GatewaySlotIconId {
  return weightedPick(PROFITABLE_IDS, nextIndex);
}

function diceIcon(nextIndex: RandomIndex): GatewaySlotIconId {
  return weightedPick(DICE_IDS, nextIndex);
}

function cascadeIcon(nextIndex: RandomIndex): GatewaySlotIconId {
  return weightedPick(CASCADE_IDS, nextIndex);
}

function rewardRank(icon: GatewaySlotIconId): number {
  if (icon === 'slimy') return GATEWAY_SLOT_FREE_SPIN_REWARDS.slimy ?? 0;
  if (icon === 'book') return GATEWAY_SLOT_FREE_SPIN_REWARDS.book ?? 0;
  if (icon === 'heart') return 1 / SKRIBBL_SLOTS_HEART_TARGET;
  return GATEWAY_SLOT_COIN_REWARDS[icon] ?? 0;
}

function lowerRewardTarget(
  icons: SlotTriple,
  sourceIndex: number,
  nextIndex: RandomIndex
): number {
  const candidates = [0, 1, 2].filter(index => index !== sourceIndex);
  const minimum = Math.min(...candidates.map(index => rewardRank(icons[index]!)));
  const lowest = candidates.filter(index => rewardRank(icons[index]!) === minimum);
  return lowest.length === 1 ? lowest[0]! : lowest[nextIndex(lowest.length)]!;
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
        const replacement = profitableIcon(nextIndex);
        const adjacent: number[] = [];
        if (sourceIndex > 0) adjacent.push(sourceIndex - 1);
        if (sourceIndex < SKRIBBL_SLOTS_REEL_COUNT - 1) adjacent.push(sourceIndex + 1);
        if (adjacent.length > 1 && nextIndex(2) === 1) adjacent.reverse();
        const targets = [sourceIndex, ...adjacent];
        targets.forEach(index => { icons[index] = replacement; });
        recordStep(effectSteps, kind, sourceIndex, targets, icons);
      } else if (kind === 'wizard') {
        const targetIndex = lowerRewardTarget(icons, sourceIndex, nextIndex);
        const replacement = profitableIcon(nextIndex);
        icons[sourceIndex] = replacement;
        icons[targetIndex] = replacement;
        recordStep(effectSteps, kind, sourceIndex, [sourceIndex, targetIndex], icons);
      } else if (kind === 'eraser') {
        icons[sourceIndex] = cascadeIcon(nextIndex);
        recordStep(effectSteps, kind, sourceIndex, [sourceIndex], icons);
      } else if (kind === 'trash') {
        for (let index = 0; index < SKRIBBL_SLOTS_REEL_COUNT; index += 1) {
          icons[index] = cascadeIcon(nextIndex);
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
  COIN_REWARD_IDS,
  PROFITABLE_IDS,
  DICE_IDS,
  CASCADE_IDS,
  lowerRewardTarget,
  rewardRank,
  weightedPick
} as const;
