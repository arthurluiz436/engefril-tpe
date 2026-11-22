-- =============================================================================
-- Segurança: Row Level Security, privilégios e políticas por perfil
-- Princípio: tudo negado por padrão; liberado explicitamente por papel.
-- =============================================================================

-- Janela de lançamento/correção para projetistas (política autorizada — ajuste aqui)
create or replace function public.janela_lancamento_dias() returns integer language sql immutable as $$ select 45 $$;
create or replace function public.janela_correcao_dias() returns integer language sql immutable as $$ select 7 $$;

-- De-para de grupos usado na importação (padronização documentada)
create table if not exists public.grupos_depara (
  principal         text not null,
  grupo_original    text not null,
  grupo_padronizado text not null,
  primary key (principal, grupo_original)
);
drop trigger if exists auditoria on public.grupos_depara;
create trigger auditoria after insert or update or delete on public.grupos_depara for each row execute function public.trg_auditoria();

-- ---------------------------------------------------------------- privilégios base
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon, public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- tabelas que só mudam por função (RPC) ou gatilho
revoke insert, update, delete on public.auditoria, public.import_lotes, public.import_itens, public.backups_registro from authenticated;
revoke delete on public.apontamentos from authenticated;

grant execute on function public.meu_papel(), public.is_master(), public.meu_recurso(), public.usuario_ativo(),
  public.tpe_visivel(bigint), public.tpe_atribuida_a_mim(bigint), public.parametros_vigentes(date),
  public.custo_vigente(bigint, date), public.tipo_dia(date), public.min_round(interval), public.minhas_tarefas(),
  public.atribuir_tpe(bigint, bigint, integer, text), public.reordenar_sequencia(bigint, bigint[]),
  public.excluir_apontamento(bigint, text), public.janela_lancamento_dias(), public.janela_correcao_dias()
  to authenticated;

-- ---------------------------------------------------------------- RLS em todas as tabelas
do $$ declare t text; begin
  foreach t in array array['recursos','profiles','custos_hh','parametros','feriados','listas','catalogo_grupos','grupos_depara',
                           'import_lotes','import_itens','import_mapas','ordens_servico','tpes','atribuicoes','apontamentos',
                           'visualizacoes','auditoria','reconciliacao','backups_registro'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- helper para recriar políticas de forma idempotente
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Referências (leitura para usuários ativos; escrita só Master)
do $$ declare t text; begin
  foreach t in array array['recursos','parametros','feriados','listas','catalogo_grupos','grupos_depara'] loop
    execute format('create policy ler on public.%I for select to authenticated using (public.usuario_ativo())', t);
    execute format('create policy master_insere on public.%I for insert to authenticated with check (public.is_master())', t);
    execute format('create policy master_altera on public.%I for update to authenticated using (public.is_master()) with check (public.is_master())', t);
    execute format('create policy master_exclui on public.%I for delete to authenticated using (public.is_master())', t);
  end loop;
end $$;

-- Somente Master
do $$ declare t text; begin
  foreach t in array array['custos_hh','ordens_servico','import_mapas','reconciliacao'] loop
    execute format('create policy master_tudo on public.%I for all to authenticated using (public.is_master()) with check (public.is_master())', t);
  end loop;
end $$;
create policy master_le on public.import_lotes for select to authenticated using (public.is_master());
create policy master_le on public.import_itens for select to authenticated using (public.is_master());
create policy master_le on public.auditoria for select to authenticated using (public.is_master());
create policy master_le on public.backups_registro for select to authenticated using (public.is_master());

-- Perfis
create policy le_proprio_ou_master on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_master());
create policy altera_proprio_ou_master on public.profiles for update to authenticated
  using (user_id = auth.uid() or public.is_master())
  with check (user_id = auth.uid() or public.is_master());
create policy master_insere on public.profiles for insert to authenticated with check (public.is_master());

-- TPEs
create policy le_visiveis on public.tpes for select to authenticated using (public.usuario_ativo() and public.tpe_visivel(id));
create policy master_insere on public.tpes for insert to authenticated with check (public.is_master());
create policy master_altera on public.tpes for update to authenticated using (public.is_master()) with check (public.is_master());
create policy master_exclui on public.tpes for delete to authenticated using (public.is_master());

-- Atribuições
create policy le_proprias on public.atribuicoes for select to authenticated
  using (public.is_master() or (public.usuario_ativo() and recurso_id = public.meu_recurso()));
create policy master_escreve on public.atribuicoes for all to authenticated using (public.is_master()) with check (public.is_master());

-- Apontamentos
create policy le_proprios on public.apontamentos for select to authenticated
  using (public.is_master() or (public.usuario_ativo() and recurso_id = public.meu_recurso()));
create policy insere on public.apontamentos for insert to authenticated
  with check (
    public.is_master()
    or (public.usuario_ativo()
        and recurso_id = public.meu_recurso()
        and public.tpe_atribuida_a_mim(tpe_id)
        and excluido_em is null
        and dia <= current_date + 1
        and dia >= current_date - public.janela_lancamento_dias())
  );
create policy corrige on public.apontamentos for update to authenticated
  using (public.is_master()
         or (public.usuario_ativo() and recurso_id = public.meu_recurso() and excluido_em is null
             and criado_em > now() - make_interval(days => public.janela_correcao_dias())))
  with check (public.is_master()
         or (recurso_id = public.meu_recurso() and excluido_em is null
             and public.tpe_visivel(tpe_id)
             and dia <= current_date + 1 and dia >= current_date - public.janela_lancamento_dias()));

-- Visualizações salvas (Central de Dados — somente Master)
create policy master_le on public.visualizacoes for select to authenticated
  using (public.is_master() and (dono = auth.uid() or compartilhada));
create policy master_cria on public.visualizacoes for insert to authenticated
  with check (public.is_master() and dono = auth.uid());
create policy master_altera on public.visualizacoes for update to authenticated
  using (public.is_master() and dono = auth.uid()) with check (public.is_master() and dono = auth.uid());
create policy master_exclui on public.visualizacoes for delete to authenticated
  using (public.is_master() and dono = auth.uid());

-- Views herdam RLS (security_invoker)
grant select on public.v_apontamentos, public.v_tpes to authenticated;
revoke all on public.v_apontamentos, public.v_tpes from anon;
