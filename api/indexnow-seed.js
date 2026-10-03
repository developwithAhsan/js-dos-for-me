const HOST = "js-dos-for-me.vercel.app";
const ORIGIN = "https://" + HOST;
const KEY = "4f7c2a9e1b8d6c3f5a0e7d9b2c4f6a8d";
const KEY_LOCATION = ORIGIN + "/" + KEY + ".txt";

function extractLocs(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1].replace(/&amp;/g, "&")
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const indexResponse = await fetch(ORIGIN + "/sitemap.xml", { cache: "no-store" });
    if (!indexResponse.ok) throw new Error("Unable to fetch sitemap index");
    const sitemapUrls = extractLocs(await indexResponse.text());

    const pageUrls = [];
    for (const sitemapUrl of sitemapUrls) {
      const response = await fetch(sitemapUrl, { cache: "no-store" });
      if (!response.ok) continue;
      pageUrls.push(...extractLocs(await response.text()));
    }

    const uniqueUrls = [...new Set(pageUrls.filter((url) => url.startsWith(ORIGIN + "/")))];
    const batches = [];
    for (let i = 0; i < uniqueUrls.length; i += 10000) {
      batches.push(uniqueUrls.slice(i, i + 10000));
    }

    const results = [];
    for (const urlList of batches) {
      const response = await fetch("https://api.indexnow.org/IndexNow", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: HOST,
          key: KEY,
          keyLocation: KEY_LOCATION,
          urlList,
        }),
      });
      results.push({ status: response.status, count: urlList.length });
      if (![200, 202].includes(response.status)) {
        const body = await response.text();
        throw new Error("IndexNow batch failed: " + response.status + " " + body.slice(0, 300));
      }
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      submitted: uniqueUrls.length,
      batches: results,
      sitemaps: sitemapUrls.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
