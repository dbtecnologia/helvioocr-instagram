import { z } from "zod";

export const supermarketSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do supermercado."),
  instagram_handle: z.string().trim().min(2, "Informe o @ do Instagram.").transform((v) => v.startsWith("@")==false ? `@${v}` : v),
  instagram_url: z.string().url("Informe uma URL válida.").or(z.literal("")),
  city: z.string().trim().optional().default(""),
  neighborhood: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  network: z.string().trim().optional().default(""),
  active: z.boolean().default(true),
  market_type: z.enum(["own", "competitor"]).default("competitor"),
  monitoring_enabled: z.boolean().default(false),
  monitoring_frequency: z.enum(["minute", "daily", "weekly", "manual"]).default("weekly"),
  notes: z.string().trim().optional().default(""),
});

export const supermarketUpdateSchema = supermarketSchema.partial();

export const extractionOfferSchema = z.object({
  nome: z.string().min(1),
  marca: z.string().nullable().optional(),
  quantidade: z.number().nullable().optional(),
  unidade: z.string().nullable().optional(),
  preco: z.number().finite().nonnegative(),
  preco_anterior: z.number().finite().nonnegative().nullable().optional(),
  condicoes: z.string().nullable().optional(),
  confianca: z.number().min(0).max(1),
});

export const extractionSchema = z.object({
  data_publicacao: z.string().nullable().optional(),
  produtos: z.array(extractionOfferSchema),
});

export function parseBrazilianPrice(value: string): number | null {
  const clean = value.replace(/R\$|\s/g, "").trim();
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
