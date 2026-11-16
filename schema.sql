-- ════════════════════════════════════════════════════════════════════════════
--  BANCO DE DADOS ISOLADO — 1º ANIVERSÁRIO DA LAURA (FUNDO DO MAR)
--  O endpoint /api/state cria este schema e tabela automaticamente na primeira
--  requisição em qualquer banco PostgreSQL / Neon (DATABASE_URL).
-- ════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS aniversario_laura;

CREATE TABLE IF NOT EXISTS aniversario_laura.rsvps_store (
  slug TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'sim',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
