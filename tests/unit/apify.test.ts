import { describe, expect, it } from "vitest";
import { mapApifyItems, normalizeInstagramHandle } from "@/lib/apify";

describe("Apify Instagram mapping", () => {
  it("normalizes and validates public handles", () => {
    expect(normalizeInstagramHandle("@Mercado.Exemplo/")).toBe("mercado.exemplo");
    expect(() => normalizeInstagramHandle("senha com espaço")).toThrow();
  });

  it("maps carousel media and removes duplicate posts", () => {
    const items = mapApifyItems([
      { id: "post-1", url: "https://www.instagram.com/p/post-1/", displayUrl: "https://scontent.cdninstagram.com/a.jpg", childPosts: [{ images: ["https://scontent.cdninstagram.com/b.jpg"] }] },
      { id: "post-1", url: "https://www.instagram.com/p/post-1/", displayUrl: "https://scontent.cdninstagram.com/a.jpg" },
    ], "market-1");
    expect(items).toHaveLength(1);
    expect(items[0].media_urls).toHaveLength(2);
    expect(items[0].supermarket_id).toBe("market-1");
  });
});
