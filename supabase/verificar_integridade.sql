-- Verificação de integridade pós-restauração (usada pelo teste automatizado e pelo workflow de backup).
-- Retorna uma linha por verificação: nome, valor, ok.
select 'contagem_os' as verificacao, count(*)::text as valor, true as ok from public.ordens_servico
union all select 'contagem_tpes', count(*)::text, true from public.tpes
union all select 'contagem_atribuicoes', count(*)::text, true from public.atribuicoes
union all select 'contagem_apontamentos', count(*)::text, true from public.apontamentos
union all select 'contagem_recursos', count(*)::text, true from public.recursos
union all select 'contagem_auditoria', count(*)::text, true from public.auditoria
union all select 'hash_apontamentos', md5(coalesce(string_agg(concat_ws('|', seq, tpe_id, recurso_id, dia, hora_inicio, hora_fim, descricao, excluido_em), ';' order by seq), '')), true from public.apontamentos
union all select 'hash_tpes', md5(coalesce(string_agg(concat_ws('|', codigo, os, principal, grupo, status, data_inicio, data_fim), ';' order by codigo), '')), true from public.tpes
union all select 'soma_horas', round(coalesce(sum(horas_totais), 0), 6)::text, true from public.v_apontamentos
union all select 'orfaos_apontamento_tpe', count(*)::text, count(*) = 0 from public.apontamentos a left join public.tpes t on t.id = a.tpe_id where t.id is null
union all select 'orfaos_apontamento_recurso', count(*)::text, count(*) = 0 from public.apontamentos a left join public.recursos r on r.id = a.recurso_id where r.id is null
union all select 'orfaos_tpe_os', count(*)::text, count(*) = 0 from public.tpes t left join public.ordens_servico o on o.os = t.os where o.os is null
union all select 'orfaos_atribuicao', count(*)::text, count(*) = 0 from public.atribuicoes a left join public.tpes t on t.id = a.tpe_id where t.id is null
union all select 'atribuicao_ativa_unica', count(*)::text, count(*) = 0 from (select tpe_id from public.atribuicoes where ativa group by tpe_id having count(*) > 1) x
union all select 'rls_tabelas_sem_rls', count(*)::text, count(*) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all select 'politicas_rls', count(*)::text, count(*) >= 40 from pg_policies where schemaname = 'public'
union all select 'sequencia_seq_ok', (select last_value from public.apontamentos_seq_seq)::text,
  (select last_value from public.apontamentos_seq_seq) >= coalesce((select max(seq) from public.apontamentos), 0);
