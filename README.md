# 🐚 Laura faz 1 Aninho! — Fundo do Mar (`aniversariolaura.vercel.app`)

Aplicação web interativa de **Convite, Confirmação de Presença (RSVP) em tempo real e Sugestão/Reserva de Presentes** para o 1º aniversário da Laura (Tema: *Fundo do Mar Encantado*).

## ✨ O que está incluído

1. **Convite & Confirmação de Presença (Home)**:
   - Visual temático do **Fundo do Mar** com bolhas animadas em Canvas e ilustrações aquáticas flutuantes.
   - Contagem regressiva ao vivo, informações de data, horário, local com **link direto para o Google Maps** e botão **Adicionar ao Google Agenda**.
   - **Reconhecimento automático** de quem já se cadastrou no aparelho (permitindo atualizar acompanhantes ou recado a qualquer momento).
   - **Formulário conectado em tempo real ao banco de dados Supabase** (`https://kgllkqyfoftzhxnggiga.supabase.co`) para confirmar presença, quantidade de adultos e crianças, observações e deixar recados no **Mural da Laura**.
2. **Lista de Confirmados**:
   - Painel atualizado automaticamente com cards de métricas: **Total de Pessoas**, **Adultos Confirmados**, **Crianças Confirmadas** e **Cadastros Recebidos**.
   - Busca instantânea por nome/recado e filtros de status (*Todos*, *Confirmados*, *Com Crianças*, *Não poderão ir*).
   - Exportação em 1 clique para **WhatsApp** ou planilha **CSV** (para envio ao buffet).
3. **Sugestão de Presentes (1 Ano)**:
   - **Guia Rápido de Tamanhos da Laura**: roupas (`1 a 2 anos / 18–24 meses`), calçados (`19 / 20`) e fraldas (`G / XG`).
   - 12 sugestões selecionadas para 1 ano de idade com **links diretos de busca na Amazon, Mercado Livre e Ri Happy**.
   - **Botão "Reservar este Presente"** sincronizado em tempo real com o banco de dados para evitar presentes repetidos.
4. **Painel Rápido dos Pais (`⚙️ Ajustar Data / Local / Tamanhos`)**:
   - No rodapé da página, permite alterar data, horário, endereço e tamanhos da Laura diretamente pelo navegador, salvando no banco de dados para todos os convidados.

## 🚀 Publicação em `aniversariolaura.vercel.app`

O repositório [`ghcastellano/aniversariolaura`](https://github.com/ghcastellano/aniversariolaura) já está configurado com `vercel.json`, `index.html`, `config.js` e `/api/state.js`.

Para ativar o domínio **`https://aniversariolaura.vercel.app`**:
1. Acesse [vercel.com/new](https://vercel.com/new) e clique em **Import** ao lado do repositório **`ghcastellano/aniversariolaura`**.
2. Confirme o **Project Name** como `aniversariolaura` e clique em **Deploy**.
3. Pronto! O site estará no ar em **`https://aniversariolaura.vercel.app`** já conectado ao banco de dados Supabase.
