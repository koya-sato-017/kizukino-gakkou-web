import {
  FiArrowUpRight,
  FiPause,
  FiPlay,
  FiRotateCcw,
  FiX,
} from "react-icons/fi";
import { formatPlaybackTime } from "./useAudioPlayer";
import type { Player } from "./useAudioPlayer";

export default function AudioPlayer({ player }: { player: Player }) {
  const {
    attachAudio,
    events,
    episode,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    speed,
    error,
    toggle,
    seek,
    changeSpeed,
    close,
  } = player;
  return (
    <>
      <audio ref={attachAudio} preload="none" {...events} />
      {episode && (
        <section className="player-dock" aria-label="放送プレーヤー">
          <div
            className={`player-art ${isPlaying ? "is-playing" : ""}`}
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="player-information">
            <p className="player-caption" aria-live="polite">
              {error
                ? "音声を確認できません"
                : isBuffering
                  ? "音声を読み込み中"
                  : isPlaying
                    ? "ただいま、再生中"
                    : "ひと休み。また、ここから。"}
            </p>
            <p
              className="player-title"
              id="player-now-title"
              title={episode.title}
            >
              {episode.title.replace(/^[【〖][^】〗]+[】〗]\s*/, "")}
            </p>
          </div>
          <div className="player-controls">
            <button
              className="player-back"
              aria-label="15秒戻る"
              onClick={() => seek(currentTime - 15)}
              disabled={!duration}
            >
              <FiRotateCcw aria-hidden="true" />
              <span>15</span>
            </button>
            <button
              className="player-toggle"
              onClick={toggle}
              aria-label={isPlaying ? "一時停止" : "再生"}
              aria-describedby="player-now-title"
            >
              {isPlaying ? (
                <FiPause aria-hidden="true" />
              ) : (
                <FiPlay aria-hidden="true" />
              )}
            </button>
            <button
              className="player-speed"
              aria-label={`再生速度 ${speed}倍。クリックして変更`}
              onClick={changeSpeed}
            >
              {speed}
              <small>×</small>
            </button>
          </div>
          <div className="player-timeline">
            <span>{formatPlaybackTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 1}
              step="1"
              value={Math.min(currentTime, duration || 0)}
              disabled={!duration}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="再生位置"
              aria-valuetext={`${formatPlaybackTime(currentTime)} / ${formatPlaybackTime(duration)}`}
            />
            <span>
              {formatPlaybackTime(duration || episode.duration_ms / 1000)}
            </span>
          </div>
          <a
            className="player-external"
            href={episode.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="再生中の放送をstand.fmで開く"
          >
            <FiArrowUpRight aria-hidden="true" />
          </a>
          <button
            className="player-close"
            onClick={close}
            aria-label="再生を終了してプレーヤーを閉じる"
          >
            <FiX aria-hidden="true" />
          </button>
          {error && (
            <p className="player-error" role="alert">
              {error}{" "}
              <a href={episode.link} target="_blank" rel="noopener noreferrer">
                stand.fmを開く <FiArrowUpRight aria-hidden="true" />
              </a>
            </p>
          )}
        </section>
      )}
    </>
  );
}
