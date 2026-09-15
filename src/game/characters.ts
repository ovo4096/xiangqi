import type { Difficulty } from './engine';
import type { VoiceCharacterId } from '../audio/voiceLines';

export type Character = {
  id: VoiceCharacterId;
  name: string;
  title: string;
  difficulty: Difficulty;
  portrait: string;
  style: string;
  invitation: string;
  thinking: string;
  badge?: string;
};

export const characters: Character[] = [
  {
    id: 'a-tang', name: '阿棠', title: '棋馆学徒', difficulty: 'easy',
    portrait: './characters/a-tang.png', style: '落子轻快，喜欢主动进攻。适合轻松切磋。',
    invitation: '「别急着赢嘛，陪我再练一局！」', thinking: '让我想想，这一步怎么走……',
  },
  {
    id: 'shen-yan', name: '沈砚', title: '青衫棋客', difficulty: 'medium',
    portrait: './characters/shen-yan.png', style: '攻守均衡，善于把握局面。适合日常过招。',
    invitation: '「一杯清茶，一局好棋，请。」', thinking: '容我斟酌片刻，再与你过招。',
  },
  {
    id: 'lu-yin', name: '陆隐', title: '山中棋隐', difficulty: 'hard',
    portrait: './characters/lu-yin.png', style: '推演更深，落子审慎。适合认真挑战。',
    invitation: '「棋中有远山，落子须看远。」', thinking: '静观全局，方知下一步。',
  },
  {
    id: 'wen-yi', name: '闻弈', title: '天元棋师', difficulty: 'master', badge: '最强',
    portrait: './characters/wen-yi.png', style: '擅长连环攻防，兼顾得失与全局。落子前稍作长考，适合进阶挑战。',
    invitation: '「眼前的一子，或许连着十步之后。」', thinking: '棋有远近，让我再推演几步。',
  },
];

export const characterForDifficulty = (difficulty: Difficulty) => characters.find((character) => character.difficulty === difficulty)!;
