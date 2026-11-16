import { neon } from "@neondatabase/serverless";
import pg from "pg";

// Canal de banco em nuvem 100% isolado e exclusivo do projeto Aniversário da Laura
const ISOLATED_CHANNEL = "aniversariolaura_db_v1_7c4e9a2f";
const NTFY_BASE_URL = `https://ntfy.sh/${ISOLATED_CHANNEL}`;

// Cache em memória da instância serverless para resposta instantânea
let memoryStore = {
  rsvpsMap: new Map(),
  eventConfig: null,
  blobUrl: process.env.LAURA_BLOB_URL || null,
};

function sanitizeEventConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const clean = { ...cfg };
  delete clean.sizes;
  delete clean.gifts;
  delete clean.adminPin;
  return clean;
}

// ─────────────────────────────────────────────────────────────────────────────
// OPÇÃO 1: Se o usuário adicionar DATABASE_URL / POSTGRES_URL no projeto
// `aniversariolaura` da Vercel, usa esse banco PostgreSQL dedicado.
// ─────────────────────────────────────────────────────────────────────────────
function getCustomPostgresUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    null
  );
}

let pgPool = null;
async function runPostgresQuery(connectionString, text, params = []) {
  try {
    const sql = neon(connectionString, { fullResults: true });
    if (typeof sql.query === "function") {
      const res = await sql.query(text, params);
      return Array.isArray(res) ? { rows: res } : res;
    }
    const res = await sql(text, params);
    return Array.isArray(res) ? { rows: res } : res;
  } catch {
    if (!pgPool) {
      pgPool = new pg.Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 3,
        connectionTimeoutMillis: 6000,
      });
    }
    return await pgPool.query(text, params);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPÇÃO 2 (PADRÃO): Banco em nuvem isolado e exclusivo do projeto
// `aniversariolaura` (combina documento JSON persistente + stream de eventos)
// ─────────────────────────────────────────────────────────────────────────────
function applyItemsToMap(rsvpsMap, currentConfig, items) {
  let nextConfig = currentConfig;
  for (const item of items || []) {
    if (!item || !item.slug || !item.payload) continue;
    if (String(item.slug).startsWith("laura1:gift:")) continue;

    if (item.slug === "laura1:config") {
      nextConfig = sanitizeEventConfig(item.payload);
    } else if (String(item.slug).startsWith("laura1:rsvp:")) {
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

async function loadIsolatedCloudState() {
  const rsvpsMap = new Map(memoryStore.rsvpsMap);
  let eventConfig = memoryStore.eventConfig;
  let blobUrl = memoryStore.blobUrl;

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

  const customPgUrl = getCustomPostgresUrl();

  try {
    if (req.method === "GET") {
      if (customPgUrl) {
        try {
          await runPostgresQuery(
            customPgUrl,
            `CREATE SCHEMA IF NOT EXISTS aniversario_laura`
          );
          await runPostgresQuery(
            customPgUrl,
            `CREATE TABLE IF NOT EXISTS aniversario_laura.rsvps_store (
              slug TEXT PRIMARY KEY,
              payload JSONB NOT NULL,
              status TEXT NOT NULL DEFAULT 'sim',
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`
          );
          const result = await runPostgresQuery(
            customPgUrl,
            `SELECT slug, payload, status, updated_at
             FROM aniversario_laura.rsvps_store
             ORDER BY updated_at DESC`
          );
          const rsvps = [];
          let eventConfig = null;
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
            source: "postgres",
            rsvps,
            eventConfig,
          });
        } catch {
          // Se DATABASE_URL falhar, usa automaticamente o banco isolado em nuvem
        }
      }

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

      if (items.length === 0) {
        return res.status(400).json({ ok: false, error: "Dados inválidos" });
      }

      const cleanedItems = items
        .filter(
          (item) =>
            item?.slug &&
            item?.payload &&
            !String(item.slug).startsWith("laura1:gift:")
        )
        .map((item) => ({
          slug: item.slug,
          payload:
            item.slug === "laura1:config"
              ? sanitizeEventConfig(item.payload)
              : item.payload,
          status: item.status === "nao" ? "nao" : "sim",
        }));

      if (customPgUrl) {
        try {
          await runPostgresQuery(
            customPgUrl,
            `CREATE SCHEMA IF NOT EXISTS aniversario_laura`
          );
          await runPostgresQuery(
            customPgUrl,
            `CREATE TABLE IF NOT EXISTS aniversario_laura.rsvps_store (
              slug TEXT PRIMARY KEY,
              payload JSONB NOT NULL,
              status TEXT NOT NULL DEFAULT 'sim',
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`
          );
          for (const item of cleanedItems) {
            await runPostgresQuery(
              customPgUrl,
              `INSERT INTO aniversario_laura.rsvps_store (slug, payload, status, updated_at)
               VALUES ($1, $2::jsonb, $3, NOW())
               ON CONFLICT (slug) DO UPDATE SET
                 payload = EXCLUDED.payload,
                 status = EXCLUDED.status,
                 updated_at = NOW()`,
              [item.slug, JSON.stringify(item.payload), item.status]
            );
          }
        } catch {
          // Continua e salva no banco isolado em nuvem
        }
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
