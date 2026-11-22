# Backup, restauração e integridade

> Exportar um Excel **não** é backup. Backup é a cópia completa do banco (estrutura e dados). Ele só vale depois de uma restauração de teste bem-sucedida.

## O que foi comprovado neste ambiente
`tests/db/backup.test.ts`, com dados fictícios, executado com sucesso:
1. Cria um banco com as migrações, 2 O.S., 12 TPEs, 12 atribuições e 60 apontamentos.
2. Gera o backup com **pg_dump**.
3. Restaura num **banco novo e isolado**.
4. Roda `supabase/verificar_integridade.sql` nos dois bancos e exige resultados **idênticos**. A verificação inclui contagens por tabela, hash dos apontamentos e das TPEs, soma de horas, ausência de órfãos (apontamento sem TPE, TPE sem O.S. etc.), uma atribuição ativa por TPE, RLS ligada em todas as tabelas, 40 ou mais políticas e sequência coerente.
5. Confirma que, no banco restaurado, o projetista continua vendo só os próprios dados.

**Ainda não comprovado:** backup e restauração do **seu** Supabase. Isso depende das suas credenciais. O primeiro run do workflow abaixo gera essa evidência e a registra na tela *Integridade e backups*.

## Rotina recomendada (diária, automática)
1. Crie um **repositório privado** separado (ex.: `engefril-tpe-backup`). Copie `supabase/verificar_integridade.sql` e `.github/workflows/backup.yml.exemplo`, renomeado para `backup.yml`.
2. Em **Settings › Secrets › Actions**, crie:
   - `SUPABASE_DB_URL`: Supabase › Project Settings › Database › *Connection string* (URI, modo Session, com a senha do banco).
   - `BACKUP_PASSPHRASE`: frase longa e aleatória. Guarde-a **fora do GitHub**, no cofre da empresa: sem ela o backup não pode ser aberto.
3. O workflow roda todo dia às 03h17 (Brasília). Ele:
   - faz o pg_dump do esquema `public` e exporta os usuários do Auth;
   - restaura num PostgreSQL 17 isolado e compara as verificações;
   - criptografa (GPG AES-256) e calcula o SHA-256;
   - registra a evidência em `backups_registro`, que aparece no app;
   - guarda o arquivo como artefato por 30 dias.
4. Complemento: no plano Pro, o Supabase também faz backups diários próprios, e o PITR (point-in-time recovery) pode ser contratado.

Backup manual equivalente: `scripts/backup_local.sh` (requer cliente PostgreSQL 17 e Docker).

## Antes de alterações importantes
Antes de uma migração nova, uma importação grande ou uma correção em massa, rode o workflow manualmente (**Actions › Backup diário verificado › Run workflow**) e confira em *Integridade* que ele aparece como **verificado**.

## Restauração em produção (recuperação)
1. Baixe o artefato `.tgz.gpg` e decifre: `gpg -d arquivo.tgz.gpg > b.tgz && tar xzf b.tgz`.
2. **Ensaie primeiro** num projeto Supabase de teste vazio:
   - aplique as migrações;
   - limpe as tabelas de dados (`truncate public.apontamentos, public.atribuicoes, public.tpes, public.ordens_servico, public.recursos, public.custos_hh restart identity cascade;`);
   - restaure só os dados: `pg_restore --data-only --disable-triggers -d "$URL_TESTE" bk/public.dump`;
   - rode `verificar_integridade.sql` e compare com `verificacao_origem.txt`.
3. Com o ensaio aprovado, repita em produção numa janela combinada e registre a operação.
4. Usuários do Auth: os logins continuam no Supabase. Recrie só os que se perderam (convite) e confira os vínculos em *Usuários*.

## Retenção
Sugestão: 30 dias de backups diários no GitHub privado, mais uma cópia mensal guardada por 5 anos em armazenamento corporativo. Ajuste à política da empresa e à LGPD (docs/SEGURANCA.md).
