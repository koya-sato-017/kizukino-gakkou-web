import { useState, useEffect, useMemo, useRef } from 'react'
import { FiSearch, FiExternalLink, FiArrowUp, FiHeart } from 'react-icons/fi'
import './App.css'

interface Episode {
  id: string;
  title: string;
  published: string; // YYYY-MM-DD
  description: string;
  duration_ms: number;
  link: string;
  audio_url: string | null;
  is_supporter_only?: boolean;
}

interface EpisodeData {
  channel_id: string;
  episodes: Episode[];
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
  [/事は/g, 'ことは'],
  [/の事/g, 'のこと'],
  [/コンビニに学べ！/g, 'コンビニから学べ'],
  [/コンビニから学ぼう/g, 'コンビニから学べ'],
  [/もう一度みたい/g, 'もう一度観たい'],
  [/パラレルワーク（複業）革命/g, 'パラレルワーク革命'],
  [/パラレルワーク革命#/g, 'パラレルワーク革命'],
  [/もっとやさしいWEB\s*3/g, 'もっとやさしいWEB3'],
  [/もっとやさしいWEB\s*３/g, 'もっとやさしいWEB3'],
  [/2026年の必須教養/g, '2026年の「必須教養」'],
  [/SCOP文化を語る$/g, 'SCOP文化を語ろう'],
  [/一緒にしてはならない$/g, '一緒にしてはならない話'],
  [/パラレルワーク（複業）への筋道/g, 'パラレルワークへの筋道'],
  [/複業（パラレルワーク）/g, '複業2024'],
  [/時間泥棒に気をつけろ！/g, '時間泥棒に気をつけろ'],
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
  const bracketMatch = title.match(/【[^】]+】(.+)/);
  if (!bracketMatch) return null;

  const content = bracketMatch[1];

  // パターン1: 「シリーズ名N〜」（末尾の数字+〜）
  const numTildeMatch = content.match(/^(.+?)(\d+|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])[〜～]/);
  if (numTildeMatch && numTildeMatch[1].trim().length >= 4) {
    return normalizeSeriesName(numTildeMatch[1]);
  }

  // パターン2: 「シリーズ名 最終回」「シリーズ名 完結」
  const finalMatch = content.match(/^(.+?)[\s　]*(最終回|完結)/);
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
    const latestA = a.episodes.reduce((latest, ep) => ep.published > latest ? ep.published : latest, '');
    const latestB = b.episodes.reduce((latest, ep) => ep.published > latest ? ep.published : latest, '');
    return latestB.localeCompare(latestA);
  });
  return seriesList;
}

function App() {
  const [data, setData] = useState<EpisodeData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // お気に入り状態
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kizukino_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // プレイリスト状態
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [sortOldest, setSortOldest] = useState(false);

  useEffect(() => {
    localStorage.setItem('kizukino_favorites', JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites(prev =>
      prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id]
    );
  };

  // 無限スクロール用のステータス
  const [displayCount, setDisplayCount] = useState(12);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // TOPに戻るボタン用のステータス
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'episodes.json')
      .then(res => res.json())
      .then(json => {
        setData(json);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("エピソードの読み込みに失敗しました", err);
        setIsLoading(false);
      });
  }, []);

  // シリーズ一覧を構築
  const seriesList = useMemo(() => {
    if (!data?.episodes) return [];
    return buildSeriesMap(data.episodes);
  }, [data]);

  const filteredEpisodes = useMemo(() => {
    if (!data?.episodes) return [];

    // メンバーシップ限定放送を除外
    let filtered = data.episodes.filter(ep => !ep.is_supporter_only);

    // お気に入り絞り込み
    if (showFavoritesOnly) {
      filtered = filtered.filter(ep => favorites.includes(ep.id));
    }

    // プレイリスト絞り込み
    if (selectedSeries) {
      filtered = filtered.filter(ep => {
        const seriesName = extractSeriesName(ep.title);
        return seriesName === selectedSeries;
      });
    }

    // 検索クエリによる絞り込み
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(ep =>
        ep.title.toLowerCase().includes(lowerQuery) ||
        (ep.description && ep.description.toLowerCase().includes(lowerQuery))
      );
    }

    // ソート
    if (sortOldest) {
      filtered = [...filtered].sort((a, b) => a.published.localeCompare(b.published));
    }

    return filtered;
  }, [data, searchQuery, showFavoritesOnly, favorites, selectedSeries, sortOldest]);

  const displayedEpisodes = useMemo(() => {
    return filteredEpisodes.slice(0, displayCount);
  }, [filteredEpisodes, displayCount]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && displayCount < filteredEpisodes.length) {
          setIsFetchingMore(true);
          setTimeout(() => {
            setDisplayCount(prev => prev + 12);
            setIsFetchingMore(false);
          }, 800);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    return () => observer.disconnect();
  }, [displayCount, filteredEpisodes.length]);

  useEffect(() => {
    setDisplayCount(12);
  }, [searchQuery, showFavoritesOnly, selectedSeries, sortOldest]);

  const handleSelectSeries = (seriesName: string) => {
    if (selectedSeries === seriesName) {
      // 同じシリーズをクリックで解除
      setSelectedSeries(null);
      setSortOldest(false);
    } else {
      setSelectedSeries(seriesName);
      setSortOldest(true); // プレイリスト選択時は古い順がデフォルト
      setSearchQuery(''); // 検索をクリア
      setShowFavoritesOnly(false); // お気に入り絞り込みを解除
    }
  };

  const clearSeries = () => {
    setSelectedSeries(null);
    setSortOldest(false);
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}分${seconds.toString().padStart(2, '0')}秒`; // 昭和らしく日本語表記
  };

  const standfmUrl = `https://stand.fm/channels/${data?.channel_id || '606297aabe8d4428b912db34'}`;

  // 曜日を取得する（レトロな雰囲気を出すため）
  const getDayOfWeek = (dateString: string) => {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? '' : `（${days[d.getDay()]}）`;
  };

  // プレイリスト一覧のスクロール用
  const playlistScrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-container">
          <a href="#" onClick={scrollToTop} className="logo-link">
            <img src={import.meta.env.BASE_URL + 'logo_02.png'} alt="キズキノ學校" className="logo-image" />
          </a>
        </div>
        <h1 className="visually-hidden">キズキノ學校</h1>

        <div className="hero-container">
          <div className="hero-copy">
            <span className="copy-en">Let's Begin！</span>
            <span className="copy-jp">とにかく、なにかを始めよう！</span>
          </div>

          <div className="motto-group">
            <div className="motto-item">
              <span className="motto-alpha">S</span>
              <span className="motto-jp">創造</span>
            </div>
            <div className="motto-item">
              <span className="motto-alpha">C</span>
              <span className="motto-jp">挑戦</span>
            </div>
            <div className="motto-item">
              <span className="motto-alpha">O</span>
              <span className="motto-jp">応援</span>
            </div>
            <div className="motto-item">
              <span className="motto-alpha">P</span>
              <span className="motto-jp">称賛</span>
            </div>
          </div>

          <div className="hero-actions">
            <a href={standfmUrl} target="_blank" rel="noopener noreferrer" className="hero-btn-light">
              stand.fmで聴く
            </a>
          </div>

          <div className="scroll-indicator">
            <span className="scroll-text">SCROLL</span>
            <div className="scroll-line"></div>
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* プレイリスト（シリーズ一覧）セクション */}
        {!isLoading && seriesList.length > 0 && (
          <section className="playlist-section">
            <h2 className="playlist-heading">📚 シリーズで聴く</h2>
            <div className="playlist-scroll-wrapper">
              <div className="playlist-scroll" ref={playlistScrollRef}>
                {seriesList.map(series => (
                  <button
                    key={series.name}
                    className={`playlist-card ${selectedSeries === series.name ? 'active' : ''}`}
                    onClick={() => handleSelectSeries(series.name)}
                  >
                    <span className="playlist-card-name">{series.displayName}</span>
                    <span className="playlist-card-count">全{series.count}話</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* プレイリスト選択中のバナー */}
        {selectedSeries && (
          <div className="playlist-active-banner">
            <div className="playlist-active-info">
              <span className="playlist-active-label">📻 シリーズ再生中</span>
              <span className="playlist-active-name">{selectedSeries}</span>
              <span className="playlist-active-count">{filteredEpisodes.length}話</span>
            </div>
            <div className="playlist-active-actions">
              <button
                className={`sort-toggle-btn ${sortOldest ? 'active' : ''}`}
                onClick={() => setSortOldest(!sortOldest)}
              >
                {sortOldest ? '古い順 ↑' : '新しい順 ↓'}
              </button>
              <button className="playlist-close-btn" onClick={clearSeries}>
                ✕ 解除
              </button>
            </div>
          </div>
        )}

        <div className="search-container">
          <FiSearch className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="キーワードで探す..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-controls" style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
          <button
            className={`favorite-filter-btn ${showFavoritesOnly ? 'active' : ''}`}
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          >
            <FiHeart className="filter-heart-icon" fill={showFavoritesOnly ? "currentColor" : "none"} />
            {showFavoritesOnly ? "お気に入りのみ表示中" : "お気に入りで絞り込む"}
          </button>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '4rem', fontWeight: 800 }}>
            読込中... しばらくお待ちください
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center' }}>
              <div className="stats">
                全 {filteredEpisodes.length} 話 見つかりました
                {searchQuery && ` (全体 ${data?.episodes.filter(ep => !ep.is_supporter_only).length} 話中)`}
              </div>
            </div>

            <div className="episode-list">
              {displayedEpisodes.map((ep, index) => (
                <article key={ep.id} className="episode-card">
                  {/* 値札シール風の装飾（最新話のみ、プレイリスト未選択時） */}
                  {index === 0 && !searchQuery && !selectedSeries && (
                    <div className="price-tag">最新<br />放送</div>
                  )}

                  {/* プレイリスト選択時はエピソード番号を表示 */}
                  {selectedSeries && (
                    <div className="episode-number">#{index + 1}</div>
                  )}

                  <header className="episode-header">
                    <div className="episode-title-row">
                      <div className="episode-title-wrap">
                        <h2 className="episode-title">{ep.title}</h2>
                      </div>
                      <button
                        className={`favorite-btn ${favorites.includes(ep.id) ? 'active' : ''}`}
                        onClick={(e) => toggleFavorite(ep.id, e)}
                        aria-label="お気に入り"
                      >
                        <FiHeart fill={favorites.includes(ep.id) ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <div className="episode-meta">
                      <span className="meta-item caption">
                        {ep.published.replace(/-/g, '/')} {getDayOfWeek(ep.published)}
                      </span>
                      {ep.duration_ms > 0 && (
                        <span className="meta-item caption">
                          {formatDuration(ep.duration_ms)}
                        </span>
                      )}
                    </div>
                  </header>

                  {ep.description && (
                    <div className="episode-description">
                      {ep.description}
                    </div>
                  )}

                  {ep.audio_url && (
                    <audio
                      controls
                      className="audio-player"
                      src={ep.audio_url}
                      preload="none"
                    />
                  )}

                  <footer className="episode-actions">
                    <a
                      href={ep.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="action-btn"
                    >
                      アプリで開く <FiExternalLink />
                    </a>
                  </footer>
                </article>
              ))}

              {filteredEpisodes.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '6rem 1rem', gridColumn: '1 / -1', fontWeight: 800 }}>
                  {selectedSeries
                    ? `「${selectedSeries}」シリーズの放送は見つかりませんでした。`
                    : `「${searchQuery}」の放送は、見つかりませんでした。`
                  }
                </div>
              )}
            </div>

            {/* 無限スクロールのローディング（電球風） */}
            {displayCount < filteredEpisodes.length && (
              <div ref={observerTarget} className="loading-more">
                {isFetchingMore ? (
                  <div className="spinner"></div>
                ) : (
                  <div style={{ height: '40px' }}></div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <footer style={{ textAlign: 'center', marginTop: 'var(--space-8)', padding: 'var(--space-6) 0', color: 'var(--color-text-tertiary)', fontSize: '0.85rem', borderTop: '4px solid var(--color-border-dark)', fontWeight: 800 }}>
        &copy; {new Date().getFullYear()} キズキノ學校
      </footer>

      {/* TOPへ戻るボタン */}
      {showScrollTop && (
        <button className="scroll-to-top" onClick={scrollToTop} aria-label="トップへ戻る">
          <FiArrowUp />
          <span>TOP</span>
        </button>
      )}
    </div>
  )
}

export default App
