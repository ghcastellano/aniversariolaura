import { neon } from "@neondatabase/serverless";
import pg from "pg";

// Canal de banco em nuvem 100% isolado e exclusivo do projeto Aniversário da Laura (v3)
const ISOLATED_CHANNEL = "aniversariolaura_db_v3_clean";
const NTFY_BASE_URL = `https://ntfy.sh/${ISOLATED_CHANNEL}`;

// Corte temporal: qualquer registro antigo anterior a este instante (exceto Gustavo e Sophia)
// é descartado, impedindo que abas antigas abertas em outros celulares reenviem registros excluídos.
const RESET_CUTOFF_TIME = new Date("2026-11-16T04:28:00.000Z").getTime();

const INITIAL_RSVP = {
  slug: "laura1:rsvp:gustavo-e-sophia",
  name: "Gustavo e Sophia",
  status: "confirmado",
  adults: 2,
  children: 0,
  kidsNotes: "",
  phone: "",
  message: "Nós te amamos muito! 💕",
  updatedAt: "2026-11-16T04:00:58.820Z",
};

function isDeletedLegacyRecord(slug, payload) {
  if (!slug || typeof slug !== "string") return true;
  if (!slug.startsWith("laura1:rsvp:")) return true;
  if (slug === "laura1:rsvp:") return true;
  if (slug === INITIAL_RSVP.slug) return false;

  const name = String(payload?.name || "").trim();
  if (!name || name === ".." || name === ".") return true;

  const ts = new Date(payload?.updatedAt || 0).getTime();
  if (!ts || Number.isNaN(ts) || ts < RESET_CUTOFF_TIME) {
    return true;
  }
  return false;
}

// Cache em memória da instância serverless inicializado apenas com Gustavo e Sophia
let memoryStore = {
  rsvpsMap: new Map([[INITIAL_RSVP.slug, INITIAL_RSVP]]),
  eventConfig: null,
  blobUrl: null,
};

function sanitizeEventConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const clean = { ...cfg };
  delete clean.sizes;
  delete clean.gifts;
  delete clean.adminPin;
  return clean;
}

function applyItemsToMap(rsvpsMap, currentConfig, items) {
  let nextConfig = currentConfig;
  for (const item of items || []) {
    if (!item || !item.slug || !item.payload) continue;
    if (String(item.slug).startsWith("laura1:gift:")) continue;

    if (item.slug === "laura1:config") {
      nextConfig = sanitizeEventConfig(item.payload);
    } else if (String(item.slug).startsWith("laura1:rsvp:")) {
      if (isDeletedLegacyRecord(item.slug, item.payload)) {
        rsvpsMap.delete(item.slug);
        continue;
      }

      const existing = rsvpsMap.get(item.slug);
      const itemTime = new Date(
        item.payload.updatedAt || item.updatedAt || 0
      ).getTime();
      const existingTime = existing
        ? new Date(existing.updatedAt || 0).getTime()
        : -1;

      if (!existing || itemTime >= existingTime) {
        rsvpsMap.set(item.slug, {
          ...item.payload,
          slug: item.slug,
          updatedAt:
            item.payload.updatedAt ||
            item.updatedAt ||
            new Date().toISOString(),
        });
      }
    }
  }
  return nextConfig;
}

async function getPgClient() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  try {
    const sql = neon(dbUrl);
    await sql`CREATE SCHEMA IF NOT EXISTS aniversario_laura`;
    await sql`CREATE TABLE IF NOT EXISTS aniversario_laura.rsvps_store (
      slug TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'sim',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    return { type: "neon", sql };
  } catch {
    try {
      const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await pool.query("CREATE SCHEMA IF NOT EXISTS aniversario_laura");
      await pool.query(`CREATE TABLE IF NOT EXISTS aniversario_laura.rsvps_store (
        slug TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'sim',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      return { type: "pg", pool };
    } catch {
      return null;
    }
  }
}

async function loadIsolatedCloudState() {
  const rsvpsMap = new Map([[INITIAL_RSVP.slug, INITIAL_RSVP]]);
  for (const [k, v] of memoryStore.rsvpsMap.entries()) {
    if (!isDeletedLegacyRecord(k, v)) {
      rsvpsMap.set(k, v);
    }
  }
  let eventConfig = memoryStore.eventConfig;
  let blobUrl = memoryStore.blobUrl;

  const db = await getPgClient();
  if (db) {
    try {
      const rows = db.type === "neon"
        ? await db.sql`SELECT slug, payload, updated_at FROM aniversario_laura.rsvps_store`
        : (await db.pool.query("SELECT slug, payload, updated_at FROM aniversario_laura.rsvps_store")).rows;
      if (db.type === "pg") await db.pool.end().catch(() => {});
      eventConfig = applyItemsToMap(rsvpsMap, eventConfig, rows.map(r => ({
        slug: r.slug,
        payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
        updatedAt: r.updated_at,
      })));
    } catch {
      // fall through to ntfy/jsonblob
    }
  }

  try {
    const res = await fetch(`${NTFY_BASE_URL}/json?poll=1&since=all`, {
      cache: "no-store",
    });
    if (res.ok) {
      const text = await res.text();
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          if (evt.event !== "message" || !evt.message) continue;
          const data = JSON.parse(evt.message);

          if (data.blobUrl && typeof data.blobUrl === "string") {
            blobUrl = data.blobUrl;
          }
          if (Array.isArray(data.items)) {
            eventConfig = applyItemsToMap(rsvpsMap, eventConfig, data.items);
          }
          if (Array.isArray(data.rsvps)) {
            const asItems = data.rsvps.map((r) => ({
              slug: r.slug,
              payload: r,
            }));
            eventConfig = applyItemsToMap(rsvpsMap, eventConfig, asItems);
          }
          if (data.eventConfig) {
            eventConfig = sanitizeEventConfig(data.eventConfig);
          }
        } catch {
          // ignore malformed line
        }
      }
    }
  } catch {
    // ignore network error on ntfy poll
  }

  if (blobUrl) {
    try {
      const blobRes = await fetch(blobUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (blobRes.ok) {
        const blobData = await blobRes.json();
        if (Array.isArray(blobData?.rsvps)) {
          const asItems = blobData.rsvps.map((r) => ({
            slug: r.slug,
            payload: r,
          }));
          eventConfig = applyItemsToMap(rsvpsMap, eventConfig, asItems);
        }
        if (blobData?.eventConfig && !eventConfig) {
          eventConfig = sanitizeEventConfig(blobData.eventConfig);
        }
      }
    } catch {
      // ignore blob read error
    }
  }

  memoryStore.rsvpsMap = rsvpsMap;
  memoryStore.eventConfig = eventConfig;
  memoryStore.blobUrl = blobUrl;

  const rsvps = Array.from(rsvpsMap.values()).sort(
    (a, b) =>
      new Date(b.updatedAt || 0).getTime() -
      new Date(a.updatedAt || 0).getTime()
  );

  return { rsvps, eventConfig, blobUrl };
}

async function saveIsolatedCloudItems(items) {
  const current = await loadIsolatedCloudState();
  const rsvpsMap = new Map(memoryStore.rsvpsMap);
  const eventConfig = applyItemsToMap(rsvpsMap, current.eventConfig, items);

  const db = await getPgClient();
  if (db) {
    try {
      for (const item of items || []) {
        if (!item?.slug || !item?.payload) continue;
        const status = item.status === "nao" ? "nao" : "sim";
        const payloadJson = JSON.stringify(item.payload);
        if (db.type === "neon") {
          await db.sql`
            INSERT INTO aniversario_laura.rsvps_store (slug, payload, status, updated_at)
            VALUES (${item.slug}, ${payloadJson}::jsonb, ${status}, NOW())
            ON CONFLICT (slug) DO UPDATE SET
              payload = EXCLUDED.payload,
              status = EXCLUDED.status,
              updated_at = NOW()
          `;
        } else {
          await db.pool.query(
            `INSERT INTO aniversario_laura.rsvps_store (slug, payload, status, updated_at)
             VALUES ($1, $2::jsonb, $3, NOW())
             ON CONFLICT (slug) DO UPDATE SET
               payload = EXCLUDED.payload,
               status = EXCLUDED.status,
               updated_at = NOW()`,
            [item.slug, payloadJson, status]
          );
        }
      }
      if (db.type === "pg") await db.pool.end().catch(() => {});
    } catch {
      // fallback to ntfy/jsonblob
    }
  }

  const rsvps = Array.from(rsvpsMap.values()).sort(
    (a, b) =>
      new Date(b.updatedAt || 0).getTime() -
      new Date(a.updatedAt || 0).getTime()
  );

  let blobUrl = current.blobUrl;
  const fullSnapshot = {
    rsvps,
    eventConfig,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (blobUrl) {
      await fetch(blobUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(fullSnapshot),
      });
    } else {
      const createRes = await fetch("https://jsonblob.com/api/jsonBlob", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(fullSnapshot),
      });
      if (createRes.ok) {
        const loc =
          createRes.headers.get("location") ||
          createRes.headers.get("x-jsonblob");
        if (loc) {
          blobUrl = loc.startsWith("http")
            ? loc
            : `https://jsonblob.com/api/jsonBlob/${loc.replace(/^\/+/, "")}`;
        }
      }
    }
  } catch {
    // jsonblob optional backup
  }

  memoryStore.rsvpsMap = rsvpsMap;
  memoryStore.eventConfig = eventConfig;
  memoryStore.blobUrl = blobUrl;

  const messagePayload = JSON.stringify({
    blobUrl,
    items,
    eventConfig,
    ts: Date.now(),
  });

  const pubRes = await fetch(NTFY_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
    body: messagePayload,
  });

  if (!pubRes.ok && !blobUrl) {
    throw new Error(`Falha ao gravar no banco em nuvem (${pubRes.status})`);
  }

  return { rsvps, eventConfig, blobUrl };
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
    if (req.method === "GET") {
      const state = await loadIsolatedCloudState();
      return res.status(200).json({
        ok: true,
        source: "isolated-cloud",
        rsvps: state.rsvps,
        eventConfig: state.eventConfig,
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

      const cleanedItems = items
        .filter(
          (item) =>
            item?.slug &&
            item?.payload &&
            !String(item.slug).startsWith("laura1:gift:") &&
            !isDeletedLegacyRecord(item.slug, item.payload)
        )
        .map((item) => ({
          slug: item.slug,
          payload: item.payload,
          status: item.status === "nao" ? "nao" : "sim",
        }));

      if (cleanedItems.length === 0) {
        const state = await loadIsolatedCloudState();
        return res.status(200).json({
          ok: true,
          rsvps: state.rsvps,
          eventConfig: state.eventConfig,
        });
      }

      const saved = await saveIsolatedCloudItems(cleanedItems);
      return res.status(200).json({
        ok: true,
        rsvps: saved.rsvps,
        eventConfig: saved.eventConfig,
      });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || "Erro interno no banco",
    });
  }
}
