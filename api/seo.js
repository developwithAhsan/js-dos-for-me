const SITE_NAME = "PlayZone";
const NATIVE = {
  "doom": { title: "DOOM", description: "Play the classic DOOM browser demo with js-dos.", image: "" },
  "digger": { title: "Digger", description: "Play the classic Digger DOS game in your browser.", image: "" },
  "grand-theft-auto": { title: "Grand Theft Auto", description: "Play the original Grand Theft Auto DOS demo in your browser.", image: "" },
  "the-need-for-speed": { title: "The Need for Speed", description: "Play the original Need for Speed DOS demo in your browser.", image: "" },
  "duke-nukem-3d": { title: "Duke Nukem 3D", description: "Duke Nukem 3D browser game page.", image: "" },
  "simcity": { title: "SimCity", description: "SimCity browser game page.", image: "" },
  "prince-of-persia": { title: "Prince of Persia", description: "Prince of Persia browser game page.", image: "" },
  "tyrian-2000": { title: "Tyrian 2000", description: "Play Tyrian 2000 online in your browser.", image: "" },
  "gta-iii-browser": { title: "GTA III Browser", description: "Explore a browser-native open-world 3D experience through the dedicated GTA III web port.", image: "https://developwithahsan.github.io/gta3-online/images/blog/play-gta-3-browser.svg" },
  "gta-vice-city-browser": { title: "GTA Vice City Browser", description: "Play a browser-native Vice City 3D experience through the dedicated web port.", image: "https://vicecityonline.vercel.app/tommy.jpg" },
};

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
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

function shell({ title, description, canonical, image, schema }) {
  const socialImage = image ? `<meta property="og:image" content="${esc(image)}" />` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#07090d" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#f5f7fb" media="(prefers-color-scheme: light)" />
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  ${socialImage}
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />\n  <link rel="apple-touch-icon" href="/favicon.svg" />\n  <link rel="manifest" href="/site.webmanifest" />
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>
  <title>${esc(title)}</title>
  <script type="module" crossorigin src="/js-dos.js"></script>
  <link rel="stylesheet" crossorigin href="/js-dos.css">
</head>
<body><div id="portal"></div></body>
</html>`;
}

export default async function handler(req, res) {
  const kind = String(req.query.kind || "game");
  const slug = String(req.query.slug || "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;
  let title = SITE_NAME;
  let description = "Play thousands of free online games instantly in your browser, from racing and action to puzzles, multiplayer and PC classics.";
  let image = "";
  let canonical = `${origin}/`;
  let schema = { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: origin };

  try {
    if (kind === "game") {
      let game = NATIVE[slug] || null;
      if (!game) {
        const response = await fetch(`${origin}/catalog/chunks/${bucketFor(slug)}.json`);
        if (response.ok) {
          const list = await response.json();
          game = list.find((item) => item.slug === slug) || null;
        }
      }
      if (game) {
        title = `${game.title} Online — Play in Browser`;
        description = game.description || `Play ${game.title} online in your browser.`;
        image = game.image || "";
        canonical = `${origin}/games/${slug}/`;
        schema = {
          "@context": "https://schema.org",
          "@type": "VideoGame",
          name: game.title,
          description,
          url: canonical,
          image: image || undefined,
          gamePlatform: "Web browser",
        };
      }
    } else {
      const response = await fetch(`${origin}/catalog/meta.json`);
      const meta = response.ok ? await response.json() : { categories: [], tags: [] };
      const source = kind === "category" ? [...(meta.categories || []), ...(meta.rawCategories || [])] : (meta.tags || []);
      const item = source.find((entry) => entry.slug === slug);
      const name = item?.name || slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
      title = `${name} — Play Online Games`;
      description = `Browse and play ${name} online in your browser.`;
      canonical = `${origin}/${kind}/${slug}/`;
      schema = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name,
        description,
        url: canonical,
      };
    }
  } catch (error) {
    console.error("SEO route lookup failed", error);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  if (!image) image = `${origin}/playzone-logo.svg`;
  res.status(200).send(shell({ title, description, canonical, image, schema }));
}
