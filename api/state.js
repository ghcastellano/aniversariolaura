// Vercel Serverless Function (/api/state)
// Suporta Neon Postgres (DATABASE_URL / POSTGRES_URL via HTTP SQL) e Supabase
// para gravar e listar exclusivamente confirmações de presença (RSVPs) e dados
// de data/hora/local do evento (sem dados de presentes ou tamanhos).

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://kgllkqyfoftzhxnggiga.supabase.co";

const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbGxrcXlmb2Z0emh4bmdnaWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MjEzOTQsImV4cCI6MjA5ODA5NzM5NH0.z90eye-xP7Z4G_fRKQDaPo1yDtiQ6fH_DMwJmbI3Yt4";

const BACKUP_SUPABASE_URL = "https://aobryreauhebmpibynai.supabase.co";
const BACKUP_SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvYnJ5cmVhdWhlYm1waWJ5bmFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMzIxNzEsImV4cCI6MjA4NTcwODE3MX0.0NXOyR2O0BFKBUcjFNmglZLp9yjrFf3JYoJ-hY3rUcw";

const RPC_PW = process.env.SUPABASE_RPC_PW || "sophia27";

function sanitizeEventConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const clean = { ...cfg };
  delete clean.sizes;
  delete clean.gifts;
  delete clean.adminPin;
  return clean;
}

// 1. Neon HTTP SQL Driver (zero npm dependencies required)
async function neonQuery(query, params = []) {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return null;
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

async function ensureNeonSchema() {
  await neonQuery(`
    CREATE TABLE IF NOT EXISTS laura_rsvp_store (
      slug TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'sim',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Remove any legacy gift rows and strip sizes from config row
  await neonQuery(`DELETE FROM laura_rsvp_store WHERE slug LIKE 'laura1:gift:%'`);
}

// 2. Supabase RPC helper
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

// 3. Backup Supabase PostgREST helper (uses product_data_cache on aobryreauhebmpibynai)
async function backupSupabaseRead() {
  const res = await fetch(
    `${BACKUP_SUPABASE_URL}/rest/v1/product_data_cache?cache_key=like.laura1:*&select=cache_key,data,updated_at&order=updated_at.desc`,
    {
      headers: {
        apikey: BACKUP_SUPABASE_KEY,
        Authorization: `Bearer ${BACKUP_SUPABASE_KEY}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Backup Supabase read failed (${res.status})`);
  return res.json();
}

async function backupSupabaseWrite(slug, payloadObj) {
  const res = await fetch(
    `${BACKUP_SUPABASE_URL}/rest/v1/product_data_cache?on_conflict=cache_key`,
    {
      method: "POST",
      headers: {
        apikey: BACKUP_SUPABASE_KEY,
        Authorization: `Bearer ${BACKUP_SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        cache_key: slug,
        board_ids: "laura1",
        data_type: slug === "laura1:config" ? "config" : "rsvp",
        data: payloadObj,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) throw new Error(`Backup Supabase write failed (${res.status})`);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const hasNeon = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

    if (req.method === "GET") {
      const rsvps = [];
      let eventConfig = null;

      if (hasNeon) {
        await ensureNeonSchema();
        const result = await neonQuery(
          `SELECT slug, payload, status, updated_at FROM laura_rsvp_store ORDER BY updated_at DESC`
        );
        for (const r of result?.rows || []) {
          const data = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload;
          if (r.slug.startsWith("laura1:rsvp:")) {
            rsvps.push({ ...data, slug: r.slug, updatedAt: r.updated_at || data.updatedAt });
          } else if (r.slug === "laura1:config") {
            eventConfig = sanitizeEventConfig(data);
          }
        }
        return res.status(200).json({ ok: true, source: "neon", rsvps, eventConfig });
      }

      try {
        const rows = (await supabaseRpc("get_rsvps", { pw: RPC_PW })) || [];
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
              // ignore
            }
          } else if (r.slug === "laura1:config") {
            try {
              eventConfig = sanitizeEventConfig(JSON.parse(r.name));
            } catch {
              // ignore
            }
          }
        }
        return res.status(200).json({ ok: true, source: "supabase", rsvps, eventConfig });
      } catch {
        const rows = (await backupSupabaseRead()) || [];
        for (const r of rows) {
          if (!r || typeof r.cache_key !== "string") continue;
          if (r.cache_key.startsWith("laura1:rsvp:") && r.data) {
            rsvps.push({
              ...r.data,
              slug: r.cache_key,
              updatedAt: r.updated_at || r.data.updatedAt,
            });
          } else if (r.cache_key === "laura1:config" && r.data) {
            eventConfig = sanitizeEventConfig(r.data);
          }
        }
        return res.status(200).json({ ok: true, source: "supabase-backup", rsvps, eventConfig });
      }
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { slug, payload, status } = body || {};

      if (!slug || !payload || String(slug).startsWith("laura1:gift:")) {
        return res.status(400).json({ ok: false, error: "Operação inválida" });
      }

      const cleanPayload =
        slug === "laura1:config" ? sanitizeEventConfig(payload) : payload;

      if (hasNeon) {
        await ensureNeonSchema();
        await neonQuery(
          `INSERT INTO laura_rsvp_store (slug, payload, status, updated_at)
           VALUES ($1, $2::jsonb, $3, NOW())
           ON CONFLICT (slug) DO UPDATE SET
             payload = EXCLUDED.payload,
             status = EXCLUDED.status,
             updated_at = NOW()`,
          [slug, JSON.stringify(cleanPayload), status === "nao" ? "nao" : "sim"]
        );
        return res.status(200).json({ ok: true, source: "neon" });
      }

      try {
        await supabaseRpc("confirmar", {
          p_slug: slug,
          p_name: JSON.stringify(cleanPayload),
          p_status: status === "nao" ? "nao" : "sim",
        });
        return res.status(200).json({ ok: true, source: "supabase" });
      } catch {
        await backupSupabaseWrite(slug, cleanPayload);
        return res.status(200).json({ ok: true, source: "supabase-backup" });
      }
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Erro interno" });
  }
}
