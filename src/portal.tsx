/* eslint-disable */
import { render } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { unzipSync } from "fflate";
import { Dos } from "./main";
import type { DosProps } from "./public/types";
import { games, genres, getGame, type Game } from "./games";
import "./portal.css";

const CACHE_NAME = "dos-arcade-bundles-v1";

function slugFromLocation() {
  const match = location.pathname.match(/^\/games\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

function updateSeo(game?: Game) {
  const title = game ? `${game.title} Online — Play DOS Game in Browser` : "DOS Arcade — Play Classic DOS Games in Browser";
  const description = game
    ? `Play ${game.title} in your browser with js-dos. Fullscreen, local saves, install caching and mobile-ready controls.`
    : "Play classic DOS games in your browser with js-dos, local caching, fullscreen, saves, search and mobile-ready controls.";

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
  canonical.href = game ? `${location.origin}/games/${game.slug}/` : `${location.origin}/`;

  let schema = document.getElementById("page-schema") as HTMLScriptElement | null;
  if (!schema) {
    schema = document.createElement("script");
    schema.id = "page-schema";
    schema.type = "application/ld+json";
    document.head.appendChild(schema);
  }
  schema.textContent = JSON.stringify(game ? {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    datePublished: String(game.year),
    genre: game.genres,
    gamePlatform: game.platform,
    description: game.description
  } : {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "DOS Arcade",
    url: location.origin,
    description
  });
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
    const blob = await cached.blob();
    return URL.createObjectURL(blob);
  }

  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);

  const total = Number(response.headers.get("content-length") || 0);
  if (!response.body) {
    const blob = await response.blob();
    await cache.put(url, new Response(blob, { headers: { "content-type": "application/octet-stream" } }));
    onProgress(100, "Installed — starting...");
    return URL.createObjectURL(blob);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    const percent = total ? Math.min(99, Math.round((received / total) * 100)) : Math.min(95, 8 + Math.round(received / (1024 * 1024)));
    const mb = (received / 1024 / 1024).toFixed(1);
    onProgress(percent, total ? `Installing… ${percent}% (${mb} MB)` : `Installing… ${mb} MB`);
  }

  const blob = new Blob(chunks, { type: "application/octet-stream" });
  await cache.put(url, new Response(blob, { headers: { "content-type": "application/octet-stream" } }));
  onProgress(100, "Installed — starting...");
  return URL.createObjectURL(blob);
}


async function prepareDemoZip(url: string, onProgress: (value: number, label: string) => void) {
  const cache = "caches" in window ? await caches.open(CACHE_NAME + "-demo-zips") : null;
  const cached = cache ? await cache.match(url) : null;
  if (cached) {
    onProgress(100, "Installed locally — preparing game files...");
    return new Uint8Array(await cached.arrayBuffer());
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Demo download failed (HTTP ${response.status})`);

  const total = Number(response.headers.get("content-length") || 0);
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (cache) await cache.put(url, new Response(bytes));
    onProgress(100, "Downloaded — preparing game files...");
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    const percent = total ? Math.min(99, Math.round((received / total) * 100)) : Math.min(95, 8 + Math.round(received / (1024 * 1024)));
    const mb = (received / 1024 / 1024).toFixed(1);
    onProgress(percent, total ? `Installing demo… ${percent}% (${mb} MB)` : `Installing demo… ${mb} MB`);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (cache) await cache.put(url, new Response(bytes));
  onProgress(100, "Downloaded — preparing game files...");
  return bytes;
}

function go(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Home() {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const shown = useMemo(() => games.filter((game) => {
    const q = query.trim().toLowerCase();
    const matchesText = !q || [game.title, game.developer, game.platform, ...game.genres].join(" ").toLowerCase().includes(q);
    const matchesGenre = genre === "All" || game.genres.includes(genre);
    return matchesText && matchesGenre;
  }), [query, genre]);

  return <main>
    <section class="hero portal-shell">
      <div class="eyebrow">Browser-native retro gaming</div>
      <h1>Classic DOS games. One fast browser arcade.</h1>
      <p>DOS Arcade is built on js-dos 8 with local installation caching, fullscreen play, saves, mobile-ready input and game-specific pages designed for discoverability.</p>
      <div class="search-panel">
        <input aria-label="Search games" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} placeholder="Search DOOM, GTA, racing, FPS..." />
        <button class="primary" onClick={() => document.getElementById("library")?.scrollIntoView()}>Browse games</button>
      </div>
      <div class="stats">
        <div class="stat"><strong>{games.length}</strong><span>catalog entries</span></div>
        <div class="stat"><strong>{games.filter(g => g.availability === "playable").length}</strong><span>verified demo bundles</span></div>
        <div class="stat"><strong>OPFS</strong><span>save persistence + local cache</span></div>
      </div>
    </section>

    <section class="section portal-shell" id="library">
      <div class="section-head">
        <div>
          <div class="eyebrow">Game library</div>
          <h2>Choose a classic</h2>
        </div>
        <div class="section-sub">Playable entries start immediately. Other titles are ready for a lawful .jsdos bundle supplied by the owner/user.</div>
      </div>
      <div class="filters">
        {["All", ...genres].map((item) => <button class={`filter ${genre === item ? "active" : ""}`} onClick={() => setGenre(item)}>{item}</button>)}
      </div>
      <div class="game-grid">
        {shown.map((game) => <article class="game-card" key={game.slug}>
          <div>
            <span class="badge">{game.badge}</span>
            <h3>{game.title}</h3>
            <div class="meta">{game.year} · {game.platform} · {game.developer}</div>
            <div class="genre-list">{game.genres.map((tag) => <span class="genre">{tag}</span>)}</div>
          </div>
          <div class="card-actions">
            <span class="meta">{game.availability === "playable" ? "Install & play" : "Import supported"}</span>
            <button class="primary" onClick={() => go(`/games/${game.slug}/`)}>Open</button>
          </div>
        </article>)}
      </div>
    </section>
  </main>;
}

function GamePage({ game }: { game: Game }) {
  const playerRef = useRef<HTMLDivElement>(null);
  const [props, setProps] = useState<DosProps | null>(null);
  const [status, setStatus] = useState(game.availability === "playable" ? "Ready to install" : "Import your .jsdos bundle to play");
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => () => {
    props?.stop().catch(console.error);
    if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
  }, [props, objectUrl]);

  const launch = async (url: string, cacheRemote: boolean) => {
    if (!playerRef.current) return;
    try {
      setRunning(false);
      setProgress(2);
      setStatus(cacheRemote ? "Checking local installation..." : "Preparing local bundle...");
      await props?.stop().catch(() => undefined);
      playerRef.current.innerHTML = "";

      const readyUrl = cacheRemote ? await prepareBundle(url, (value, label) => {
        setProgress(value);
        setStatus(label);
      }) : url;

      if (readyUrl.startsWith("blob:")) setObjectUrl(readyUrl);
      setStatus("Starting emulator...");
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
      console.error(error);
      setRunning(false);
      setProgress(0);
      setStatus(error instanceof Error ? error.message : "Unable to start this game");
    }
  };

  const launchDemo = async (zipUrl: string, command: string) => {
    if (!playerRef.current) return;
    try {
      setRunning(false);
      setProgress(2);
      setStatus("Checking local demo installation...");
      await props?.stop().catch(() => undefined);
      playerRef.current.innerHTML = "";

      const zipBytes = await prepareDemoZip(zipUrl, (value, label) => {
        setProgress(value);
        setStatus(label);
      });
      const archive = unzipSync(zipBytes);
      const initFs = Object.entries(archive)
        .filter(([path]) => !path.endsWith("/"))
        .map(([path, contents]) => ({ path, contents }));

      if (initFs.length === 0) throw new Error("The demo archive did not contain game files.");

      setStatus("Starting emulator...");
      const next = Dos(playerRef.current, {
        dosboxConf: `
[sdl]
autolock=true

[dosbox]
memsize=32

[cpu]
core=auto
cycles=max

[sblaster]
sbtype=sb16

[autoexec]
@echo off
mount c .
c:
${command}
`,
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
      console.error(error);
      setRunning(false);
      setProgress(0);
      setStatus(error instanceof Error ? error.message : "Unable to start this demo");
    }
  };

  const installAndPlay = () => {
    if (game.demoZipUrl && game.command) {
      launchDemo(game.demoZipUrl, game.command);
      return;
    }
    if (game.bundleUrl) launch(game.bundleUrl, true);
  };

  const upload = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".jsdos") && !file.name.toLowerCase().endsWith(".zip")) {
      setStatus("Please choose a .jsdos or compatible .zip bundle.");
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    launch(url, false);
  };

  return <main class="game-page portal-shell">
    <button class="back" onClick={() => go("/")}>← Back to library</button>
    <div class="game-layout">
      <section class="player-card">
        <div class="player-frame">
          <div id="dos-player" ref={playerRef}></div>
          {!running && <div class="player-empty">
            <div>
              <span class="badge">{game.platform}</span>
              <h2>{game.title}</h2>
              <p>{status}</p>
              {progress > 0 && <><div class="progress-track"><div class="progress-bar" style={{ width: `${progress}%` }}></div></div><div class="meta">{progress}%</div></>}
              {(game.bundleUrl || game.demoZipUrl) && <button class="primary" onClick={installAndPlay}>Install & Play</button>}
            </div>
          </div>}
        </div>
        <div class="player-toolbar">
          <button class="secondary" onClick={() => props?.setFullScreen(true)} disabled={!props}>Fullscreen</button>
          <button class="secondary" onClick={() => props?.save()} disabled={!props}>Save</button>
          <button class="secondary" onClick={() => props?.setPaused(false)} disabled={!props}>Resume</button>
          <button class="danger" onClick={() => { props?.stop(); setRunning(false); setStatus("Stopped"); }} disabled={!props}>Stop</button>
        </div>
      </section>

      <aside class="info-card">
        <span class="badge">{game.badge}</span>
        <h1>{game.title}</h1>
        <div class="meta">{game.year} · {game.platform}</div>
        <p>{game.description}</p>
        <div class="info-row"><strong>Developer</strong>{game.developer}</div>
        <div class="info-row"><strong>Genres</strong>{game.genres.join(", ")}</div>
        <div class="info-row"><strong>Controls</strong>{game.controls}</div>
        {game.sourceLabel && <div class="info-row"><strong>Bundle source</strong>{game.sourceLabel}</div>}
        <div class="upload-box">
          <strong>Optional: use your own game bundle</strong>
          <div>Choose a lawful .jsdos bundle from your device. It stays in your browser session and is not uploaded to our server.</div>
          <input type="file" accept=".jsdos,.zip,application/zip" onChange={upload as any} />
        </div>
        {game.availability !== "playable" && <div class="notice">This catalog entry is intentionally not shipping commercial game files. Attach a licensed/user-owned bundle and the same player, cache, saves and fullscreen features will work.</div>}
      </aside>
    </div>
  </main>;
}

function App() {
  const [slug, setSlug] = useState(slugFromLocation());

  useEffect(() => {
    const handle = () => setSlug(slugFromLocation());
    addEventListener("popstate", handle);
    return () => removeEventListener("popstate", handle);
  }, []);

  const game = getGame(slug);
  useEffect(() => updateSeo(game), [game]);

  return <>
    <header class="site-header">
      <div class="portal-shell nav">
        <button class="brand" onClick={() => go("/")} style={{ background: "transparent", color: "white", border: 0, padding: 0 }}>
          <span class="brand-mark">D</span><span>DOS Arcade</span>
        </button>
        <nav class="nav-links">
          <button onClick={() => go("/")}>Games</button>
          <button onClick={() => go("/")}>Popular</button>
          <button onClick={() => go("/")}>About</button>
        </nav>
      </div>
    </header>
    {game ? <GamePage game={game} /> : slug ? <main class="portal-shell hero"><h1>Game not found.</h1><button class="primary" onClick={() => go("/")}>Return home</button></main> : <Home />}
    <footer class="footer"><div class="portal-shell">DOS Arcade · Powered by js-dos · Game files must be used according to their respective licenses.</div></footer>
  </>;
}

render(<App />, document.getElementById("portal")!);
