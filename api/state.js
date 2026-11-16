import { neon } from "@neondatabase/serverless";

// Se você conectar um banco dedicado na aba Storage do projeto `aniversariolaura` na Vercel,
// a Vercel preenche DATABASE_URL / POSTGRES_URL automaticamente.
// Enquanto não houver variável no painel da Vercel, usa o schema isolado `aniversario_laura`.
const FALLBACK_NEON_URL =
  "postgresql://neondb_owner:npg_VHxOI2vsD3YP@ep-steep-surf-a4igari9-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require";

function getSql() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    FALLBACK_NEON_URL;
  return neon(url, { fullResults: true });
}

function sanitizeEventConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const clean = { ...cfg };
  delete clean.sizes;
  delete clean.gifts;
  delete clean.adminPin;
  return clean;
}

let schemaReady = false;
async function ensureIsolatedSchema(sql) {
  if (schemaReady) return;
  await sql.query(`CREATE SCHEMA IF NOT EXISTS aniversario_laura`);
  await sql.query(
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
    const sql = getSql();
    await ensureIsolatedSchema(sql);

    if (req.method === "GET") {
      const rsvps = [];
      let eventConfig = null;

      const result = await sql.query(
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

        await sql.query(
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
