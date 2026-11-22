-- =============================================================================
-- 1) Cor de cada projetista (usada nos cronogramas).
-- 2) Predecessora da TPE: a TPE só pode ser iniciada/apontada depois que a predecessora
--    for iniciada (status diferente de NÃO INICIADA ou com apontamento).
-- 3) Exclusão definitiva de TPE cadastrada por engano (somente Supervisor), com bloqueios:
--    revisões vinculadas, apontamentos e TPEs que a usam como predecessora.
-- Aplicar depois da 0006 (SQL Editor do Supabase). Idempotente.
-- =============================================================================

-- ---------------------------------------------------------------- 1) cor
alter table public.recursos add column if not exists cor text;
alter table public.recursos drop constraint if exists recursos_cor_chk;
alter table public.recursos add constraint recursos_cor_chk check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$');
update public.recursos r
   set cor = (array['#1f6fd1','#d9480f','#2b8a3e','#7048e8','#c2255c','#0c8599','#e67700','#5c7cfa'])[1 + ((r.id - 1) % 8)::int]
 where r.cor is null;
-- novos projetistas recebem a próxima cor da paleta
create or replace function public.cor_padrao_recurso() returns text
language sql volatile security definer set search_path = public as $$
  select (array['#1f6fd1','#d9480f','#2b8a3e','#7048e8','#c2255c','#0c8599','#e67700','#5c7cfa'])[1 + ((select count(*) from public.recursos) % 8)::int]
$$;
alter table public.recursos alter column cor set default public.cor_padrao_recurso();
comment on column public.recursos.cor is 'Cor do projetista nos cronogramas (#RRGGBB).';

-- ---------------------------------------------------------------- 2) predecessora
alter table public.tpes add column if not exists predecessora_id bigint references public.tpes (id) on delete restrict;
alter table public.tpes drop constraint if exists tpes_predecessora_chk;
alter table public.tpes add constraint tpes_predecessora_chk check (predecessora_id is null or predecessora_id <> id);
create index if not exists tpes_predecessora_idx on public.tpes (predecessora_id) where predecessora_id is not null;
comment on column public.tpes.predecessora_id is 'TPE que precisa estar iniciada para esta poder ser iniciada/apontada.';

create or replace function public.tpe_iniciada(p_tpe bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tpes t where t.id = p_tpe and t.status <> 'NÃO INICIADA')
      or exists (select 1 from public.apontamentos a where a.tpe_id = p_tpe and a.excluido_em is null)
$$;

create or replace function public.predecessora_liberada(p_tpe bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select t.predecessora_id is null or public.tpe_iniciada(t.predecessora_id)
                   from public.tpes t where t.id = p_tpe), true)
$$;

create or replace function public.trg_tpes_predecessora() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pred text;
begin
  if new.predecessora_id is not null then
    -- impede ciclos (A depende de B que depende de A…)
    if exists (
      with recursive cadeia(id) as (
        select new.predecessora_id
        union
        select t.predecessora_id from public.tpes t join cadeia c on t.id = c.id where t.predecessora_id is not null
      ) select 1 from cadeia where id = new.id
    ) then
      raise exception 'A predecessora escolhida cria um ciclo (uma TPE acabaria dependendo dela mesma).';
    end if;
    -- não deixa iniciar antes da predecessora
    if new.status <> 'NÃO INICIADA' and (tg_op = 'INSERT' or old.status = 'NÃO INICIADA' or old.predecessora_id is distinct from new.predecessora_id)
       and not public.tpe_iniciada(new.predecessora_id) then
      select codigo into v_pred from public.tpes where id = new.predecessora_id;
      raise exception 'A TPE % só pode ser iniciada depois que a predecessora % for iniciada.', new.codigo, v_pred;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tpes_predecessora on public.tpes;
create trigger tpes_predecessora before insert or update of predecessora_id, status on public.tpes
  for each row execute function public.trg_tpes_predecessora();

-- projetista só aponta em TPE cuja predecessora já foi iniciada
drop policy if exists insere on public.apontamentos;
create policy insere on public.apontamentos for insert to authenticated
  with check (
    public.is_master()
    or (public.usuario_ativo()
        and recurso_id = public.meu_recurso()
        and public.tpe_atribuida_a_mim(tpe_id)
        and public.predecessora_liberada(tpe_id)
        and excluido_em is null
        and dia <= current_date + 1
        and dia >= current_date - public.janela_lancamento_dias())
  );

-- tarefas do projetista com a situação da predecessora (o projetista não enxerga a TPE predecessora)
drop function if exists public.minhas_tarefas();
create function public.minhas_tarefas()
returns table (tpe_id bigint, codigo text, os integer, cliente text, cidade text, uf text, principal text, grupo text,
               descricao text, instrucoes text, status public.status_tpe, sequencia integer, prazo date,
               data_inicio date, horas_apontadas numeric, ultimo_apontamento date,
               predecessora_codigo text, predecessora_liberada boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.codigo, t.os, o.nome, o.cidade, o.uf, t.principal, t.grupo, t.descricao, t.instrucoes, t.status,
         a.sequencia, t.prazo, t.data_inicio,
         coalesce((select sum(v.horas_totais) from public.v_apontamentos v
                   where v.tpe_id = t.id and v.recurso_id = public.meu_recurso()), 0),
         (select max(x.dia) from public.apontamentos x where x.tpe_id = t.id and x.recurso_id = public.meu_recurso() and x.excluido_em is null),
         p.codigo,
         (t.predecessora_id is null or public.tpe_iniciada(t.predecessora_id))
  from public.atribuicoes a
  join public.tpes t on t.id = a.tpe_id
  left join public.tpes p on p.id = t.predecessora_id
  left join public.ordens_servico o on o.os = t.os
  where a.ativa and a.recurso_id = public.meu_recurso() and public.usuario_ativo() and not t.arquivada
  order by (t.status = 'FINALIZADA'), a.sequencia, t.prazo nulls last, t.codigo
$$;

-- v_tpes passa a trazer predecessora_id (t.*): precisa ser recriada
drop view if exists public.v_tpes;
create view public.v_tpes
with (security_invoker = true) as
select t.*,
       o.nome as cliente, o.uf, o.cidade, o.nivel, o.vendedor, o.classificacao, o.projeto_engefril,
       at.recurso_id as responsavel_id, r.nome as responsavel, at.sequencia,
       coalesce(sum(v.horas_normais), 0) as horas_normais,
       coalesce(sum(v.horas_extras), 0) as horas_extras,
       coalesce(sum(v.horas_totais), 0) as horas_totais,
       sum(v.custo_total) as custo_total,
       count(v.id) as qtd_apontamentos,
       min(v.dia) as primeiro_apontamento,
       max(v.dia) as ultimo_apontamento
from public.tpes t
left join public.ordens_servico o on o.os = t.os
left join public.atribuicoes at on at.tpe_id = t.id and at.ativa
left join public.recursos r on r.id = at.recurso_id
left join public.v_apontamentos v on v.tpe_id = t.id
group by t.id, o.os, at.recurso_id, at.sequencia, r.nome;
grant select on public.v_tpes to authenticated;
revoke all on public.v_tpes from anon;

-- ---------------------------------------------------------------- 3) exclusão de TPE
create or replace function public.excluir_tpe(p_tpe bigint) returns text
language plpgsql security definer set search_path = public as $$
declare t record; v_lista text; v_n integer;
begin
  if not public.is_master() then raise exception 'Somente o Supervisor apaga TPEs.' using errcode = '42501'; end if;
  select * into t from public.tpes where id = p_tpe;
  if not found then raise exception 'TPE não encontrada.'; end if;
  if t.revisao = 0 then
    select string_agg(codigo, ', ' order by revisao) into v_lista from public.tpes where numero = t.numero and id <> t.id;
    if v_lista is not null then
      raise exception 'A TPE % não pode ser apagada porque tem revisões vinculadas (%). Apague as revisões primeiro.', t.codigo, v_lista;
    end if;
  end if;
  select count(*) into v_n from public.apontamentos where tpe_id = p_tpe;
  if v_n > 0 then
    raise exception 'A TPE % não pode ser apagada porque tem % apontamento(s) registrado(s). Use Arquivar.', t.codigo, v_n;
  end if;
  select string_agg(codigo, ', ' order by codigo) into v_lista from public.tpes where predecessora_id = p_tpe;
  if v_lista is not null then
    raise exception 'A TPE % não pode ser apagada porque é predecessora de %. Troque a predecessora dessas TPEs primeiro.', t.codigo, v_lista;
  end if;
  delete from public.atribuicoes where tpe_id = p_tpe;
  delete from public.tpes where id = p_tpe;
  return t.codigo;
end $$;

-- ---------------------------------------------------------------- permissões
revoke all on function public.tpe_iniciada(bigint), public.predecessora_liberada(bigint), public.excluir_tpe(bigint), public.cor_padrao_recurso(),
  public.minhas_tarefas(), public.trg_tpes_predecessora() from public, anon;
grant execute on function public.tpe_iniciada(bigint), public.predecessora_liberada(bigint), public.excluir_tpe(bigint),
  public.minhas_tarefas(), public.cor_padrao_recurso() to authenticated;
