// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DO ANIVERSÁRIO DE 1 ANO DA LAURA (FUNDO DO MAR)
// Conectado ao banco de dados para persistir confirmações de presença (RSVPs)
// e ler os dados oficiais do evento em tempo real.
// ─────────────────────────────────────────────────────────────────────────────
window.LAURA_CONFIG = {
  SUPABASE_URL: "https://kgllkqyfoftzhxnggiga.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbGxrcXlmb2Z0emh4bmdnaWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MjEzOTQsImV4cCI6MjA5ODA5NzM5NH0.z90eye-xP7Z4G_fRKQDaPo1yDtiQ6fH_DMwJmbI3Yt4",

  BACKUP_SUPABASE_URL: "https://aobryreauhebmpibynai.supabase.co",
  BACKUP_SUPABASE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvYnJ5cmVhdWhlYm1waWJ5bmFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMzIxNzEsImV4cCI6MjA4NTcwODE3MX0.0NXOyR2O0BFKBUcjFNmglZLp9yjrFf3JYoJ-hY3rUcw",

  RPC_READ_KEY: "sophia27",
  NAMESPACE: "laura1",

  // Dados fixos do evento (e sincronizados com o registro salvo no banco)
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
