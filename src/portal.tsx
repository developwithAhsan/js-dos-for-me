/* eslint-disable */
import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { unzipSync } from "fflate";
import { Dos } from "./main";
import type { DosProps } from "./public/types";
import { games, genres, getGame, type Game } from "./games";
import "./portal.css";

const CACHE_NAME = "dos-arcade-bundles-v2";
const PROFILE_KEY = "dos-arcade-device-profile";
const FAVORITES_KEY = "dos-arcade-favorites";

type WebIndexGame = {
  slug: string;
  title: string;
  image: string;
  category: string;
  collections: string[];
  tags: string[];
  isNew?: boolean;
  type: string;
};

type WebGame = WebIndexGame & {
  id: string;
  url: string;
  description: string;
  instructions: string;
  width: number;
  height: number;
};

type TaxonomyItem = { slug: string; name: string; count: number };
type CatalogMeta = {
  count: number;
  generatedAt?: string;
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
};

type Route =
  | { type: "home" }
  | { type: "game"; slug: string }
  | { type: "category"; slug: string }
  | { type: "tag"; slug: string }
  | { type: "favorites" };

function routeFromLocation(): Route {
  const path = decodeURIComponent(location.pathname);
  let match = path.match(/^\/games\/([^/]+)\/?$/);
  if (match) return { type: "game", slug: match[1] };
  match = path.match(/^\/category\/([^/]+)\/?$/);
  if (match) return { type: "category", slug: match[1] };
  match = path.match(/^\/tag\/([^/]+)\/?$/);
  if (match) return { type: "tag", slug: match[1] };
  if (/^\/favorites\/?$/.test(path)) return { type: "favorites" };
  return { type: "home" };
}

function go(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bucketFor(slug: string) {
  const c = (slug[0] || "_").toLowerCase();
  return /^[a-z0-9]$/.test(c) ? c : "_";
}

function nativeCategories(game: Game) {
  return game.categories?.length ? game.categories : [game.platform === "Browser" ? "Browser-Native Games" : "DOS Classics"];
}

function nativeTags(game: Game) {
  return game.tags?.length ? game.tags : game.genres;
}

function taxonomySlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function useFavorites() {
  const read = () => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"));
    } catch {
      return new Set<string>();
    }
  };
  const [favorites, setFavorites] = useState<Set<string>>(read);

  useEffect(() => {
    const handler = () => setFavorites(read());
    addEventListener("favorites-changed", handler);
    return () => removeEventListener("favorites-changed", handler);
  }, []);

  const toggle = (slug: string) => {
    const next = read();
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event("favorites-changed"));
  };

  return { favorites, toggle };
}

async function loadCatalogIndex(): Promise<WebIndexGame[]> {
  const response = await fetch("/catalog/index.json");
  if (!response.ok) return [];
  return response.json();
}

async function loadCatalogMeta(): Promise<CatalogMeta> {
  const response = await fetch("/catalog/meta.json");
  if (!response.ok) return { count: 0, categories: [], tags: [] };
  return response.json();
}

async function loadWebGame(slug: string): Promise<WebGame | null> {
  const response = await fetch(`/catalog/chunks/${bucketFor(slug)}.json`);
  if (!response.ok) return null;
  const games: WebGame[] = await response.json();
  return games.find((game) => game.slug === slug) || null;
}

function updateSeo(title: string, description: string, canonicalPath: string, image?: string) {
  document.title = title;
  let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "description";
    document.head.appendChild(meta);
  }
  meta.content = description;

  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = new URL(canonicalPath, location.origin).href;

  for (const [property, content] of [
    ["og:title", title],
    ["og:description", description],
    ["og:url", canonical.href],
    ["og:image", image || ""],
  ]) {
    if (!content) continue;
    let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("property", property);
      document.head.appendChild(tag);
    }
    tag.content = content;
  }
}

async function prepareBundle(url: string, onProgress: (value: number, label: string) => void) {
  if (!("caches" in window)) {
    onProgress(5, "Downloading game...");
    return url;
  }

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    onProgress(100, "Installed locally — starting...");
    return URL.createObjectURL(await cached.blob());
  }

  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
  const total = Number(response.headers.get("content-length") || 0);
  const reader = response.body?.getReader();

  if (!reader) {
    const blob = await response.blob();
    await cache.put(url, new Response(blob));
    return URL.createObjectURL(blob);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    const percent = total ? Math.min(99, Math.round((received / total) * 100)) : Math.min(95, 8 + Math.round(received / 1048576));
    onProgress(percent, `Installing… ${percent}% · ${(received / 1048576).toFixed(1)} MB`);
  }

  const blob = new Blob(chunks, { type: "application/octet-stream" });
  await cache.put(url, new Response(blob));
  onProgress(100, "Installed — starting...");
  return URL.createObjectURL(blob);
}

async function prepareDemoZip(url: string, onProgress: (value: number, label: string) => void) {
  const cache = "caches" in window ? await caches.open(CACHE_NAME + "-demo-zips") : null;
  const cached = cache ? await cache.match(url) : null;
  if (cached) {
    onProgress(100, "Installed locally — preparing files...");
    return new Uint8Array(await cached.arrayBuffer());
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Demo download failed (HTTP ${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (cache) await cache.put(url, new Response(bytes));
  onProgress(100, "Downloaded — preparing files...");
  return bytes;
}

function TaxonomyChips({ categories, tags }: { categories: string[]; tags: string[] }) {
  return <div class="taxonomy-chips">
    {categories.map((name) =>
      <button class="tax-chip category-chip" onClick={() => go(`/category/${taxonomySlug(name)}/`)}>{name}</button>
    )}
    {tags.slice(0, 14).map((name) =>
      <button class="tax-chip" onClick={() => go(`/tag/${taxonomySlug(name)}/`)}>#{name}</button>
    )}
  </div>;
}

function FavoriteButton({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const { favorites, toggle } = useFavorites();
  const active = favorites.has(slug);
  return <button
    class={compact ? `favorite-icon ${active ? "active" : ""}` : `secondary favorite-button ${active ? "active" : ""}`}
    onClick={(event) => {
      event.stopPropagation();
      toggle(slug);
    }}
    aria-label={active ? "Remove from favorites" : "Add to favorites"}
  >
    {active ? "♥" : "♡"}{compact ? "" : active ? " Favorited" : " Favorite"}
  </button>;
}

function NativeThumb({ game }: { game: Game }) {
  if (game.image) return <img class="game-thumb" src={game.image} alt={`${game.title} browser game thumbnail`} loading="lazy" />;
  return <div class="game-thumb native-thumb"><span>{game.platform}</span><strong>{game.title}</strong></div>;
}

function NativeCard({ game }: { game: Game }) {
  return <article class="game-card" onClick={() => go(`/games/${game.slug}/`)}>
    <div class="thumb-wrap">
      <NativeThumb game={game} />
      <FavoriteButton slug={game.slug} compact />
    </div>
    <div class="game-card-body">
      <span class="badge">{game.badge}</span>
      <h3>{game.title}</h3>
      <div class="meta">{game.year} · {game.platform}</div>
      <div class="genre-list">{nativeTags(game).slice(0, 4).map((tag) => <span class="genre">{tag}</span>)}</div>
    </div>
  </article>;
}

function WebCard({ game }: { game: WebIndexGame }) {
  return <article class="game-card" onClick={() => go(`/games/${game.slug}/`)}>
    <div class="thumb-wrap">
      <img class="game-thumb" src={game.image} alt={`${game.title} online game thumbnail`} loading="lazy" />
      {game.isNew && <span class="new-corner">NEW</span>}
      <FavoriteButton slug={game.slug} compact />
    </div>
    <div class="game-card-body">
      <h3>{game.title}</h3>
      <div class="meta">{game.category.replace(/-/g, " ")}</div>
    </div>
  </article>;
}

function ShelfGameCard({ game }: { game: WebIndexGame }) {
  return <article class="shelf-game-card" onClick={() => go(`/games/${game.slug}/`)}>
    <img src={game.image} alt={`${game.title} online game`} loading="lazy" />
    {game.isNew && <span class="new-corner">NEW</span>}
    <FavoriteButton slug={game.slug} compact />
    <div class="shelf-hover">
      <strong>{game.title}</strong>
      <span>Play now</span>
    </div>
  </article>;
}

function NativeShelfCard({ game }: { game: Game }) {
  return <article class="shelf-game-card native-shelf-card" onClick={() => go(`/games/${game.slug}/`)}>
    {game.image
      ? <img src={game.image} alt={`${game.title} browser game`} loading="lazy" />
      : <div class="native-shelf-art"><small>{game.platform}</small><strong>{game.title}</strong></div>}
    <FavoriteButton slug={game.slug} compact />
    <div class="shelf-hover">
      <strong>{game.title}</strong>
      <span>{game.badge || "Play"}</span>
    </div>
  </article>;
}

const featuredTaxonomy = [
  { label: "Driving & Racing", slug: "driving-racing" },
  { label: "Shooting", slug: "shooting" },
  { label: "Action & Fighting", slug: "action-fighting" },
  { label: "Adventure & RPG", slug: "adventure-rpg" },
  { label: "Girls & Lifestyle", slug: "girls-lifestyle" },
  { label: "Multiplayer", slug: "multiplayer" },
  { label: "Arcade & Classic", slug: "arcade-classic" },
  { label: "Board & Puzzle", slug: "board-puzzle" },
  { label: "Sports", slug: "sports" },
  { label: "Strategy & Defense", slug: "strategy-defense" },
  { label: "Management & Simulation", slug: "management-simulation" },
  { label: "Kids & Educational", slug: "kids-educational" },
  { label: "Fun & Crazy", slug: "fun-crazy" },
];

function CategoryShelf({ title, slug, count, items, tone }: {
  title: string;
  slug: string;
  count: number;
  items: WebIndexGame[];
  tone: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  if (!items.length) return null;
  const backdrop = items[0]?.image || "";

  const scrollMore = () => {
    const track = trackRef.current;
    if (!track) return;
    const maxLeft = track.scrollWidth - track.clientWidth;
    if (track.scrollLeft >= maxLeft - 20) {
      go(`/category/${slug}/`);
      return;
    }
    track.scrollBy({ left: Math.max(520, track.clientWidth * 0.86), behavior: "smooth" });
  };

  return <section class="category-shelf">
    <button
      class={`category-banner category-tone-${tone % 13}`}
      onClick={() => go(`/category/${slug}/`)}
      style={{ backgroundImage: `linear-gradient(90deg, rgba(8,15,32,.96) 0%, rgba(8,15,32,.70) 44%, rgba(8,15,32,.04) 100%), url("${backdrop}")` }}
    >
      <span class="category-banner-copy">
        <strong>{title}</strong>
        <small>{count.toLocaleString()} games</small>
      </span>
    </button>

    <div class="shelf-browser">
      <div class="shelf-track" ref={trackRef}>
        {items.map((game) => <ShelfGameCard game={game} />)}
      </div>
      <button
        class="shelf-next"
        onClick={scrollMore}
        aria-label={`Show more ${title} games`}
        title={`More ${title} games`}
      >›</button>
    </div>
  </section>;
}

function NativeShelf() {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollMore = () => {
    const track = trackRef.current;
    if (!track) return;
    const maxLeft = track.scrollWidth - track.clientWidth;
    if (track.scrollLeft >= maxLeft - 20) {
      go("/category/browser-native-games/");
      return;
    }
    track.scrollBy({ left: Math.max(520, track.clientWidth * 0.86), behavior: "smooth" });
  };

  return <section class="category-shelf">
    <button class="category-banner category-tone-native" onClick={() => go("/category/browser-native-games/")}>
      <span class="category-banner-copy">
        <strong>PC & Browser Classics</strong>
        <small>{games.length} featured games</small>
      </span>
    </button>
    <div class="shelf-browser">
      <div class="shelf-track" ref={trackRef}>
        {games.map((game) => <NativeShelfCard game={game} />)}
      </div>
      <button class="shelf-next" onClick={scrollMore} aria-label="Show more browser classics" title="More browser classics">›</button>
    </div>
  </section>;
}

function Home({ query }: { query: string }) {
  const [index, setIndex] = useState<WebIndexGame[]>([]);
  const [meta, setMeta] = useState<CatalogMeta>({ count: 0, categories: [], tags: [] });
  const [visible, setVisible] = useState(72);

  useEffect(() => {
    Promise.all([loadCatalogIndex(), loadCatalogMeta()]).then(([gamesList, info]) => {
      setIndex(gamesList);
      setMeta(info);
    });
    updateSeo(
      "DOS Arcade — Play Browser, HTML5 & Classic PC Games",
      "Play browser games instantly across racing, shooting, action, adventure, multiplayer, arcade, puzzle, sports and classic PC categories.",
      "/"
    );
  }, []);

  useEffect(() => setVisible(72), [query]);
  const search = query.trim().toLowerCase();
  const filtered = useMemo(() => search
    ? index.filter((game) => [game.title, game.category, ...game.collections, ...game.tags].join(" ").toLowerCase().includes(search))
    : index,
  [index, search]);

  const categoryCount = (slug: string) => meta.categories.find((category) => category.slug === slug)?.count || 0;
  const byCollection = (slug: string, count = 48) => index.filter((game) => game.collections?.includes(slug)).slice(0, count);

  if (search) {
    return <main class="home-feed portal-shell search-home">
      <div class="search-result-head">
        <div><small>Search results</small><h1>{query}</h1></div>
        <span>{filtered.length.toLocaleString()} games</span>
      </div>
      <div class="game-grid dense-grid">{filtered.slice(0, visible).map((game) => <WebCard game={game} />)}</div>
      {visible < filtered.length && <div class="load-more"><button class="primary" onClick={() => setVisible((value) => value + 72)}>Load more games</button></div>}
    </main>;
  }

  return <main class="home-feed portal-shell">
    <div class="home-status-line">
      <strong>Play instantly</strong>
      <span>{meta.count ? `${meta.count.toLocaleString()} games` : "Loading game library…"}</span>
    </div>

    <div class="shelves-list">
      {featuredTaxonomy.slice(0, 5).map((item, i) =>
        <CategoryShelf
          title={item.label}
          slug={item.slug}
          count={categoryCount(item.slug)}
          items={byCollection(item.slug)}
          tone={i}
        />
      )}

      <NativeShelf />

      {featuredTaxonomy.slice(5).map((item, i) =>
        <CategoryShelf
          title={item.label}
          slug={item.slug}
          count={categoryCount(item.slug)}
          items={byCollection(item.slug)}
          tone={i + 5}
        />
      )}
    </div>

    <section class="all-games-section">
      <div class="all-games-head">
        <div><small>More to play</small><h2>All Games</h2></div>
        <span>{meta.count.toLocaleString()} total</span>
      </div>
      <div class="game-grid dense-grid">{index.slice(0, visible).map((game) => <WebCard game={game} />)}</div>
      {visible < index.length && <div class="load-more"><button class="primary" onClick={() => setVisible((value) => value + 72)}>Load more games</button></div>}
    </section>
  </main>;
}


const categoryIcons: Record<string, string> = {
  "driving-racing": "🏎",
  "shooting": "🎯",
  "action-fighting": "⚔",
  "adventure-rpg": "🧭",
  "girls-lifestyle": "✿",
  "sports": "⚽",
  "board-puzzle": "🧩",
  "multiplayer": "◉",
  "arcade-classic": "👾",
  "strategy-defense": "♞",
  "management-simulation": "⚗",
  "kids-educational": "🎨",
  "fun-crazy": "🎪",
};

function GameSidebar() {
  return <aside class="game-side-nav">
    <button class="side-close" onClick={() => go("/")} aria-label="Back to homepage">×</button>
    <div class="side-quick">
      <button onClick={() => go("/tag/new/")}><span class="side-icon side-new">✦</span><strong>New Games</strong></button>
      <button onClick={() => go("/category/arcade-classic/")}><span class="side-icon side-hot">★</span><strong>Popular Games</strong></button>
    </div>
    <div class="side-divider" />
    <nav class="side-categories">
      {featuredTaxonomy.map((item, i) =>
        <button onClick={() => go(`/category/${item.slug}/`)}>
          <span class={`side-icon side-tone-${i % 13}`}>{categoryIcons[item.slug] || "◆"}</span>
          <strong>{item.label}</strong>
        </button>
      )}
    </nav>
    <div class="side-divider" />
    <div class="side-library">
      <button onClick={() => go("/favorites/")}><span class="side-icon">♡</span><strong>Liked Games</strong></button>
      <button onClick={() => go("/")}><span class="side-icon">⌂</span><strong>Recommended</strong></button>
    </div>
  </aside>;
}

function GameTagPanel({ tags }: { tags: string[] }) {
  const unique = [...new Set(tags.filter(Boolean))].slice(0, 10);
  return <aside class="game-tag-panel">
    <h3>Tags</h3>
    <div class="game-tag-grid">
      {unique.map((tag, i) =>
        <button class={`game-tag-pill tag-tone-${i % 6}`} onClick={() => go(`/tag/${taxonomySlug(tag)}/`)}>
          <span>{i % 2 === 0 ? "◇" : "⌁"}</span>{tag}
        </button>
      )}
    </div>
  </aside>;
}

function CompactGameActions({ slug, onFullscreen, directUrl }: {
  slug: string;
  onFullscreen?: () => void;
  directUrl?: string;
}) {
  const { favorites, toggle } = useFavorites();
  const liked = favorites.has(slug);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: document.title, url: location.href });
      else await navigator.clipboard.writeText(location.href);
    } catch {}
  };
  return <div class="compact-game-actions">
    <button onClick={() => toggle(slug)} title={liked ? "Remove favorite" : "Add favorite"}>{liked ? "♥" : "♡"}</button>
    <button onClick={share} title="Share game">↗</button>
    {directUrl && <a href={directUrl} target="_blank" rel="noopener" title="Open game directly">↗</a>}
    {onFullscreen && <button onClick={onFullscreen} title="Fullscreen">⛶</button>}
  </div>;
}

function Comments({ slug, title }: { slug: string; title: string }) {
  useEffect(() => {
    const win = window as any;
    win.disqus_config = function() {
      this.page.url = `${location.origin}/games/${slug}/`;
      this.page.identifier = `game:${slug}`;
      this.page.title = title;
    };
    if (win.DISQUS) {
      win.DISQUS.reset({ reload: true, config: win.disqus_config });
    } else if (!document.querySelector('script[data-disqus="game-comments"]')) {
      const script = document.createElement("script");
      script.src = "https://gta3-1.disqus.com/embed.js";
      script.async = true;
      script.setAttribute("data-disqus", "game-comments");
      document.body.appendChild(script);
    }
  }, [slug, title]);

  return <section class="comments-card">
    <div class="eyebrow">Community</div>
    <h2>Comments</h2>
    <div id="disqus_thread"></div>
    <noscript>Please enable JavaScript to view comments.</noscript>
  </section>;
}

function NativeGamePage({ game }: { game: Game }) {
  const playerRef = useRef<HTMLDivElement>(null);
  const [props, setProps] = useState<DosProps | null>(null);
  const [status, setStatus] = useState(game.engine === "external" ? "Ready to launch" : game.availability === "playable" ? "Ready to install" : "Use your own .jsdos bundle");
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [externalStarted, setExternalStarted] = useState(false);

  useEffect(() => {
    updateSeo(`${game.title} Online — Play in Browser`, game.description, `/games/${game.slug}/`, game.image);
    return () => { props?.stop().catch(() => undefined); };
  }, [game.slug]);

  const launchBundle = async (url: string) => {
    if (!playerRef.current) return;
    setRunning(false);
    setStatus("Checking local installation...");
    try {
      const readyUrl = await prepareBundle(url, (value, label) => { setProgress(value); setStatus(label); });
      playerRef.current.innerHTML = "";
      const next = Dos(playerRef.current, {
        url: readyUrl,
        pathPrefix: "/emulators/",
        autoStart: true,
        autoSave: true,
        offscreenCanvas: true,
        renderBackend: "webgl",
        onEvent: (event) => {
          if (event === "ci-ready") {
            setRunning(true);
            setProgress(100);
            setStatus("Running");
          }
        }
      });
      setProps(next);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to start game");
      setProgress(0);
    }
  };

  const launchDemo = async (zipUrl: string, command: string) => {
    if (!playerRef.current) return;
    setStatus("Installing playable demo...");
    setProgress(5);
    try {
      const zipBytes = await prepareDemoZip(zipUrl, (value, label) => { setProgress(value); setStatus(label); });
      const archive = unzipSync(zipBytes);
      const initFs = Object.entries(archive)
        .filter(([path]) => !path.endsWith("/"))
        .map(([path, contents]) => ({ path, contents }));
      playerRef.current.innerHTML = "";
      const next = Dos(playerRef.current, {
        dosboxConf: `[sdl]\nautolock=true\n[dosbox]\nmemsize=32\n[cpu]\ncore=auto\ncycles=max\n[sblaster]\nsbtype=sb16\n[autoexec]\n@echo off\nmount c .\nc:\n${command}\n`,
        initFs,
        pathPrefix: "/emulators/",
        autoStart: true,
        autoSave: true,
        offscreenCanvas: true,
        renderBackend: "webgl",
        onEvent: (event) => {
          if (event === "ci-ready") {
            setRunning(true);
            setProgress(100);
            setStatus("Running");
          }
        }
      });
      setProps(next);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to start demo");
      setProgress(0);
    }
  };

  const installAndPlay = () => {
    if (game.engine === "external" && game.externalUrl) {
      setExternalStarted(true);
      setRunning(true);
      return;
    }
    if (game.demoZipUrl && game.command) launchDemo(game.demoZipUrl, game.command);
    else if (game.bundleUrl) launchBundle(game.bundleUrl);
  };

  const upload = (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !playerRef.current) return;
    const url = URL.createObjectURL(file);
    playerRef.current.innerHTML = "";
    const next = Dos(playerRef.current, {
      url,
      pathPrefix: "/emulators/",
      autoStart: true,
      autoSave: true,
      onEvent: (event) => {
        if (event === "ci-ready") {
          setRunning(true);
          setStatus("Running");
        }
      }
    });
    setProps(next);
  };

  const fullscreen = () => {
    if (game.externalUrl) {
      (document.querySelector(".html5-frame") as HTMLIFrameElement | null)?.requestFullscreen?.();
    } else {
      props?.setFullScreen(true);
    }
  };

  const categories = nativeCategories(game);
  const tags = [...nativeTags(game), ...categories, game.platform];

  return <main class="play-page">
    <div class="play-shell">
      <GameSidebar />
      <section class="play-main">
        <div class="play-stage">
          {game.engine === "external" && externalStarted && game.externalUrl
            ? <iframe class="html5-frame" src={game.externalUrl} title={game.title} allow="fullscreen; autoplay; gamepad" allowFullScreen />
            : <div id="dos-player" ref={playerRef}></div>}
          {!running && <div class="player-empty compact-player-empty">
            <div>
              <h2>{game.title}</h2>
              <p>{status}</p>
              {progress > 0 && <><div class="progress-track"><div class="progress-bar" style={{ width: `${progress}%` }} /></div><div class="meta">{progress}%</div></>}
              {(game.bundleUrl || game.demoZipUrl || game.externalUrl) && <button class="primary" onClick={installAndPlay}>{game.engine === "external" ? "Launch Game" : "Install & Play"}</button>}
            </div>
          </div>}
        </div>

        <div class="play-bottom-bar">
          <div class="play-title">
            <strong>{game.title}</strong>
            <span>{game.badge || game.platform}</span>
          </div>
          <CompactGameActions slug={game.slug} onFullscreen={fullscreen} directUrl={game.externalUrl} />
        </div>

        {!game.externalUrl && <div class="native-tools-row">
          <button onClick={() => props?.save()} disabled={!props}>Save</button>
          <button onClick={() => props?.setPaused(false)} disabled={!props}>Resume</button>
          <label class="bundle-import">Import bundle<input type="file" accept=".jsdos,.zip,application/zip" onChange={upload as any} /></label>
          <button onClick={() => { props?.stop(); setRunning(false); setStatus("Stopped"); }} disabled={!props}>Stop</button>
        </div>}

        <section class="game-details-card">
          <h2>Game details</h2>
          <p>{game.description}</p>
          <div class="detail-mini-grid">
            <div><strong>Developer</strong><span>{game.developer}</span></div>
            <div><strong>Categories</strong><span>{categories.join(", ")}</span></div>
            <div><strong>Controls</strong><span>{game.controls}</span></div>
          </div>
        </section>
        <Comments slug={game.slug} title={game.title} />
      </section>
      <GameTagPanel tags={tags} />
    </div>
  </main>;
}

function WebGamePage({ slug }: { slug: string }) {
  const [game, setGame] = useState<WebGame | null>(null);
  const [related, setRelated] = useState<WebIndexGame[]>([]);

  useEffect(() => {
    Promise.all([loadWebGame(slug), loadCatalogIndex()]).then(([detail, index]) => {
      setGame(detail);
      if (detail) {
        setRelated(index.filter((item) =>
          item.slug !== detail.slug &&
          (item.collections?.some((collection) => detail.collections?.includes(collection)) || item.category === detail.category)
        ).slice(0, 12));
        updateSeo(`${detail.title} Online — Play Free in Browser`, detail.description, `/games/${detail.slug}/`, detail.image);
      }
    });
  }, [slug]);

  if (!game) return <main class="portal-shell loading-page"><h1>Loading game…</h1></main>;

  const displayTags = [
    "HTML5",
    "Browser Game",
    ...game.tags.map((tag) => tag.replace(/-/g, " ")),
    ...game.collections.map((tag) => tag.replace(/-/g, " "))
  ];

  const fullscreen = () => (document.querySelector(".html5-frame") as HTMLIFrameElement | null)?.requestFullscreen?.();

  return <main class="play-page">
    <div class="play-shell">
      <GameSidebar />

      <section class="play-main">
        <div class="play-stage web-play-stage">
          <iframe class="html5-frame" src={game.url} title={game.title} allow="fullscreen; autoplay; gamepad" allowFullScreen scrolling="no" />
        </div>

        <div class="play-bottom-bar">
          <div class="play-title">
            <strong>{game.title}</strong>
            <span>{game.category.replace(/-/g, " ")}</span>
          </div>
          <CompactGameActions slug={game.slug} onFullscreen={fullscreen} directUrl={game.url} />
        </div>

        <section class="game-details-card">
          <h2>Game details</h2>
          <p>{game.description}</p>
          <div class="detail-mini-grid">
            <div><strong>Category</strong><span>{game.category.replace(/-/g, " ")}</span></div>
            <div><strong>Game type</strong><span>{game.type || "HTML5"}</span></div>
            <div><strong>How to play</strong><span>{game.instructions}</span></div>
          </div>
        </section>

        {related.length > 0 && <section class="related-section compact-related">
          <div class="all-games-head"><div><small>More like this</small><h2>Related games</h2></div></div>
          <div class="game-grid dense-grid">{related.map((item) => <WebCard game={item} />)}</div>
        </section>}

        <Comments slug={game.slug} title={game.title} />
      </section>

      <GameTagPanel tags={displayTags} />
    </div>
  </main>;
}

function ListingPage({ kind, slug }: { kind: "category" | "tag"; slug: string }) {
  const [index, setIndex] = useState<WebIndexGame[]>([]);
  const [meta, setMeta] = useState<CatalogMeta>({ count: 0, categories: [], tags: [] });
  const [visible, setVisible] = useState(72);

  useEffect(() => {
    Promise.all([loadCatalogIndex(), loadCatalogMeta()]).then(([games, info]) => {
      setIndex(games);
      setMeta(info);
    });
  }, [slug]);

  const nativeMatches = games.filter((game) => {
    if (kind === "category") return nativeCategories(game).some((name) => taxonomySlug(name) === slug);
    return nativeTags(game).some((name) => taxonomySlug(name) === slug);
  });
  const webMatches = index.filter((game) => kind === "category" ? (game.collections?.includes(slug) || game.category === slug) : game.tags.includes(slug));
  const lookup = kind === "category" ? meta.categories : meta.tags;
  const label = lookup.find((item) => item.slug === slug)?.name
    || slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  useEffect(() => {
    updateSeo(
      `${label} — Play Online Games`,
      `Browse and play ${label} online in your browser.`,
      `/${kind}/${slug}/`
    );
  }, [label, slug]);

  return <main class="portal-shell listing-page">
    <button class="back" onClick={() => go("/")}>← Back to home</button>
    <div class="eyebrow">{kind}</div>
    <h1>{label}</h1>
    <p class="section-sub">{nativeMatches.length + webMatches.length} games in this {kind}.</p>
    <div class="game-grid">
      {nativeMatches.map((game) => <NativeCard game={game} />)}
      {webMatches.slice(0, visible).map((game) => <WebCard game={game} />)}
    </div>
    {visible < webMatches.length && <div class="load-more"><button class="primary" onClick={() => setVisible((value) => value + 72)}>Load more</button></div>}
  </main>;
}

function FavoritesPage() {
  const { favorites } = useFavorites();
  const [index, setIndex] = useState<WebIndexGame[]>([]);
  useEffect(() => {
    loadCatalogIndex().then(setIndex);
    updateSeo("Favorite Games — DOS Arcade", "Your favorite browser games saved on this device.", "/favorites/");
  }, []);
  const native = games.filter((game) => favorites.has(game.slug));
  const web = index.filter((game) => favorites.has(game.slug));
  return <main class="portal-shell listing-page">
    <button class="back" onClick={() => go("/")}>← Back to home</button>
    <div class="eyebrow">Your library</div>
    <h1>Favorite Games</h1>
    {native.length + web.length === 0
      ? <p class="section-sub">Tap the heart on any game to save it here.</p>
      : <div class="game-grid">{native.map((game) => <NativeCard game={game} />)}{web.map((game) => <WebCard game={game} />)}</div>}
  </main>;
}

function AccountModal({ close }: { close: () => void }) {
  const stored = (() => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; } })();
  const [mode, setMode] = useState<"signin" | "signup">(stored ? "signin" : "signup");
  const [name, setName] = useState(stored?.name || "");
  const [email, setEmail] = useState(stored?.email || "");
  const [message, setMessage] = useState("");

  const submit = () => {
    if (!email.includes("@")) return setMessage("Enter a valid email address.");
    if (mode === "signup") {
      if (!name.trim()) return setMessage("Enter a display name.");
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }));
      setMessage("Device profile created.");
      setTimeout(close, 350);
      return;
    }
    if (!stored || stored.email !== email.trim().toLowerCase()) {
      setMessage("No matching device profile found. Create one first.");
      return;
    }
    setMessage("Signed in on this device.");
    setTimeout(close, 350);
  };

  return <div class="modal-backdrop" onClick={close}>
    <div class="account-modal" onClick={(event) => event.stopPropagation()}>
      <button class="modal-close" onClick={close}>×</button>
      <div class="eyebrow">Device profile</div>
      <h2>{mode === "signup" ? "Create profile" : "Sign in"}</h2>
      <p>This lightweight profile is stored only in this browser. It keeps favorites ready for a future server-backed account system.</p>
      <div class="mode-tabs">
        <button class={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button>
        <button class={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
      </div>
      {mode === "signup" && <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Display name" />}
      <input value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} placeholder="Email address" type="email" />
      {message && <div class="account-message">{message}</div>}
      <button class="primary" onClick={submit}>{mode === "signup" ? "Create profile" : "Sign in"}</button>
    </div>
  </div>;
}

function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation());
  const [accountOpen, setAccountOpen] = useState(false);
  const [headerQuery, setHeaderQuery] = useState("");
  const [profile, setProfile] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; }
  });

  useEffect(() => {
    const handle = () => {
      setRoute(routeFromLocation());
      if (routeFromLocation().type !== "home") setHeaderQuery("");
    };
    addEventListener("popstate", handle);
    return () => removeEventListener("popstate", handle);
  }, []);

  const closeAccount = () => {
    setAccountOpen(false);
    try { setProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) || "null")); } catch {}
  };

  const sendSearch = (value: string) => {
    setHeaderQuery(value);
    if (route.type !== "home") {
      history.pushState({}, "", "/");
      setRoute({ type: "home" });
    }
  };

  const openCategories = () => {
    if (route.type !== "home") go("/");
    setTimeout(() => document.querySelector(".shelves-list")?.scrollIntoView({ behavior: "smooth" }), 80);
  };

  let content: any = <Home query={headerQuery} />;
  if (route.type === "game") {
    const native = getGame(route.slug);
    content = native ? <NativeGamePage game={native} /> : <WebGamePage slug={route.slug} />;
  } else if (route.type === "category") {
    content = <ListingPage kind="category" slug={route.slug} />;
  } else if (route.type === "tag") {
    content = <ListingPage kind="tag" slug={route.slug} />;
  } else if (route.type === "favorites") {
    content = <FavoritesPage />;
  }

  return <>
    <header class="site-header screenshot-header">
      <div class="portal-shell screenshot-nav">
        <button class="hamburger-button" onClick={openCategories} aria-label="Browse categories">☰</button>
        <button class="brand compact-brand" onClick={() => go("/")}>
          <span class="brand-mark"><span class="brand-core">DA</span><span class="brand-pulse" /></span>
          <span class="brand-word"><strong>DOS</strong><em>Arcade</em></span>
        </button>

        <label class="top-search">
          <span>⌕</span>
          <input
            value={headerQuery}
            onInput={(e) => sendSearch((e.target as HTMLInputElement).value)}
            placeholder="Search our 38,000+ games"
            aria-label="Search games"
          />
        </label>

        <button class="top-favorite-button" onClick={() => go("/favorites/")} aria-label="Favorites">♡</button>
        <button class="profile-avatar" onClick={() => setAccountOpen(true)} aria-label="Account">
          {(profile?.name || "A").slice(0, 1).toUpperCase()}
        </button>
      </div>
    </header>

    {content}

    <nav class="mobile-dock">
      <button onClick={() => go("/")}><span>⌂</span><small>Home</small></button>
      <button onClick={openCategories}><span>▤</span><small>Categories</small></button>
      <button onClick={() => go("/favorites/")}><span>♡</span><small>Favorites</small></button>
      <button onClick={() => setAccountOpen(true)}><span>○</span><small>Profile</small></button>
    </nav>

    <footer class="footer"><div class="portal-shell">DOS Arcade · Browser, HTML5, DOS and browser-native games.</div></footer>
    {accountOpen && <AccountModal close={closeAccount} />}
  </>;
}

render(<App />, document.getElementById("portal")!);
