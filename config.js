// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DO ANIVERSÁRIO DE 1 ANO DA LAURA (FUNDO DO MAR)
// Conectado ao projeto Supabase existente para persistir confirmações (RSVPs),
// reservas de presentes e configurações do evento em tempo real.
// ─────────────────────────────────────────────────────────────────────────────
window.LAURA_CONFIG = {
  SUPABASE_URL: "https://kgllkqyfoftzhxnggiga.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnbGxrcXlmb2Z0emh4bmdnaWdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MjEzOTQsImV4cCI6MjA5ODA5NzM5NH0.z90eye-xP7Z4G_fRKQDaPo1yDtiQ6fH_DMwJmbI3Yt4",

  // Chave RPC do banco compartilhado (usa confirmar + get_rsvps com namespace "laura1:")
  RPC_READ_KEY: "sophia27",
  NAMESPACE: "laura1",

  // Dados padrão do evento (podem ser editados ao vivo no botão "⚙️ Editar Evento" na página)
  DEFAULT_EVENT: {
    childName: "Laura",
    ageLabel: "1 Aninho",
    themeTitle: "Fundo do Mar Encantado",
    subtitle:
      "Prepare o fôlego para mergulhar em uma tarde cheia de alegria, bolhas de sabão e muito amor para comemorar o primeiro aninho da nossa pequena sereia!",
    dateDisplay: "Sábado, 12 de Dezembro de 2026",
    dateISO: "2026-12-12T15:00:00-03:00",
    timeDisplay: "Das 15h00 às 19h00",
    locationName: "Espaço Festa & Magia — Salão Atlântida",
    locationAddress: "Av. das Américas, 1500 — Salão Principal (Estacionamento no local)",
    mapQuery: "Espaço Festa Av. das Américas 1500",
    rsvpDeadline: "05 de Dezembro",
    sizes: {
      clothes: "1 a 2 anos (18–24 meses)",
      shoes: "19 / 20",
      diapers: "G ou XG (Pampers Confort Sec / Huggies Supreme Care)"
    },
    adminPin: "laura1"
  }
};
