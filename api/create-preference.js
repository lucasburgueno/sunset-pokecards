// api/create-preference.js
export const config = {
  runtime: "edge", // si te diera problema, cambiá a "nodejs"
};

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const body = await req.json();

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Missing MP_ACCESS_TOKEN" }), { status: 500 });
    }

    const prefPayload = {
      items: body.items || [],
      back_urls: body.back_urls || undefined,
      auto_return: body.auto_return, // opcional
      metadata: body.metadata || {},
    };

    const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(prefPayload),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("MP Error:", data);
      return new Response(JSON.stringify(data), { status: resp.status });
    }

    return new Response(JSON.stringify({ id: data.id }), { status: 200 });
  } catch (err) {
    console.error("create-preference error", err);
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500 });
  }
}
