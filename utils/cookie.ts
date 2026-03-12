export function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
