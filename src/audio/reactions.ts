import { voiceLines, type VoiceCharacterId, type VoiceEvent, type VoiceLine } from './voiceLines';

export type Mood = 'calm' | 'thinking' | 'confident' | 'concerned' | 'happy' | 'regret' | 'win' | 'lose';
export const reactionMood: Record<VoiceEvent, Mood> = {
  intro: 'confident', capture: 'happy', lost: 'regret', strongCapture: 'happy',
  strongLost: 'regret', thinking: 'thinking', win: 'win', lose: 'lose', undo: 'calm',
};
export const moodLabels: Record<Mood, string> = {
  calm: '静候落子', thinking: '凝神思索', confident: '从容自若', concerned: '稍显凝重',
  happy: '喜上眉梢', regret: '懊恼片刻', win: '欣然一笑', lose: '甘拜下风',
};
export const voicePriority: Record<VoiceEvent, number> = {
  thinking: 0, intro: 1, undo: 1, capture: 2, lost: 2, strongCapture: 3, strongLost: 3, win: 4, lose: 4,
};

/** Every line in a category gets a turn before repeats; adjacent cycles also differ. */
export function createLinePicker(random = Math.random) {
  const bags = new Map<string, VoiceLine[]>();
  const last = new Map<string, string>();
  return (character: VoiceCharacterId, event: VoiceEvent): VoiceLine => {
    const key = `${character}:${event}`;
    let bag = bags.get(key);
    if (!bag?.length) {
      bag = [...voiceLines[character][event]];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag.at(-1)!.src === last.get(key)) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      bags.set(key, bag);
    }
    const line = bag.pop()!;
    last.set(key, line.src);
    return line;
  };
}
