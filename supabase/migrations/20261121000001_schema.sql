-- =============================================================================
-- Engefril · Sistema de gestão de TPEs — esquema principal
-- Supabase (PostgreSQL 15+). Aplicar com: supabase db push  (ou SQL Editor)
-- Regras de cálculo reproduzidas da planilha TAREF_PROJ_ENGEFRIL_VER_035.xlsx
-- (abas CRM_ANALITICO e KPI). Ver docs/VALIDACAO.md.
-- =============================================================================

-- gen_random_uuid() é nativo no PostgreSQL 13+

-- ---------------------------------------------------------------- tipos
do $$ begin
  create type public.papel_t as enum ('projetista', 'master');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.status_tpe as enum ('NÃO INICIADA', 'EM ANDAMENTO', 'PAUSADA', 'FINALIZADA');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.status_os as enum ('EM ANDAMENTO', 'FINALIZADA');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- cadastros
create table if not exists public.recursos (
  id            bigint generated always as identity primary key,
  nome          text not null unique check (length(trim(nome)) between 2 and 60),
  inicio_padrao time not null default '07:00',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);
comment on table public.recursos is 'Projetistas (coluna RECURSO da planilha). Vínculo com login em profiles.recurso_id.';

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nome       text not null default '',
  email      text,
  papel      public.papel_t not null default 'projetista',
  recurso_id bigint unique references public.recursos (id),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- custo H/H é informação restrita ao Master (RLS)
create table if not exists public.custos_hh (
  id            bigint generated always as identity primary key,
  recurso_id    bigint not null references public.recursos (id) on delete cascade,
  valor         numeric(10,2) not null check (valor > 0),
  vigente_desde date not null default date '2000-01-01',
  criado_em     timestamptz not null default now(),
  unique (recurso_id, vigente_desde)
);
comment on table public.custos_hh is 'Custo H/H versionado. Na VER_035 havia um único valor por recurso aplicado a todo o histórico (vigente_desde = 2000-01-01 reproduz isso).';

create table if not exists public.parametros (
  id                    bigint generated always as identity primary key,
  vigente_desde         date not null unique default date '2000-01-01',
  inicio_antecipado     time not null default '07:00',
  jornada_seg_qui       interval not null default '10 hours',
  jornada_sex           interval not null default '9 hours',
  almoco_inicio         time not null default '12:00',
  almoco_fim            time not null default '13:00',
  adic_dia_util         numeric(6,4) not null default 0.60,
  adic_sabado           numeric(6,4) not null default 0.75,
  adic_dom_feriado      numeric(6,4) not null default 1.00,
  descontar_feriados_capacidade boolean not null default false,
  os_interna_limite     integer not null default 1000,
  criado_em             timestamptz not null default now(),
  check (almoco_fim > almoco_inicio)
);
comment on table public.parametros is 'Parâmetros de jornada e hora extra (aba '' REF'' da VER_035), versionados por vigência.';

create table if not exists public.feriados (
  data      date primary key,
  descricao text not null
);

create table if not exists public.listas (
  tipo  text not null check (tipo in ('vendedor','nivel','classificacao','uf','projeto_engefril')),
  valor text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  primary key (tipo, valor)
);

create table if not exists public.catalogo_grupos (
  id        bigint generated always as identity primary key,
  principal text not null,
  grupo     text not null,
  ativo     boolean not null default true,
  ordem     integer not null default 0,
  unique (principal, grupo)
);

create table if not exists public.import_lotes (
  id            bigint generated always as identity primary key,
  arquivo       text not null,
  sha256        text not null,
  modelo        text not null,
  mapa          jsonb not null default '{}'::jsonb,
  resumo        jsonb not null default '{}'::jsonb,
  status        text not null default 'confirmado' check (status in ('confirmado','revertido')),
  importado_por uuid references auth.users (id),
  importado_em  timestamptz not null default now(),
  revertido_por uuid references auth.users (id),
  revertido_em  timestamptz
);

create table if not exists public.import_itens (
  id         bigint generated always as identity primary key,
  lote_id    bigint not null references public.import_lotes (id) on delete cascade,
  entidade   text not null,
  chave      text not null,
  aba        text,
  linha      integer,
  operacao   text not null check (operacao in ('inserido','atualizado','duplicado','rejeitado','sem_alteracao')),
  motivo     text,
  antes      jsonb,
  depois     jsonb
);
create index if not exists import_itens_lote_idx on public.import_itens (lote_id);

create table if not exists public.import_mapas (
  id        bigint generated always as identity primary key,
  nome      text not null unique,
  modelo    text not null,
  mapa      jsonb not null,
  criado_por uuid references auth.users (id),
  criado_em timestamptz not null default now()
);

create table if not exists public.ordens_servico (
  os               integer primary key check (os >= 0),
  nome             text not null default '',
  uf               text,
  cidade           text,
  projeto_engefril text,
  nivel            text,
  vendedor         text,
  classificacao    text,
  data_inicio      date,
  prazo_final      date,
  status           public.status_os not null default 'EM ANDAMENTO',
  arquivada        boolean not null default false,
  import_lote_id   bigint references public.import_lotes (id),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  check (prazo_final is null or data_inicio is null or prazo_final >= data_inicio)
);

create table if not exists public.tpes (
  id             bigint generated always as identity primary key,
  codigo         text not null unique check (codigo ~ '^TPE-[0-9]{3,}\.[0-9]+$'),
  numero         integer generated always as ((substring(codigo from 'TPE-([0-9]+)\.'))::integer) stored,
  revisao        integer generated always as ((substring(codigo from '\.([0-9]+)$'))::integer) stored,
  os             integer not null references public.ordens_servico (os),
  principal      text not null,
  grupo          text not null,
  grupo_original text,
  descricao      text not null default '' check (length(descricao) <= 500),
  status         public.status_tpe not null default 'NÃO INICIADA',
  data_inicio    date,
  data_fim       date,
  prazo          date,
  instrucoes     text check (instrucoes is null or length(instrucoes) <= 1000),
  arquivada      boolean not null default false,
  import_lote_id bigint references public.import_lotes (id),
  criado_por     uuid references auth.users (id),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (data_fim is null or data_inicio is null or data_fim >= data_inicio),
  check (status <> 'FINALIZADA' or data_fim is not null)
);
create index if not exists tpes_os_idx on public.tpes (os);
comment on column public.tpes.status is 'Status independente dos apontamentos: só o Master altera (regra crítica do documento de requisitos).';

create table if not exists public.atribuicoes (
  id            bigint generated always as identity primary key,
  tpe_id        bigint not null references public.tpes (id) on delete cascade,
  recurso_id    bigint not null references public.recursos (id),
  sequencia     integer not null default 100,
  ativa         boolean not null default true,
  inicio        timestamptz not null default now(),
  fim           timestamptz,
  atribuido_por uuid references auth.users (id),
  observacao    text
);
create unique index if not exists atribuicoes_uma_ativa on public.atribuicoes (tpe_id) where ativa;
create index if not exists atribuicoes_recurso_idx on public.atribuicoes (recurso_id) where ativa;

create table if not exists public.apontamentos (
  id                  bigint generated always as identity primary key,
  seq                 bigint not null unique,
  tpe_id              bigint not null references public.tpes (id),
  recurso_id          bigint not null references public.recursos (id),
  dia                 date not null,
  hora_inicio         time not null,
  hora_fim            time not null,
  descricao           text not null check (length(trim(descricao)) between 3 and 500),
  tpe_codigo_original text,
  os_informada        integer,
  origem              text not null default 'app' check (origem in ('app','importacao')),
  import_lote_id      bigint references public.import_lotes (id),
  client_request_id   uuid unique,
  excluido_em         timestamptz,
  excluido_por        uuid references auth.users (id),
  motivo_exclusao     text,
  criado_por          uuid references auth.users (id),
  criado_em           timestamptz not null default now(),
  atualizado_por      uuid references auth.users (id),
  atualizado_em       timestamptz not null default now(),
  check (hora_fim > hora_inicio),
  check (dia between date '2000-01-01' and date '2100-12-31')
);
create sequence if not exists public.apontamentos_seq_seq;
create unique index if not exists apontamentos_chave_natural
  on public.apontamentos (tpe_id, recurso_id, dia, hora_inicio, hora_fim) where excluido_em is null;
create index if not exists apontamentos_recurso_dia_idx on public.apontamentos (recurso_id, dia);
create index if not exists apontamentos_tpe_idx on public.apontamentos (tpe_id);

create table if not exists public.visualizacoes (
  id           bigint generated always as identity primary key,
  dono         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conjunto     text not null check (conjunto in ('apontamentos','tpes','os')),
  nome         text not null check (length(nome) between 1 and 80),
  config       jsonb not null,
  compartilhada boolean not null default false,
  criado_em    timestamptz not null default now(),
  unique (dono, conjunto, nome)
);

create table if not exists public.auditoria (
  id        bigint generated always as identity primary key,
  tabela    text not null,
  registro  text,
  acao      text not null,
  antes     jsonb,
  depois    jsonb,
  usuario   uuid,
  quando    timestamptz not null default now()
);
create index if not exists auditoria_tabela_idx on public.auditoria (tabela, quando desc);

create table if not exists public.reconciliacao (
  id           bigint generated always as identity primary key,
  execucao     uuid not null,
  indicador    text not null,
  referencia   text,
  formula      text,
  valor_excel  text,
  valor_web    text,
  diferenca    numeric,
  tolerancia   numeric,
  status       text not null check (status in ('validado','diferenca_explicada','divergente','pendente')),
  explicacao   text,
  arquivo      text,
  executado_por uuid references auth.users (id),
  executado_em timestamptz not null default now(),
  aprovado_por uuid references auth.users (id),
  aprovado_em  timestamptz
);

create table if not exists public.backups_registro (
  id               bigint generated always as identity primary key,
  tipo             text not null default 'pg_dump',
  arquivo          text not null,
  sha256           text,
  contagens        jsonb not null default '{}'::jsonb,
  criado_em        timestamptz not null default now(),
  restauracao_ok   boolean,
  restauracao_em   timestamptz,
  evidencia        text,
  responsavel      text
);

-- ---------------------------------------------------------------- funções de identidade
create or replace function public.meu_papel() returns public.papel_t
language sql stable security definer set search_path = public as $$
  select papel from public.profiles where user_id = auth.uid() and ativo
$$;

create or replace function public.is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'master' from public.profiles where user_id = auth.uid() and ativo), false)
$$;

create or replace function public.meu_recurso() returns bigint
language sql stable security definer set search_path = public as $$
  select recurso_id from public.profiles where user_id = auth.uid() and ativo
$$;

create or replace function public.usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ativo from public.profiles where user_id = auth.uid()), false)
$$;

-- TPEs que o projetista pode ver: atribuídas a ele (ativas ou passadas) ou com apontamento dele
create or replace function public.tpe_visivel(p_tpe bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_master()
      or exists (select 1 from public.atribuicoes a where a.tpe_id = p_tpe and a.recurso_id = public.meu_recurso())
      or exists (select 1 from public.apontamentos x where x.tpe_id = p_tpe and x.recurso_id = public.meu_recurso())
$$;

create or replace function public.tpe_atribuida_a_mim(p_tpe bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.atribuicoes a
                 where a.tpe_id = p_tpe and a.ativa and a.recurso_id = public.meu_recurso())
$$;

-- ---------------------------------------------------------------- motor de cálculo (equivalente à CRM_ANALITICO)
create or replace function public.parametros_vigentes(p_dia date) returns public.parametros
language sql stable security definer set search_path = public as $$
  select p.* from public.parametros p
  where p.vigente_desde <= coalesce(p_dia, current_date)
  order by p.vigente_desde desc limit 1
$$;

create or replace function public.custo_vigente(p_recurso bigint, p_dia date) returns numeric
language sql stable security invoker set search_path = public as $$
  select c.valor from public.custos_hh c
  where c.recurso_id = p_recurso and c.vigente_desde <= p_dia
  order by c.vigente_desde desc limit 1
$$;

-- Tipo de dia: FERIADO > DOMINGO > SÁBADO > DIA ÚTIL (coluna X)
create or replace function public.tipo_dia(p_dia date) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.feriados f where f.data = p_dia) then 'FERIADO'
    when extract(isodow from p_dia) = 7 then 'DOMINGO'
    when extract(isodow from p_dia) = 6 then 'SÁBADO'
    else 'DIA ÚTIL' end
$$;

-- Arredondamento ao minuto, como ROUND(x*1440,0)/1440 do Excel (metade para longe de zero)
create or replace function public.min_round(p interval) returns interval
language sql immutable as $$
  select make_interval(mins => round(extract(epoch from p) / 60.0)::int)
$$;

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
    -- coluna Z: começa no horário antecipado se houver lançamento do recurso no dia iniciando até ele
    case when exists (select 1 from public.apontamentos o
                      where o.recurso_id = b.recurso_id and o.dia = b.dia and o.excluido_em is null
                        and o.hora_inicio <= b.inicio_antecipado)
         then b.inicio_antecipado else b.inicio_padrao end as inicio_jornada
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
       h.criado_por, h.criado_em, h.atualizado_por, h.atualizado_em
from horas h
left join lateral (select public.custo_vigente(h.recurso_id, h.dia) as valor) cv on true;

comment on view public.v_apontamentos is 'Apontamentos com horas normais/extras e custos calculados pela regra da VER_035. Custos aparecem nulos para quem não pode ver custos_hh (projetistas).';

-- TPEs com totais (para o Master e para as telas de tarefas)
create or replace view public.v_tpes
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

-- Tarefas do projetista logado com dados mínimos do cliente (não expõe vendedor/nível/custos)
create or replace function public.minhas_tarefas()
returns table (tpe_id bigint, codigo text, os integer, cliente text, cidade text, uf text, principal text, grupo text,
               descricao text, instrucoes text, status public.status_tpe, sequencia integer, prazo date,
               data_inicio date, horas_apontadas numeric, ultimo_apontamento date)
language sql stable security definer set search_path = public as $$
  select t.id, t.codigo, t.os, o.nome, o.cidade, o.uf, t.principal, t.grupo, t.descricao, t.instrucoes, t.status,
         a.sequencia, t.prazo, t.data_inicio,
         coalesce((select sum(v.horas_totais) from public.v_apontamentos v
                   where v.tpe_id = t.id and v.recurso_id = public.meu_recurso()), 0),
         (select max(x.dia) from public.apontamentos x where x.tpe_id = t.id and x.recurso_id = public.meu_recurso() and x.excluido_em is null)
  from public.atribuicoes a
  join public.tpes t on t.id = a.tpe_id
  left join public.ordens_servico o on o.os = t.os
  where a.ativa and a.recurso_id = public.meu_recurso() and public.usuario_ativo() and not t.arquivada
  order by (t.status = 'FINALIZADA'), a.sequencia, t.prazo nulls last, t.codigo
$$;

-- ---------------------------------------------------------------- gatilhos
create or replace function public.trg_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id', to_jsonb(new) ->> 'os', to_jsonb(old) ->> 'os',
                   to_jsonb(new) ->> 'user_id', to_jsonb(old) ->> 'user_id', to_jsonb(new) ->> 'data', to_jsonb(old) ->> 'data');
  insert into public.auditoria (tabela, registro, acao, antes, depois, usuario)
  values (tg_table_name, v_id, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['recursos','profiles','custos_hh','parametros','feriados','listas','catalogo_grupos',
                           'ordens_servico','tpes','atribuicoes','apontamentos','import_lotes','reconciliacao'] loop
    execute format('drop trigger if exists auditoria on public.%I', t);
    execute format('create trigger auditoria after insert or update or delete on public.%I for each row execute function public.trg_auditoria()', t);
  end loop;
end $$;

create or replace function public.trg_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','ordens_servico','tpes'] loop
    execute format('drop trigger if exists atualizado_em on public.%I', t);
    execute format('create trigger atualizado_em before update on public.%I for each row execute function public.trg_atualizado_em()', t);
  end loop;
end $$;

-- Apontamento: autoria forçada pelo servidor (impede falsificar o recurso)
create or replace function public.trg_apontamento_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.seq is null then new.seq := nextval('public.apontamentos_seq_seq'); end if;
    if auth.uid() is not null and not public.is_master() then
      new.recurso_id := public.meu_recurso();
      new.origem := 'app';
      new.import_lote_id := null;
      if new.recurso_id is null then raise exception 'Usuário sem projetista vinculado.' using errcode = '42501'; end if;
    end if;
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    new.criado_em := now();
  else
    if auth.uid() is not null and not public.is_master() then
      if new.recurso_id <> old.recurso_id or new.seq <> old.seq or new.origem <> old.origem
         or new.excluido_em is distinct from old.excluido_em or new.criado_por is distinct from old.criado_por then
        raise exception 'Alteração não permitida para projetista.' using errcode = '42501';
      end if;
    end if;
    new.atualizado_por := auth.uid();
    new.atualizado_em := now();
  end if;
  new.descricao := trim(new.descricao);
  return new;
end $$;
drop trigger if exists antes on public.apontamentos;
create trigger antes before insert or update on public.apontamentos
for each row execute function public.trg_apontamento_antes();

-- Perfil: somente o Master altera papel, recurso e situação
create or replace function public.trg_profiles_protege() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_master() then
    if new.papel <> old.papel or new.recurso_id is distinct from old.recurso_id or new.ativo <> old.ativo
       or new.email is distinct from old.email then
      raise exception 'Somente o Master altera papel, vínculo ou situação.' using errcode = '42501';
    end if;
  end if;
  -- impede que o último Master ativo seja rebaixado ou desativado
  if old.papel = 'master' and old.ativo and (new.papel <> 'master' or not new.ativo)
     and (select count(*) from public.profiles where papel = 'master' and ativo and user_id <> old.user_id) = 0 then
    raise exception 'Não é possível remover o último Master ativo.';
  end if;
  return new;
end $$;
drop trigger if exists protege on public.profiles;
create trigger protege before update on public.profiles for each row execute function public.trg_profiles_protege();

-- Novo usuário do Auth gera perfil de PROJETISTA (papel nunca vem de metadados do cliente)
create or replace function public.trg_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, nome, email, papel, ativo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)), new.email, 'projetista', true)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.trg_novo_usuario();

-- Atribuição: ao atribuir de novo, encerra a anterior (histórico preservado)
create or replace function public.atribuir_tpe(p_tpe bigint, p_recurso bigint, p_sequencia integer default null, p_obs text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_seq integer;
begin
  if not public.is_master() then raise exception 'Somente o Master atribui tarefas.' using errcode = '42501'; end if;
  update public.atribuicoes set ativa = false, fim = now() where tpe_id = p_tpe and ativa;
  if p_recurso is null then return null; end if;
  v_seq := coalesce(p_sequencia, (select coalesce(max(sequencia), 0) + 10 from public.atribuicoes where recurso_id = p_recurso and ativa));
  insert into public.atribuicoes (tpe_id, recurso_id, sequencia, atribuido_por, observacao)
  values (p_tpe, p_recurso, v_seq, auth.uid(), p_obs) returning id into v_id;
  return v_id;
end $$;

-- Reordena a sequência de um projetista (lista de tpe_id na ordem desejada)
create or replace function public.reordenar_sequencia(p_recurso bigint, p_tpes bigint[])
returns void language plpgsql security definer set search_path = public as $$
declare i integer;
begin
  if not public.is_master() then raise exception 'Somente o Master reordena.' using errcode = '42501'; end if;
  for i in 1 .. coalesce(array_length(p_tpes, 1), 0) loop
    update public.atribuicoes set sequencia = i * 10 where tpe_id = p_tpes[i] and recurso_id = p_recurso and ativa;
  end loop;
end $$;

-- Exclusão de apontamento: lógica, com motivo obrigatório (somente Master)
create or replace function public.excluir_apontamento(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master() then raise exception 'Somente o Master exclui apontamentos.' using errcode = '42501'; end if;
  if p_motivo is null or length(trim(p_motivo)) < 5 then raise exception 'Informe o motivo da exclusão (mín. 5 caracteres).'; end if;
  update public.apontamentos set excluido_em = now(), excluido_por = auth.uid(), motivo_exclusao = trim(p_motivo)
  where id = p_id and excluido_em is null;
  if not found then raise exception 'Apontamento não encontrado ou já excluído.'; end if;
end $$;

-- Somente o banco (SQL Editor / service_role) cria o primeiro Master
create or replace function public.promover_master(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from auth.users where lower(email) = lower(p_email);
  if v is null then raise exception 'Usuário % não encontrado em auth.users.', p_email; end if;
  insert into public.profiles (user_id, email, nome, papel, ativo) values (v, p_email, split_part(p_email,'@',1), 'master', true)
  on conflict (user_id) do update set papel = 'master', ativo = true;
  return 'Master: ' || p_email;
end $$;
revoke all on function public.promover_master(text) from public, anon, authenticated;
