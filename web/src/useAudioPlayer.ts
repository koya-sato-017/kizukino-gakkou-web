import { useCallback, useEffect, useRef, useState } from "react";
import type { Episode } from "./episode";

export function formatPlaybackTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const attachAudio = useCallback((element: HTMLAudioElement | null) => {
    audioRef.current = element;
  }, []);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  const start = (audio: HTMLAudioElement) => {
    setError("");
    audio.play().catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError")
        return;
      setIsPlaying(false);
      setIsBuffering(false);
      setError("再生できませんでした。stand.fmでお聴きください。");
    });
  };

  const playEpisode = (next: Episode) => {
    const audio = audioRef.current;
    if (!audio || !next.audio_url) return;
    if (episode?.id !== next.id) {
      audio.pause();
      audio.src = next.audio_url;
      audio.playbackRate = speed;
      setEpisode(next);
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>(".player-toggle")
          ?.focus({ preventScroll: true });
      });
      setCurrentTime(0);
      setDuration(0);
      setIsBuffering(true);
      start(audio);
    } else if (audio.paused) {
      start(audio);
    } else {
      audio.pause();
    }
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || !episode) return;
    if (audio.paused) start(audio);
    else audio.pause();
  };

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration));
    setCurrentTime(audio.currentTime);
  };

  const changeSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const close = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setEpisode(null);
    setIsPlaying(false);
    setIsBuffering(false);
    setError("");
  };

  return {
    attachAudio,
    episode,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    speed,
    error,
    playEpisode,
    toggle,
    seek,
    changeSpeed,
    close,
    events: {
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
      onEnded: () => setIsPlaying(false),
      onWaiting: () => setIsBuffering(true),
      onPlaying: () => setIsBuffering(false),
      onCanPlay: () => setIsBuffering(false),
      onLoadedMetadata: () => {
        const value = audioRef.current?.duration ?? 0;
        setDuration(Number.isFinite(value) ? value : 0);
      },
      onTimeUpdate: () => setCurrentTime(audioRef.current?.currentTime ?? 0),
      onError: () => {
        if (!audioRef.current?.getAttribute("src")) return;
        setIsBuffering(false);
        setIsPlaying(false);
        setError("再生できませんでした。stand.fmでお聴きください。");
      },
    },
  };
}

export type Player = ReturnType<typeof useAudioPlayer>;
