import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve("public/catalog");
const SITE = "https://js-dos-for-me.vercel.app";
const sources = [
  "https://gamemonetize.com/feed.json",
  "https://gamemonetize.com/feed.php?format=0&num=25000",
  "https://gamemonetize.com/rssfeed.php?format=json&category=All&type=html5&popularity=newest&company=All&amount=25000",
];

function slugify(value) {
  return String(value || "game")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "game";
}

function clean(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchGames() {
  let lastError;
  for (const url of sources) {
    try {
      console.log("Fetching catalog:", url);
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 DOS-Arcade-Catalog/1.0" },
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const list = Array.isArray(data) ? data : data.games || data.items || data.data;
      if (Array.isArray(list) && list.length) {
        console.log("Catalog source returned", list.length, "games");
        return list;
      }
      throw new Error("Catalog response did not contain a game array");
    } catch (error) {
      lastError = error;
      console.warn("Catalog source failed:", error?.message || error);
    }
  }
  throw lastError || new Error("No catalog source available");
}

function bucketFor(slug) {
  let hash = 2166136261;
  const value = String(slug || "");
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0 & 255).toString(16).padStart(2, "0");
}

const keywordTags = [
  ["racing", "Racing"], ["race", "Racing"], ["car", "Cars"], ["drift", "Drifting"],
  ["bike", "Motorbike"], ["moto", "Motorbike"], ["truck", "Trucks"], ["parking", "Parking"],
  ["shoot", "Shooting"], ["gun", "Shooting"], ["sniper", "Sniper"], ["zombie", "Zombie"],
  ["war", "War"], ["tank", "Tank"], ["army", "Military"], ["battle", "Battle"],
  ["puzzle", "Puzzle"], ["match", "Matching"], ["mahjong", "Mahjong"], ["solitaire", "Cards"],
  ["card", "Cards"], ["chess", "Chess"], ["football", "Football"], ["soccer", "Football"],
  ["basket", "Basketball"], ["tennis", "Tennis"], ["cricket", "Cricket"], ["golf", "Golf"],
  ["runner", "Runner"], ["running", "Runner"], ["jump", "Platform"], ["platform", "Platform"],
  ["adventure", "Adventure"], ["quest", "Adventure"], ["escape", "Escape"], ["room", "Escape"],
  ["dress", "Dress Up"], ["makeup", "Makeup"], ["cooking", "Cooking"], ["food", "Food"],
  ["kids", "Kids"], ["baby", "Kids"], ["girl", "Girls"], ["boy", "Boys"],
  ["io", "IO"], ["multiplayer", "Multiplayer"], ["3d", "3D"], ["idle", "Idle"],
  ["clicker", "Clicker"], ["merge", "Merge"], ["tycoon", "Tycoon"], ["simulator", "Simulation"],
  ["strategy", "Strategy"], ["defense", "Defense"], ["tower", "Tower Defense"],
];

function inferredTags(title, categoryName, rawTags, type) {
  const names = new Set();
  const sourceTags = Array.isArray(rawTags) ? rawTags : String(rawTags || "").split(",");
  for (const tag of sourceTags.map(clean).filter(Boolean)) names.add(tag);

  const categoryBase = clean(categoryName).replace(/\s+Games$/i, "");
  if (categoryBase) names.add(categoryBase);
  names.add("Browser Game");
  names.add("Online Game");

  const haystack = `${title} ${categoryName} ${sourceTags.join(" ")}`.toLowerCase();
  for (const [needle, label] of keywordTags) {
    if (haystack.includes(needle)) names.add(label);
    if (names.size >= 10) break;
  }
  return [...names].slice(0, 10);
}

const curatedCollections = [
  { slug: "new-games", name: "New Games", description: "The newest games recently added to the browser catalog." },
  { slug: "driving-racing", name: "Driving & Racing", description: "Cars, bikes, drifting, parking and racing games." },
  { slug: "multiplayer", name: "Multiplayer", description: "Online, local and competitive multiplayer games." },
  { slug: "arcade-classic", name: "Arcade & Classic", description: "Fast arcade action, retro-inspired and classic browser games." },
  { slug: "board-puzzle", name: "Board & Puzzle", description: "Puzzle, board, card, chess, mahjong and thinking games." },
  { slug: "shooting", name: "Shooting", description: "FPS, sniper, battle, zombie and action shooting games." },
  { slug: "action-fighting", name: "Action & Fighting", description: "Action, combat, fighting, brawling and battle games." },
  { slug: "sports", name: "Sports", description: "Football, basketball, tennis, cricket, golf and more." },
  { slug: "adventure-rpg", name: "Adventure & RPG", description: "Adventure, exploration, quest, escape and role-playing games." },
  { slug: "strategy-defense", name: "Strategy & Defense", description: "Strategy, tower defense, tactical and planning games." },
  { slug: "kids-educational", name: "Kids & Educational", description: "Coloring, learning, family-friendly and kids games." },
  { slug: "management-simulation", name: "Management & Simulation", description: "Tycoon, idle, simulator, cooking and management games." },
  { slug: "girls-lifestyle", name: "Girls & Lifestyle", description: "Fashion, dress-up, makeover, cooking and lifestyle games." },
  { slug: "fun-crazy", name: "Fun & Crazy", description: "Funny, unusual, casual and surprising browser games." },
];

function inferCollections(title, categoryName, tagNames, type) {
  const text = `${title} ${categoryName} ${tagNames.join(" ")} ${type || ""}`.toLowerCase();
  const found = new Set();
  const has = (...words) => words.some((word) => text.includes(word));

  if (has("racing", "race", "car", "drift", "parking", "bike", "moto", "truck", "drive")) found.add("driving-racing");
  if (has("multiplayer", "2 player", "two player", "3 player", "io", "online pvp", "battle royale")) found.add("multiplayer");
  if (has("arcade", "classic", "retro", "runner", "platform", "jump", "snake", "tetris")) found.add("arcade-classic");
  if (has("puzzle", "board", "card", "chess", "mahjong", "solitaire", "match", "brain", "thinking", "word")) found.add("board-puzzle");
  if (has("shoot", "gun", "sniper", "fps", "zombie", "war", "tank", "army", "battle")) found.add("shooting");
  if (has("action", "fight", "fighting", "combat", "brawl", "ninja", "martial", "boxing", "sword")) found.add("action-fighting");
  if (has("sport", "football", "soccer", "basket", "tennis", "cricket", "golf", "baseball", "bowling")) found.add("sports");
  if (has("adventure", "rpg", "quest", "escape", "survival", "explore", "hero", "dungeon")) found.add("adventure-rpg");
  if (has("strategy", "defense", "tower", "tactical", "war", "kingdom")) found.add("strategy-defense");
  if (has("kids", "baby", "coloring", "educational", "school", "learning", "family")) found.add("kids-educational");
  if (has("simulator", "simulation", "tycoon", "idle", "management", "restaurant", "cooking", "farm", "shop")) found.add("management-simulation");
  if (has("girl", "dress", "makeup", "fashion", "makeover", "princess", "beauty", "wedding", "cooking")) found.add("girls-lifestyle");
  if (has("fun", "funny", "crazy", "casual", "prank", "silly", "brainrot")) found.add("fun-crazy");

  if (found.size === 0) {
    if (categoryName.toLowerCase().includes("puzzle")) found.add("board-puzzle");
    else if (categoryName.toLowerCase().includes("sports")) found.add("sports");
    else if (categoryName.toLowerCase().includes("action") || categoryName.toLowerCase().includes("fighting")) found.add("action-fighting");
    else if (categoryName.toLowerCase().includes("adventure")) found.add("adventure-rpg");
    else found.add("arcade-classic");
  }
  return [...found];
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(path.join(OUT, "chunks"), { recursive: true });
await fs.mkdir(path.join(OUT, "categories"), { recursive: true });
await fs.mkdir(path.join(OUT, "tags"), { recursive: true });
await fs.mkdir(path.join(OUT, "search"), { recursive: true });
await fs.mkdir(path.join(OUT, "seo", "categories"), { recursive: true });
await fs.mkdir(path.join(OUT, "seo", "tags"), { recursive: true });
await fs.rm(path.resolve("public/sitemaps"), { recursive: true, force: true });
await fs.mkdir(path.resolve("public/sitemaps"), { recursive: true });

let sourceGames = [];
try {
  sourceGames = await fetchGames();
} catch (error) {
  console.warn("Unable to refresh browser game catalog. Building with an empty catalog.", error?.message || error);
}

const used = new Set();
const categories = new Map();
const tags = new Map();
const full = [];
const index = [];

for (const [sourceIndex, item] of sourceGames.entries()) {
  const title = clean(item.title || item.name);
  const gameUrl = String(item.url || item.file || "").trim();
  const image = String(item.thumb || item.image || item.thumbnail || "").trim();
  if (!title || !gameUrl || !image) continue;

  let slug = slugify(item.slug || item.game_name || title);
  const base = slug;
  let counter = 2;
  while (used.has(slug)) slug = `${base}-${item.id || counter++}`;
  used.add(slug);

  const categoryName = clean(item.category || "Arcade") || "Arcade";
  const categorySlug = slugify(categoryName.endsWith("Games") ? categoryName : `${categoryName} Games`);
  categories.set(categorySlug, {
    slug: categorySlug,
    name: categoryName.endsWith("Games") ? categoryName : `${categoryName} Games`,
  });

  const inferred = inferredTags(title, categoryName, item.tags, item.type || item.game_type || "html5");
  const gameTags = inferred.map((name) => {
    const tagSlug = slugify(name);
    if (!tags.has(tagSlug)) tags.set(tagSlug, { slug: tagSlug, name });
    return tagSlug;
  });

  const collections = inferCollections(title, categoryName, inferred, item.type || item.game_type || "html5");
  if (sourceIndex < 700) collections.unshift("new-games");

  const record = {
    id: String(item.id || item.catalog_id || slug),
    slug,
    title,
    image,
    url: gameUrl,
    description: clean(item.description) || `Play ${title} online in your browser.`,
    instructions: clean(item.instructions) || "Use the on-screen or keyboard controls shown by the game.",
    category: categorySlug,
    collections,
    tags: gameTags,
    type: clean(item.type || item.game_type || "html5").toLowerCase(),
    isNew: sourceIndex < 180,
    width: Number(item.width || item.w || 800) || 800,
    height: Number(item.height || item.h || 600) || 600,
  };
  full.push(record);
  index.push({
    slug: record.slug,
    title: record.title,
    image: record.image,
    category: record.category,
    collections: record.collections,
    tags: record.tags,
    isNew: record.isNew,
    type: record.type,
  });
}

const countsByCategory = {};
const countsByRawCategory = {};
const countsByTag = {};
for (const game of full) {
  for (const collection of game.collections) countsByCategory[collection] = (countsByCategory[collection] || 0) + 1;
  countsByRawCategory[game.category] = (countsByRawCategory[game.category] || 0) + 1;
  for (const tag of game.tags) countsByTag[tag] = (countsByTag[tag] || 0) + 1;
}

const meta = {
  generatedAt: new Date().toISOString(),
  count: full.length,
  categories: curatedCollections.map((item) => ({ ...item, count: countsByCategory[item.slug] || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  rawCategories: [...categories.values()]
    .map((item) => ({ ...item, count: countsByRawCategory[item.slug] || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  tags: [...tags.values()].map((t) => ({ ...t, count: countsByTag[t.slug] || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
};

const buckets = new Map();
for (const game of full) {
  const key = bucketFor(game.slug);
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(game);
}


const homeCatalog = {
  generatedAt: new Date().toISOString(),
  count: full.length,
  featured: curatedCollections.map((collection) => ({
    slug: collection.slug,
    name: collection.name,
    count: countsByCategory[collection.slug] || 0,
    items: index.filter((game) => game.collections.includes(collection.slug)).slice(0, 14),
  })).filter((shelf) => shelf.items.length > 0),
  raw: [...categories.values()]
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      count: countsByRawCategory[category.slug] || 0,
      items: index.filter((game) => game.category === category.slug).slice(0, 14),
    }))
    .filter((shelf) => shelf.items.length > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
};

await fs.writeFile(path.join(OUT, "home.json"), JSON.stringify(homeCatalog));

// Per-category and per-tag files keep homepage/listing navigation fast without
// downloading the entire 38k-game index.
for (const category of categories.values()) {
  const items = index.filter((game) => game.category === category.slug);
  await fs.writeFile(path.join(OUT, "categories", `${category.slug}.json`), JSON.stringify(items));
  await fs.writeFile(
    path.join(OUT, "seo", "categories", `${category.slug}.json`),
    JSON.stringify({
      slug: category.slug,
      name: category.name,
      description: `Play ${category.name} online in your browser. Discover popular titles, new releases and related games on PlayZone.`,
      count: items.length,
      items: items.slice(0, 24),
    })
  );
}
for (const collection of curatedCollections) {
  const items = index.filter((game) => game.collections.includes(collection.slug));
  await fs.writeFile(path.join(OUT, "categories", `${collection.slug}.json`), JSON.stringify(items));
  await fs.writeFile(
    path.join(OUT, "seo", "categories", `${collection.slug}.json`),
    JSON.stringify({
      slug: collection.slug,
      name: collection.name,
      description: collection.description,
      count: items.length,
      items: items.slice(0, 24),
    })
  );
}
for (const tag of tags.values()) {
  const items = index.filter((game) => game.tags.includes(tag.slug));
  await fs.writeFile(path.join(OUT, "tags", `${tag.slug}.json`), JSON.stringify(items));
  await fs.writeFile(
    path.join(OUT, "seo", "tags", `${tag.slug}.json`),
    JSON.stringify({
      slug: tag.slug,
      name: tag.name,
      description: `Browse ${tag.name} games and play them online instantly on PlayZone.`,
      count: items.length,
      items: items.slice(0, 24),
    })
  );
}

// Lightweight search shards. A game is added only to buckets matching the
// first letter of its searchable tokens, so a query downloads a small shard
// instead of the entire catalog.
const searchStopwords = new Set(["game", "games", "online", "html5", "browser", "play", "free"]);
const searchBuckets = new Map();
for (const game of index) {
  const searchable = [
    game.title,
    game.category,
    ...game.collections,
    ...game.tags,
  ].join(" ").toLowerCase();
  const tokenStarts = new Set(
    searchable
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !searchStopwords.has(token))
      .map((token) => token.slice(0, 3))
  );
  if (tokenStarts.size === 0) tokenStarts.add("_");
  const entry = [game.slug, game.title, game.image, searchable, game.isNew ? 1 : 0];
  for (const key of tokenStarts) {
    const bucket = /^[a-z0-9]{3}$/.test(key) ? key : "_";
    if (!searchBuckets.has(bucket)) searchBuckets.set(bucket, []);
    searchBuckets.get(bucket).push(entry);
  }
}
for (const [bucket, entries] of searchBuckets) {
  await fs.writeFile(path.join(OUT, "search", `${bucket}.json`), JSON.stringify(entries));
}

await fs.writeFile(path.join(OUT, "index.json"), JSON.stringify(index));
await fs.writeFile(path.join(OUT, "meta.json"), JSON.stringify(meta));
for (const [bucket, games] of buckets) {
  await fs.writeFile(path.join(OUT, "chunks", `${bucket}.json`), JSON.stringify(games));
}

const nativeSlugs = [
  "doom", "digger", "grand-theft-auto", "the-need-for-speed",
  "duke-nukem-3d", "simcity", "prince-of-persia", "tyrian-2000",
  "gta-iii-browser", "gta-vice-city-browser"
];
const nativeCategoryUrls = [
  "pc-browser-classics",
  "browser-native-games",
  "open-world-3d-classics",
  "dos-classics",
];
const nativeTagUrls = [
  "3d",
  "open-world",
  "browser-game",
  "action",
  "racing",
  "cars",
  "fps",
  "arcade",
  "classic-pc",
  "retro",
  "shooter",
  "simulation",
  "strategy",
  "city-building",
  "adventure",
  "platform",
];

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) =>
    `  <url><loc>${xmlEscape(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

const generatedDate = new Date().toISOString().slice(0, 10);
const sitemapDir = path.resolve("public/sitemaps");
const sitemapFiles = [];

const gameUrls = [
  ...nativeSlugs.map((slug) => `${SITE}/games/${slug}/`),
  ...full.map((game) => `${SITE}/games/${game.slug}/`),
];
const gameChunkSize = 5000;
for (let i = 0; i < gameUrls.length; i += gameChunkSize) {
  const number = String(Math.floor(i / gameChunkSize) + 1).padStart(3, "0");
  const fileName = `games-${number}.xml`;
  await fs.writeFile(path.join(sitemapDir, fileName), sitemapXml(gameUrls.slice(i, i + gameChunkSize)));
  sitemapFiles.push(fileName);
}

const categoryUrls = [...new Set([
  ...nativeCategoryUrls.map((slug) => `${SITE}/category/${slug}/`),
  ...meta.categories.map((category) => `${SITE}/category/${category.slug}/`),
  ...meta.rawCategories.map((category) => `${SITE}/category/${category.slug}/`),
])];
await fs.writeFile(path.join(sitemapDir, "categories.xml"), sitemapXml(categoryUrls));
sitemapFiles.push("categories.xml");

const tagUrls = [...new Set([
  ...nativeTagUrls.map((slug) => `${SITE}/tag/${slug}/`),
  ...meta.tags.map((tag) => `${SITE}/tag/${tag.slug}/`),
])];
await fs.writeFile(path.join(sitemapDir, "tags.xml"), sitemapXml(tagUrls));
sitemapFiles.push("tags.xml");

await fs.writeFile(path.join(sitemapDir, "pages.xml"), sitemapXml([SITE + "/"]));
sitemapFiles.push("pages.xml");

const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapFiles.map((fileName) =>
  `  <sitemap><loc>${SITE}/sitemaps/${fileName}</loc><lastmod>${generatedDate}</lastmod></sitemap>`).join("\n")}\n</sitemapindex>\n`;
await fs.writeFile(path.resolve("public/sitemap.xml"), sitemapIndex);

console.log(
  `Built catalog: ${full.length} games, ${meta.categories.length} curated categories, ${meta.rawCategories.length} source categories, ${meta.tags.length} tags, ${sitemapFiles.length} sitemap files`
);
