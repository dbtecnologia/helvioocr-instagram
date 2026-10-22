import { describe, expect, it } from "vitest";
import { extractProductsFromOcrSpace } from "@/lib/ocr-space";

describe("OCR.space overlay extraction", () => {
  it("associates a price with the closest product label above it", () => {
    const products = extractProductsFromOcrSpace([{ TextOverlay: { Lines: [
      { LineText: "LAGARTO BOVINO", Words: [{ WordText: "LAGARTO", Left: 10, Top: 10, Width: 70, Height: 18 }, { WordText: "BOVINO", Left: 85, Top: 10, Width: 60, Height: 18 }] },
      { LineText: "R$ 39,99 kg", Words: [{ WordText: "R$", Left: 20, Top: 80, Width: 15, Height: 16 }, { WordText: "39,99", Left: 38, Top: 80, Width: 50, Height: 16 }, { WordText: "kg", Left: 90, Top: 80, Width: 15, Height: 16 }] },
    ] } }]);
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ nome: "LAGARTO BOVINO", preco: 39.99, confianca: 0.78 });
  });
});
