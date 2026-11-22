# Segurança, privacidade e LGPD

## Arquitetura e por que ela é segura no GitHub Pages
O GitHub Pages só entrega arquivos estáticos (HTML/JS/CSS). **Nenhum dado fica no GitHub.** Os dados ficam no Supabase (PostgreSQL), e todas as permissões são aplicadas **dentro do banco**:

- O navegador usa somente a chave **pública** (anon/publishable) e o **JWT do usuário logado**.
- Cada tabela tem **Row Level Security** ligada, com tudo negado por padrão e liberado explicitamente por perfil.
- Operações que exigem privilégio (convidar e desativar usuários) rodam na **Edge Function** `admin-usuarios`. Ela confere no banco se quem chama é um Master ativo e usa a chave `service_role` **apenas no servidor**.
- Importação, atribuição, reordenação, exclusão e reversão são **funções SQL protegidas** (`security definer` com verificação `is_master()`). Burlar a interface não adianta.
- O app se recusa a iniciar se alguém configurar por engano uma chave `service_role` no navegador.

## Matriz de permissões (aplicada por RLS e funções)

| Recurso | Anônimo | Projetista | Master |
|---|---|---|---|
| Tarefas (TPEs) | ✗ | só as atribuídas a ele ou com apontamento dele (leitura) | tudo |
| Dados de cliente | ✗ | nome/cidade das próprias tarefas, via `minhas_tarefas()` | tudo |
| Apontamentos | ✗ | só os próprios. Inclui em TPE atribuída, até 45 dias atrás. Corrige até 7 dias. Não troca o projetista. Não exclui | tudo, com exclusão lógica e motivo |
| Custos H/H e custos calculados | ✗ | ✗ (aparecem vazios) | ✓ |
| Status de TPE | ✗ | ✗ (só leitura) | ✓ |
| Perfis | ✗ | só o próprio. Não muda papel, vínculo nem situação | ✓ (não remove o último Master) |
| Importar / reverter / exportar base | ✗ | ✗ | ✓ |
| Auditoria | ✗ | ✗ | leitura (ninguém edita) |

## Testes de acesso executados (seção 14.2 dos requisitos)
Os testes rodam em PostgreSQL real (PGlite), com as mesmas migrações do Supabase e a troca de papel `SET ROLE authenticated` + `sub` do JWT. Arquivo: `tests/db/acesso.test.ts`. **Resultado: 16/16 aprovados.**

| Requisito | Teste |
|---|---|
| Projetista A não lista, abre, edita nem exporta apontamentos de B | "Projetista B não lista, não altera e não exclui…" |
| Usuário comum não importa nem exporta como Master manipulando a API | "Projetista não executa importação, atribuição, reordenação, exclusão…" |
| Sessão não autenticada não lê tabelas privadas | "não lê nenhuma tabela privada" e "não executa funções administrativas" |
| Usuário não falsifica a autoria do apontamento | "Apontamento grava o recurso da identidade autenticada…" e "não troca o recurso…" |
| Regras eficazes com interface adulterada | todos os testes chamam o banco diretamente, sem passar pela interface |
| Correção destrutiva só com confirmação e trilha | "Exclusão de apontamento exige motivo e fica na auditoria", "Último Master…", "Reenvio…" |

**Não testado aqui:** a Edge Function contra um Supabase real (só a verificação de tipos com `deno check`) e as configurações do painel do Supabase (cadastro desligado, SMTP, MFA). Confira-as pelo roteiro de publicação.

## Outras proteções
- **Exportação.** Os dados exportados já vêm filtrados pela RLS. Textos que começam com `=`, `+`, `-` ou `@` recebem apóstrofo, contra injeção de fórmulas no Excel. Só o Master acessa as telas de exportação.
- **Importação.** A leitura é feita no navegador do Master, e o arquivo **não é enviado nem armazenado**. A função do servidor revalida cada linha (tipos, chaves, limites de tamanho: 50 mil apontamentos por lote), deduplica, registra a proveniência (arquivo, SHA-256, aba, linha, usuário) e permite reverter. Macros de arquivos `.xlsm` nunca são executadas.
- **Duplo clique e reenvio.** Cada formulário de apontamento leva um `client_request_id` único, e o banco tem um índice único por (TPE, projetista, dia, horários).
- **Auditoria.** Gatilhos gravam inclusões, alterações e exclusões nas tabelas principais, com antes, depois, usuário e data/hora.
- **Navegador.** Política CSP restritiva, `noindex`, *referrer policy* e proteção contra *clickjacking* por script. O GitHub Pages não permite cabeçalhos HTTP próprios, por isso o `frame-ancestors` não pode ser aplicado. Se for necessário, publique atrás de um proxy (ex.: Cloudflare) que injete esses cabeçalhos.
- **Sessão.** PKCE, token de 1 h com renovação automática e senha mínima de 10 caracteres com letras e números.

## LGPD — tratamento de dados pessoais
| Dado | Titular | Finalidade | Base legal sugerida | Onde fica |
|---|---|---|---|---|
| Nome, e-mail, login | colaboradores | autenticação e autoria | execução de contrato / legítimo interesse | Supabase Auth + `profiles` |
| Apontamentos (dia, horário, descrição) | projetistas | controle de horas e custos de engenharia | legítimo interesse / obrigação trabalhista | `apontamentos` |
| Custo H/H | projetistas | custeio de projetos | legítimo interesse (acesso restrito ao Master) | `custos_hh` |
| Nome de cliente, cidade, vendedor | pessoas jurídicas / vendedores | gestão de O.S. | execução de contrato | `ordens_servico` |

Recomendações antes de produção, para decisão da empresa:
1. **Autorização institucional e aviso** aos colaboradores sobre o registro de horas e a auditoria.
2. **Minimização.** As descrições dos apontamentos não devem conter dados pessoais de terceiros.
3. **Retenção.** Defina o prazo (ex.: 5 anos para registros de jornada) e o descarte de backups (o workflow guarda 30 dias).
4. **Direitos do titular.** O Master consegue exportar todos os registros de um projetista (Exportar › filtro por projetista). Desativar um usuário bloqueia o acesso sem apagar o histórico.
5. **Operador.** O Supabase atua como operador. Avalie o DPA do fornecedor e a região (São Paulo).
6. **Ambiente de teste** sem dados reais, ou com dados anonimizados.

## Riscos conhecidos e mitigação
| Risco | Mitigação |
|---|---|
| Chave anon é pública | Por design. Sem RLS correta, os dados vazariam, e por isso a RLS foi testada e o build barra segredos. |
| Conta de Master comprometida | MFA para Masters, poucos Masters e auditoria de todas as ações. |
| Biblioteca ExcelJS com dependências antigas (avisos do `npm audit`) | Usada só no navegador do Master, para ler e gerar arquivos. Não processa arquivos de terceiros sem ação do Master. Revisar a cada atualização. |
| Cadastro público reativado por engano | O gatilho cria só o perfil de projetista **sem vínculo**: o usuário não vê tarefas nem dados. Mantenha o cadastro desligado. |
