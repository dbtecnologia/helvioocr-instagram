import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const allowedHosts = ["cdninstagram.com", "instagram.com", "fbcdn.net", "fbsbx.com", "facebook.com"];

function isAllowedMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!isAllowedMediaUrl(url)) return NextResponse.json({ error: "URL de imagem não permitida." }, { status: 400 });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "Não foi possível carregar a imagem." }, { status: 502 });
    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return NextResponse.json({ error: "O endereço não retornou uma imagem." }, { status: 415 });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 25 * 1024 * 1024) return NextResponse.json({ error: "A imagem excede o limite permitido." }, { status: 413 });
    return new NextResponse(buffer, { status: 200, headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    console.warn("[instagram] share media proxy failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Não foi possível preparar a imagem para compartilhamento." }, { status: 502 });
  }
}
