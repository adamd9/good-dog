import React, { useRef, useState } from 'react';

interface Props {
  src: string;
  label?: string;
}

const AudioPlayer: React.FC<Props> = ({ src, label = 'Bark recording' }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play().catch(() => setError(true));
    }
  };

  return (
    <div className="audio-player" role="region" aria-label={label}>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
        preload="metadata"
      />
      {error ? (
        <span className="audio-player__error" role="alert">
          Audio unavailable
        </span>
      ) : (
        <button
          className="audio-player__btn"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          aria-label={playing ? 'Pause audio' : 'Play audio'}
          type="button"
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
      )}
    </div>
  );
};

export default AudioPlayer;
