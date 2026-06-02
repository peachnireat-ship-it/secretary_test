import { useEffect, useRef } from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';
import { CHINCHILLA_VIDEO_SOURCES } from '../constants/chinchillaVideos';

export const CHINCHILLA_VIDEO_W = 90;
export const CHINCHILLA_VIDEO_H = 90;

function resolveSource(mode) {
  return CHINCHILLA_VIDEO_SOURCES[mode] ?? CHINCHILLA_VIDEO_SOURCES.idle ?? null;
}

export default function ChinchillaVideo({ mode }) {
  const prevMode = useRef(mode);

  const player = useVideoPlayer(resolveSource(mode), p => {
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    const src = resolveSource(mode);
    if (!src) return;
    player.replace(src);
    player.loop = true;
    player.play();
  }, [mode, player]);

  return (
    <VideoView
      player={player}
      style={{ width: CHINCHILLA_VIDEO_W, height: CHINCHILLA_VIDEO_H }}
      nativeControls={false}
      contentFit="contain"
    />
  );
}
