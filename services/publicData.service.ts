type CryptoTickerItem = {
  name: string;
  symbol: string;
  priceUsd: number;
  changePercent: number;
  logoUrl?: string;
};

type DailyNewsItem = {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  tag: "Sustainability" | "Technology";
};

type CambodiaFarmerStats = {
  source: string;
  estimatedFarmers: number;
  agriEmploymentPercent: number;
  ruralPopulation: number;
  laborForceTotal: number;
  sourceYear: number | null;
};

const visitorIds = new Set<string>();

let marketCache: { expiresAt: number; data: CryptoTickerItem[] } | null = null;
let newsCache: { expiresAt: number; data: DailyNewsItem[] } | null = null;

function decodeXmlEntities(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(input: string) {
  const decoded = decodeXmlEntities(input);
  return decodeXmlEntities(
    decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  );
}

function cleanNewsText(input: string, fallback: string) {
  const cleaned = stripTags(input)
    .replace(/^https?:\/\/\S+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || fallback;
}

function parseRssItems(xml: string): DailyNewsItem[] {
  const matches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  return matches.slice(0, 6).map((item) => {
    const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const linkMatch = item.match(/<link>(.*?)<\/link>/);
    const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
    const descriptionMatch = item.match(
      /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/,
    );
    const sourceMatch = item.match(
      /<source[^>]*><!\[CDATA\[(.*?)\]\]><\/source>|<source[^>]*>(.*?)<\/source>/,
    );

    const rawTitle = cleanNewsText(
      titleMatch?.[1] || titleMatch?.[2] || "Agriculture update",
      "Agriculture update",
    );
    const titleParts = rawTitle.split(" - ");
    const source = stripTags(sourceMatch?.[1] || sourceMatch?.[2] || titleParts[titleParts.length - 1] || "Google News");
    const title = titleParts.length > 1 ? titleParts.slice(0, -1).join(" - ") : rawTitle;
    const summary = cleanNewsText(
      descriptionMatch?.[1] || descriptionMatch?.[2] || title,
      title,
    );
    const lower = `${title} ${summary}`.toLowerCase();

    return {
      title,
      summary,
      url: decodeXmlEntities(linkMatch?.[1] || ""),
      source,
      publishedAt: pubDateMatch?.[1] || new Date().toUTCString(),
      tag:
        /climate|sustain|water|soil|harvest|rice|farm/.test(lower)
          ? "Sustainability"
          : "Technology",
    };
  });
}

export class PublicDataService {
  recordLandingVisit(visitorId?: string) {
    if (visitorId) {
      visitorIds.add(visitorId);
    }

    return {
      visitors: Math.max(50, visitorIds.size),
    };
  }

  getCambodiaFarmerStats(): CambodiaFarmerStats {
    return {
      source: "World Bank / FAO",
      estimatedFarmers: 2450000,
      agriEmploymentPercent: 31.2,
      ruralPopulation: 12200000,
      laborForceTotal: 9800000,
      sourceYear: 2023,
    };
  }

  async getMarketPrices(): Promise<CryptoTickerItem[]> {
    const now = Date.now();
    if (marketCache && marketCache.expiresAt > now) {
      return marketCache.data;
    }

    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,tether&vs_currencies=usd&include_24hr_change=true",
      { headers: { accept: "application/json" } },
    );

    if (!response.ok) {
      if (marketCache) {
        return marketCache.data;
      }
      throw new Error("Unable to fetch market prices.");
    }

    const body = (await response.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number }
    >;

    const data: CryptoTickerItem[] = [
      {
        name: "Mayura Coin",
        symbol: "MYR",
        priceUsd: 1,
        changePercent: 0,
        logoUrl: "/logo.png",
      },
      {
        name: "Bitcoin",
        symbol: "BTC",
        priceUsd: Number(body.bitcoin?.usd || 0),
        changePercent: Number(body.bitcoin?.usd_24h_change || 0),
      },
      {
        name: "Ethereum",
        symbol: "ETH",
        priceUsd: Number(body.ethereum?.usd || 0),
        changePercent: Number(body.ethereum?.usd_24h_change || 0),
      },
      {
        name: "Solana",
        symbol: "SOL",
        priceUsd: Number(body.solana?.usd || 0),
        changePercent: Number(body.solana?.usd_24h_change || 0),
      },
      {
        name: "Tether",
        symbol: "USDT",
        priceUsd: Number(body.tether?.usd || 0),
        changePercent: Number(body.tether?.usd_24h_change || 0),
      },
    ];

    marketCache = {
      data,
      expiresAt: now + 60_000,
    };

    return data;
  }

  async getDailyNews(): Promise<DailyNewsItem[]> {
    const now = Date.now();
    if (newsCache && newsCache.expiresAt > now) {
      return newsCache.data;
    }

    const response = await fetch(
      "https://news.google.com/rss/search?q=Cambodia%20agriculture&hl=en-US&gl=US&ceid=US:en",
      { headers: { accept: "application/rss+xml, application/xml, text/xml" } },
    );

    if (!response.ok) {
      if (newsCache) {
        return newsCache.data;
      }
      throw new Error("Unable to fetch agriculture news.");
    }

    const xml = await response.text();
    const items = parseRssItems(xml);

    newsCache = {
      data: items,
      expiresAt: now + 15 * 60_000,
    };

    return items;
  }
}
