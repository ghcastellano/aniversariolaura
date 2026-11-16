// Vercel Serverless Function (/api/state)
// Conecta automaticamente ao Supabase (ou Neon DATABASE_URL se configurado na Vercel)
// para gravar e listar confirmações de presença (RSVPs) e reservas de presentes da Laura.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://kgllkqyfoftzhxnggiga.supabase.co";

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbGxrcXlmb2Z0emh4bmdnaWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MjEzOTQsImV4cCI6MjA5ODA5NzM5NH0.z90eye-xP7Z4G_fRKQDaPo1yDtiQ6fH_DMwJmbI3Yt4";

const RPC_PW = process.env.SUPABASE_RPC_PW || "sophia27";

async function supabaseRpc(fnName, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase RPC ${fnName} failed (${res.status}): ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method === "GET") {
      const rows = (await supabaseRpc("get_rsvps", { pw: RPC_PW })) || [];
      const rsvps = [];
      const gifts = {};
      let eventConfig = null;

      for (const r of rows) {
        if (!r || typeof r.slug !== "string") continue;
        if (r.slug.startsWith("laura1:rsvp:")) {
          try {
            const parsed = JSON.parse(r.name);
            rsvps.push({
              ...parsed,
              slug: r.slug,
              updatedAt: r.updated_at || parsed.updatedAt,
            });
          } catch {
            // ignore malformed row
          }
        } else if (r.slug.startsWith("laura1:gift:")) {
          try {
            const parsed = JSON.parse(r.name);
            if (r.status === "sim" && parsed && parsed.giftId) {
              gifts[parsed.giftId] = {
                ...parsed,
                updatedAt: r.updated_at || parsed.updatedAt,
              };
            }
          } catch {
            // ignore malformed row
          }
        } else if (r.slug === "laura1:config") {
          try {
            eventConfig = JSON.parse(r.name);
          } catch {
            // ignore
          }
        }
      }

      return res.status(200).json({ ok: true, rsvps, gifts, eventConfig });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { type, slug, payload, status } = body || {};

      if (!slug || !payload) {
        return res.status(400).json({ ok: false, error: "Dados incompletos" });
      }

      await supabaseRpc("confirmar", {
        p_slug: slug,
        p_name: JSON.stringify({ ...payload, _type: type }),
        p_status: status === "nao" ? "nao" : "sim",
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Erro interno" });
  }
}
