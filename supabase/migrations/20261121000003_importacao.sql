-- =============================================================================
-- Importação controlada de planilhas legadas: prévia, confirmação e reversão
-- O navegador do Master só LÊ o arquivo e envia linhas normalizadas (JSON).
-- Toda validação, deduplicação e gravação acontece aqui, no servidor, e só
-- para quem é Master. A prévia executa exatamente a mesma lógica e desfaz tudo.
-- =============================================================================

create or replace function public.normaliza_tpe(p text) returns text
language plpgsql immutable as $$
declare v text; n text; r text;
begin
  v := upper(regexp_replace(coalesce(p, ''), '\s', '', 'g'));
  if v !~ '^TPE-?[0-9]+(\.[0-9]+)?$' then return null; end if;
  v := replace(v, 'TPE', ''); v := ltrim(v, '-');
  n := split_part(v, '.', 1); r := coalesce(nullif(split_part(v, '.', 2), ''), '0');
  return 'TPE-' || lpad(ltrim(n, '0'), 3, '0') || '.' || (r::int)::text;
end $$;

create or replace function public.processar_importacao(p jsonb, p_confirmar boolean default false, p_atualizar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lote bigint;
  v_cont jsonb := jsonb_build_object('recursos','{}'::jsonb,'feriados','{}'::jsonb,'os','{}'::jsonb,'tpes','{}'::jsonb,'apontamentos','{}'::jsonb);
  v_itens jsonb := '[]'::jsonb;
  v_n integer := 0;
  e jsonb; i bigint;
  v_ja boolean;
  v_rec record; v_old jsonb; v_new jsonb;
  v_os integer; v_cod text; v_tpe record; v_rid bigint; v_seq bigint;
  v_princ text; v_grupo text; v_gorig text; v_status public.status_tpe; v_motivo text;
  v_dia date; v_ini time; v_fim time; v_custo numeric;
  v_aba text; v_linha integer;

begin
  if not public.is_master() then
    raise exception 'Somente o Master pode importar planilhas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Conteúdo inválido.'; end if;
  if coalesce(jsonb_array_length(p -> 'apontamentos'), 0) > 50000 or coalesce(jsonb_array_length(p -> 'tpes'), 0) > 20000
     or coalesce(jsonb_array_length(p -> 'os'), 0) > 10000 then
    raise exception 'Arquivo grande demais para um único lote.';
  end if;
  if coalesce(p ->> 'sha256', '') !~ '^[0-9a-f]{64}$' then raise exception 'Hash do arquivo ausente ou inválido.'; end if;

  v_ja := exists (select 1 from public.import_lotes where sha256 = p ->> 'sha256' and status = 'confirmado');

  begin
    insert into public.import_lotes (arquivo, sha256, modelo, mapa, importado_por)
    values (left(coalesce(p ->> 'arquivo', 'sem nome'), 200), p ->> 'sha256', left(coalesce(p ->> 'modelo', 'genérico'), 60),
            coalesce(p -> 'mapa', '{}'::jsonb), auth.uid())
    returning id into v_lote;

    ------------------------------------------------------------------ recursos e custos
    for e in select * from jsonb_array_elements(coalesce(p -> 'recursos', '[]'::jsonb)) loop
      v_motivo := null;
      begin
        select * into v_rec from public.recursos where lower(nome) = lower(trim(e ->> 'nome'));
        if not found then
          insert into public.recursos (nome, inicio_padrao) values (trim(e ->> 'nome'), coalesce((e ->> 'inicio_padrao')::time, '07:00'))
          returning * into v_rec;
          perform 1; v_new := to_jsonb(v_rec);
          insert into public.import_itens (lote_id, entidade, chave, aba, linha, operacao, depois) values (v_lote, 'recursos', v_rec.nome, e ->> 'aba', (e ->> 'linha')::int, 'inserido', v_new);
          v_cont := jsonb_set(v_cont, '{recursos,inserido}', to_jsonb(coalesce((v_cont #>> '{recursos,inserido}')::int, 0) + 1));
        else
          v_cont := jsonb_set(v_cont, '{recursos,sem_alteracao}', to_jsonb(coalesce((v_cont #>> '{recursos,sem_alteracao}')::int, 0) + 1));
        end if;
        v_custo := nullif(e ->> 'custo', '')::numeric;
        if v_custo is not null then
          if not exists (select 1 from public.custos_hh where recurso_id = v_rec.id) then
            insert into public.custos_hh (recurso_id, valor, vigente_desde) values (v_rec.id, v_custo, date '2000-01-01');
          elsif (select valor from public.custos_hh where recurso_id = v_rec.id order by vigente_desde desc limit 1) <> v_custo then
            v_itens := v_itens || jsonb_build_object('entidade','recursos','chave',v_rec.nome,'operacao','sem_alteracao',
                         'motivo','Custo H/H da planilha difere do cadastrado; não alterado (ajuste em Parâmetros com nova vigência).');
          end if;
        end if;
      exception when others then
        v_cont := jsonb_set(v_cont, '{recursos,rejeitado}', to_jsonb(coalesce((v_cont #>> '{recursos,rejeitado}')::int, 0) + 1));
        v_itens := v_itens || jsonb_build_object('entidade','recursos','chave',e ->> 'nome','aba',e ->> 'aba','linha',e ->> 'linha','operacao','rejeitado','motivo',sqlerrm);
      end;
    end loop;

    ------------------------------------------------------------------ feriados
    for e in select * from jsonb_array_elements(coalesce(p -> 'feriados', '[]'::jsonb)) loop
      begin
        if exists (select 1 from public.feriados where data = (e ->> 'data')::date) then
          v_cont := jsonb_set(v_cont, '{feriados,sem_alteracao}', to_jsonb(coalesce((v_cont #>> '{feriados,sem_alteracao}')::int, 0) + 1));
        else
          insert into public.feriados (data, descricao) values ((e ->> 'data')::date, coalesce(nullif(trim(e ->> 'descricao'), ''), 'Feriado'));
          v_cont := jsonb_set(v_cont, '{feriados,inserido}', to_jsonb(coalesce((v_cont #>> '{feriados,inserido}')::int, 0) + 1));
        end if;
      exception when others then
        v_cont := jsonb_set(v_cont, '{feriados,rejeitado}', to_jsonb(coalesce((v_cont #>> '{feriados,rejeitado}')::int, 0) + 1));
      end;
    end loop;

    ------------------------------------------------------------------ ordens de serviço
    for e in select * from jsonb_array_elements(coalesce(p -> 'os', '[]'::jsonb)) loop
      v_aba := e ->> 'aba'; v_linha := (e ->> 'linha')::int; v_motivo := null;
      begin
        v_os := (e ->> 'os')::integer;
        if v_os is null or v_os < 0 then raise exception 'Número de O.S. inválido.'; end if;
        v_new := jsonb_build_object(
          'nome', coalesce(trim(e ->> 'nome'), ''), 'uf', nullif(trim(e ->> 'uf'), ''), 'cidade', nullif(trim(e ->> 'cidade'), ''),
          'projeto_engefril', nullif(trim(e ->> 'projeto_engefril'), ''), 'nivel', nullif(trim(e ->> 'nivel'), ''),
          'vendedor', nullif(trim(e ->> 'vendedor'), ''), 'classificacao', nullif(trim(e ->> 'classificacao'), ''),
          'data_inicio', nullif(e ->> 'data_inicio', ''), 'prazo_final', nullif(e ->> 'prazo_final', ''),
          'status', case when upper(coalesce(e ->> 'status', '')) like 'FINALIZ%' then 'FINALIZADA' else 'EM ANDAMENTO' end);
        select to_jsonb(o) into v_old from public.ordens_servico o where o.os = v_os;
        if v_old is null then
          insert into public.ordens_servico (os, nome, uf, cidade, projeto_engefril, nivel, vendedor, classificacao, data_inicio, prazo_final, status, import_lote_id)
          values (v_os, v_new ->> 'nome', v_new ->> 'uf', v_new ->> 'cidade', v_new ->> 'projeto_engefril', v_new ->> 'nivel', v_new ->> 'vendedor',
                  v_new ->> 'classificacao', (v_new ->> 'data_inicio')::date, (v_new ->> 'prazo_final')::date, (v_new ->> 'status')::public.status_os, v_lote);
          insert into public.import_itens (lote_id, entidade, chave, aba, linha, operacao, depois) values (v_lote, 'os', v_os::text, v_aba, v_linha, 'inserido', v_new);
          v_cont := jsonb_set(v_cont, '{os,inserido}', to_jsonb(coalesce((v_cont #>> '{os,inserido}')::int, 0) + 1));
        elsif exists (select 1 from jsonb_each(v_new) n where (v_old -> n.key) is distinct from n.value) then
          if p_atualizar then
            update public.ordens_servico set nome = v_new ->> 'nome', uf = v_new ->> 'uf', cidade = v_new ->> 'cidade',
              projeto_engefril = v_new ->> 'projeto_engefril', nivel = v_new ->> 'nivel', vendedor = v_new ->> 'vendedor',
              classificacao = v_new ->> 'classificacao', data_inicio = (v_new ->> 'data_inicio')::date,
              prazo_final = (v_new ->> 'prazo_final')::date, status = (v_new ->> 'status')::public.status_os
            where os = v_os;
            insert into public.import_itens (lote_id, entidade, chave, aba, linha, operacao, antes, depois) values (v_lote, 'os', v_os::text, v_aba, v_linha, 'atualizado', v_old, v_new);
            v_cont := jsonb_set(v_cont, '{os,atualizado}', to_jsonb(coalesce((v_cont #>> '{os,atualizado}')::int, 0) + 1));
            v_itens := v_itens || jsonb_build_object('entidade','os','chave',v_os,'aba',v_aba,'linha',v_linha,'operacao','atualizado','antes',v_old,'depois',v_new);
          else
            v_cont := jsonb_set(v_cont, '{os,sem_alteracao}', to_jsonb(coalesce((v_cont #>> '{os,sem_alteracao}')::int, 0) + 1));
            v_itens := v_itens || jsonb_build_object('entidade','os','chave',v_os,'aba',v_aba,'linha',v_linha,'operacao','diferente',
                         'motivo','Difere do cadastro atual; marque "atualizar existentes" para aplicar.','antes',v_old,'depois',v_new);
          end if;
        else
          v_cont := jsonb_set(v_cont, '{os,sem_alteracao}', to_jsonb(coalesce((v_cont #>> '{os,sem_alteracao}')::int, 0) + 1));
        end if;
      exception when others then
        v_cont := jsonb_set(v_cont, '{os,rejeitado}', to_jsonb(coalesce((v_cont #>> '{os,rejeitado}')::int, 0) + 1));
        v_itens := v_itens || jsonb_build_object('entidade','os','chave',e ->> 'os','aba',v_aba,'linha',v_linha,'operacao','rejeitado','motivo',sqlerrm);
      end;
    end loop;

    ------------------------------------------------------------------ TPEs
    for e in select * from jsonb_array_elements(coalesce(p -> 'tpes', '[]'::jsonb)) loop
      v_aba := e ->> 'aba'; v_linha := (e ->> 'linha')::int; v_motivo := null;
      begin
        v_cod := public.normaliza_tpe(e ->> 'codigo');
        if v_cod is null then raise exception 'Código de TPE inválido: %', e ->> 'codigo'; end if;
        v_os := (e ->> 'os')::integer;
        if not exists (select 1 from public.ordens_servico where os = v_os) then raise exception 'O.S. % não cadastrada.', v_os; end if;
        v_princ := upper(trim(coalesce(e ->> 'principal', '')));
        v_gorig := trim(coalesce(e ->> 'grupo', ''));
        if v_princ = '' or v_gorig = '' then raise exception 'Principal e grupo são obrigatórios.'; end if;
        select grupo_padronizado into v_grupo from public.grupos_depara where principal = v_princ and grupo_original = v_gorig;
        v_grupo := coalesce(v_grupo, v_gorig);
        if not exists (select 1 from public.catalogo_grupos where principal = v_princ and grupo = v_grupo) then
          v_motivo := 'Grupo fora do catálogo (mantido como na planilha; validar).';
        end if;
        v_status := case
          when upper(coalesce(e ->> 'finalizada', '')) = 'SIM' or upper(coalesce(e ->> 'status', '')) = 'FINALIZADA' then 'FINALIZADA'
          when upper(coalesce(e ->> 'status', '')) in ('EM ANDAMENTO','PAUSADA','NÃO INICIADA') then (upper(e ->> 'status'))::public.status_tpe
          when coalesce((e ->> 'tem_apontamentos')::boolean, false) then 'EM ANDAMENTO'
          else 'NÃO INICIADA' end;
        if v_status = 'EM ANDAMENTO' and coalesce(e ->> 'status', '') = '' then
          v_motivo := concat_ws(' ', v_motivo, 'Status inferido (há apontamentos na planilha); validar.');
        end if;
        v_new := jsonb_build_object('codigo', v_cod, 'os', v_os, 'principal', v_princ, 'grupo', v_grupo, 'grupo_original', v_gorig,
          'descricao', left(coalesce(e ->> 'descricao', ''), 500), 'status', v_status,
          'data_inicio', nullif(e ->> 'data_inicio', ''), 'data_fim', nullif(e ->> 'data_fim', ''));
        select to_jsonb(t) into v_old from public.tpes t where t.codigo = v_cod;
        if v_old is null then
          insert into public.tpes (codigo, os, principal, grupo, grupo_original, descricao, status, data_inicio, data_fim, import_lote_id, criado_por)
          values (v_cod, v_os, v_princ, v_grupo, v_gorig, v_new ->> 'descricao', v_status, (v_new ->> 'data_inicio')::date, (v_new ->> 'data_fim')::date, v_lote, auth.uid())
          returning id into i;
          if nullif(trim(e ->> 'responsavel'), '') is not null and v_status <> 'FINALIZADA' then
            select id into v_rid from public.recursos where lower(nome) = lower(trim(e ->> 'responsavel'));
            if v_rid is not null then
              insert into public.atribuicoes (tpe_id, recurso_id, sequencia, atribuido_por, observacao)
              values (i, v_rid, coalesce((e ->> 'sequencia')::int, 100), auth.uid(), 'Importado (lote ' || v_lote || ')');
            end if;
          end if;
          insert into public.import_itens (lote_id, entidade, chave, aba, linha, operacao, motivo, depois) values (v_lote, 'tpes', v_cod, v_aba, v_linha, 'inserido', v_motivo, v_new);
          v_cont := jsonb_set(v_cont, '{tpes,inserido}', to_jsonb(coalesce((v_cont #>> '{tpes,inserido}')::int, 0) + 1));
          if v_motivo is not null then
            v_itens := v_itens || jsonb_build_object('entidade','tpes','chave',v_cod,'aba',v_aba,'linha',v_linha,'operacao','inserido','motivo',v_motivo);
          end if;
        elsif exists (select 1 from jsonb_each(v_new) n where (v_old -> n.key) is distinct from n.value) then
          if p_atualizar then
            update public.tpes set os = v_os, principal = v_princ, grupo = v_grupo, grupo_original = v_gorig, descricao = v_new ->> 'descricao',
              status = v_status, data_inicio = (v_new ->> 'data_inicio')::date, data_fim = (v_new ->> 'data_fim')::date
            where codigo = v_cod;
            insert into public.import_itens (lote_id, entidade, chave, aba, linha, operacao, motivo, antes, depois) values (v_lote, 'tpes', v_cod, v_aba, v_linha, 'atualizado', v_motivo, v_old, v_new);
            v_cont := jsonb_set(v_cont, '{tpes,atualizado}', to_jsonb(coalesce((v_cont #>> '{tpes,atualizado}')::int, 0) + 1));
            v_itens := v_itens || jsonb_build_object('entidade','tpes','chave',v_cod,'aba',v_aba,'linha',v_linha,'operacao','atualizado','antes',v_old,'depois',v_new);
          else
            v_cont := jsonb_set(v_cont, '{tpes,sem_alteracao}', to_jsonb(coalesce((v_cont #>> '{tpes,sem_alteracao}')::int, 0) + 1));
            v_itens := v_itens || jsonb_build_object('entidade','tpes','chave',v_cod,'aba',v_aba,'linha',v_linha,'operacao','diferente',
                         'motivo','Difere do cadastro atual; marque "atualizar existentes" para aplicar.','antes',v_old,'depois',v_new);
          end if;
        else
          v_cont := jsonb_set(v_cont, '{tpes,sem_alteracao}', to_jsonb(coalesce((v_cont #>> '{tpes,sem_alteracao}')::int, 0) + 1));
        end if;
      exception when others then
        v_cont := jsonb_set(v_cont, '{tpes,rejeitado}', to_jsonb(coalesce((v_cont #>> '{tpes,rejeitado}')::int, 0) + 1));
        v_itens := v_itens || jsonb_build_object('entidade','tpes','chave',e ->> 'codigo','aba',v_aba,'linha',v_linha,'operacao','rejeitado','motivo',sqlerrm);
      end;
    end loop;

    ------------------------------------------------------------------ apontamentos (nunca substitui os existentes)
    for e in select * from jsonb_array_elements(coalesce(p -> 'apontamentos', '[]'::jsonb)) loop
      v_aba := e ->> 'aba'; v_linha := (e ->> 'linha')::int; v_motivo := null;
      begin
        v_cod := public.normaliza_tpe(e ->> 'tpe');
        select id, os into v_tpe from public.tpes where codigo = v_cod;
        if v_tpe.id is null then raise exception 'TPE % não encontrada.', e ->> 'tpe'; end if;
        select id into v_rid from public.recursos where lower(nome) = lower(trim(e ->> 'recurso'));
        if v_rid is null then raise exception 'Projetista "%" não cadastrado.', e ->> 'recurso'; end if;
        v_dia := (e ->> 'dia')::date; v_ini := (e ->> 'hora_inicio')::time; v_fim := (e ->> 'hora_fim')::time;
        if v_dia is null or v_ini is null or v_fim is null then raise exception 'Dia e horários são obrigatórios.'; end if;
        if v_fim <= v_ini then raise exception 'Hora fim deve ser maior que a hora início.'; end if;
        if exists (select 1 from public.apontamentos a where a.tpe_id = v_tpe.id and a.recurso_id = v_rid and a.dia = v_dia
                   and a.hora_inicio = v_ini and a.hora_fim = v_fim and a.excluido_em is null) then
          v_cont := jsonb_set(v_cont, '{apontamentos,duplicado}', to_jsonb(coalesce((v_cont #>> '{apontamentos,duplicado}')::int, 0) + 1));
          if jsonb_array_length(v_itens) < 2000 then
            v_itens := v_itens || jsonb_build_object('entidade','apontamentos','chave',v_cod || ' ' || v_dia || ' ' || v_ini,'aba',v_aba,'linha',v_linha,'operacao','duplicado','motivo','Já existe apontamento idêntico (TPE, projetista, dia e horários).');
          end if;
          continue;
        end if;
        if nullif(e ->> 'os', '') is not null and (e ->> 'os')::int <> v_tpe.os then
          v_motivo := 'O.S. informada (' || (e ->> 'os') || ') difere da O.S. da TPE (' || v_tpe.os || ').';
        end if;
        v_seq := nullif(e ->> 'seq', '')::bigint;
        if v_seq is null or exists (select 1 from public.apontamentos where seq = v_seq) then v_seq := nextval('public.apontamentos_seq_seq'); end if;
        insert into public.apontamentos (seq, tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao, tpe_codigo_original, os_informada, origem, import_lote_id)
        values (v_seq, v_tpe.id, v_rid, v_dia, v_ini, v_fim, left(coalesce(nullif(trim(e ->> 'descricao'), ''), '(sem descrição na planilha)'), 500),
                e ->> 'tpe', nullif(e ->> 'os', '')::int, 'importacao', v_lote);
        insert into public.import_itens (lote_id, entidade, chave, aba, linha, operacao, motivo) values (v_lote, 'apontamentos', v_seq::text, v_aba, v_linha, 'inserido', v_motivo);
        v_cont := jsonb_set(v_cont, '{apontamentos,inserido}', to_jsonb(coalesce((v_cont #>> '{apontamentos,inserido}')::int, 0) + 1));
        if v_motivo is not null then
          v_itens := v_itens || jsonb_build_object('entidade','apontamentos','chave',v_seq,'aba',v_aba,'linha',v_linha,'operacao','inserido','motivo',v_motivo);
        end if;
      exception when others then
        v_cont := jsonb_set(v_cont, '{apontamentos,rejeitado}', to_jsonb(coalesce((v_cont #>> '{apontamentos,rejeitado}')::int, 0) + 1));
        v_itens := v_itens || jsonb_build_object('entidade','apontamentos','chave',e ->> 'tpe','aba',v_aba,'linha',v_linha,'operacao','rejeitado','motivo',sqlerrm);
      end;
    end loop;
    perform setval('public.apontamentos_seq_seq', greatest(coalesce((select max(seq) from public.apontamentos), 0), 1));

    update public.import_lotes set resumo = v_cont where id = v_lote;
    if not p_confirmar then
      raise exception using errcode = 'P0001', message = '__PREVIA_IMPORTACAO__';
    end if;
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__PREVIA_IMPORTACAO__' then raise; end if;
    v_lote := null;   -- prévia: tudo desfeito
  end;

  return jsonb_build_object('lote_id', v_lote, 'confirmado', p_confirmar and v_lote is not null, 'ja_importado', v_ja,
                            'resumo', v_cont, 'itens', v_itens);
end $$;

-- Reversão segura de um lote confirmado
create or replace function public.reverter_lote(p_lote bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb := '{}'::jsonb; n integer; it record;
begin
  if not public.is_master() then raise exception 'Somente o Master reverte importações.' using errcode = '42501'; end if;
  if not exists (select 1 from public.import_lotes where id = p_lote and status = 'confirmado') then
    raise exception 'Lote inexistente ou já revertido.';
  end if;
  -- bloqueia se dados criados pelo lote já receberam lançamentos fora dele
  if exists (select 1 from public.apontamentos a join public.tpes t on t.id = a.tpe_id
             where t.import_lote_id = p_lote and coalesce(a.import_lote_id, -1) <> p_lote and a.excluido_em is null) then
    raise exception 'Há apontamentos feitos depois da importação em TPEs deste lote. Reverta manualmente ou exclua esses apontamentos antes.';
  end if;
  delete from public.apontamentos where import_lote_id = p_lote; get diagnostics n = row_count; v := v || jsonb_build_object('apontamentos_removidos', n);
  delete from public.atribuicoes where tpe_id in (select id from public.tpes where import_lote_id = p_lote);
  delete from public.tpes where import_lote_id = p_lote; get diagnostics n = row_count; v := v || jsonb_build_object('tpes_removidas', n);
  delete from public.ordens_servico o where o.import_lote_id = p_lote and not exists (select 1 from public.tpes t where t.os = o.os);
  get diagnostics n = row_count; v := v || jsonb_build_object('os_removidas', n);
  for it in select * from public.import_itens where lote_id = p_lote and operacao = 'atualizado' order by id desc loop
    if it.entidade = 'os' then
      update public.ordens_servico o set nome = r.nome, uf = r.uf, cidade = r.cidade, projeto_engefril = r.projeto_engefril, nivel = r.nivel,
        vendedor = r.vendedor, classificacao = r.classificacao, data_inicio = r.data_inicio, prazo_final = r.prazo_final, status = r.status
      from jsonb_populate_record(null::public.ordens_servico, it.antes) r where o.os = r.os;
    elsif it.entidade = 'tpes' then
      update public.tpes t set os = r.os, principal = r.principal, grupo = r.grupo, grupo_original = r.grupo_original, descricao = r.descricao,
        status = r.status, data_inicio = r.data_inicio, data_fim = r.data_fim
      from jsonb_populate_record(null::public.tpes, it.antes) r where t.codigo = r.codigo;
    end if;
  end loop;
  update public.import_lotes set status = 'revertido', revertido_por = auth.uid(), revertido_em = now() where id = p_lote;
  return v;
end $$;

grant execute on function public.normaliza_tpe(text), public.processar_importacao(jsonb, boolean, boolean), public.reverter_lote(bigint) to authenticated;
