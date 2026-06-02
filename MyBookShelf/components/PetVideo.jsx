import { useEffect, useRef } from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';
import { PET_VIDEO_W, PET_VIDEO_H } from '../constants/petVideos';

function resolveSource(sources, mode) {
  return sources?.[mode] ?? sources?.idle ?? null;
}

export default function PetVideo({ sources, mode, width, height }) {
  const prevMode = useRef(mode);
  const src = resolveSource(sources, mode);

  const player = useVideoPlayer(src, p => {
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    const newSrc = resolveSource(sources, mode);
    if (!newSrc) return;
    player.replace(newSrc);
    player.loop = true;
    player.play();
  }, [mode, player, sources]);

  return (
    <VideoView
      player={player}
      style={{ width: width ?? PET_VIDEO_W, height: height ?? PET_VIDEO_H }}
      nativeControls={false}
      contentFit="contain"
    />
  );
}
