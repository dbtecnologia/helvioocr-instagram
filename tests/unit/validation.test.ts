import { describe, expect, it } from "vitest";
import { extractionSchema, supermarketSchema } from "@/lib/validation";

describe("schemas do núcleo", () => {
  it("normaliza o @ do Instagram", () => { const result = supermarketSchema.parse({ name: "Mercado Central", instagram_handle: "mercadocentral", instagram_url: "", city: "Campinas", neighborhood: "Centro" }); expect(result.instagram_handle).toBe("@mercadocentral"); });
  it("rejeita preço negativo ou confiança fora da faixa", () => { expect(extractionSchema.safeParse({ produtos: [{ nome: "Arroz", preco: -1, confianca: 0.9 }] }).success).toBe(false); expect(extractionSchema.safeParse({ produtos: [{ nome: "Arroz", preco: 1, confianca: 1.2 }] }).success).toBe(false); });
});
