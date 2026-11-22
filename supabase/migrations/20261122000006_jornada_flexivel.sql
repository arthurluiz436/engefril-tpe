-- =============================================================================
-- Jornada flexível por projetista.
-- Alguns projetistas podem começar às 07:00 (07–17) ou às 08:00 (08–18) conforme o dia.
-- Com o vínculo ativo, o projetista informa no apontamento em que horário começou a
-- jornada daquele dia, e a hora extra passa a ser calculada a partir dele.
-- Sem informação (todos os lançamentos antigos), vale a regra da VER_035 de sempre:
-- início antecipado se houver lançamento até ele; senão, o início padrão do projetista.
-- Aplicar depois das migrações 0001–0005 (SQL Editor do Supabase). Idempotente.
-- =============================================================================

alter table public.recursos add column if not exists jornada_flexivel boolean not null default false;
alter table public.recursos add column if not exists inicios_flexiveis time[] not null default array['07:00', '08:00']::time[];
comment on column public.recursos.jornada_flexivel is 'Se verdadeiro, o projetista informa a cada dia em que horário começou a jornada (opções em inicios_flexiveis).';
comment on column public.recursos.inicios_flexiveis is 'Horários de início permitidos para a jornada flexível (ex.: {07:00,08:00}).';

alter table public.apontamentos add column if not exists inicio_jornada_informado time;
alter table public.apontamentos drop constraint if exists apontamentos_inicio_jornada_chk;
alter table public.apontamentos add constraint apontamentos_inicio_jornada_chk
  check (inicio_jornada_informado is null or inicio_jornada_informado between time '05:00' and time '12:00');
comment on column public.apontamentos.inicio_jornada_informado is 'Início da jornada do dia informado pelo projetista com jornada flexível. Prevalece sobre a regra automática para todos os lançamentos do mesmo projetista no mesmo dia.';

-- Mesma view de antes; muda só a coluna Z (início da jornada) e acrescenta a coluna informada no fim.
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
      -- jornada flexível: horário informado pelo projetista para o dia (vale para todos os lançamentos do dia)
      (select min(o.inicio_jornada_informado) from public.apontamentos o
        where o.recurso_id = b.recurso_id and o.dia = b.dia and o.excluido_em is null),
      -- coluna Z: começa no horário antecipado se houver lançamento do recurso no dia iniciando até ele
      case when exists (select 1 from public.apontamentos o
                        where o.recurso_id = b.recurso_id and o.dia = b.dia and o.excluido_em is null
                          and o.hora_inicio <= b.inicio_antecipado)
           then b.inicio_antecipado else b.inicio_padrao end
    ) as inicio_jornada
  from base b
), calc as (
  select j.*,
    (j.inicio_jornada + case when extract(isodow from j.dia) <= 4 then j.jornada_seg_qui else j.jornada_sex end)::time as fim_jornada,
    case when j.tipo_dia in ('FERIADO','DOMINGO') then j.adic_dom_feriado
         when j.tipo_dia = 'SÁBADO' then j.adic_sabado else j.adic_dia_util end as adicional
  from jornada j
), horas as (
  select c.*,
    -- coluna T: hora normal (somente dia útil, dentro da jornada, descontando o almoço quando cruzado)
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

comment on view public.v_apontamentos is 'Apontamentos com horas normais/extras e custos calculados pela regra da VER_035 (com jornada flexível informada, quando houver). Custos aparecem nulos para quem não pode ver custos_hh (projetistas).';
grant select on public.v_apontamentos to authenticated;
revoke all on public.v_apontamentos from anon;
