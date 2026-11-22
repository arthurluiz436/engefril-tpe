-- =============================================================================
-- Endurecimento final: nenhuma função do esquema public é executável por anon/PUBLIC.
-- (O PostgreSQL concede EXECUTE a PUBLIC por padrão em toda função nova.)
-- Re-execute este arquivo sempre que criar novas funções.
-- =============================================================================
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke all on function %s from public, anon', f.sig);
  end loop;
end $$;
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- funções que o aplicativo chama (ou que as políticas RLS usam) — somente usuários autenticados
grant execute on function public.meu_papel(), public.is_master(), public.meu_recurso(), public.usuario_ativo(),
  public.tpe_visivel(bigint), public.tpe_atribuida_a_mim(bigint), public.parametros_vigentes(date),
  public.custo_vigente(bigint, date), public.tipo_dia(date), public.min_round(interval), public.minhas_tarefas(),
  public.atribuir_tpe(bigint, bigint, integer, text), public.reordenar_sequencia(bigint, bigint[]),
  public.excluir_apontamento(bigint, text), public.janela_lancamento_dias(), public.janela_correcao_dias(),
  public.normaliza_tpe(text), public.processar_importacao(jsonb, boolean, boolean), public.reverter_lote(bigint)
  to authenticated;
revoke all on function public.promover_master(text) from authenticated;
