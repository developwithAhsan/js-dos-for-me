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
      <FavoriteButton slug={game.slug} compact />
    </div>
    <div class="game-card-body">
      <span class="badge">HTML5</span>
      <h3>{game.title}</h3>
      <div class="meta">{game.category.replace(/-/g, " ")}</div>
      <div class="genre-list">{game.tags.slice(0, 4).map((tag) => <span class="genre">{tag.replace(/-/g, " ")}</span>)}</div>
    </div>
  </article>;
}


const featuredTaxonomy = [
  { label: "Driving & Racing", slug: "driving-racing", symbol: "DR" },
  { label: "Multiplayer", slug: "multiplayer", symbol: "MP" },
  { label: "Arcade & Classic", slug: "arcade-classic", symbol: "AC" },
  { label: "Board & Puzzle", slug: "board-puzzle", symbol: "BP" },
  { label: "Shooting", slug: "shooting", symbol: "SH" },
  { label: "Sports", slug: "sports", symbol: "SP" },
  { label: "Adventure & RPG", slug: "adventure-rpg", symbol: "AR" },
  { label: "Strategy & Defense", slug: "strategy-defense", symbol: "SD" },
  { label: "Kids & Educational", slug: "kids-educational", symbol: "KE" },
  { label: "Management & Simulation", slug: "management-simulation", symbol: "MS" },
  { label: "Girls & Lifestyle", slug: "girls-lifestyle", symbol: "GL" },
  { label: "Fun & Crazy", slug: "fun-crazy", symbol: "FC" },
];

function GameRail({ title, subtitle, items, categorySlug, symbol = "GM" }: {
  title: string;
  subtitle?: string;
  items: WebIndexGame[];
  categorySlug: string;
  symbol?: string;
}) {
  if (!items.length) return null;
  return <section class="home-rail">
    <div class="rail-head">
      <div>
        <div class="rail-title"><span class="rail-icon">{symbol}</span><h2>{title}</h2></div>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button class="rail-more" onClick={() => go(`/category/${categorySlug}/`)}>View all <span>→</span></button>
    </div>
    <div class="rail-track">
      {items.map((game) => <WebCard game={game} />)}
    </div>
  </section>;
}


function HomeGameTile({ game, isNew = false }: { game: WebIndexGame; isNew?: boolean }) {
  return <article class="shelf-game-card" onClick={() => go(`/games/${game.slug}/`)}>
    <img src={game.image} alt={`${game.title} online game thumbnail`} loading="lazy" />
    {isNew && <span class="new-ribbon">NEW</span>}
    <div class="shelf-game-overlay">
      <strong>{game.title}</strong>
      <span class="shelf-game-meta">{game.tags.slice(0, 2).map((tag) => tag.replace(/-/g, " ")).join(" · ")}</span>
      <FavoriteButton slug={game.slug} compact />
    </div>
  </article>;
}

function CategoryShelf({ title, slug, items, count, tone, isNewRow = false }: {
  title: string;
  slug: string;
  items: WebIndexGame[];
  count: number;
  tone: string;
  isNewRow?: boolean;
}) {
  if (!items.length) return null;
  const cover = items[0]?.image;
  return <section class="category-shelf">
    <button
      class={`category-cover ${tone}`}
      onClick={() => go(`/category/${slug}/`)}
      style={cover ? { backgroundImage: `linear-gradient(90deg, rgba(8,18,30,.96) 0%, rgba(8,18,30,.70) 48%, rgba(8,18,30,.10) 100%), url("${cover}")` } : undefined}
    >
      <span class="category-cover-content">
        <strong>{title}</strong>
        <small>{count.toLocaleString()} games</small>
      </span>
      <span class="category-open-arrow">›</span>
    </button>
    <div class="shelf-games" aria-label={`${title} games`}>
      {items.slice(0, 8).map((game, index) =>
        <HomeGameTile game={game} isNew={isNewRow ? index < 3 : index === 5} />
      )}
      <button class="shelf-next" onClick={() => go(`/category/${slug}/`)} aria-label={`View all ${title} games`}>›</button>
    </div>
  </section>;
}

function Home() {
  const [index, setIndex] = useState<WebIndexGame[]>([]);
  const [meta, setMeta] = useState<CatalogMeta>({ count: 0, categories: [], tags: [] });
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([loadCatalogIndex(), loadCatalogMeta()]).then(([gamesList, info]) => {
      setIndex(gamesList);
      setMeta(info);
    });
    updateSeo(
      "DOS Arcade — Play Browser, HTML5 & Classic PC Games",
      "Play browser games by category including racing, shooting, action, adventure, multiplayer, arcade, puzzle, sports and classic PC games.",
      "/"
    );
  }, []);

  const categoryCount = (slug: string) => meta.categories.find((category) => category.slug === slug)?.count || 0;
  const byCollection = (slug: string, count = 18) => index.filter((game) => game.collections?.includes(slug)).slice(0, count);
  const search = query.trim().toLowerCase();
  const searchResults = search
    ? index.filter((game) => [game.title, game.category, ...(game.tags || [])].join(" ").toLowerCase().includes(search)).slice(0, 80)
    : [];

  const shelves = [
    { title: "Driving & Racing", slug: "driving-racing", tone: "tone-cyan", items: byCollection("driving-racing"), isNewRow: false },
    { title: "Shooting", slug: "shooting", tone: "tone-gold", items: byCollection("shooting"), isNewRow: true },
    { title: "Arcade & Classic", slug: "arcade-classic", tone: "tone-red", items: byCollection("arcade-classic"), isNewRow: false },
    { title: "Adventure & RPG", slug: "adventure-rpg", tone: "tone-green", items: byCollection("adventure-rpg"), isNewRow: true },
    { title: "Girls & Lifestyle", slug: "girls-lifestyle", tone: "tone-pink", items: byCollection("girls-lifestyle"), isNewRow: false },
    { title: "Board & Puzzle", slug: "board-puzzle", tone: "tone-violet", items: byCollection("board-puzzle"), isNewRow: false },
    { title: "Multiplayer", slug: "multiplayer", tone: "tone-blue", items: byCollection("multiplayer"), isNewRow: true },
    { title: "Sports", slug: "sports", tone: "tone-orange", items: byCollection("sports"), isNewRow: false },
    { title: "Strategy & Defense", slug: "strategy-defense", tone: "tone-slate", items: byCollection("strategy-defense"), isNewRow: false },
    { title: "Management & Simulation", slug: "management-simulation", tone: "tone-teal", items: byCollection("management-simulation"), isNewRow: false },
    { title: "Kids & Educational", slug: "kids-educational", tone: "tone-lime", items: byCollection("kids-educational"), isNewRow: false },
    { title: "Fun & Crazy", slug: "fun-crazy", tone: "tone-purple", items: byCollection("fun-crazy"), isNewRow: false },
  ];

  return <main class="shelf-home">
    <div class="portal-shell shelf-search-row">
      <div class="home-search-box">
        <span>⌕</span>
        <input
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder={`Search our ${meta.count ? meta.count.toLocaleString() : "38,000+"} games`}
          aria-label="Search all games"
        />
        {query && <button class="search-clear" onClick={() => setQuery("")}>×</button>}
      </div>
    </div>

    {search ? <section class="portal-shell search-results-panel">
      <div class="compact-results-head">
        <strong>Search results</strong>
        <span>{searchResults.length} shown</span>
      </div>
      <div class="search-game-grid">
        {searchResults.map((game, index) => <HomeGameTile game={game} isNew={index < 4} />)}
      </div>
    </section> : <>
      <div class="portal-shell shelf-list">
        {shelves.map((shelf) =>
          <CategoryShelf
            title={shelf.title}
            slug={shelf.slug}
            items={shelf.items}
            count={categoryCount(shelf.slug)}
            tone={shelf.tone}
            isNewRow={shelf.isNewRow}
          />
        )}

        <section class="category-shelf native-home-shelf">
          <button class="category-cover tone-native" onClick={() => go("/category/browser-native-games/")}>
            <span class="category-cover-content">
              <strong>PC & Browser Classics</strong>
              <small>{games.length} featured games</small>
            </span>
            <span class="category-open-arrow">›</span>
          </button>
          <div class="shelf-games">
            {games.slice(0, 8).map((game, index) => <article class="shelf-game-card native-shelf-card" onClick={() => go(`/games/${game.slug}/`)}>
              <NativeThumb game={game} />
              {index < 2 && <span class="new-ribbon">NEW</span>}
              <div class="shelf-game-overlay">
                <strong>{game.title}</strong>
                <span class="shelf-game-meta">{game.platform}</span>
                <FavoriteButton slug={game.slug} compact />
              </div>
            </article>)}
            <button class="shelf-next" onClick={() => go("/category/browser-native-games/")}>›</button>
          </div>
        </section>
      </div>
    </>}

    <div class="portal-shell home-directory-link">
      <button onClick={() => go("/category/arcade-classic/")}>Browse all categories</button>
      <span>{meta.count.toLocaleString()} games available</span>
    </div>
  </main>;
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
    updateSeo(
      `${game.title} Online — Play in Browser`,
      game.description,
      `/games/${game.slug}/`,
      game.image
    );
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

  return <main class="game-page portal-shell">
    <button class="back" onClick={() => go("/")}>← Back to games</button>
    <TaxonomyChips categories={nativeCategories(game)} tags={nativeTags(game)} />
    <div class="game-title-row">
      <div><span class="badge">{game.badge}</span><h1>{game.title}</h1><div class="meta">{game.year} · {game.platform} · {game.developer}</div></div>
      <FavoriteButton slug={game.slug} />
    </div>

    <div class="game-layout">
      <section class="player-card">
        <div class="player-frame">
          {game.engine === "external" && externalStarted && game.externalUrl
            ? <iframe class="html5-frame" src={game.externalUrl} title={game.title} allow="fullscreen; autoplay; gamepad" allowFullScreen />
            : <div id="dos-player" ref={playerRef}></div>}
          {!running && <div class="player-empty">
            <div>
              <h2>{game.title}</h2>
              <p>{status}</p>
              {progress > 0 && <><div class="progress-track"><div class="progress-bar" style={{ width: `${progress}%` }} /></div><div class="meta">{progress}%</div></>}
              {(game.bundleUrl || game.demoZipUrl || game.externalUrl) && <button class="primary" onClick={installAndPlay}>{game.engine === "external" ? "Launch Game" : "Install & Play"}</button>}
            </div>
          </div>}
        </div>
        <div class="player-toolbar">
          {game.externalUrl && <a class="secondary button-link" href={game.externalUrl} target="_blank" rel="noopener">Open full page</a>}
          {!game.externalUrl && <>
            <button class="secondary" onClick={() => props?.setFullScreen(true)} disabled={!props}>Fullscreen</button>
            <button class="secondary" onClick={() => props?.save()} disabled={!props}>Save</button>
            <button class="secondary" onClick={() => props?.setPaused(false)} disabled={!props}>Resume</button>
            <button class="danger" onClick={() => { props?.stop(); setRunning(false); setStatus("Stopped"); }} disabled={!props}>Stop</button>
          </>}
        </div>
      </section>

      <aside class="info-card">
        <NativeThumb game={game} />
        <p>{game.description}</p>
        <div class="info-row"><strong>Developer</strong>{game.developer}</div>
        <div class="info-row"><strong>Categories</strong>{nativeCategories(game).join(", ")}</div>
        <div class="info-row"><strong>Controls</strong>{game.controls}</div>
        {game.sourceLabel && <div class="info-row"><strong>Game source</strong>{game.sourceLabel}</div>}
        {!game.externalUrl && <div class="upload-box">
          <strong>Optional: use your own game bundle</strong>
          <div>You can also choose a compatible .jsdos/ZIP bundle stored on your device.</div>
          <input type="file" accept=".jsdos,.zip,application/zip" onChange={upload as any} />
        </div>}
      </aside>
    </div>
    <Comments slug={game.slug} title={game.title} />
  </main>;
}

function WebGamePage({ slug }: { slug: string }) {
  const [game, setGame] = useState<WebGame | null>(null);
  const [related, setRelated] = useState<WebIndexGame[]>([]);

  useEffect(() => {
    Promise.all([loadWebGame(slug), loadCatalogIndex()]).then(([detail, index]) => {
      setGame(detail);
      if (detail) {
        setRelated(index.filter((item) => item.category === detail.category && item.slug !== detail.slug).slice(0, 8));
        updateSeo(
          `${detail.title} Online — Play Free in Browser`,
          detail.description,
          `/games/${detail.slug}/`,
          detail.image
        );
      }
    });
  }, [slug]);

  if (!game) return <main class="portal-shell loading-page"><h1>Loading game…</h1></main>;

  return <main class="game-page portal-shell">
    <button class="back" onClick={() => go("/")}>← Back to games</button>
    <TaxonomyChips
      categories={[game.category.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())]}
      tags={game.tags.map((tag) => tag.replace(/-/g, " "))}
    />
    <div class="game-title-row">
      <div><span class="badge">HTML5</span><h1>{game.title}</h1><div class="meta">Play online in browser</div></div>
      <FavoriteButton slug={game.slug} />
    </div>
    <div class="game-layout">
      <section class="player-card">
        <div class="player-frame web-player-frame">
          <iframe class="html5-frame" src={game.url} title={game.title} allow="fullscreen; autoplay; gamepad" allowFullScreen scrolling="no" />
        </div>
        <div class="player-toolbar">
          <button class="secondary" onClick={() => (document.querySelector(".html5-frame") as HTMLIFrameElement | null)?.requestFullscreen?.()}>Fullscreen</button>
          <a class="secondary button-link" href={game.url} target="_blank" rel="noopener">Open game directly</a>
        </div>
      </section>
      <aside class="info-card">
        <img class="game-thumb detail-thumb" src={game.image} alt={`${game.title} game thumbnail`} />
        <p>{game.description}</p>
        <div class="info-row"><strong>Category</strong>{game.category.replace(/-/g, " ")}</div>
        <div class="info-row"><strong>Game type</strong>{game.type || "HTML5"}</div>
        <div class="info-row"><strong>How to play</strong>{game.instructions}</div>
      </aside>
    </div>
    {related.length > 0 && <section class="related-section">
      <div class="section-head"><div><div class="eyebrow">More like this</div><h2>Related games</h2></div></div>
      <div class="game-grid">{related.map((item) => <WebCard game={item} />)}</div>
    </section>}
    <Comments slug={game.slug} title={game.title} />
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
    {visible < webMatches.length && <div class="load-more"><button class="primary" onClick={() => setVisible(visible + 72)}>Load more</button></div>}
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
  const [profile, setProfile] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; }
  });

  useEffect(() => {
    const handle = () => setRoute(routeFromLocation());
    addEventListener("popstate", handle);
    return () => removeEventListener("popstate", handle);
  }, []);

  const closeAccount = () => {
    setAccountOpen(false);
    try { setProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) || "null")); } catch {}
  };

  let content: any = <Home />;
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
    <header class="site-header">
      <div class="portal-shell nav">
        <button class="brand" onClick={() => go("/")}>
          <span class="brand-mark"><span class="brand-core">DA</span><span class="brand-pulse" /></span>
          <span class="brand-word"><strong>DOS</strong><em>Arcade</em></span>
        </button>
        <nav class="nav-links">
          <button onClick={() => go("/")}>Discover</button>
          <button onClick={() => go("/category/driving-racing/")}>Racing</button>
          <button onClick={() => go("/category/multiplayer/")}>Multiplayer</button>
          <button onClick={() => go("/category/browser-native-games/")}>Browser 3D</button>
          <button class="nav-favorite" onClick={() => go("/favorites/")}>♡ Favorites</button>
          <button class="account-trigger" onClick={() => setAccountOpen(true)}>{profile?.name || "Sign in"}</button>
        </nav>
      </div>
    </header>
    <div class="header-category-strip">
      <div class="portal-shell quick-categories">
        {featuredTaxonomy.slice(0, 8).map((item) => <button onClick={() => go(`/category/${item.slug}/`)}>{item.label}</button>)}
      </div>
    </div>
    {content}
    <nav class="mobile-dock">
      <button onClick={() => go("/")}><span>⌂</span><small>Home</small></button>
      <button onClick={() => go("/category/driving-racing/")}><span>▤</span><small>Categories</small></button>
      <button onClick={() => go("/favorites/")}><span>♡</span><small>Favorites</small></button>
      <button onClick={() => setAccountOpen(true)}><span>○</span><small>Profile</small></button>
    </nav>
    <footer class="footer"><div class="portal-shell">DOS Arcade · DOS, HTML5 and browser-native games · Original game publishers retain their respective rights.</div></footer>
    {accountOpen && <AccountModal close={closeAccount} />}
  </>;
}

render(<App />, document.getElementById("portal")!);
