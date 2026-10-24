import { useState, useEffect, useMemo } from "react";
import {
  FiSearch,
  FiArrowUp,
  FiHeart,
  FiArrowUpRight,
  FiArrowRight,
  FiArrowDown,
  FiHeadphones,
  FiRadio,
  FiPlay,
  FiClock,
  FiChevronDown,
  FiX,
} from "react-icons/fi";
import BrandScene from "./BrandScene";
import "./App.css";

interface Episode {
  id: string;
  title: string;
  published: string; // YYYY-MM-DD
  published_at?: string;
  description: string;
  duration_ms: number;
  link: string;
  audio_url: string | null;
  is_supporter_only?: boolean;
}

interface EpisodeData {
  channel_id: string;
  episodes: Episode[];
  updated_at?: string;
}

function parseEpisodeData(value: unknown): EpisodeData {
  if (!value || typeof value !== "object")
    throw new Error("放送データが不正です");
  const data = value as Partial<EpisodeData>;
  if (
    typeof data.channel_id !== "string" ||
    !Array.isArray(data.episodes) ||
    data.episodes.length === 0
  ) {
    throw new Error("放送データが空、または形式が不正です");
  }
  if (
    !data.episodes.every(
      (ep) =>
        ep &&
        typeof ep.id === "string" &&
        typeof ep.title === "string" &&
        typeof ep.published === "string" &&
        typeof ep.description === "string" &&
        typeof ep.duration_ms === "number" &&
        typeof ep.link === "string" &&
        /^https:\/\/stand\.fm\/episodes\//.test(ep.link) &&
        (ep.audio_url == null ||
          (typeof ep.audio_url === "string" &&
            ep.audio_url.startsWith("https://"))),
    )
  ) {
    throw new Error("放送の形式が不正です");
  }
  return data as EpisodeData;
}

function episodeTime(episode: Episode): number {
  return Date.parse(
    episode.published_at || `${episode.published}T00:00:00+09:00`,
  );
}

interface SeriesInfo {
  name: string;
  displayName: string;
  count: number;
  episodes: Episode[];
}

// === シリーズ検出ユーティリティ ===

/** 表記揺れの正規化マップ */
const NORMALIZE_MAP: [RegExp, string][] = [
  [/事は/g, "ことは"],
  [/の事/g, "のこと"],
  [/コンビニに学べ！/g, "コンビニから学べ"],
  [/コンビニから学ぼう/g, "コンビニから学べ"],
  [/もう一度みたい/g, "もう一度観たい"],
  [/パラレルワーク（複業）革命/g, "パラレルワーク革命"],
  [/パラレルワーク革命#/g, "パラレルワーク革命"],
  [/もっとやさしいWEB\s*3/g, "もっとやさしいWEB3"],
  [/もっとやさしいWEB\s*３/g, "もっとやさしいWEB3"],
  [/2026年の必須教養/g, "2026年の「必須教養」"],
  [/SCOP文化を語る$/g, "SCOP文化を語ろう"],
  [/一緒にしてはならない$/g, "一緒にしてはならない話"],
  [/パラレルワーク（複業）への筋道/g, "パラレルワークへの筋道"],
  [/複業（パラレルワーク）/g, "複業2024"],
  [/時間泥棒に気をつけろ！/g, "時間泥棒に気をつけろ"],
];

/** シリーズ名を正規化 */
function normalizeSeriesName(name: string): string {
  let normalized = name.trim();
  for (const [pattern, replacement] of NORMALIZE_MAP) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

/** タイトルからシリーズ名を抽出 */
function extractSeriesName(title: string): string | null {
  // 【XXX】の後のテキストを取得
  const bracketMatch = title.match(/[【〖][^】〗]+[】〗](.+)/);
  if (!bracketMatch) return null;

  const content = bracketMatch[1];

  // パターン1: 「シリーズ名N〜」（末尾の数字+〜）
  const numTildeMatch = content.match(
    /^(.+?)(\d+|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])[〜～]/,
  );
  if (numTildeMatch && numTildeMatch[1].trim().length >= 4) {
    return normalizeSeriesName(numTildeMatch[1]);
  }

  // パターン2: 「シリーズ名 最終回」「シリーズ名 完結」
  const finalMatch = content.match(/^(.+?)[\s\u3000]*(最終回|完結)/);
  if (finalMatch && finalMatch[1].trim().length >= 4) {
    return normalizeSeriesName(finalMatch[1]);
  }

  return null;
}

/** 全エピソードからシリーズMapを構築 */
function buildSeriesMap(episodes: Episode[]): SeriesInfo[] {
  const map = new Map<string, Episode[]>();

  for (const ep of episodes) {
    if (ep.is_supporter_only) continue;
    const seriesName = extractSeriesName(ep.title);
    if (!seriesName) continue;

    const existing = map.get(seriesName) || [];
    existing.push(ep);
    map.set(seriesName, existing);
  }

  // 5件以上のシリーズのみ、件数が多い順にソート
  const seriesList: SeriesInfo[] = [];
  for (const [name, eps] of map.entries()) {
    if (eps.length >= 5) {
      seriesList.push({
        name,
        displayName: name,
        count: eps.length,
        episodes: eps,
      });
    }
  }

  // 各シリーズ内の最新放送日が新しい順にソート
  seriesList.sort((a, b) => {
    const latestA = a.episodes.reduce(
      (latest, ep) => (ep.published > latest ? ep.published : latest),
      "",
    );
    const latestB = b.episodes.reduce(
      (latest, ep) => (ep.published > latest ? ep.published : latest),
      "",
    );
    return latestB.localeCompare(latestA);
  });
  return seriesList;
}

function App() {
  const [data, setData] = useState<EpisodeData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAllSeries, setShowAllSeries] = useState(false);

  // お気に入り状態
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("kizukino_favorites");
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // プレイリスト状態
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [sortOldest, setSortOldest] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("kizukino_favorites", JSON.stringify(favorites));
    } catch {
      // 保存を制限するブラウザーでも、閲覧と現在の画面でのお気に入りは利用できる。
    }
  }, [favorites]);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((fId) => fId !== id) : [...prev, id],
    );
  };

  // ボタンを押すごとに12件ずつ追加表示する
  const [displayCount, setDisplayCount] = useState(12);

  // TOPに戻るボタン用のステータス
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch(import.meta.env.BASE_URL + "episodes.json", {
      cache: "no-cache",
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`読み込みエラー: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        setData(parseEpisodeData(json));
        setIsLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("エピソードの読み込みに失敗しました", err);
        setLoadError(
          "放送一覧を読み込めませんでした。時間をおいて再読み込みしてください。",
        );
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const retryLoad = () => {
    setIsLoading(true);
    setLoadError(null);
    setReloadKey((prev) => prev + 1);
  };

  // シリーズ一覧を構築
  const seriesList = useMemo(() => {
    if (!data?.episodes) return [];
    return buildSeriesMap(data.episodes);
  }, [data]);

  const filteredEpisodes = useMemo(() => {
    if (!data?.episodes) return [];

    // メンバーシップ限定放送を除外
    let filtered = data.episodes.filter((ep) => !ep.is_supporter_only);

    // お気に入り絞り込み
    if (showFavoritesOnly) {
      filtered = filtered.filter((ep) => favorites.includes(ep.id));
    }

    // プレイリスト絞り込み
    if (selectedSeries) {
      filtered = filtered.filter((ep) => {
        const seriesName = extractSeriesName(ep.title);
        return seriesName === selectedSeries;
      });
    }

    // 検索クエリによる絞り込み
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (ep) =>
          ep.title.toLowerCase().includes(lowerQuery) ||
          (ep.description && ep.description.toLowerCase().includes(lowerQuery)),
      );
    }

    // ソート
    filtered = [...filtered].sort((a, b) =>
      sortOldest
        ? episodeTime(a) - episodeTime(b)
        : episodeTime(b) - episodeTime(a),
    );

    return filtered;
  }, [
    data,
    searchQuery,
    showFavoritesOnly,
    favorites,
    selectedSeries,
    sortOldest,
  ]);

  const displayedEpisodes = useMemo(() => {
    return filteredEpisodes.slice(0, displayCount);
  }, [filteredEpisodes, displayCount]);

  const handleSelectSeries = (seriesName: string) => {
    setDisplayCount(12);
    if (selectedSeries === seriesName) {
      // 同じシリーズをクリックで解除
      setSelectedSeries(null);
      setSortOldest(false);
    } else {
      setSelectedSeries(seriesName);
      setSortOldest(true); // プレイリスト選択時は古い順がデフォルト
      setSearchQuery(""); // 検索をクリア
      setShowFavoritesOnly(false); // お気に入り絞り込みを解除
    }
  };

  const clearSeries = () => {
    setDisplayCount(12);
    setSelectedSeries(null);
    setSortOldest(false);
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}分${seconds.toString().padStart(2, "0")}秒`; // 昭和らしく日本語表記
  };

  const standfmUrl = `https://stand.fm/channels/${data?.channel_id || "606297aabe8d4428b912db34"}`;

  // 曜日を取得する（レトロな雰囲気を出すため）
  const getDayOfWeek = (dateString: string) => {
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    const d = new Date(`${dateString}T00:00:00Z`);
    return isNaN(d.getTime()) ? "" : `(${days[d.getUTCDay()]})`;
  };

  const publicCount =
    data?.episodes.filter((ep) => !ep.is_supporter_only).length || 0;
  const visibleSeries = showAllSeries ? seriesList : seriesList.slice(0, 6);
  const latestId = data?.episodes.find((ep) => !ep.is_supporter_only)?.id;

  return (
    <div className="app-container">
      <a className="skip-link" href="#episodes">
        放送一覧へ移動
      </a>
      <header className="site-header">
        <a
          className="nav-brand"
          href="#"
          onClick={scrollToTop}
          aria-label="キズキノ學校 トップへ"
        >
          <FiRadio aria-hidden="true" />
          <span>キズキノ學校</span>
        </a>
        <nav className="main-nav" aria-label="メインナビゲーション">
          <a href="#episodes">放送を探す</a>
          <a href="#series">シリーズで聴く</a>
          <a
            className="nav-external"
            href={standfmUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            stand.fm <FiArrowUpRight aria-hidden="true" />
          </a>
        </nav>
      </header>

      <section className="hero" aria-labelledby="site-title">
        <BrandScene />
        <div className="hero-inner">
          <p className="hero-eyebrow">
            <span /> 耳からひらく、学びの時間。
          </p>
          <h1 className="hero-logo" id="site-title" aria-label="キズキノ學校">
            <span className="hero-logo-top" aria-hidden="true">
              キズキ
              <span className="hero-no">
                ノ
                <svg className="sound-lines" viewBox="0 0 56 46" fill="none">
                  <path d="M8 28 5 8M24 23 29 3M39 31 52 15" />
                </svg>
              </span>
            </span>
            <span className="hero-logo-bottom" aria-hidden="true">
              <span className="logo-side">気づいて、</span>學校
              <span className="logo-side">築こう。</span>
            </span>
          </h1>
          <p className="hero-description">
            いつもの毎日に、
            <br className="mobile-break" />
            ひとつ新しい気付きを。
          </p>
          <a className="hero-cta" href="#episodes">
            <FiHeadphones aria-hidden="true" /> 放送を聴いてみる{" "}
            <span>
              <FiArrowDown aria-hidden="true" />
            </span>
          </a>
        </div>
        <div className="hand-note note-left" aria-hidden="true">
          耳をすませて。
          <svg viewBox="0 0 98 55">
            <path d="M5 5c30-2 65 8 77 35m-20-6 22 8 5-23" />
          </svg>
        </div>
        <div className="hand-note note-right" aria-hidden="true">
          気になる話、発見！
          <svg viewBox="0 0 98 55">
            <path d="M90 4C64 2 29 16 15 40m-4-20 2 23 23-5" />
          </svg>
        </div>
      </section>

      <div className="motto-strip" aria-label="キズキノ學校が大切にすること">
        <span className="motto-intro">気付きから、次の一歩へ。</span>
        <div className="motto-words">
          <span>
            <b>S</b>創造
          </span>
          <i />{" "}
          <span>
            <b>C</b>挑戦
          </span>
          <i />{" "}
          <span>
            <b>O</b>応援
          </span>
          <i />{" "}
          <span>
            <b>P</b>称賛
          </span>
        </div>
      </div>

      <main className="main-content" id="episodes">
        <section className="library-intro" aria-labelledby="library-title">
          <div>
            <p className="eyebrow">THE EPISODE LIBRARY</p>
            <h2 id="library-title">放送を、探そう。</h2>
            <p className="section-lead">
              気になる言葉から。好きなテーマから。
              <br className="mobile-break" />
              今日のあなたに、ぴったりの話を。
            </p>
          </div>
          <div
            className="library-total"
            aria-label={`公開放送 ${publicCount}話`}
          >
            <FiRadio aria-hidden="true" />
            <div>
              <span>公開中の放送</span>
              <p>
                {isLoading ? "—" : publicCount.toLocaleString()}
                <small>話</small>
              </p>
            </div>
          </div>
        </section>

        <div className="search-tools">
          <div className="search-container">
            <FiSearch aria-hidden="true" />
            <input
              id="episode-search"
              type="search"
              className="search-input"
              placeholder="タイトルや、気になる言葉を入力"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setDisplayCount(12);
              }}
              aria-label="放送のタイトル・概要を検索"
            />
          </div>
          <button
            className={`favorite-filter-btn ${showFavoritesOnly ? "active" : ""}`}
            aria-pressed={showFavoritesOnly}
            onClick={() => {
              setShowFavoritesOnly(!showFavoritesOnly);
              setDisplayCount(12);
            }}
          >
            <FiHeart
              aria-hidden="true"
              fill={showFavoritesOnly ? "currentColor" : "none"}
            />
            お気に入り
            <span>{favorites.length}</span>
          </button>
        </div>

        {!isLoading && !loadError && seriesList.length > 0 && (
          <section
            className="series-section"
            id="series"
            aria-labelledby="series-title"
          >
            <div className="section-heading">
              <div>
                <span className="section-index">SERIES</span>
                <h2 id="series-title">シリーズで、じっくり。</h2>
              </div>
              <button
                className="text-button"
                aria-expanded={showAllSeries}
                onClick={() => setShowAllSeries(!showAllSeries)}
              >
                {showAllSeries ? "閉じる" : "すべて見る"}
                <FiChevronDown
                  className={showAllSeries ? "flipped" : ""}
                  aria-hidden="true"
                />
              </button>
            </div>
            <div className="series-grid">
              {visibleSeries.map((series, index) => (
                <button
                  key={series.name}
                  className={`series-card series-color-${index % 3} ${selectedSeries === series.name ? "active" : ""}`}
                  onClick={() => handleSelectSeries(series.name)}
                  aria-pressed={selectedSeries === series.name}
                >
                  <span className="series-name">{series.displayName}</span>
                  <span className="series-card-bottom">
                    <span>全{series.count}話</span>
                    <FiArrowUpRight aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="results-section" aria-labelledby="results-title">
          <div className="results-heading">
            <div>
              <span className="section-index">
                {showFavoritesOnly
                  ? "YOUR FAVORITES"
                  : selectedSeries
                    ? "SELECTED SERIES"
                    : "ON AIR"}
              </span>
              <h2 id="results-title">
                {showFavoritesOnly
                  ? "お気に入りの放送"
                  : selectedSeries ||
                    (searchQuery
                      ? "気になる話、ありましたか？"
                      : "新しい放送から、どうぞ。")}
              </h2>
            </div>
            <label className="sort-control">
              <span className="sr-only">放送の並び順</span>
              <select
                value={sortOldest ? "oldest" : "newest"}
                onChange={(e) => {
                  setSortOldest(e.target.value === "oldest");
                  setDisplayCount(12);
                }}
              >
                <option value="newest">新しい順</option>
                <option value="oldest">古い順</option>
              </select>
              <FiChevronDown aria-hidden="true" />
            </label>
          </div>
          {selectedSeries && (
            <div className="selected-series">
              <span>シリーズを選択中</span>
              <button onClick={clearSeries}>
                選択を解除 <FiX aria-hidden="true" />
              </button>
            </div>
          )}
          {!isLoading && !loadError && (
            <p className="results-count" aria-live="polite">
              {searchQuery && <span>「{searchQuery}」の検索結果 </span>}
              <strong>{filteredEpisodes.length.toLocaleString()}</strong>話
              {searchQuery && (
                <span> / 全{publicCount.toLocaleString()}話</span>
              )}
            </p>
          )}

          {loadError ? (
            <div role="alert" className="empty-state">
              <FiRadio aria-hidden="true" />
              <h3>うまく、受信できませんでした。</h3>
              <p>{loadError}</p>
              <button className="outline-button" onClick={retryLoad}>
                再読み込み <FiArrowRight aria-hidden="true" />
              </button>
              <a href={standfmUrl} target="_blank" rel="noopener noreferrer">
                stand.fmで放送を見る <FiArrowUpRight aria-hidden="true" />
              </a>
            </div>
          ) : isLoading ? (
            <div className="empty-state" role="status">
              <FiRadio className="loading-icon" aria-hidden="true" />
              <p>放送を受信しています…</p>
            </div>
          ) : (
            <>
              <div className="episode-list" id="episode-list">
                {displayedEpisodes.map((ep) => {
                  const label = ep.title.match(/^[【〖]([^】〗]+)[】〗]/)?.[1];
                  const title = label
                    ? ep.title.replace(/^[【〖][^】〗]+[】〗]\s*/, "")
                    : ep.title;
                  const isLatest = ep.id === latestId;
                  const isFavorite = favorites.includes(ep.id);
                  return (
                    <article
                      key={ep.id}
                      className={`episode-card ${isLatest ? "is-latest" : ""}`}
                    >
                      <div className="card-topline">
                        <span className="episode-category">
                          {label || "キズキノ學校"}
                        </span>
                        {isLatest && (
                          <span className="new-label">
                            <i />
                            新着
                          </span>
                        )}
                        <button
                          className={`favorite-btn ${isFavorite ? "active" : ""}`}
                          onClick={(e) => toggleFavorite(ep.id, e)}
                          aria-pressed={isFavorite}
                          aria-label={`「${ep.title}」を${isFavorite ? "お気に入りから外す" : "お気に入りに追加"}`}
                        >
                          <FiHeart
                            aria-hidden="true"
                            fill={isFavorite ? "currentColor" : "none"}
                          />
                        </button>
                      </div>
                      <div className="episode-meta">
                        <time dateTime={ep.published}>
                          {ep.published} {getDayOfWeek(ep.published)}
                        </time>
                        {ep.duration_ms > 0 && (
                          <span>
                            <FiClock aria-hidden="true" />
                            {formatDuration(ep.duration_ms)}
                          </span>
                        )}
                      </div>
                      <h3 className="episode-title">{title}</h3>
                      <p
                        className={`episode-description ${!ep.description ? "description-pending" : ""}`}
                      >
                        {ep.description ||
                          "放送の詳しい内容は、stand.fmでご覧いただけます。"}
                      </p>
                      <div className="card-listen">
                        {ep.audio_url ? (
                          <audio
                            controls
                            className="audio-player"
                            src={ep.audio_url}
                            preload="none"
                            aria-label={`「${ep.title}」の音声`}
                            onPlay={(event) => {
                              const current = event.currentTarget;
                              document
                                .querySelectorAll("audio")
                                .forEach((audio) => {
                                  if (audio !== current) audio.pause();
                                });
                            }}
                          />
                        ) : (
                          <a
                            className="audio-fallback"
                            href={ep.link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FiPlay aria-hidden="true" />
                            stand.fmで再生する
                            <FiArrowUpRight aria-hidden="true" />
                          </a>
                        )}
                      </div>
                      <footer className="episode-actions">
                        <a
                          href={ep.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          stand.fmで聴く <FiArrowUpRight aria-hidden="true" />
                        </a>
                      </footer>
                    </article>
                  );
                })}
              </div>
              {filteredEpisodes.length === 0 && (
                <div className="empty-state">
                  <FiSearch aria-hidden="true" />
                  <h3>
                    {showFavoritesOnly
                      ? "お気に入りは、これから。"
                      : "その言葉では、見つかりませんでした。"}
                  </h3>
                  <p>
                    {showFavoritesOnly
                      ? "気になった放送のハートを押して、あなただけの棚をつくりましょう。"
                      : "別の言葉で、もう一度探してみてください。"}
                  </p>
                </div>
              )}
              {filteredEpisodes.length > 0 && (
                <div className="loading-more">
                  <p className="display-count" role="status">
                    {displayedEpisodes.length.toLocaleString()} /{" "}
                    {filteredEpisodes.length.toLocaleString()}話を表示
                  </p>
                  {displayCount < filteredEpisodes.length && (
                    <button
                      className="outline-button"
                      aria-controls="episode-list"
                      onClick={() =>
                        setDisplayCount((prev) =>
                          Math.min(prev + 12, filteredEpisodes.length),
                        )
                      }
                    >
                      さらに放送を読み込む
                      <FiArrowDown aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <aside className="library-notice">
          <FiRadio aria-hidden="true" />
          <div>
            <strong>毎日の気付きを、ここから。</strong>
            <p>
              放送を1時間ごとに確認して、このライブラリーにお届けしています。
              <br />
              メンバーシップ限定放送は、stand.fmでお楽しみください。
            </p>
            {data?.updated_at && (
              <p className="update-status">
                最終取得:{" "}
                <time dateTime={data.updated_at}>
                  {new Date(data.updated_at).toLocaleString("sv-SE", {
                    timeZone: "Asia/Tokyo",
                  })}
                </time>{" "}
                (日本時間)
              </p>
            )}
          </div>
        </aside>
      </main>

      <footer className="site-footer" id="about">
        <div className="footer-top">
          <div>
            <p className="eyebrow">LISTEN. LEARN. DISCOVER.</p>
            <a className="footer-brand" href="#" onClick={scrollToTop}>
              キズキノ學校
            </a>
            <p>気づいて、築こう。</p>
          </div>
          <a
            className="footer-channel"
            href={standfmUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FiHeadphones aria-hidden="true" />
            <span>
              本日の放送も、
              <br />
              stand.fmで。
            </span>
            <FiArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} キズキノ學校</span>
          <p>お気に入りは、このブラウザーに保存されます。</p>
          <a href="#" onClick={scrollToTop}>
            ページの先頭へ <FiArrowUp aria-hidden="true" />
          </a>
        </div>
      </footer>
      {showScrollTop && (
        <button
          className="scroll-to-top"
          onClick={scrollToTop}
          aria-label="トップへ戻る"
        >
          <FiArrowUp aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default App;
