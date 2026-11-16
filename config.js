// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DO ANIVERSÁRIO DE 1 ANO DA LAURA (FUNDO DO MAR)
// Conectado ao banco de dados Neon PostgreSQL (serverless) para sincronizar
// confirmações de presença (RSVPs) e dados do evento entre todos os celulares.
// ─────────────────────────────────────────────────────────────────────────────
window.LAURA_CONFIG = {
  NEON_DATABASE_URL:
    "postgresql://neondb_owner:npg_VHxOI2vsD3YP@ep-steep-surf-a4igari9-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",

  NAMESPACE: "laura1",

  // Dados padrão do evento (sincronizados automaticamente com o banco de dados)
  DEFAULT_EVENT: {
    childName: "Laura",
    ageLabel: "1 Aninho",
    themeTitle: "Fundo do Mar Encantado",
    subtitle:
      "Prepare o fôlego para mergulhar em uma tarde cheia de alegria, bolhas de sabão e muito amor para comemorar o primeiro aninho da nossa pequena sereia!",
    dateDisplay: "Domingo, 14 de Fevereiro de 2027",
    dateISO: "2027-02-14T15:00:00-03:00",
    timeDisplay: "Das 15h00 às 19h00",
    locationName: "Espaço Festa & Magia — Salão Atlântida",
    locationAddress: "Av. das Américas, 1500 — Salão Principal (Estacionamento no local)",
    rsvpDeadline: "05 de Fevereiro"
  }
};
