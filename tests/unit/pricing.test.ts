import { describe, expect, it } from "vitest";
import { extractOcrCandidates, findPricesInText } from "@/lib/extraction";
import { parseBrazilianPrice } from "@/lib/validation";

describe("preços brasileiros", () => {
  it("converte vírgula decimal sem confundir milhares", () => { expect(parseBrazilianPrice("R$ 9,99")).toBe(9.99); expect(parseBrazilianPrice("1.299,90")).toBe(1299.9); });
  it("encontra múltiplos preços no OCR", () => { expect(findPricesInText("Arroz R$ 19,90 e óleo 6,49").map((item) => item.value)).toEqual([19.9, 6.49]); });
  it("gera candidatos de revisão sem inventar produto quando há texto na linha", () => { const candidates = extractOcrCandidates("ARROZ TIPO 1 5KG R$ 19,90\nOLEO DE SOJA 900ML R$ 6,49"); expect(candidates).toHaveLength(2); expect(candidates[0]?.nome).toContain("ARROZ"); expect(candidates[0]?.preco).toBe(19.9); expect(candidates[0]?.confianca).toBeLessThan(0.82); });
});
