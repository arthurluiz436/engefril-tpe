# Manual do administrador (Master)

## Menu
| Tela | Para que serve |
|---|---|
| **Painel** | Visão do dia: tarefas atrasadas, sem responsável, horas da semana, alertas de integridade |
| **Indicadores** | Os indicadores da antiga aba KPI (resumo, por principal, grupo, recurso, mês, O.S., custos, vendedor, nível, classificação). Passe o mouse para ver a definição de cada um |
| **Central de Dados** | Grade com busca, filtro por coluna (aceita `>=10`, `<5`, `=texto`), ordenação múltipla (Shift+clique), arrastar e redimensionar colunas, agrupar com subtotais, visões prontas e personalizadas, exportação da visão atual |
| **TPEs e tarefas** | Cadastrar, editar status e prazos, atribuir responsável. A coluna *Consumo* = horas lançadas ÷ estimadas (**não** é % de conclusão) |
| **Sequência por projetista** | Ordem de execução (setas ↑/↓). É o que o projetista vê em *Minhas tarefas* |
| **Ordens de serviço** | Clientes e O.S. (vendedor, nível, classificação, cidade/UF) |
| **Apontamentos** | Todos os lançamentos, com horas e custos. Correção e exclusão lógica com motivo |
| **Importar planilha** | Trazer planilhas antigas (VER_035 e similares) |
| **Exportar** | Excel (.xlsx) ou CSV com filtros e colunas escolhidas |
| **Integridade e backups** | Reconciliação com o Excel, verificações automáticas, histórico de backups |
| **Usuários** | Convidar, vincular a projetista, desativar ou reativar, promover a Master |
| **Parâmetros** | Jornada, almoço, adicionais de H.E., custos H/H (com vigência), feriados, catálogo de grupos e de-para |
| **Auditoria** | Quem alterou o quê e quando (somente leitura) |

## Rotinas
**Diária**
1. Painel: tratar atrasadas e sem responsável.
2. Conferir se o backup da noite aparece como *verificado* em Integridade.

**Nova TPE**
1. Cadastre em TPEs › **Nova TPE**: O.S., principal, grupo, descrição, estimativa.
2. Atribua um responsável e um prazo.
3. Ajuste a posição em Sequência.

**Fechar TPE**
1. Confira as horas lançadas.
2. Mude o status para **FINALIZADA** e informe a data de fim (o banco exige).

**Reabrir TPE**
1. Mude o status para EM ANDAMENTO.
2. O histórico de reabertura fica registrado na auditoria.

**Mudança de custo H/H ou de parâmetro**
1. Em Parâmetros, crie um **novo valor com data de vigência**. Não edite o antigo.
2. Lançamentos anteriores à data continuam com o valor da época.

## Importar uma planilha antiga
1. **Importar planilha** › selecione o .xlsx ou .xlsm (até 20 MB). O arquivo é lido só no seu navegador.
2. Confira o **modelo detectado** e o **mapeamento** de abas e colunas. Ajuste o que estiver errado. O mapeamento pode ser salvo para a próxima vez.
3. Clique em **Ver prévia**. O servidor valida tudo **sem gravar** e mostra novos, atualizados, duplicados, erros e avisos (grupo padronizado, status inferido etc.).
4. Confirme. O lote recebe um número, e os registros guardam arquivo, aba e linha de origem.
5. Se algo der errado, use **Reverter lote** no histórico. Isso apaga exatamente o que aquele lote criou e restaura o que ele alterou.

Reimportar o mesmo arquivo não duplica nada: tudo aparece como "duplicado".

## Reconciliação com o Excel
**Integridade › Executar reconciliação**, enviando a planilha. O sistema compara cada indicador da aba KPI com o cálculo do banco. Resultado:
- *Validado*: igual.
- *Diferença explicada*: correção documentada (ver docs/VALIDACAO.md).
- *Divergente*: precisa de análise. Registre a explicação e aprove.

## Usuários
- **Convidar.** Informe e-mail, nome e o projetista vinculado. A pessoa recebe o link para criar a senha.
- **Desativar.** Bloqueia o acesso na hora e preserva todo o histórico.
- O sistema impede remover ou desativar **o último Master ativo**.
- **Perfil.** Um Master pode mudar outro usuário entre Projetista e Master na coluna *Perfil* (com confirmação e auditoria). Ninguém altera o próprio perfil. Só o **primeiro** Master é criado pelo SQL Editor (`select public.promover_master('email')`).

## Cuidados
- Exportações contêm dados internos. Não as envie para fora da empresa nem as coloque no GitHub.
- Antes de importações grandes ou correções em massa, rode um backup manual (docs/BACKUP.md).
- Mantenha poucos Masters e use MFA.
