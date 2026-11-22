# Auditoria dos cálculos e equivalência com o Excel

> Este arquivo descreve **método, regras e resultados por categoria**, sem valores corporativos, porque o repositório pode ser público. A matriz com os valores reais da VER_035 é gerada pelos testes (`private/`) e pela tela **Integridade › Reconciliação** do sistema, que guarda o resultado no banco.

## Regras reproduzidas (abas CRM_ANALITICO e KPI)

| Cálculo | Regra (VER_035) | Implementação |
|---|---|---|
| Tipo de dia | FERIADO (lista) › DOMINGO › SÁBADO › DIA ÚTIL | `tipo_dia()` / `tipoDia()` |
| Início da jornada (col. Z) | Se o recurso tem lançamento no dia começando até 07:00, a jornada começa às 07:00. Senão, no início padrão do recurso (08:00 para quem trabalha 08–18) | `v_apontamentos` / `calcularApontamento` |
| Fim da jornada (col. AA) | início + 10 h (seg–qui) ou + 9 h (sex), com almoço incluso | idem |
| Hora normal (col. T) | só em dia útil: trecho dentro da jornada − sobreposição com o almoço 12–13, arredondado ao minuto | idem |
| Hora extra (col. S) | (fim − início − sobreposição com o almoço) arredondado ao minuto − hora normal, mínimo 0 | idem |
| Custo (U, V, W) | normal × H/H + extra × H/H × (1 + 60%, 75% ou 100% conforme o tipo de dia) | idem, com custo H/H **versionado por vigência** |
| Capacidade | dias úteis × 9 h, menos 1 h por sexta. Feriados não descontados (regra documentada; agora é parâmetro) | `capacidade()` |
| Indicadores KPI 1–10 | contagens, somas e médias sobre TPEs e apontamentos | `indicadores()` |

Cada indicador exibido tem definição explícita (nome, numerador, denominador, unidade, população, tratamento de vazio e célula de origem) em `src/lib/calculo.ts › DEFINICOES`. A tela de indicadores mostra essa definição ao passar o mouse.

**Indicadores que não se confundem:** "horas consumidas ÷ estimadas" (coluna *Consumo* em TPEs) **não** é percentual de conclusão física. O status da tarefa é independente dos apontamentos e só o Master o altera.

## Resultado da equivalência (executado em `tests/db/equivalencia.test.ts`)

| Teste | Resultado |
|---|---|
| Horas normais, extras, custo normal, custo H.E., custo total, tipo de dia e início da jornada, **lançamento a lançamento**, view SQL × Excel | **442 de 442 idênticos** (tolerância 1e-6) |
| Os mesmos campos, motor TypeScript × Excel | **442 de 442 idênticos** |
| Resumo geral (KPI B5–B19) | idêntico |
| Custos (KPI B156–B165) | idêntico |
| Por principal (horas, H.E., quantidade, tempo médio, prazo médio) | idêntico |
| Carga mensal (capacidade, horas da equipe, horas extras) | idêntico |
| Por recurso (dias, capacidade, horas, alocação) | idêntico |
| Por vendedor (O.S., TPEs, horas, reaberturas) | idêntico |
| TPEs atendidos por recurso | **diferença explicada** (correção 1) |
| Média e mediana de horas por O.S. | **diferença explicada** (correção 2) |

## Erros comprovados na planilha e correções aplicadas
1. **TPEs atendidos contados em dobro.** A VER_035 contava `TPE-xxx` e `TPE-xxx.0` como TPEs distintas. A contagem agora usa o código normalizado, o que afeta 2 recursos e o total da equipe.
2. **Lista fixa de O.S.** nos itens 6 e 10.3. Duas O.S. cadastradas depois ficavam de fora, o que deixava a conferência do item 10.3 como DIVERGENTE. Agora a lista é dinâmica.
3. **Combinações principal/grupo fora da lista fixa do item 3.** Agora o item 3 soma 100% das horas.
4. **Data com "yyyy" no Excel em português** (CAPA). Não existe mais no sistema web.
5. **Dados de cliente copiados na aba TPE** (1 divergência de nível). O sistema usa sempre o cadastro da O.S.

Nenhum valor histórico foi alterado em silêncio. Os grupos com grafias diferentes são padronizados por uma tabela **de-para** visível (Parâmetros › Catálogo), e o texto original fica em `tpes.grupo_original`. O status de TPEs abertas importadas com horas é marcado como **"inferido"** na prévia, para validação.

## Pendências de validação humana
- **Lançamentos sobrepostos** (mesmo projetista, mesmo dia, horários cruzados): o sistema mostra e não corrige. Confirmar com a agenda.
- **TPE com principal possivelmente incorreto** (grupo "TRAÇADO SADEMA" em EXECUTIVO): mantida como está, marcada como item de catálogo inativo.
- **Nível do cliente:** usar o cadastro atual (como hoje) ou o nível da época da TPE (snapshot)?
- **Feriados municipais** de Santa Luzia/MG: incluir em Parâmetros.

## Como repetir a validação
- Automaticamente: `python3 scripts/gerar_fixture_excel.py private/TAREF_PROJ_ENGEFRIL_VER_035.xlsx && npm test`. Os testes de equivalência também precisam de `private/esperado.json` (nomes, custos H/H e contagens corrigidas, entregue em separado por ser confidencial) e são ignorados se esses arquivos não estiverem em `private/`.
- No sistema: **Integridade › Executar reconciliação** com a planilha. O resultado fica registrado com status, explicação e aprovação do Master. Divergências não explicadas bloqueiam o aceite.
