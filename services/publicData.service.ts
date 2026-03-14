import { getUserModel } from "../models/user.model";

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

type WeatherForecastItem = {
  day: string;
  high: number;
  low: number;
  condition: string;
};

type WeatherSnapshot = {
  locationLabel: string;
  temperature: number;
  humidity: number;
  description: string;
  icon: string;
  forecast: WeatherForecastItem[];
};

type PublicMemberProfile = {
  memberQrCode: string;
  username: string;
  fullName: string | null;
  role: string;
  phoneMasked: string | null;
  address: string | null;
  gender: string | null;
  age: number | null;
  onboardingCompleted: boolean;
  joinedAt: string | null;
};

const visitorIds = new Set<string>();

let marketCache: { expiresAt: number; data: CryptoTickerItem[] } | null = null;
let newsCache: { expiresAt: number; data: DailyNewsItem[] } | null = null;
const weatherCache = new Map<string, { expiresAt: number; data: WeatherSnapshot }>();

const DEFAULT_WEATHER: WeatherSnapshot = {
  locationLabel: "Battambang, Cambodia",
  temperature: 32,
  humidity: 78,
  description: "Partly cloudy",
  icon: "cloud-sun",
  forecast: [
    { day: "Mon", high: 33, low: 24, condition: "sunny" },
    { day: "Tue", high: 31, low: 23, condition: "cloudy" },
    { day: "Wed", high: 29, low: 22, condition: "rain" },
    { day: "Thu", high: 30, low: 23, condition: "rain" },
    { day: "Fri", high: 32, low: 24, condition: "sunny" },
  ],
};

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

function normalizeWeatherLocation(location?: string) {
  return location?.trim() || DEFAULT_WEATHER.locationLabel;
}

function parseCoordinates(input?: string) {
  const value = input?.trim();
  if (!value) {
    return null;
  }

  const latLngMatch = value.match(/lat:([+-]?\d+(\.\d+)?),\s*lng:([+-]?\d+(\.\d+)?)/i);
  if (latLngMatch) {
    return {
      latitude: Number(latLngMatch[1]),
      longitude: Number(latLngMatch[3]),
    };
  }

  return null;
}

function buildWeatherLocationLabel(location: {
  name?: string;
  admin1?: string;
  country?: string;
}) {
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}

async function reverseGeocodeCoordinates(latitude: number, longitude: number) {
  const openMeteoResponse = await fetch(
    `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=en&format=json`,
    { headers: { accept: "application/json" } },
  );

  if (openMeteoResponse.ok) {
    const openMeteoBody = (await openMeteoResponse.json()) as {
      results?: Array<{
        latitude: number;
        longitude: number;
        name?: string;
        country?: string;
        admin1?: string;
      }>;
    };

    const result = openMeteoBody.results?.[0];
    if (result?.name) {
      return {
        latitude,
        longitude,
        name: result.name,
        country: result.country,
        admin1: result.admin1,
      };
    }
  }

  const nominatimResponse = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
    {
      headers: {
        accept: "application/json",
        "user-agent": "MayuraDACMS/1.0 weather-lookup",
      },
    },
  );

  if (nominatimResponse.ok) {
    const nominatimBody = (await nominatimResponse.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        county?: string;
        state?: string;
        country?: string;
      };
      name?: string;
      display_name?: string;
    };

    const address = nominatimBody.address;
    const name =
      address?.city ||
      address?.town ||
      address?.village ||
      address?.county ||
      nominatimBody.name ||
      nominatimBody.display_name?.split(",")[0]?.trim();

    if (name) {
      return {
        latitude,
        longitude,
        name,
        admin1: address?.state,
        country: address?.country,
      };
    }
  }

  return {
    latitude,
    longitude,
    name: `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
  };
}

function dayLabel(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", { weekday: "short" });
}

function mapWeatherCode(code: number): { description: string; icon: string; condition: string } {
  if (code === 0) {
    return { description: "Clear sky", icon: "sunny", condition: "sunny" };
  }
  if ([1, 2].includes(code)) {
    return { description: "Partly cloudy", icon: "cloud-sun", condition: "cloud-sun" };
  }
  if (code === 3) {
    return { description: "Cloudy", icon: "cloudy", condition: "cloudy" };
  }
  if ([45, 48].includes(code)) {
    return { description: "Foggy", icon: "cloudy", condition: "cloudy" };
  }
  if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) {
    return { description: "Rain showers", icon: "rain", condition: "rain" };
  }
  if ([66, 67, 71, 73, 75, 77, 85, 86].includes(code)) {
    return { description: "Storm or snow", icon: "cloudy", condition: "cloudy" };
  }
  if ([95, 96, 99].includes(code)) {
    return { description: "Thunderstorms", icon: "rain", condition: "rain" };
  }
  return { description: "Partly cloudy", icon: "cloud-sun", condition: "cloud-sun" };
}

function maskPhone(phone?: string | null) {
  if (!phone) {
    return null;
  }

  const visible = phone.slice(-4);
  return `${"*".repeat(Math.max(phone.length - 4, 0))}${visible}`;
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

  async getWeather(location?: string): Promise<WeatherSnapshot> {
    const normalizedLocation = normalizeWeatherLocation(location);
    const cacheKey = normalizedLocation.toLowerCase();
    const now = Date.now();
    const cached = weatherCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    try {
      const directCoordinates = parseCoordinates(normalizedLocation);
      let firstResult:
        | {
            latitude: number;
            longitude: number;
            name: string;
            country?: string;
            admin1?: string;
          }
        | undefined;

      if (directCoordinates) {
        firstResult = await reverseGeocodeCoordinates(
          directCoordinates.latitude,
          directCoordinates.longitude,
        );
      } else {
        const geocodeResponse = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(normalizedLocation)}&count=1&language=en&format=json`,
          { headers: { accept: "application/json" } },
        );

        if (!geocodeResponse.ok) {
          throw new Error("Unable to geocode weather location.");
        }

        const geocodeBody = (await geocodeResponse.json()) as {
          results?: Array<{
            latitude: number;
            longitude: number;
            name: string;
            country?: string;
            admin1?: string;
          }>;
        };

        firstResult = geocodeBody.results?.[0];
      }

      if (!firstResult) {
        throw new Error("No weather result found for location.");
      }

      const forecastResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${firstResult.latitude}&longitude=${firstResult.longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto`,
        { headers: { accept: "application/json" } },
      );

      if (!forecastResponse.ok) {
        throw new Error("Unable to fetch weather forecast.");
      }

      const forecastBody = (await forecastResponse.json()) as {
        current?: {
          temperature_2m?: number;
          relative_humidity_2m?: number;
          weather_code?: number;
        };
        daily?: {
          time?: string[];
          weather_code?: number[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
        };
      };

      const current = forecastBody.current || {};
      const currentWeather = mapWeatherCode(Number(current.weather_code ?? 1));
      const times = forecastBody.daily?.time || [];
      const dailyCodes = forecastBody.daily?.weather_code || [];
      const dailyMax = forecastBody.daily?.temperature_2m_max || [];
      const dailyMin = forecastBody.daily?.temperature_2m_min || [];

      const data: WeatherSnapshot = {
        locationLabel: buildWeatherLocationLabel(firstResult) || DEFAULT_WEATHER.locationLabel,
        temperature: Math.round(Number(current.temperature_2m ?? DEFAULT_WEATHER.temperature)),
        humidity: Math.round(Number(current.relative_humidity_2m ?? DEFAULT_WEATHER.humidity)),
        description: currentWeather.description,
        icon: currentWeather.icon,
        forecast: times.slice(0, 5).map((time, index) => {
          const weather = mapWeatherCode(Number(dailyCodes[index] ?? 1));
          return {
            day: dayLabel(time),
            high: Math.round(Number(dailyMax[index] ?? 0)),
            low: Math.round(Number(dailyMin[index] ?? 0)),
            condition: weather.condition,
          };
        }),
      };

      weatherCache.set(cacheKey, {
        data,
        expiresAt: now + 30 * 60_000,
      });

      return data;
    } catch {
      return {
        ...DEFAULT_WEATHER,
        locationLabel: normalizedLocation || DEFAULT_WEATHER.locationLabel,
      };
    }
  }

  async getMemberProfileByQr(memberQrCode: string): Promise<PublicMemberProfile | null> {
    const User = getUserModel();
    const user = await User.findOne({ memberQrCode: memberQrCode.trim() }).lean();

    if (!user) {
      return null;
    }

    return {
      memberQrCode: user.memberQrCode,
      username: user.username,
      fullName: user.profile?.fullName || null,
      role: user.role,
      phoneMasked: maskPhone(user.phone),
      address: user.profile?.address || null,
      gender: user.profile?.gender || null,
      age: typeof user.profile?.age === "number" ? user.profile.age : null,
      onboardingCompleted: Boolean(user.onboardingCompleted),
      joinedAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    };
  }
}
