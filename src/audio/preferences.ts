export function musicPreferences() {
  try {
    const storedVolume = localStorage.getItem('yijing.music.volume');
    const parsedVolume = storedVolume === null ? 0.35 : Number(storedVolume);
    return {
      enabled: localStorage.getItem('yijing.music.enabled') !== 'false',
      volume: Number.isFinite(parsedVolume) ? Math.min(1, Math.max(0, parsedVolume)) : 0.35,
    };
  } catch {
    return { enabled: true, volume: 0.35 };
  }
}

export function saveMusicPreferences(enabled: boolean, volume: number) {
  try {
    localStorage.setItem('yijing.music.enabled', String(enabled));
    localStorage.setItem('yijing.music.volume', String(volume));
  } catch { /* Playback also works when device preference storage is unavailable. */ }
}
