import type { Mood } from '../audio/reactions';

export function CharacterPortrait({ id, name, mood, speaking, reactionKey }: { id: string; name: string; mood: Mood; speaking: boolean; reactionKey: number }) {
  const expression = ['happy', 'win', 'confident'].includes(mood) ? 'joy' : ['regret', 'lose', 'concerned'].includes(mood) ? 'regret' : 'neutral';
  return <div className={`portrait-stage mood-${mood} ${speaking ? 'is-speaking' : ''}`} data-mood={mood} data-expression={expression}>
    <div className="portrait-aura" aria-hidden="true" />
    <div className={`mood-portrait motion-${mood}`} key={`${id}-${reactionKey}`}>
      {(['neutral', 'joy', 'regret'] as const).map((face) => <img key={face} className={`portrait-layer ${expression === face ? 'is-visible' : ''}`} src={`./characters/${id}${face === 'neutral' ? '' : `-${face}`}.png`} alt={expression === face ? `${name}的${face === 'joy' ? '喜悦' : face === 'regret' ? '懊恼' : '平静'}神态` : ''} aria-hidden={expression !== face} draggable={false} />)}
    </div>
    <div className="portrait-shade" aria-hidden="true" />
    <span className="portrait-caption">以 棋 会 友</span>
    <div className="portrait-sparks" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</div>
    {speaking && <span className="speaking-indicator" aria-label="角色正在说话"><i /><i /><i /><i /></span>}
  </div>;
}
