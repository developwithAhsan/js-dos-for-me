const SITE_NAME = "PlayZone";

const NATIVE = {
  "doom": {
    title: "DOOM",
    description: "Play the classic DOOM browser demo with fast in-browser controls and no separate desktop installation.",
    image: "/thumbs/doom.gif",
    category: "DOS Classics",
    tags: ["Action", "FPS", "Arcade", "Classic PC"]
  },
  "digger": {
    title: "Digger",
    description: "Play Digger online in your browser and enjoy the classic arcade-style DOS gameplay instantly.",
    image: "/thumbs/digger.png",
    category: "DOS Classics",
    tags: ["Arcade", "Retro", "Classic PC"]
  },
  "grand-theft-auto": {
    title: "Grand Theft Auto",
    description: "Play the original Grand Theft Auto DOS demo in your browser with the classic top-down open-world gameplay.",
    image: "/thumbs/gta.gif",
    category: "PC & Browser Classics",
    tags: ["Action", "Open World", "Classic PC"]
  },
  "the-need-for-speed": {
    title: "The Need for Speed",
    description: "Play the original Need for Speed DOS demo online and experience classic racing directly in your browser.",
    image: "/thumbs/needfspd.gif",
    category: "Driving & Racing",
    tags: ["Racing", "Cars", "Classic PC"]
  },
  "duke-nukem-3d": {
    title: "Duke Nukem 3D",
    description: "Explore the Duke Nukem 3D browser game page with classic first-person action and PC gaming nostalgia.",
    image: "/thumbs/duke3d.gif",
    category: "PC & Browser Classics",
    tags: ["Action", "FPS", "Shooter", "Classic PC"]
  },
  "simcity": {
    title: "SimCity",
    description: "Play classic SimCity in your browser and build, manage and grow your city with the original simulation style.",
    image: "/thumbs/simcity.gif",
    category: "Management & Simulation",
    tags: ["Simulation", "Strategy", "City Building", "Classic PC"]
  },
  "prince-of-persia": {
    title: "Prince of Persia",
    description: "Play the classic Prince of Persia browser game and enjoy platforming, exploration and retro PC action.",
    image: "/thumbs/pop.gif",
    category: "Adventure & RPG",
    tags: ["Adventure", "Platform", "Action", "Classic PC"]
  },
  "tyrian-2000": {
    title: "Tyrian 2000",
    description: "Play Tyrian 2000 online in your browser and enjoy fast vertical shooting with classic arcade gameplay.",
    image: "/thumbs/tyrian.gif",
    category: "Arcade & Classic",
    tags: ["Arcade", "Shooter", "Retro", "Classic PC"]
  },
  "gta-iii-browser": {
    title: "GTA III Browser",
    description: "Explore a browser-native open-world 3D experience through the dedicated GTA III web port.",
    image: "/thumbs/gta3-gameplay.jpg",
    category: "PC & Browser Classics",
    tags: ["3D", "Open World", "Action", "Browser Game"]
  },
  "gta-vice-city-browser": {
    title: "GTA Vice City Browser",
    description: "Play a browser-native Vice City 3D experience through the dedicated web port.",
    image: "/thumbs/vc-gameplay.jpg",
    category: "PC & Browser Classics",
    tags: ["3D", "Open World", "Action", "Browser Game"]
  },
};

const NATIVE_COLLECTIONS = {
  "pc-browser-classics": {
    name: "PC & Browser Classics",
    description: "Play classic PC games and browser-native ports including action, racing, simulation, arcade and open-world favorites.",
    items: Object.entries(NATIVE).map(([slug, game]) => ({ slug, title: game.title, image: game.image }))
  },
  "browser-native-games": {
    name: "Browser-Native Games",
    description: "Explore games and dedicated web ports designed to run directly in modern browsers.",
    items: ["gta-iii-browser", "gta-vice-city-browser"].map((slug) => ({ slug, ...NATIVE[slug] }))
  },
  "open-world-3d-classics": {
    name: "Open-World 3D Classics",
    description: "Browse open-world 3D browser experiences and classic action games.",
    items: ["gta-iii-browser", "gta-vice-city-browser"].map((slug) => ({ slug, ...NATIVE[slug] }))
  },
  "dos-classics": {
    name: "DOS Classics",
    description: "Play retro DOS games and classic PC favorites directly in your browser.",
    items: ["doom", "digger", "grand-theft-auto", "the-need-for-speed", "duke-nukem-3d", "simcity", "prince-of-persia", "tyrian-2000"]
      .map((slug) => ({ slug, ...NATIVE[slug] }))
  },
};

function nativeTagSummary(slug) {
  const items = Object.entries(NATIVE)
    .filter(([, game]) => (game.tags || []).some((tag) => slugForPath(tag) === slug))
    .map(([gameSlug, game]) => ({ slug: gameSlug, title: game.title, image: game.image }));
  if (!items.length) return null;
  const name = titleCase(slug);
  return {
    slug,
    name,
    description: `Play ${name} games online and discover related browser and classic PC games on PlayZone.`,
    count: items.length,
    items,
  };
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
}

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value = "") {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function slugForPath(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function truncate(value, max = 165) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

function absoluteUrl(origin, value) {
  if (!value) return "";
  try {
    return new URL(value, origin).href;
  } catch {
    return "";
  }
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

async function fetchJson(url, fallback = null) {
  try {
    const response = await fetch(url);
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

function keywordListForGame(game) {
  const title = cleanText(game.title);
  const category = titleCase(game.category || "Browser Games");
  const categoryBase = category.replace(/\s+Games$/i, "").trim();
  const tags = (game.tags || []).map(titleCase).filter(Boolean);
  const collections = (game.collections || []).map(titleCase).filter(Boolean);
  return [...new Set([
    title,
    `${title} online`,
    `play ${title}`,
    `${title} browser game`,
    `${categoryBase} games`,
    ...tags,
    ...collections,
    "free online games",
    "browser games",
  ])].slice(0, 18);
}

function keywordListForCollection(name, items = []) {
  const baseName = String(name).replace(/\s+Games$/i, "").trim();
  return [...new Set([
    name,
    `${baseName} games`,
    `play ${baseName} games online`,
    `free ${baseName} games`,
    ...items.slice(0, 8).map((item) => item.title).filter(Boolean),
    "free online games",
    "browser games",
  ])].slice(0, 18);
}

function breadcrumbSchema(origin, entries) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(origin, entry.path),
    })),
  };
}

function fallbackLinks(items = []) {
  if (!items.length) return "";
  return `<nav class="seo-related" aria-label="Related games"><h2>Related games</h2><ul>${items.slice(0, 24).map((item) =>
    `<li><a href="/games/${esc(item.slug)}/">${esc(item.title)}</a></li>`).join("")}</ul></nav>`;
}

function shell({
  title,
  description,
  canonical,
  image,
  keywords = [],
  schema,
  heading,
  bodyText,
  tags = [],
  related = [],
  robots = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
  status = 200,
}) {
  const socialImage = image ? `<meta property="og:image" content="${esc(image)}" /><meta name="twitter:image" content="${esc(image)}" />` : "";
  const keywordMeta = keywords.length ? `<meta name="keywords" content="${esc(keywords.join(", "))}" />` : "";
  const tagLinks = tags.length
    ? `<p class="seo-tags">${tags.slice(0, 12).map((tag) => `<a href="/tag/${esc(String(tag).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))}/">#${esc(titleCase(tag))}</a>`).join(" ")}</p>`
    : "";

  return {
    status,
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#07090d" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#f5f7fb" media="(prefers-color-scheme: light)" />
  <meta name="description" content="${esc(description)}" />
  ${keywordMeta}
  <meta name="robots" content="${esc(robots)}" />
  <meta name="googlebot" content="${esc(robots)}" />
  <meta name="bingbot" content="${esc(robots)}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <link rel="alternate" hreflang="x-default" href="${esc(canonical)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  ${socialImage}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="application-name" content="${SITE_NAME}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/favicon.svg" />
  <link rel="manifest" href="/site.webmanifest" />
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>
  <title>${esc(title)}</title>
  <script type="module" crossorigin src="/js-dos.js"></script>
  <link rel="stylesheet" crossorigin href="/js-dos.css">
  <style>
    .seo-fallback{max-width:1100px;margin:24px auto;padding:20px;font-family:Arial,sans-serif;color:#111827}
    .seo-fallback h1{font-size:30px;margin:0 0 10px}.seo-fallback p{line-height:1.6;color:#475569}
    .seo-fallback img{max-width:320px;border-radius:12px}.seo-tags a,.seo-related a{color:#2563eb;text-decoration:none}
    .seo-related ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;padding-left:18px}
    @media(prefers-color-scheme:dark){.seo-fallback{color:#f8fafc}.seo-fallback p{color:#94a3b8}}
  </style>
</head>
<body>
  <div id="portal">
    <main class="seo-fallback">
      <h1>${esc(heading || title)}</h1>
      ${image ? `<img src="${esc(image)}" alt="${esc(heading || title)} gameplay thumbnail" />` : ""}
      <p>${esc(bodyText || description)}</p>
      ${tagLinks}
      ${fallbackLinks(related)}
    </main>
  </div>
</body>
</html>`,
  };
}

function notFound(origin, kind, slug) {
  const canonical = `${origin}/${kind === "game" ? "games" : kind}/${encodeURIComponent(slug)}/`;
  return shell({
    title: `Page Not Found | ${SITE_NAME}`,
    description: "This game or collection could not be found.",
    canonical,
    image: `${origin}/playzone-logo.svg`,
    schema: { "@context": "https://schema.org", "@type": "WebPage", name: "Page Not Found", url: canonical },
    heading: "Page not found",
    bodyText: "The requested game or collection does not exist.",
    robots: "noindex,nofollow",
    status: 404,
  });
}

export default async function handler(req, res) {
  const kind = String(req.query.kind || "game");
  const slug = String(req.query.slug || "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;

  let result;

  try {
    if (kind === "favorites") {
      result = shell({
        title: `Favorite Games | ${SITE_NAME}`,
        description: "Your favorite games saved on this device.",
        canonical: `${origin}/favorites/`,
        image: `${origin}/playzone-logo.svg`,
        schema: { "@context": "https://schema.org", "@type": "WebPage", name: "Favorite Games", url: `${origin}/favorites/` },
        heading: "Favorite Games",
        bodyText: "Your favorites are stored on this device.",
        robots: "noindex,follow",
      });
    } else if (kind === "game") {
      let game = NATIVE[slug] || null;
      if (!game) {
        const list = await fetchJson(`${origin}/catalog/chunks/${bucketFor(slug)}.json`, []);
        game = list.find((item) => item.slug === slug) || null;
      }
      if (!game) {
        result = notFound(origin, kind, slug);
      } else {
        const title = cleanText(game.title);
        const categoryName = titleCase(game.category || game.collections?.[0] || "Browser Games");
        const tags = (game.tags || []).map(titleCase).filter(Boolean);
        const canonical = `${origin}/games/${slug}/`;
        const image = absoluteUrl(origin, game.image) || `${origin}/playzone-logo.svg`;
        const description = truncate(
          game.description && cleanText(game.description).length > 35
            ? game.description
            : `Play ${title} online in your browser. Discover ${categoryName.toLowerCase()} gameplay, controls and related games on PlayZone.`,
          165
        );
        const keywords = keywordListForGame(game);
        const categorySlug = slugForPath(game.category || game.collections?.[0] || "");
        const categoryPath = categorySlug ? `/category/${categorySlug}/` : "/";
        let related = [];
        if (categorySlug) {
          if (NATIVE_COLLECTIONS[categorySlug]) {
            related = NATIVE_COLLECTIONS[categorySlug].items
              .filter((item) => item.slug !== slug)
              .slice(0, 16);
          } else {
            const relatedSummary = await fetchJson(`${origin}/catalog/seo/categories/${categorySlug}.json`, null);
            related = (relatedSummary?.items || [])
              .filter((item) => item.slug !== slug)
              .slice(0, 16);
          }
        }
        const schemas = {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": `${origin}/#website`,
              url: `${origin}/`,
              name: SITE_NAME,
            },
            {
              "@type": "WebPage",
              "@id": `${canonical}#webpage`,
              url: canonical,
              name: `Play ${title} Online | ${SITE_NAME}`,
              description,
              isPartOf: { "@id": `${origin}/#website` },
              primaryImageOfPage: { "@id": `${canonical}#image` },
            },
            {
              "@type": "ImageObject",
              "@id": `${canonical}#image`,
              contentUrl: image,
              caption: `${title} gameplay`,
            },
            {
              "@type": "VideoGame",
              "@id": `${canonical}#game`,
              name: title,
              url: canonical,
              description,
              image,
              gamePlatform: "Web Browser",
              genre: [...new Set([categoryName, ...tags])],
              keywords: keywords.join(", "),
              isPartOf: { "@id": `${origin}/#website` },
            },
            breadcrumbSchema(origin, [
              { name: "Home", path: "/" },
              { name: categoryName, path: categoryPath },
              { name: title, path: `/games/${slug}/` },
            ]),
          ],
        };
        result = shell({
          title: `Play ${title} Online | ${SITE_NAME}`,
          description,
          canonical,
          image,
          keywords,
          schema: schemas,
          heading: title,
          bodyText: game.instructions
            ? `${description} How to play: ${truncate(game.instructions, 180)}`
            : description,
          tags,
          related,
        });
      }
    } else if (kind === "category" || kind === "tag") {
      let summary = null;
      if (kind === "category" && NATIVE_COLLECTIONS[slug]) {
        summary = {
          slug,
          ...NATIVE_COLLECTIONS[slug],
          count: NATIVE_COLLECTIONS[slug].items.length,
        };
      } else if (kind === "tag") {
        summary = nativeTagSummary(slug)
          || await fetchJson(`${origin}/catalog/seo/tags/${encodeURIComponent(slug)}.json`, null);
      } else {
        summary = await fetchJson(`${origin}/catalog/seo/categories/${encodeURIComponent(slug)}.json`, null);
      }

      if (!summary) {
        result = notFound(origin, kind, slug);
      } else {
        const name = cleanText(summary.name || titleCase(slug));
        const canonical = `${origin}/${kind}/${slug}/`;
        const description = truncate(
          summary.description || `Browse and play ${name} online in your browser on PlayZone.`,
          165
        );
        const keywords = keywordListForCollection(name, summary.items || []);
        const baseName = name.replace(/\s+Games$/i, "").trim();
        const pageTitle = `${baseName} Games Online | ${SITE_NAME}`;
        const related = (summary.items || []).map((item) => ({
          slug: item.slug,
          title: item.title,
          image: item.image,
        }));
        const schema = {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": `${origin}/#website`,
              url: `${origin}/`,
              name: SITE_NAME,
            },
            {
              "@type": "CollectionPage",
              "@id": `${canonical}#collection`,
              url: canonical,
              name: pageTitle,
              description,
              isPartOf: { "@id": `${origin}/#website` },
              mainEntity: {
                "@type": "ItemList",
                numberOfItems: Number(summary.count || related.length),
                itemListElement: related.slice(0, 24).map((item, index) => ({
                  "@type": "ListItem",
                  position: index + 1,
                  url: `${origin}/games/${item.slug}/`,
                  name: item.title,
                })),
              },
            },
            breadcrumbSchema(origin, [
              { name: "Home", path: "/" },
              { name, path: `/${kind}/${slug}/` },
            ]),
          ],
        };
        result = shell({
          title: pageTitle,
          description,
          canonical,
          image: related[0]?.image ? absoluteUrl(origin, related[0].image) : `${origin}/playzone-logo.svg`,
          keywords,
          schema,
          heading: `${baseName} Games`,
          bodyText: `${description} Browse ${Number(summary.count || related.length).toLocaleString("en-US")} games in this collection.`,
          tags: kind === "tag" ? [name] : [],
          related,
        });
      }
    } else {
      result = notFound(origin, kind, slug);
    }
  } catch (error) {
    console.error("SEO route lookup failed", error);
    result = shell({
      title: `Temporary Error | ${SITE_NAME}`,
      description: "This page is temporarily unavailable.",
      canonical: `${origin}/`,
      image: `${origin}/playzone-logo.svg`,
      schema: { "@context": "https://schema.org", "@type": "WebPage", name: "Temporary Error", url: origin },
      heading: "Temporary error",
      bodyText: "Please try again shortly.",
      robots: "noindex,nofollow",
      status: 503,
    });
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", result.status === 200
    ? "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
    : "public, max-age=0, s-maxage=60");
  res.status(result.status).send(result.html);
}
