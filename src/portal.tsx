/* eslint-disable */
import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { unzipSync } from "fflate";
import { Dos } from "./main";
import type { DosProps } from "./public/types";
import { games, genres, getGame, type Game } from "./games";
import "./portal.css";

const CACHE_NAME = "dos-arcade-bundles-v2";
const FAVORITES_KEY = "dos-arcade-favorites";
const INSTALL_START_KEY = "playzone-install-start";
const INSTALL_DONE_KEY = "playzone-pwa-installed";
const RECENT_KEY = "playzone-recent-games";

type RecentGame = {
  slug: string;
  title: string;
  image: string;
  category: string;
  tags: string[];
  collections: string[];
  type: string;
  isNew?: boolean;
  playedAt: number;
};

function readRecentGames(): RecentGame[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function recordRecentGame(game: Omit<RecentGame, "playedAt">) {
  const next = [
    { ...game, playedAt: Date.now() },
    ...readRecentGames().filter((item) => item.slug !== game.slug),
  ].slice(0, 40);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

let deferredInstallPrompt: InstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new Event("playzone-install-ready"));
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    localStorage.setItem(INSTALL_DONE_KEY, "1");
    window.dispatchEvent(new Event("playzone-installed"));
  });
}

function isStandaloneMode() {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

async function requestIOPlayInstall(startPath = "/") {
  localStorage.setItem(INSTALL_START_KEY, startPath);

  if (isStandaloneMode()) {
    return "IOPlay is installed. This game is set as your launch game.";
  }

  if (deferredInstallPrompt) {
    const promptEvent = deferredInstallPrompt;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      deferredInstallPrompt = null;
      localStorage.setItem(INSTALL_DONE_KEY, "1");
      return "IOPlay installed. This game is saved for quick launch.";
    }
    return "Install was cancelled.";
  }

  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
  return isIOS
    ? "On iPhone/iPad: tap Share, then Add to Home Screen."
    : "Use your browser menu and choose Install app or Add to Home screen.";
}

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
  rawCategories?: TaxonomyItem[];
  tags: TaxonomyItem[];
};

type HomeShelf = {
  slug: string;
  name: string;
  count: number;
  items: WebIndexGame[];
};

type HomeCatalog = {
  count: number;
  generatedAt?: string;
  featured: HomeShelf[];
  raw: HomeShelf[];
};

type SearchEntry = [string, string, string, string, number];

type Route =
  | { type: "home" }
  | { type: "game"; slug: string }
  | { type: "category"; slug: string }
  | { type: "tag"; slug: string }
  | { type: "favorites" }
  | { type: "recent" };

function routeFromLocation(): Route {
  const path = decodeURIComponent(location.pathname);
  let match = path.match(/^\/games\/([^/]+)\/?$/);
  if (match) return { type: "game", slug: match[1] };
  match = path.match(/^\/category\/([^/]+)\/?$/);
  if (match) return { type: "category", slug: match[1] };
  match = path.match(/^\/tag\/([^/]+)\/?$/);
  if (match) return { type: "tag", slug: match[1] };
  if (/^\/favorites\/?$/.test(path)) return { type: "favorites" };
  if (/^\/recent\/?$/.test(path)) return { type: "recent" };
  return { type: "home" };
}

function go(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bucketFor(slug: string) {
  let hash = 2166136261;
  const value = String(slug || "");
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0 & 255).toString(16).padStart(2, "0");
}

function nativeCategories(game: Game) {
  const specific = game.categories?.length
    ? game.categories
    : [game.platform === "Browser" ? "Browser-Native Games" : "DOS Classics"];
  return ["PC & Browser Classics", ...specific];
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

let catalogIndexPromise: Promise<WebIndexGame[]> | null = null;
let homeCatalogPromise: Promise<HomeCatalog> | null = null;
const categoryPromises = new Map<string, Promise<WebIndexGame[]>>();
const tagPromises = new Map<string, Promise<WebIndexGame[]>>();
const searchPromises = new Map<string, Promise<SearchEntry[]>>();

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

function loadCatalogIndex(): Promise<WebIndexGame[]> {
  if (!catalogIndexPromise) {
    catalogIndexPromise = fetchJson<WebIndexGame[]>("/catalog/index.json", []);
  }
  return catalogIndexPromise;
}

function loadCatalogMeta(): Promise<CatalogMeta> {
  return fetchJson<CatalogMeta>("/catalog/meta.json", { count: 0, categories: [], tags: [] });
}

function loadHomeCatalog(): Promise<HomeCatalog> {
  if (!homeCatalogPromise) {
    homeCatalogPromise = fetchJson<HomeCatalog>("/catalog/home.json", { count: 0, featured: [], raw: [] });
  }
  return homeCatalogPromise;
}

function loadCategoryGames(slug: string): Promise<WebIndexGame[]> {
  if (!categoryPromises.has(slug)) {
    categoryPromises.set(slug, fetchJson<WebIndexGame[]>(`/catalog/categories/${slug}.json`, []));
  }
  return categoryPromises.get(slug)!;
}

function loadTagGames(slug: string): Promise<WebIndexGame[]> {
  if (!tagPromises.has(slug)) {
    tagPromises.set(slug, fetchJson<WebIndexGame[]>(`/catalog/tags/${slug}.json`, []));
  }
  return tagPromises.get(slug)!;
}

const SEARCH_STOPWORDS = new Set(["game", "games", "online", "html5", "browser", "play", "free"]);

async function loadSearchGames(query: string): Promise<WebIndexGame[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const meaningful = normalized
    .split(/[^a-z0-9]+/)
    .find((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token));
  if (!meaningful || meaningful.length < 3) return [];
  const shard = meaningful.slice(0, 3);
  if (!searchPromises.has(shard)) {
    searchPromises.set(shard, fetchJson<SearchEntry[]>(`/catalog/search/${shard}.json`, []));
  }
  const entries = await searchPromises.get(shard)!;
  return entries
    .filter((entry) => entry[3].includes(normalized))
    .slice(0, 500)
    .map((entry) => ({
      slug: entry[0],
      title: entry[1],
      image: entry[2],
      category: "",
      collections: [],
      tags: [],
      isNew: entry[4] === 1,
      type: "html5",
    }));
}

async function loadWebGame(slug: string): Promise<WebGame | null> {
  const games = await fetchJson<WebGame[]>(`/catalog/chunks/${bucketFor(slug)}.json`, []);
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

function ShelfGameCard({ game, priority = false }: { game: WebIndexGame; priority?: boolean }) {
  return <article class="shelf-game-card" onClick={() => go(`/games/${game.slug}/`)}>
    <img src={game.image} alt={`${game.title} online game`} loading={priority ? "eager" : "lazy"} decoding="async" />
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
      ? <img src={game.image} alt={`${game.title} gameplay thumbnail`} loading="eager" decoding="async" />
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
  { label: "IO & Multiplayer", slug: "io-multiplayer" },
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
  const [rowItems, setRowItems] = useState(items);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setRowItems(items);
  }, [slug, items]);

  if (!rowItems.length) return null;
  const backdrop = rowItems[0]?.image || "";

  const scrollMore = async () => {
    const track = trackRef.current;
    if (!track) return;
    const maxLeft = track.scrollWidth - track.clientWidth;

    if (track.scrollLeft < maxLeft - 20) {
      track.scrollBy({ left: Math.max(520, track.clientWidth * 0.86), behavior: "smooth" });
      return;
    }

    if (rowItems.length < count && !loadingMore) {
      setLoadingMore(true);
      const all = await loadCategoryGames(slug);
      if (all.length) setRowItems(all);
      setLoadingMore(false);
      requestAnimationFrame(() => {
        trackRef.current?.scrollBy({ left: Math.max(520, trackRef.current.clientWidth * 0.86), behavior: "smooth" });
      });
      return;
    }

    go(`/category/${slug}/`);
  };

  return <section class="category-shelf">
    <button
      class={`category-banner category-tone-${tone % 20}`}
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
        {rowItems.map((game, index) => <ShelfGameCard game={game} priority={tone < 2 && index < 8} />)}
      </div>
      <button
        class={`shelf-next ${loadingMore ? "loading" : ""}`}
        onClick={scrollMore}
        aria-label={`Show more ${title} games`}
        title={`More ${title} games`}
      >{loadingMore ? "…" : "›"}</button>
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
      go("/category/pc-browser-classics/");
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
      <button class="shelf-next" onClick={scrollMore} aria-label="Show more PC and browser classics" title="More PC & Browser Classics">›</button>
    </div>
  </section>;
}

function HomeSkeleton() {
  return <main class="home-feed portal-shell home-skeleton" aria-label="Loading games">
    {[0, 1, 2, 3, 4].map((row) => <div class="skeleton-row" key={row}>
      <div class="skeleton-category" />
      <div class="skeleton-games">
        {[0, 1, 2, 3, 4, 5, 6].map((item) => <div class="skeleton-game" key={item} />)}
      </div>
    </div>)}
  </main>;
}

function Home({ query }: { query: string }) {
  const [home, setHome] = useState<HomeCatalog>({ count: 0, featured: [], raw: [] });
  const [searchResults, setSearchResults] = useState<WebIndexGame[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [visible, setVisible] = useState(72);

  useEffect(() => {
    let active = true;
    loadHomeCatalog().then((data) => {
      if (active) setHome(data);
    });
    updateSeo(
      "IOPlay — Free Online Games",
      "Play browser games instantly across racing, shooting, action, adventure, multiplayer, arcade, puzzle, sports and classic PC categories.",
      "/"
    );
    return () => { active = false; };
  }, []);

  const search = query.trim().toLowerCase();

  useEffect(() => {
    setVisible(72);
    if (!search) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const quickPool = [...home.featured, ...home.raw].flatMap((shelf) => shelf.items);
    const seen = new Set<string>();
    const quick = quickPool.filter((game) => {
      if (seen.has(game.slug)) return false;
      seen.add(game.slug);
      return [game.title, game.category, ...game.collections, ...game.tags].join(" ").toLowerCase().includes(search);
    });
    setSearchResults(quick.slice(0, 72));
    setSearchLoading(true);

    let cancelled = false;
    if (search.replace(/[^a-z0-9]/g, "").length < 3) {
      setSearchLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      loadSearchGames(search).then((results) => {
        if (!cancelled) setSearchResults(results);
      }).finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, home.generatedAt]);

  const featuredMap = new Map(home.featured.map((shelf) => [shelf.slug, shelf]));

  if (search) {
    return <main class="home-feed portal-shell search-home">
      <div class="search-result-head">
        <div><small>Search results</small><h1>{query}</h1></div>
        <span>{searchLoading ? "Searching…" : `${searchResults.length.toLocaleString()} matches`}</span>
      </div>
      {!searchLoading && searchResults.length === 0 && <div class="catalog-empty">No matching games found.</div>}
      <div class="search-shelf-grid">{searchResults.slice(0, visible).map((game) => <ShelfGameCard game={game} />)}</div>
      {visible < searchResults.length && <div class="load-more"><button class="primary" onClick={() => setVisible((value) => value + 72)}>Load more games</button></div>}
    </main>;
  }

  if (!home.count && home.featured.length === 0) return <HomeSkeleton />;

  return <main class="home-feed portal-shell">
    <div class="home-status-line">
      <strong>Play instantly</strong>
      <span>{home.count.toLocaleString()} games</span>
    </div>

    <div class="shelves-list">
      <NativeShelf />

      {featuredTaxonomy.map((item, i) => {
        const shelf = featuredMap.get(item.slug);
        return shelf ? <CategoryShelf title={item.label} slug={item.slug} count={shelf.count} items={shelf.items} tone={i} /> : null;
      })}
    </div>

    {home.raw.length > 0 && <section class="all-category-shelves">
      <div class="all-games-head">
        <div><small>Complete directory</small><h2>More Game Categories</h2></div>
        <span>{home.raw.length} categories</span>
      </div>
      <div class="shelves-list raw-shelves-list">
        {home.raw.map((item, i) =>
          <CategoryShelf
            title={item.name}
            slug={item.slug}
            count={item.count}
            items={item.items}
            tone={i + featuredTaxonomy.length}
          />
        )}
      </div>
    </section>}
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
  "io-multiplayer": "◎",
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
      <button onClick={() => go("/category/new-games/")}><span class="side-icon side-new">✦</span><strong>New Games</strong></button>
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
      <button onClick={() => go("/recent/")}><span class="side-icon">◷</span><strong>Recently Played</strong></button>
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

function GameTopActions({ slug, onFullscreen }: { slug: string; onFullscreen?: () => void }) {
  const { favorites, toggle } = useFavorites();
  const saved = favorites.has(slug);
  const [message, setMessage] = useState("");

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: document.title, url: location.href });
      else {
        await navigator.clipboard.writeText(location.href);
        setMessage("Game link copied.");
      }
    } catch {}
  };

  const install = async () => {
    const result = await requestIOPlayInstall(`/games/${slug}/`);
    setMessage(result);
  };

  return <div class="game-top-actions">
    <button class={saved ? "saved" : ""} onClick={() => toggle(slug)}>
      <span>{saved ? "♥" : "♡"}</span>{saved ? "Saved" : "Save Game"}
    </button>
    <button class="install-action" onClick={install}>
      <span>⇩</span>Install
    </button>
    {onFullscreen && <button onClick={onFullscreen}><span>⛶</span>Fullscreen</button>}
    <button onClick={share}><span>↗</span>Share</button>
    <span class="game-action-note">No account required</span>
    {message && <div class="game-action-feedback" role="status">{message}</div>}
  </div>;
}

function SiteInstallButton({ compact = false }: { compact?: boolean }) {
  const [message, setMessage] = useState("");
  const install = async () => {
    const result = await requestIOPlayInstall("/");
    setMessage(result);
    if (compact && result) window.setTimeout(() => setMessage(""), 3500);
  };
  return <span class={compact ? "site-install-wrap compact" : "site-install-wrap"}>
    <button class="site-install-button" onClick={install} title="Install IOPlay">
      <span>⇩</span>{compact ? "" : "Install"}
    </button>
    {message && <span class="site-install-feedback">{message}</span>}
  </span>;
}

function CompactGameActions({ slug, onFullscreen, onRestart }: {
  slug: string;
  onFullscreen?: () => void;
  onRestart?: () => void;
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
    {onRestart && <button onClick={onRestart} title="Reload game">↻</button>}
    {onFullscreen && <button onClick={onFullscreen} title="Fullscreen">⛶</button>}
  </div>;
}

function controlChips(text: string) {
  const source = String(text || "");
  const tests: Array<[RegExp, string]> = [
    [/\barrow keys?\b|\barrows?\b/i, "Arrow Keys"],
    [/\bwasd\b/i, "WASD"],
    [/\bmouse\b/i, "Mouse"],
    [/\btouch\b|\btap\b/i, "Touch"],
    [/\bspace(?:bar)?\b/i, "Space"],
    [/\bctrl|control key\b/i, "Ctrl"],
    [/\balt\b/i, "Alt"],
    [/\bshift\b/i, "Shift"],
    [/\benter\b/i, "Enter"],
    [/\besc(?:ape)?\b/i, "Esc"],
    [/\bnumber keys?\b|\b1-9\b/i, "Number Keys"],
  ];
  return tests.filter(([pattern]) => pattern.test(source)).map(([, label]) => label);
}

function GameFeatureChips() {
  return <div class="game-feature-chips">
    <span>✓ Play in Browser</span>
    <span>♡ Save Locally</span>
    <span>⇩ Installable</span>
    <span>⌨ Controls Included</span>
    <span>◎ No Account Required</span>
  </div>;
}

function ControlGuide({ text }: { text: string }) {
  const chips = controlChips(text);
  return <div class="control-guide">
    <div class="control-guide-head">
      <span class="control-guide-icon">⌨</span>
      <div><strong>Controls & How to Play</strong><small>Game controls</small></div>
    </div>
    <p>{text}</p>
    {chips.length > 0 && <div class="control-chips">
      {chips.map((chip) => <span>{chip}</span>)}
    </div>}
  </div>;
}

function Comments({ slug, title }: { slug: string; title: string }) {
  const rootRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!("IntersectionObserver" in window)) {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setActive(true);
        observer.disconnect();
      }
    }, { rootMargin: "500px 0px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, [slug]);

  useEffect(() => {
    if (!active) return;
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
  }, [active, slug, title]);

  return <section class="comments-card" ref={rootRef}>
    <div class="eyebrow">Community</div>
    <h2>Comments</h2>
    {!active && <button class="secondary lazy-comments-button" onClick={() => setActive(true)}>Load comments</button>}
    {active && <div id="disqus_thread"></div>}
    <noscript>Please enable JavaScript to view comments.</noscript>
  </section>;
}

function NativeGamePage({ game }: { game: Game }) {
  const playerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef<DosProps | null>(null);
  const [props, setProps] = useState<DosProps | null>(null);
  const [status, setStatus] = useState(game.engine === "external" ? "Ready to launch" : game.availability === "playable" ? "Ready to install" : "Use your own .jsdos bundle");
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [externalStarted, setExternalStarted] = useState(false);

  useEffect(() => {
    updateSeo(`${game.title} Online — Play in Browser`, game.description, `/games/${game.slug}/`, game.image);
    recordRecentGame({
      slug: game.slug,
      title: game.title,
      image: game.image || "",
      category: taxonomySlug(nativeCategories(game)[0] || "pc-browser-classics"),
      tags: nativeTags(game).map(taxonomySlug),
      collections: nativeCategories(game).map(taxonomySlug),
      type: "native",
      isNew: false,
    });
    return () => {
      propsRef.current?.stop().catch(() => undefined);
      propsRef.current = null;
    };
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
      propsRef.current = next;
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
      propsRef.current = next;
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

  const restart = async () => {
    if (game.engine === "external") {
      setExternalStarted(false);
      setRunning(false);
      window.setTimeout(() => {
        setExternalStarted(true);
        setRunning(true);
      }, 60);
      return;
    }
    if (props) await props.stop().catch(() => undefined);
    propsRef.current = null;
    setProps(null);
    setRunning(false);
    setProgress(0);
    installAndPlay();
  };

  const categories = nativeCategories(game);
  const tags = [...nativeTags(game), ...categories, game.platform];

  return <main class="play-page">
    <div class="play-shell">
      <GameSidebar />
      <section class="play-main">
        <GameTopActions slug={game.slug} onFullscreen={fullscreen} />
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
          <CompactGameActions slug={game.slug} onFullscreen={fullscreen} onRestart={restart} />
        </div>

        {!game.externalUrl && <div class="native-tools-row">
          <button onClick={() => props?.save()} disabled={!props}>Save</button>
          <button onClick={() => props?.setPaused(false)} disabled={!props}>Resume</button>
          <label class="bundle-import">Import bundle<input type="file" accept=".jsdos,.zip,application/zip" onChange={upload as any} /></label>
          <button onClick={() => { props?.stop(); propsRef.current = null; setProps(null); setRunning(false); setStatus("Stopped"); }} disabled={!props}>Stop</button>
        </div>}

        <section class="game-details-card">
          <h2>Game details</h2>
          <p>{game.description}</p>
          <GameFeatureChips />
          <div class="detail-mini-grid">
            <div><strong>Developer</strong><span>{game.developer}</span></div>
            <div><strong>Categories</strong><span>{categories.join(", ")}</span></div>
            <div><strong>Platform</strong><span>{game.platform}</span></div>
          </div>
          <ControlGuide text={game.controls} />
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
  const [frameVersion, setFrameVersion] = useState(0);
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setGame(null);
    setRelated([]);
    setFrameReady(false);

    loadWebGame(slug).then((detail) => {
      if (cancelled) return;
      setGame(detail);
      if (!detail) return;

      recordRecentGame({
        slug: detail.slug,
        title: detail.title,
        image: detail.image,
        category: detail.category,
        tags: detail.tags,
        collections: detail.collections,
        type: detail.type || "browser",
        isNew: detail.isNew,
      });

      updateSeo(`${detail.title} Online — Play Free in Browser`, detail.description, `/games/${detail.slug}/`, detail.image);

      const loadRelated = () => {
        const relatedSlug = detail.collections?.[0] || detail.category;
        loadCategoryGames(relatedSlug).then((items) => {
          if (cancelled) return;
          setRelated(items.filter((item) => item.slug !== detail.slug).slice(0, 12));
        });
      };

      const win = window as any;
      if (typeof win.requestIdleCallback === "function") win.requestIdleCallback(loadRelated, { timeout: 900 });
      else window.setTimeout(loadRelated, 250);
    });

    return () => { cancelled = true; };
  }, [slug]);

  if (!game) return <main class="play-page"><div class="play-shell game-loading-shell"><GameSidebar /><section class="play-main"><div class="play-stage game-stage-skeleton" /></section></div></main>;

  const displayTags = [
    "Browser Game",
    ...game.tags.map((tag) => tag.replace(/-/g, " ")),
    ...game.collections.map((tag) => tag.replace(/-/g, " "))
  ];

  const fullscreen = () => (document.querySelector(".html5-frame") as HTMLIFrameElement | null)?.requestFullscreen?.();
  const restart = () => {
    setFrameReady(false);
    setFrameVersion((value) => value + 1);
  };
  let sourceHost = "browser game";
  try {
    sourceHost = new URL(game.url).hostname.replace(/^www\./, "");
  } catch {}

  return <main class="play-page">
    <div class="play-shell">
      <GameSidebar />

      <section class="play-main">
        <GameTopActions slug={game.slug} onFullscreen={fullscreen} />
        <div class="embedded-browser">
          <div class="embedded-browser-bar">
            <div class="browser-window-dots" aria-hidden="true"><span /><span /><span /></div>
            <div class="browser-address">
              <span class="browser-lock">●</span>
              <span class="browser-address-title">{game.title}</span>
              <small>{sourceHost}</small>
            </div>
            <button class="browser-reload" onClick={restart} title="Reload game" aria-label="Reload game">↻</button>
          </div>
          <div class="play-stage web-play-stage">
            {!frameReady && <div class="browser-game-poster">
              <img src={game.image} alt={`${game.title} game preview`} />
              <div class="browser-game-poster-shade">
                <span class="browser-live-chip">Browser game</span>
                <strong>{game.title}</strong>
                <small>Loading game inside IOPlay…</small>
              </div>
            </div>}
            <iframe
              key={frameVersion}
              class={`html5-frame ${frameReady ? "ready" : ""}`}
              src={game.url}
              title={game.title}
              allow="fullscreen; autoplay; gamepad"
              allowFullScreen
              scrolling="no"
              loading="eager"
              onLoad={() => setFrameReady(true)}
            />
          </div>
        </div>

        <div class="play-bottom-bar">
          <div class="play-title">
            <strong>{game.title}</strong>
            <span>{game.category.replace(/-/g, " ")}</span>
          </div>
          <CompactGameActions slug={game.slug} onFullscreen={fullscreen} onRestart={restart} />
        </div>

        <section class="game-details-card">
          <h2>Game details</h2>
          <p>{game.description}</p>
          <GameFeatureChips />
          <div class="detail-mini-grid">
            <div><strong>Category</strong><span>{game.category.replace(/-/g, " ")}</span></div>
            <div><strong>Game type</strong><span>Browser Game</span></div>
            <div><strong>Play mode</strong><span>In-browser</span></div>
          </div>
          <ControlGuide text={game.instructions || "Use the controls shown inside the game."} />
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
  const [webMatches, setWebMatches] = useState<WebIndexGame[]>([]);
  const [meta, setMeta] = useState<CatalogMeta>({ count: 0, categories: [], tags: [] });
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(72);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setVisible(72);
    Promise.all([
      kind === "category" ? loadCategoryGames(slug) : loadTagGames(slug),
      loadCatalogMeta(),
    ]).then(([items, info]) => {
      if (!active) return;
      setWebMatches(items);
      setMeta(info);
      setLoading(false);
    });
    return () => { active = false; };
  }, [kind, slug]);

  const nativeMatches = games.filter((game) => {
    if (kind === "category") return nativeCategories(game).some((name) => taxonomySlug(name) === slug);
    return nativeTags(game).some((name) => taxonomySlug(name) === slug);
  });

  const categoryLookup = [...meta.categories, ...(meta.rawCategories || [])];
  const lookup = kind === "category" ? categoryLookup : meta.tags;
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
    <p class="section-sub">{loading ? "Loading games…" : `${nativeMatches.length + webMatches.length} games in this ${kind}.`}</p>
    {loading ? <div class="listing-skeleton-grid">{Array.from({ length: 16 }).map((_, i) => <div class="skeleton-game large" key={i} />)}</div> : <>
      <div class="game-grid">
        {nativeMatches.map((game) => <NativeCard game={game} />)}
        {webMatches.slice(0, visible).map((game) => <WebCard game={game} />)}
      </div>
      {visible < webMatches.length && <div class="load-more"><button class="primary" onClick={() => setVisible((value) => value + 72)}>Load more</button></div>}
    </>}
  </main>;
}

function RecentPage() {
  const [recent, setRecent] = useState<RecentGame[]>([]);
  useEffect(() => {
    setRecent(readRecentGames());
    updateSeo("Recently Played Games — IOPlay", "Games recently played on this device.", "/recent/");
  }, []);

  const clearRecent = () => {
    localStorage.removeItem(RECENT_KEY);
    setRecent([]);
  };

  return <main class="portal-shell listing-page">
    <button class="back" onClick={() => go("/")}>← Back to home</button>
    <div class="listing-title-row">
      <div>
        <div class="eyebrow">Your device</div>
        <h1>Recently Played</h1>
      </div>
      {recent.length > 0 && <button class="secondary" onClick={clearRecent}>Clear history</button>}
    </div>
    {recent.length === 0
      ? <p class="section-sub">Games you play will appear here automatically.</p>
      : <div class="game-grid">
          {recent.map((item) => {
            const native = getGame(item.slug);
            if (native) return <NativeCard game={native} />;
            const web: WebIndexGame = {
              slug: item.slug,
              title: item.title,
              image: item.image,
              category: item.category,
              tags: item.tags,
              collections: item.collections,
              type: item.type,
              isNew: item.isNew,
            };
            return <WebCard game={web} />;
          })}
        </div>}
  </main>;
}

function FavoritesPage() {
  const { favorites } = useFavorites();
  const [index, setIndex] = useState<WebIndexGame[]>([]);
  useEffect(() => {
    loadCatalogIndex().then(setIndex);
    updateSeo("Favorite Games — IOPlay", "Your favorite browser games saved on this device.", "/favorites/");
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

function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation());
  const [headerQuery, setHeaderQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handle = () => {
      setRoute(routeFromLocation());
      if (routeFromLocation().type !== "home") setHeaderQuery("");
    };
    addEventListener("popstate", handle);
    return () => removeEventListener("popstate", handle);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const params = new URLSearchParams(location.search);
    if (params.get("launch") === "installed") {
      const target = localStorage.getItem(INSTALL_START_KEY) || "/";
      history.replaceState({}, "", target);
      setRoute(routeFromLocation());
    }
  }, []);

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "/" && !editing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
      }
    };
    addEventListener("keydown", handleSearchShortcut);
    return () => removeEventListener("keydown", handleSearchShortcut);
  }, []);

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
  } else if (route.type === "recent") {
    content = <RecentPage />;
  }

  return <>
    <header class="site-header screenshot-header">
      <div class="portal-shell screenshot-nav">
        <button class="hamburger-button" onClick={openCategories} aria-label="Browse categories" title="Browse categories">☰</button>

        <button class="brand compact-brand" onClick={() => go("/")} aria-label="IOPlay home">
          <span class="brand-mark"><img src="/favicon.svg" alt="" /><span class="brand-pulse" /></span>
          <span class="brand-word"><strong>Play</strong><em>Zone</em></span>
        </button>

        <nav class="header-quick-links" aria-label="Quick game categories">
          <button onClick={() => go("/category/new-games/")}>New</button>
          <button onClick={() => go("/category/driving-racing/")}>Racing</button>
          <button onClick={() => go("/category/shooting/")}>Shooting</button>
          <button onClick={() => go("/category/io-multiplayer/")}>IO Games</button>
          <button onClick={() => go("/category/arcade-classic/")}>Arcade</button>
        </nav>

        <label class="top-search">
          <span class="top-search-icon">⌕</span>
          <input
            ref={searchRef}
            value={headerQuery}
            onInput={(e) => sendSearch((e.target as HTMLInputElement).value)}
            placeholder="Search 38,000+ browser games"
            aria-label="Search games"
            autoComplete="off"
            spellcheck={false}
          />
          {headerQuery
            ? <button class="top-search-clear" type="button" onClick={() => sendSearch("")} aria-label="Clear search">×</button>
            : <kbd class="search-shortcut">/</kbd>}
        </label>

        <button class="top-favorite-button" onClick={() => go("/favorites/")} aria-label="Favorites" title="Favorite games">
          <span>♡</span>
        </button>
        <SiteInstallButton compact />
      </div>
    </header>

    {content}

    <nav class="mobile-dock" aria-label="Mobile navigation">
      <button onClick={() => go("/")}><span>⌂</span><small>Home</small></button>
      <button onClick={openCategories}><span>▤</span><small>Categories</small></button>
      <button onClick={() => go("/favorites/")}><span>♡</span><small>Favorites</small></button>
      <button onClick={() => requestIOPlayInstall("/")}><span>⇩</span><small>Install</small></button>
    </nav>

    <footer class="site-footer">
      <div class="portal-shell footer-main">
        <div class="footer-brand-column">
          <button class="footer-brand" onClick={() => go("/")} aria-label="IOPlay home">
            <span class="brand-mark"><img src="/favicon.svg" alt="" /></span>
            <span><strong>IOPlay</strong><small>Free browser games</small></span>
          </button>
          <p>Play free browser games, PC classics, IO games and multiplayer favorites in one fast, mobile-friendly gaming hub.</p>
          <div class="footer-badges">
            <span>38K+ Games</span>
            <span>Mobile Ready</span>
            <span>No Database Required</span>
          </div>
        </div>

        <div class="footer-link-column">
          <strong>Popular</strong>
          <button onClick={() => go("/category/new-games/")}>New Games</button>
          <button onClick={() => go("/category/driving-racing/")}>Driving & Racing</button>
          <button onClick={() => go("/category/shooting/")}>Shooting</button>
          <button onClick={() => go("/category/multiplayer/")}>Multiplayer</button>
          <button onClick={() => go("/category/io-multiplayer/")}>IO & Multiplayer</button>
        </div>

        <div class="footer-link-column">
          <strong>Discover</strong>
          <button onClick={() => go("/category/arcade-classic/")}>Arcade & Classic</button>
          <button onClick={() => go("/category/board-puzzle/")}>Board & Puzzle</button>
          <button onClick={() => go("/category/adventure-rpg/")}>Adventure & RPG</button>
          <button onClick={() => go("/category/pc-browser-classics/")}>PC & Browser Classics</button>
        </div>

        <div class="footer-link-column">
          <strong>Your Arcade</strong>
          <button onClick={() => go("/favorites/")}>Favorite Games</button>
          <button onClick={() => go("/recent/")}>Recently Played</button>
          <button onClick={() => searchRef.current?.focus()}>Search Games</button>
          <button onClick={openCategories}>Browse Categories</button>
          <button onClick={() => requestIOPlayInstall("/")}>Install IOPlay</button>
        </div>
      </div>

      <div class="footer-bottom">
        <div class="portal-shell footer-bottom-inner">
          <span>© 2026 IOPlay</span>
          <span>Browser Games · PC Classics · WebAssembly</span>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button>
        </div>
      </div>
    </footer>

  </>;
}

render(<App />, document.getElementById("portal")!);
