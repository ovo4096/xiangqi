export type SoundEffect = 'select' | 'confirm' | 'back' | 'move' | 'capture';

/** Rounded wooden taps; generated offline in the audio context. */
export function playEffect(context: AudioContext, kind: SoundEffect) {
  const notes = kind === 'confirm' ? [660, 880] : kind === 'back' ? [330] : kind === 'capture' ? [280, 420] : kind === 'move' ? [440] : [740];
  const isPiece = kind === 'move' || kind === 'capture';
  notes.forEach((frequency, index) => {
    const start = context.currentTime + index * (kind === 'confirm' ? .075 : .018);
    const duration = isPiece ? .14 : .09;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .48, start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(isPiece ? .22 : .07, start + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + .01);
  });
}
