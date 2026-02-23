import { useState, useEffect, useMemo, useRef } from 'react'
import { FiSearch, FiExternalLink, FiArrowUp } from 'react-icons/fi'
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

function App() {
  const [data, setData] = useState<EpisodeData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

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
    fetch('/episodes.json')
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

  const filteredEpisodes = useMemo(() => {
    if (!data?.episodes) return [];

    // メンバーシップ限定放送を除外
    let filtered = data.episodes.filter(ep => !ep.is_supporter_only);

    // 検索クエリによる絞り込み
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(ep =>
        ep.title.toLowerCase().includes(lowerQuery) ||
        (ep.description && ep.description.toLowerCase().includes(lowerQuery))
      );
    }
    return filtered;
  }, [data, searchQuery]);

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
  }, [searchQuery]);

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

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-container">
          <a href="#" onClick={scrollToTop} className="logo-link">
            <img src="/logo_02.png" alt="キズキノ學校" className="logo-image" />
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
                  {/* 値札シール風の装飾（最新話のみ） */}
                  {index === 0 && !searchQuery && (
                    <div className="price-tag">最新<br />放送</div>
                  )}

                  <header className="episode-header">
                    <h2 className="episode-title">{ep.title}</h2>
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
                  「{searchQuery}」の放送は、見つかりませんでした。
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
