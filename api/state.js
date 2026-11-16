// Vercel Serverless Function (/api/state)
// Usa banco PostgreSQL (Neon) com schema isolado exclusivo (`aniversario_laura`)
// para nunca misturar tabelas com outros projetos. Se você conectar um banco novo
// dedicado na aba Storage da Vercel (DATABASE_URL / POSTGRES_URL), ele passa a
// usar esse banco automaticamente.

const FALLBACK_NEON_URL =
  "postgresql://neondb_owner:npg_VHxOI2vsD3YP@ep-steep-surf-a4igari9-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require";

function sanitizeEventConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const clean = { ...cfg };
  delete clean.sizes;
  delete clean.gifts;
  delete clean.adminPin;
  return clean;
}

// Neon HTTP SQL Driver (1 comando SQL por chamada HTTP, zero dependências npm)
async function neonQuery(query, params = []) {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    FALLBACK_NEON_URL;
  const parsed = new URL(dbUrl);
  const endpoint = `https://${parsed.hostname}/sql`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Neon-Connection-String": dbUrl,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, params }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Neon HTTP error (${res.status}): ${txt}`);
  }
  return res.json();
}

let schemaReady = false;
async function ensureIsolatedSchema() {
  if (schemaReady) return;
  // Cria um schema 100% isolado exclusivo para o aniversário da Laura
  await neonQuery(`CREATE SCHEMA IF NOT EXISTS aniversario_laura`);
  await neonQuery(
    `CREATE TABLE IF NOT EXISTS aniversario_laura.rsvps_store (
      slug TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'sim',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  schemaReady = true;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    await ensureIsolatedSchema();

    if (req.method === "GET") {
      const rsvps = [];
      let eventConfig = null;

      const result = await neonQuery(
        `SELECT slug, payload, status, updated_at
         FROM aniversario_laura.rsvps_store
         ORDER BY updated_at DESC`
      );

      for (const r of result?.rows || []) {
        const data =
          typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
        if (!data) continue;

        if (r.slug.startsWith("laura1:rsvp:")) {
          rsvps.push({
            ...data,
            slug: r.slug,
            updatedAt: r.updated_at || data.updatedAt,
          });
        } else if (r.slug === "laura1:config") {
          eventConfig = sanitizeEventConfig(data);
        }
      }

      return res.status(200).json({
        ok: true,
        source: process.env.DATABASE_URL ? "neon-dedicated" : "neon-isolated-schema",
        rsvps,
        eventConfig,
      });
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      const items = Array.isArray(body?.items)
        ? body.items
        : body?.slug && body?.payload
        ? [{ slug: body.slug, payload: body.payload, status: body.status }]
        : [];

      if (items.length === 0) {
        return res.status(400).json({ ok: false, error: "Dados inválidos" });
      }

      for (const item of items) {
        if (!item?.slug || !item?.payload) continue;
        if (String(item.slug).startsWith("laura1:gift:")) continue;

        const cleanPayload =
          item.slug === "laura1:config"
            ? sanitizeEventConfig(item.payload)
            : item.payload;

        await neonQuery(
          `INSERT INTO aniversario_laura.rsvps_store (slug, payload, status, updated_at)
           VALUES ($1, $2::jsonb, $3, NOW())
           ON CONFLICT (slug) DO UPDATE SET
             payload = EXCLUDED.payload,
             status = EXCLUDED.status,
             updated_at = NOW()`,
          [
            item.slug,
            JSON.stringify(cleanPayload),
            item.status === "nao" ? "nao" : "sim",
          ]
        );
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    return res
      .status(500)
      .json({ ok: false, error: err.message || "Erro interno no banco" });
  }
}
