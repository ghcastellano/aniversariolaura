-- ════════════════════════════════════════════════════════════════════════════
--  BANCO DE DADOS — 1º ANIVERSÁRIO DA LAURA (FUNDO DO MAR)
--  Nota: O app já funciona automaticamente no projeto Supabase configurado em
--  config.js usando as funções RPC existentes (`confirmar` e `get_rsvps` com
--  prefixo `laura1:`). Caso deseje criar um projeto Supabase separado do zero,
--  basta rodar este script no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.rsvp (
  slug        text primary key,
  name        text not null,
  status      text not null check (status in ('sim','nao')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.rsvp enable row level security;
revoke all on public.rsvp from anon, authenticated;

create or replace function public.confirmar(
  p_slug text, p_name text, p_status text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('sim','nao') then
    raise exception 'status inválido';
  end if;
  insert into public.rsvp (slug, name, status, updated_at)
  values (p_slug, p_name, p_status, now())
  on conflict (slug) do update
    set name = excluded.name,
        status = excluded.status,
        updated_at = now();
end; $$;

create or replace function public.get_rsvps(pw text)
returns setof public.rsvp
language plpgsql security definer set search_path = public as $$
begin
  if pw is distinct from 'sophia27' and pw is distinct from 'laura1' then
    raise exception 'unauthorized';
  end if;
  return query select * from public.rsvp order by updated_at desc;
end; $$;

grant execute on function public.confirmar(text, text, text) to anon;
grant execute on function public.get_rsvps(text) to anon;
