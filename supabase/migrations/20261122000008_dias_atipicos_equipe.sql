-- =============================================================================
-- 1) Apagar TPE: apontamentos já excluídos (exclusão lógica) não bloqueiam mais;
--    eles são removidos junto com a TPE (o histórico continua na auditoria).
-- 2) Feriados / dias atípicos: além do feriado (100% H.E.), o dia pode ser
--    - NAO_TRABALHADO: dia útil sem expediente; todas as horas são H.E. com o % informado;
--    - DIA_NORMAL: sábado/domingo contado como dia útil (horas normais, sem H.E. dentro da jornada);
--    - PERCENTUAL: mantém a regra do dia, mas a H.E. usa o % informado.
-- 3) Cronograma e calendário da equipe para os projetistas (funções sem custos).
-- Aplicar depois da 0007 (SQL Editor do Supabase). Idempotente.
-- =============================================================================

-- ---------------------------------------------------------------- 1) exclusão de TPE
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
  select count(*) into v_n from public.apontamentos where tpe_id = p_tpe and excluido_em is null;
  if v_n > 0 then
    raise exception 'A TPE % não pode ser apagada porque tem % apontamento(s) registrado(s). Exclua os apontamentos em Planejamento › Apontamentos ou use Arquivar.', t.codigo, v_n;
  end if;
  select string_agg(codigo, ', ' order by codigo) into v_lista from public.tpes where predecessora_id = p_tpe;
  if v_lista is not null then
    raise exception 'A TPE % não pode ser apagada porque é predecessora de %. Troque a predecessora dessas TPEs primeiro.', t.codigo, v_lista;
  end if;
  delete from public.apontamentos where tpe_id = p_tpe and excluido_em is not null;
  delete from public.atribuicoes where tpe_id = p_tpe;
  delete from public.tpes where id = p_tpe;
  return t.codigo;
end $$;

-- ---------------------------------------------------------------- 2) dias atípicos
alter table public.feriados add column if not exists tipo text not null default 'FERIADO';
alter table public.feriados add column if not exists adicional_he numeric(5,2);
alter table public.feriados drop constraint if exists feriados_tipo_chk;
alter table public.feriados add constraint feriados_tipo_chk check (
  tipo in ('FERIADO', 'NAO_TRABALHADO', 'DIA_NORMAL', 'PERCENTUAL')
  and (adicional_he is null or adicional_he between 0 and 3)
  and (tipo not in ('NAO_TRABALHADO', 'PERCENTUAL') or adicional_he is not null));
comment on table public.feriados is 'Feriados e dias atípicos. FERIADO = 100% H.E.; NAO_TRABALHADO = dia útil sem expediente (todas as horas H.E. a adicional_he); DIA_NORMAL = fim de semana contado como dia útil; PERCENTUAL = H.E. do dia com adicional_he.';

-- Tipo de dia: FERIADO / NÃO TRABALHADO / dia normal informado > DOMINGO > SÁBADO > DIA ÚTIL
create or replace function public.tipo_dia(p_dia date) returns text
language sql stable security definer set search_path = public as $$
  select case
    when f.tipo = 'FERIADO' then 'FERIADO'
    when f.tipo = 'NAO_TRABALHADO' then 'NÃO TRABALHADO'
    when f.tipo = 'DIA_NORMAL' then 'DIA ÚTIL'
    when extract(isodow from p_dia) = 7 then 'DOMINGO'
    when extract(isodow from p_dia) = 6 then 'SÁBADO'
    else 'DIA ÚTIL' end
  from (select 1) x left join public.feriados f on f.data = p_dia
$$;

-- adicional de H.E. próprio do dia (null = segue os parâmetros vigentes)
create or replace function public.adicional_dia(p_dia date) returns numeric
language sql stable security definer set search_path = public as $$
  select f.adicional_he from public.feriados f where f.data = p_dia and f.tipo in ('NAO_TRABALHADO', 'PERCENTUAL')
$$;

-- Mesma view da 0006; muda só o adicional (dia atípico com % próprio)
create or replace view public.v_apontamentos
with (security_invoker = true) as
with base as (
  select a.*,
         t.codigo as tpe_codigo, t.os, t.principal, t.grupo, t.descricao as tpe_descricao,
         r.nome as recurso_nome, r.inicio_padrao,
         public.tipo_dia(a.dia) as tipo_dia,
         pv.inicio_antecipado, pv.jornada_seg_qui, pv.jornada_sex, pv.almoco_inicio, pv.almoco_fim,
         pv.adic_dia_util, pv.adic_sabado, pv.adic_dom_feriado
  from public.apontamentos a
  join public.tpes t on t.id = a.tpe_id
  join public.recursos r on r.id = a.recurso_id
  cross join lateral public.parametros_vigentes(a.dia) pv
  where a.excluido_em is null
), jornada as (
  select b.*,
    coalesce(
      (select min(o.inicio_jornada_informado) from public.apontamentos o
        where o.recurso_id = b.recurso_id and o.dia = b.dia and o.excluido_em is null),
      case when exists (select 1 from public.apontamentos o
                        where o.recurso_id = b.recurso_id and o.dia = b.dia and o.excluido_em is null
                          and o.hora_inicio <= b.inicio_antecipado)
           then b.inicio_antecipado else b.inicio_padrao end
    ) as inicio_jornada
  from base b
), calc as (
  select j.*,
    (j.inicio_jornada + case when extract(isodow from j.dia) <= 4 then j.jornada_seg_qui else j.jornada_sex end)::time as fim_jornada,
    coalesce(public.adicional_dia(j.dia),
      case when j.tipo_dia in ('FERIADO','DOMINGO') then j.adic_dom_feriado
           when j.tipo_dia = 'SÁBADO' then j.adic_sabado else j.adic_dia_util end)::numeric(6,4) as adicional
  from jornada j
), horas as (
  select c.*,
    case when c.tipo_dia <> 'DIA ÚTIL' then interval '0'
         else public.min_round(
                greatest(interval '0', least(c.hora_fim, c.fim_jornada) - greatest(c.hora_inicio, c.inicio_jornada))
              - greatest(interval '0', least(c.hora_fim, c.fim_jornada, c.almoco_fim) - greatest(c.hora_inicio, c.inicio_jornada, c.almoco_inicio)))
    end as hora_normal,
    public.min_round((c.hora_fim - c.hora_inicio)
      - greatest(interval '0', least(c.hora_fim, c.almoco_fim) - greatest(c.hora_inicio, c.almoco_inicio))) as hora_liquida
  from calc c
)
select h.id, h.seq, h.tpe_id, h.tpe_codigo, h.os, h.principal, h.grupo, h.tpe_descricao,
       h.recurso_id, h.recurso_nome, h.dia, h.hora_inicio, h.hora_fim, h.descricao,
       h.tipo_dia, h.adicional, h.inicio_jornada, h.fim_jornada,
       round(extract(epoch from h.hora_normal) / 3600.0, 10) as horas_normais,
       round(greatest(0, extract(epoch from h.hora_liquida - h.hora_normal) / 3600.0), 10) as horas_extras,
       round(extract(epoch from greatest(h.hora_liquida, h.hora_normal)) / 3600.0, 10) as horas_totais,
       cv.valor as custo_hh,
       round(extract(epoch from h.hora_normal) / 3600.0 * cv.valor, 10) as custo_normal,
       round(greatest(0, extract(epoch from h.hora_liquida - h.hora_normal) / 3600.0) * cv.valor * (1 + h.adicional), 10) as custo_he,
       round(extract(epoch from h.hora_normal) / 3600.0 * cv.valor
           + greatest(0, extract(epoch from h.hora_liquida - h.hora_normal) / 3600.0) * cv.valor * (1 + h.adicional), 10) as custo_total,
       date_trunc('month', h.dia)::date as mes,
       h.origem, h.os_informada, h.tpe_codigo_original, h.import_lote_id,
       h.criado_por, h.criado_em, h.atualizado_por, h.atualizado_em,
       h.inicio_jornada_informado
from horas h
left join lateral (select public.custo_vigente(h.recurso_id, h.dia) as valor) cv on true;
grant select on public.v_apontamentos to authenticated;
revoke all on public.v_apontamentos from anon;

-- ---------------------------------------------------------------- 3) equipe (sem custos) para o projetista
create or replace function public.cronograma_equipe()
returns table (id bigint, codigo text, numero integer, revisao integer, os integer, cliente text, principal text, grupo text, descricao text,
               status public.status_tpe, data_inicio date, prazo date, data_fim date, arquivada boolean, predecessora_id bigint,
               responsavel_id bigint, responsavel text, sequencia integer,
               primeiro_apontamento date, ultimo_apontamento date, qtd_apontamentos bigint, horas_totais numeric)
language sql stable security definer set search_path = public as $$
  select t.id, t.codigo, t.numero, t.revisao, t.os, o.nome, t.principal, t.grupo, t.descricao,
         t.status, t.data_inicio, t.prazo, t.data_fim, t.arquivada, t.predecessora_id,
         at.recurso_id, r.nome, at.sequencia,
         min(a.dia), max(a.dia), count(a.id), coalesce(sum(v.horas_totais), 0)
  from public.tpes t
  left join public.ordens_servico o on o.os = t.os
  left join public.atribuicoes at on at.tpe_id = t.id and at.ativa
  left join public.recursos r on r.id = at.recurso_id
  left join public.apontamentos a on a.tpe_id = t.id and a.excluido_em is null
  left join public.v_apontamentos v on v.id = a.id
  where public.usuario_ativo() and not t.arquivada
  group by t.id, o.nome, at.recurso_id, r.nome, at.sequencia
$$;

create or replace function public.calendario_equipe(p_ini date, p_fim date)
returns table (id bigint, dia date, hora_inicio time, hora_fim time, recurso_id bigint, recurso_nome text,
               tpe_id bigint, tpe_codigo text, grupo text, tipo_dia text, horas_totais numeric, horas_extras numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.usuario_ativo() then return; end if;
  if p_fim < p_ini or p_fim - p_ini > 62 then raise exception 'Período inválido (máximo de 62 dias).'; end if;
  return query
    select v.id, v.dia, v.hora_inicio, v.hora_fim, v.recurso_id, v.recurso_nome, v.tpe_id, v.tpe_codigo, v.grupo,
           v.tipo_dia, v.horas_totais, v.horas_extras
    from public.v_apontamentos v
    where v.dia between p_ini and p_fim
    order by v.dia, v.hora_inicio;
end $$;

-- ---------------------------------------------------------------- permissões
revoke all on function public.adicional_dia(date), public.cronograma_equipe(), public.calendario_equipe(date, date), public.excluir_tpe(bigint) from public, anon;
grant execute on function public.adicional_dia(date), public.cronograma_equipe(), public.calendario_equipe(date, date), public.excluir_tpe(bigint) to authenticated;
