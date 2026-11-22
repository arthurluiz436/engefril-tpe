# Roteiro de instalação, configuração e publicação

O roteiro foi pensado para quem nunca publicou um sistema. Faça uma vez em **teste** e repita em **produção**. Cada passo diz onde clicar e o que conferir.

> Tempo estimado: 60–90 minutos na primeira vez.
> Você vai precisar de: conta no GitHub, conta no Supabase (plano gratuito serve para testar) e Node.js 20 ou mais recente no seu computador.

---

## Parte A — Supabase (banco, login e funções)

### A1. Criar dois projetos
1. Acesse <https://supabase.com/dashboard> › **New project**.
2. Crie `engefril-tpe-teste` e, depois, `engefril-tpe-producao`. Use a região **South America (São Paulo)** e uma senha forte para o banco, guardada no cofre de senhas da empresa.
3. O projeto de **teste** nunca recebe dados reais sem autorização.

### A2. Aplicar o banco
Faça no projeto de teste e depois no de produção.
1. Menu **SQL Editor** › **New query**.
2. Abra, na ordem, cada arquivo de `supabase/migrations/`. Copie o conteúdo, cole e clique em **Run**:
   1. `20261121000001_schema.sql`
   2. `20261121000002_seguranca_rls.sql`
   3. `20261121000003_importacao.sql`
   4. `20261121000004_referencias.sql`
   5. `20261121000005_endurecimento.sql`
3. Confira em **Table Editor** que existem as tabelas `tpes`, `apontamentos`, `profiles`, entre outras. Cada uma deve mostrar o selo **RLS enabled**.

*Alternativa com a linha de comando:* `npx supabase link --project-ref SEU_REF` e depois `npx supabase db push`.

### A3. Configurar o login
Menu **Authentication**:
1. **Sign In / Providers › Email.** Mantenha *Email* ligado e **desligue "Allow new users to sign up"**. O acesso passa a ser só por convite.
2. **URL Configuration:**
   - *Site URL* = `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`
   - *Redirect URLs* = o mesmo endereço e `http://localhost:5173` (só no projeto de teste)
3. **Emails › SMTP Settings.** Configure o SMTP corporativo da Engefril. O envio padrão do Supabase tem limite baixo e serve apenas para testes.
4. **Policies (senhas):** comprimento mínimo de 10 caracteres.
5. Recomendado em produção: **Auth › Rate Limits** com os valores padrão ou mais restritivos, e **MFA** (TOTP) habilitado para os Masters.

### A4. Publicar a Edge Function de usuários
No seu computador, dentro da pasta do projeto:
```bash
npx supabase login
npx supabase link --project-ref SEU_REF
npx supabase secrets set URL_APP="https://SEU-USUARIO.github.io/SEU-REPOSITORIO/" \
  ORIGENS_PERMITIDAS="https://SEU-USUARIO.github.io"
npx supabase functions deploy admin-usuarios
```
A chave `service_role` **não** é configurada por você: o Supabase a injeta automaticamente na função, no servidor.

### A5. Criar o primeiro Master
1. **Authentication › Users › Add user › Send invitation.** Informe o e-mail do administrador e aceite o convite pelo link recebido. Isso define a senha.
2. **SQL Editor:**
   ```sql
   select public.promover_master('email.do.admin@engefril.com.br');
   ```
   Essa função só roda pelo SQL Editor. O aplicativo não consegue chamá-la.

---

## Parte B — GitHub Pages (o site)

### B1. Repositório
1. Crie um repositório no GitHub, por exemplo `engefril-tpe`. Ele pode ser público: não contém dados.
2. Envie o código:
   ```bash
   git init && git add . && git commit -m "Engefril TPE 1.0"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/engefril-tpe.git
   git push -u origin main
   ```
3. Confira no GitHub que **não** existem arquivos `.xlsx`, `.csv`, `.env.local` nem a pasta `private/`.

### B2. Variáveis públicas do build
**Settings › Secrets and variables › Actions › aba Variables › New repository variable:**

| Nome | Valor (Supabase › Project Settings › API) |
|---|---|
| `VITE_SUPABASE_URL` | Project URL (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | chave **anon / publishable** (nunca a *service_role* / *secret*) |

A chave anon é pública por natureza. A proteção vem das políticas RLS, testadas em `tests/db`.

### B3. Ligar o Pages
**Settings › Pages › Build and deployment › Source = GitHub Actions.**
O workflow `publicar.yml` roda a cada push: verifica tipos, executa os testes de segurança e cálculo, gera o build, confere que não há segredo nem dado no pacote e publica.
O endereço fica em `https://SEU-USUARIO.github.io/engefril-tpe/`.

---

## Parte C — Pôr em uso

1. Entre como Master no endereço publicado.
2. **Importar planilha** › envie a `TAREF_PROJ_ENGEFRIL_VER_035.xlsx` › confira o mapeamento › **Ver prévia**. A prévia não grava nada. Depois clique em **Confirmar e gravar**.
3. **Parâmetros › Projetistas.** Confira o custo H/H e o início padrão de cada um. A importação lê os custos da aba `' REF'` e a jornada 08–18 da nota da planilha.
4. **Usuários › Convidar usuário** para cada projetista, já vinculando ao nome importado.
5. **TPEs e tarefas.** Atribua responsáveis e prazos às TPEs em aberto. **Sequência por projetista** define a ordem de execução.
6. **Integridade › Executar reconciliação** com a mesma planilha. Confira que tudo aparece como *Validado* ou *Diferença explicada*.
7. Configure o **backup diário** (docs/BACKUP.md) e confira em **Integridade** que o primeiro backup aparece como *verificado*.

## Atualizar versões
- **Código:** faça commit e push na `main`. O workflow testa e publica sozinho. Se um teste falhar, nada é publicado.
- **Banco:** novas migrações vão em `supabase/migrations/` com prefixo de data maior. Aplique primeiro no projeto de teste e depois no de produção, sempre após um backup verificado.
- **Dependências:** rode `npm outdated` e `npm audit` mensalmente. Atualize no ambiente de teste primeiro.

## Recuperar dados
Veja docs/BACKUP.md › *Restauração em produção*. O resumo:
1. Restaure o backup num projeto novo de teste.
2. Confira com `verificar_integridade.sql`.
3. Só então restaure em produção, numa janela combinada.

## Problemas comuns
| Sintoma | Causa provável | Solução |
|---|---|---|
| Tela "Aplicativo não configurado" | Variáveis do build ausentes | Passo B2 e depois rode o workflow de novo (Actions › Run workflow) |
| Link de convite abre página em branco | Redirect URL ausente | Passo A3.2 |
| "Seu login não tem perfil" | Usuário criado antes de aplicar as migrações | `insert into profiles (user_id, email) select id, email from auth.users on conflict do nothing;` |
| Convite falha com "Somente o Master" | Usuário não é Master ou está desativado | Passo A5 |
| Projetista não vê tarefas | Login sem vínculo de projetista, ou nada atribuído | Usuários (vínculo) e TPEs (responsável) |
