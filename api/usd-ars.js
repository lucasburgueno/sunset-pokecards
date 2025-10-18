// api/usd-ars.js
export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") || "blue").toLowerCase();

    const r = await fetch(`https://dolarapi.com/v1/dolares/${type}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "rate_fetch_error", detail: j }), { status: 500 });
    }

    const rate = Number(j.venta);
    return new Response(JSON.stringify({
      rate,
      source: "dolarapi.com",
      type,
      at: new Date().toISOString(),
    }), { status: 200 });
  } catch (e) {
    console.error("usd-ars error", e);
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500 });
  }
}
