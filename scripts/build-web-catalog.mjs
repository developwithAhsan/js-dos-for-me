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
  const c = (slug[0] || "_").toLowerCase();
  return /^[a-z0-9]$/.test(c) ? c : "_";
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
  names.add(type && String(type).toLowerCase().includes("html") ? "HTML5" : "Browser Game");
  names.add("Online Game");

  const haystack = `${title} ${categoryName} ${sourceTags.join(" ")}`.toLowerCase();
  for (const [needle, label] of keywordTags) {
    if (haystack.includes(needle)) names.add(label);
    if (names.size >= 10) break;
  }
  return [...names].slice(0, 10);
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(path.join(OUT, "chunks"), { recursive: true });

let sourceGames = [];
try {
  sourceGames = await fetchGames();
} catch (error) {
  console.warn("Unable to refresh GameMonetize catalog. Building with an empty HTML5 catalog.", error?.message || error);
}

const used = new Set();
const categories = new Map();
const tags = new Map();
const full = [];
const index = [];

for (const item of sourceGames) {
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

  const record = {
    id: String(item.id || item.catalog_id || slug),
    slug,
    title,
    image,
    url: gameUrl,
    description: clean(item.description) || `Play ${title} online in your browser.`,
    instructions: clean(item.instructions) || "Use the on-screen or keyboard controls shown by the game.",
    category: categorySlug,
    tags: gameTags,
    type: clean(item.type || item.game_type || "html5").toLowerCase(),
    width: Number(item.width || item.w || 800) || 800,
    height: Number(item.height || item.h || 600) || 600,
  };
  full.push(record);
  index.push({
    slug: record.slug,
    title: record.title,
    image: record.image,
    category: record.category,
    tags: record.tags,
    type: record.type,
  });
}

const countsByCategory = {};
const countsByTag = {};
for (const game of full) {
  countsByCategory[game.category] = (countsByCategory[game.category] || 0) + 1;
  for (const tag of game.tags) countsByTag[tag] = (countsByTag[tag] || 0) + 1;
}

const meta = {
  generatedAt: new Date().toISOString(),
  count: full.length,
  categories: [...categories.values()].map((c) => ({ ...c, count: countsByCategory[c.slug] || 0 }))
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
  "browser-native-games",
  "open-world-3d-classics",
  "dos-classics",
];
const nativeTagUrls = [
  "3d",
  "open-world",
  "browser-native",
  "action",
  "racing",
  "fps",
  "arcade",
];
const urls = [
  ...nativeSlugs.map((slug) => `${SITE}/games/${slug}/`),
  ...full.map((game) => `${SITE}/games/${game.slug}/`),
  ...nativeCategoryUrls.map((slug) => `${SITE}/category/${slug}/`),
  ...meta.categories.map((category) => `${SITE}/category/${category.slug}/`),
  ...nativeTagUrls.map((slug) => `${SITE}/tag/${slug}/`),
  ...meta.tags.map((tag) => `${SITE}/tag/${tag.slug}/`),
];
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) =>
  `  <url><loc>${url.replace(/&/g, "&amp;")}</loc></url>`).join("\n")}\n</urlset>\n`;
await fs.writeFile(path.resolve("public/sitemap.xml"), xml);

console.log(`Built catalog: ${full.length} games, ${meta.categories.length} categories, ${meta.tags.length} tags`);
