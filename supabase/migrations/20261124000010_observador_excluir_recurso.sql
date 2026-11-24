-- =============================================================================
-- 0010 — Perfil "Observador" (somente leitura) e exclusão de projetista sem vínculos
-- =============================================================================
-- Observador: enxerga O.S., clientes, TPEs, atribuições, apontamentos e custos (indicadores do
-- Supervisor), mas não grava nada. As regras de escrita existentes já exigem is_master() ou
-- recurso = meu_recurso(); o Observador não é Master e não tem projetista vinculado, então
-- todas as gravações continuam negadas pelo banco. Aqui só acrescentamos políticas de LEITURA.

alter type public.papel_t add value if not exists 'observador';

-- (compara como texto: o valor novo do enum ainda não pode ser usado nesta mesma transação)
create or replace function public.is_observador() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel::text = 'observador' from public.profiles where user_id = auth.uid() and ativo), false)
$$;
revoke all on function public.is_observador() from public, anon;
grant execute on function public.is_observador() to authenticated;

-- leitura para o Observador (políticas permissivas somam às existentes: não mudam Master nem projetista)
do $$ declare t text; begin
  foreach t in array array['ordens_servico', 'custos_hh', 'tpes', 'atribuicoes', 'apontamentos'] loop
    execute format('drop policy if exists observador_le on public.%I', t);
    execute format('create policy observador_le on public.%I for select to authenticated using (public.is_observador())', t);
  end loop;
end $$;
-- lista de usuários (nome e papel) para exibir responsáveis: o Observador lê os perfis, sem alterar
drop policy if exists observador_le on public.profiles;
create policy observador_le on public.profiles for select to authenticated using (public.is_observador());

-- o papel de Observador não tem projetista vinculado (não aponta horas)
create or replace function public.trg_observador_sem_recurso() returns trigger
language plpgsql as $$
begin
  if new.papel::text = 'observador' then new.recurso_id := null; end if;
  return new;
end $$;
drop trigger if exists profiles_observador on public.profiles;
create trigger profiles_observador before insert or update of papel, recurso_id on public.profiles
  for each row execute function public.trg_observador_sem_recurso();

-- ---------------------------------------------------------------- apagar projetista
-- Só apaga projetista sem TPE vinculada (atribuição atual ou antiga), sem apontamento e sem login vinculado.
-- O histórico de custo H/H e as férias dele saem junto.
create or replace function public.excluir_recurso(p_recurso bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_nome text; v_tpes int; v_lista text; v_aps int; v_login text;
begin
  if not public.is_master() then raise exception 'Somente o Supervisor apaga projetistas.' using errcode = '42501'; end if;
  select nome into v_nome from public.recursos where id = p_recurso;
  if v_nome is null then raise exception 'Projetista não encontrado.'; end if;
  select count(distinct a.tpe_id), string_agg(distinct t.codigo, ', ') into v_tpes, v_lista
    from public.atribuicoes a join public.tpes t on t.id = a.tpe_id where a.recurso_id = p_recurso;
  if v_tpes > 0 then
    raise exception '% não pode ser apagado porque tem % TPE(s) vinculada(s): %. Troque o responsável dessas TPEs primeiro.', v_nome, v_tpes, v_lista;
  end if;
  select count(*) into v_aps from public.apontamentos where recurso_id = p_recurso;
  if v_aps > 0 then
    raise exception '% não pode ser apagado porque tem % apontamento(s) de horas. Desative-o em vez de apagar.', v_nome, v_aps;
  end if;
  select coalesce(nullif(nome, ''), email) into v_login from public.profiles where recurso_id = p_recurso limit 1;
  if v_login is not null then
    raise exception '% está vinculado ao login de %. Tire o vínculo em Usuários antes de apagar.', v_nome, v_login;
  end if;
  delete from public.custos_hh where recurso_id = p_recurso;
  delete from public.recursos where id = p_recurso;
  return v_nome;
end $$;
revoke all on function public.excluir_recurso(bigint) from public, anon;
grant execute on function public.excluir_recurso(bigint) to authenticated;
