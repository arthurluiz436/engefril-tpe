# Matriz de testes e checklists finais

Execução registrada em 21/11/2026, neste ambiente de desenvolvimento: `npm run typecheck` sem erros e `npx vitest run` com **4 arquivos e 35 testes aprovados**. O banco dos testes é PostgreSQL real (PGlite 0.3), com as mesmas migrações publicadas no Supabase.

## Testes automatizados executados
| # | Arquivo | Teste | Resultado |
|---|---|---|---|
| 1 | acesso | Anônimo não lê nenhuma tabela privada | ✅ |
| 2 | acesso | Anônimo não executa funções administrativas | ✅ |
| 3 | acesso | Projetista vê apenas as próprias tarefas e TPEs | ✅ |
| 4 | acesso | Projetista não lê O.S., custos, auditoria nem perfis de terceiros | ✅ |
| 5 | acesso | Apontamento grava o recurso da identidade autenticada (anti-falsificação) | ✅ |
| 6 | acesso | Projetista não lança em TPE não atribuída | ✅ |
| 7 | acesso | Projetista B não lista, altera nem exclui apontamentos de A | ✅ |
| 8 | acesso | Projetista não troca o recurso do próprio apontamento | ✅ |
| 9 | acesso | Projetista vê horas, mas não custos | ✅ |
| 10 | acesso | Usuário desativado não vê nada | ✅ |
| 11 | acesso | Projetista não importa, atribui, reordena, exclui nem promove (via API) | ✅ |
| 12 | acesso | Projetista não altera status de TPE | ✅ |
| 13 | acesso | Exclusão exige motivo e fica na auditoria | ✅ |
| 14 | acesso | Último Master ativo não pode ser rebaixado | ✅ |
| 15 | acesso | Reenvio do mesmo lançamento é barrado | ✅ |
| 16 | acesso | Reatribuição preserva o histórico | ✅ |
| 17–24 | equivalencia | Leitura da VER_035, prévia sem gravação, proveniência, 442/442 lançamentos (SQL e TS), KPI, reimportação, reversão | ✅ (requer a planilha em `private/`, ignorados sem ela) |
| 25–34 | calculo | Jornada, sexta, início antecipado, almoço, sábado/feriado, custo nulo, capacidade, datas, códigos, injeção de fórmulas | ✅ |
| 35 | backup | pg_dump → restauração isolada → verificação idêntica, RLS preservada | ✅ |

## Verificações manuais executadas
| Verificação | Resultado |
|---|---|
| Build de produção (`npm run build`) | ✅ sem erros |
| Edge Function `admin-usuarios` (`deno check`) | ✅ tipos corretos |
| Telas no navegador (Playwright, back-end simulado com dados fictícios): login, início, tarefas, registrar, painel, indicadores, central, importar, exportar, integridade, celular 390 px | ✅ sem erros de JavaScript. Capturas revisadas |
| Nenhuma chave secreta nem arquivo de dados no `dist/` (`scripts/verificar_dist.mjs`) | ✅. Teste negativo com JWT `service_role` falso bloqueou o build. O mesmo script roda no workflow |

## NÃO executado (depende do seu ambiente)
| Item | Como validar |
|---|---|
| Migrações aplicadas no Supabase real | PUBLICACAO A2: conferir o selo RLS em todas as tabelas |
| Convite, desativação e e-mail (Edge Function + SMTP) | Convidar um usuário de teste e aceitar o link |
| Login real, renovação de sessão, MFA | Entrar, aguardar mais de 1 h, entrar com MFA |
| Workflow de publicação no GitHub Actions | Primeiro push na `main` |
| Workflow de backup e restauração do seu banco | Rodar manualmente e conferir em Integridade |
| Desempenho com volume alto (>50 mil apontamentos) | Monitorar após 6 meses de uso |
| Testes de acesso 14.2 **no Supabase publicado** | Repetir o roteiro abaixo com 2 projetistas de teste |

### Roteiro de acesso no ambiente publicado (15 min)
1. Crie os projetistas de teste A e B e atribua uma TPE a cada um.
2. Entre como A: lance horas. Em outra janela, entre como B e confira que não aparece nada de A.
3. Copie o token de B (F12 › Application › Local Storage › chave `sb-…-auth-token` › `access_token`) e chame a API REST com o token de B:
   `curl "$URL/rest/v1/apontamentos?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN_B"`. O resultado deve trazer só os lançamentos de B.
4. Sem token: `curl "$URL/rest/v1/tpes?select=*" -H "apikey: $ANON"` deve retornar `[]` ou erro de permissão.
5. Como B: `curl -X POST "$URL/rest/v1/rpc/reverter_lote" ... -d '{"p_lote":1}'` deve retornar erro "Somente o Master".

## Anexo C — Checklist de segurança antes de produção
- [ ] Cadastro público desligado ("Allow new users to sign up" = off)
- [ ] Somente a chave anon/publishable nas variáveis do GitHub
- [ ] RLS ligada em todas as tabelas (`verificar_integridade.sql`, linha `tabelas_sem_rls = 0`)
- [ ] SMTP corporativo configurado
- [ ] Site URL e Redirect URLs corretos
- [ ] MFA para os Masters
- [ ] Repositório sem planilhas, exportações, backups ou `.env`
- [ ] Backup diário em repositório **privado**, com a frase-senha guardada fora do GitHub
- [ ] Roteiro de acesso acima executado no ambiente publicado
- [ ] Aviso de LGPD aos colaboradores

## Anexo D — Checklist de aceite funcional
- [ ] VER_035 importada, com prévia conferida
- [ ] Reconciliação sem divergência não explicada
- [ ] Pendências de validação resolvidas (docs/VALIDACAO.md › Pendências)
- [ ] Custos H/H e início padrão de cada projetista conferidos
- [ ] Todos os projetistas convidados e vinculados
- [ ] TPEs abertas com responsável, prazo e sequência
- [ ] Um projetista registrou uma atividade pelo celular
- [ ] Exportação Excel aberta e conferida
- [ ] Primeiro backup aparece como *verificado*
