-- =============================================================================
-- 1) O.S.: data de finalização (para o parecer no prazo / atrasada / antes do prazo)
--    e exclusão definitiva de O.S. cadastrada por engano (somente sem TPEs vinculadas).
-- 2) Férias (e outras ausências) por projetista: dias indisponíveis no cronograma.
-- 3) Cronograma da equipe passa a trazer o prazo final da O.S. de cada TPE.
-- Aplicar depois da 0008 (SQL Editor do Supabase). Idempotente.
-- =============================================================================

-- ---------------------------------------------------------------- 1) O.S.
alter table public.ordens_servico add column if not exists data_finalizacao date;
comment on column public.ordens_servico.data_finalizacao is 'Dia em que a O.S. foi finalizada no projeto (compara com prazo_final).';

create or replace function public.excluir_os(p_os integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer; v_lista text;
begin
  if not public.is_master() then raise exception 'Somente o Supervisor apaga O.S.' using errcode = '42501'; end if;
  if not exists (select 1 from public.ordens_servico where os = p_os) then raise exception 'O.S. não encontrada.'; end if;
  select count(*), string_agg(codigo, ', ' order by codigo) into v_n, v_lista
    from (select codigo from public.tpes where os = p_os order by codigo limit 6) x;
  if v_n > 0 then
    select count(*) into v_n from public.tpes where os = p_os;
    if v_n > 6 then v_lista := v_lista || '…'; end if;
    raise exception 'A O.S. % não pode ser apagada porque tem % TPE(s) vinculada(s): %. Apague as TPEs ou mude a O.S. delas primeiro.',
      lpad(p_os::text, 6, '0'), v_n, v_lista;
  end if;
  select count(*) into v_n from public.apontamentos where os_informada = p_os and excluido_em is null;
  if v_n > 0 then
    raise exception 'A O.S. % não pode ser apagada porque aparece em % apontamento(s) importado(s).', lpad(p_os::text, 6, '0'), v_n;
  end if;
  delete from public.ordens_servico where os = p_os;
  return p_os;
end $$;

-- ---------------------------------------------------------------- 2) férias / ausências
create table if not exists public.ausencias (
  id          bigint generated always as identity primary key,
  recurso_id  bigint not null references public.recursos (id) on delete cascade,
  inicio      date not null,
  fim         date not null,
  tipo        text not null default 'FERIAS' check (tipo in ('FERIAS', 'LICENCA', 'OUTRO')),
  observacao  text check (observacao is null or length(observacao) <= 200),
  criado_em   timestamptz not null default now(),
  check (fim >= inicio and fim - inicio <= 366)
);
create index if not exists ausencias_recurso_idx on public.ausencias (recurso_id, inicio);
comment on table public.ausencias is 'Férias e ausências de projetistas: dias que não contam na duração das TPEs nem na capacidade do cronograma.';

alter table public.ausencias enable row level security;
drop policy if exists ler on public.ausencias;
drop policy if exists master_insere on public.ausencias;
drop policy if exists master_altera on public.ausencias;
drop policy if exists master_exclui on public.ausencias;
create policy ler on public.ausencias for select to authenticated using (public.usuario_ativo());
create policy master_insere on public.ausencias for insert to authenticated with check (public.is_master());
create policy master_altera on public.ausencias for update to authenticated using (public.is_master()) with check (public.is_master());
create policy master_exclui on public.ausencias for delete to authenticated using (public.is_master());
grant select, insert, update, delete on public.ausencias to authenticated;
revoke all on public.ausencias from anon;
drop trigger if exists auditoria on public.ausencias;
create trigger auditoria after insert or update or delete on public.ausencias for each row execute function public.trg_auditoria();

-- ---------------------------------------------------------------- 3) cronograma com prazo da O.S.
drop function if exists public.cronograma_equipe();
create function public.cronograma_equipe()
returns table (id bigint, codigo text, numero integer, revisao integer, os integer, cliente text, principal text, grupo text, descricao text,
               status public.status_tpe, data_inicio date, prazo date, data_fim date, arquivada boolean, predecessora_id bigint,
               responsavel_id bigint, responsavel text, sequencia integer,
               primeiro_apontamento date, ultimo_apontamento date, qtd_apontamentos bigint, horas_totais numeric, os_prazo_final date)
language sql stable security definer set search_path = public as $$
  select t.id, t.codigo, t.numero, t.revisao, t.os, o.nome, t.principal, t.grupo, t.descricao,
         t.status, t.data_inicio, t.prazo, t.data_fim, t.arquivada, t.predecessora_id,
         at.recurso_id, r.nome, at.sequencia,
         min(a.dia), max(a.dia), count(a.id), coalesce(sum(v.horas_totais), 0), o.prazo_final
  from public.tpes t
  left join public.ordens_servico o on o.os = t.os
  left join public.atribuicoes at on at.tpe_id = t.id and at.ativa
  left join public.recursos r on r.id = at.recurso_id
  left join public.apontamentos a on a.tpe_id = t.id and a.excluido_em is null
  left join public.v_apontamentos v on v.id = a.id
  where public.usuario_ativo() and not t.arquivada
  group by t.id, o.nome, o.prazo_final, at.recurso_id, r.nome, at.sequencia
$$;

-- ---------------------------------------------------------------- permissões
revoke all on function public.excluir_os(integer), public.cronograma_equipe() from public, anon;
grant execute on function public.excluir_os(integer), public.cronograma_equipe() to authenticated;
