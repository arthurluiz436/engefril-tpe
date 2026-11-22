import { useMemo } from 'react'
import { dataBR, diasEntre, hojeISO, somaDias } from '../lib/formato'

/**
 * Cronograma (Gantt) por projetista.
 * Cada projetista tem a sua faixa; dentro dela, as tarefas aparecem na ordem da sequência.
 * Em cada tarefa há duas marcações:
 *  - Planejado: da data de início até o prazo definido pelo Master (◆ marca o prazo);
 *  - Realizado: do 1º apontamento até a finalização (ou até hoje, se está em andamento).
 * O trecho depois do prazo aparece hachurado em vermelho. Uma linha vertical marca o dia de hoje.
 * Janela: 30 dias antes de hoje até o último prazo das tarefas ativas.
 */

interface Props {
  tpes: any[]
  recursos: any[]
  /** Ordem ainda não salva de um projetista (pré-visualização da tela de sequência). */
  ordem?: { recurso: string; ids: number[] }
  destaque?: string
  aoEscolher?: (recursoId: string) => void
  /** Mostra só este projetista. */
  somente?: string
}

const DIAS_ANTES = 30
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const maior = (a: string, b?: string | null) => (b && b > a ? b : a)
const iso = (d?: string | null) => (d ? String(d).slice(0, 10) : null)
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

export default function Gantt({ tpes, recursos, ordem, destaque, aoEscolher, somente }: Props) {
  const hoje = hojeISO()
  const dados = useMemo(() => {
    const ini = somaDias(hoje, -DIAS_ANTES)
    const pistas = recursos
      .filter((r: any) => !somente || String(r.id) === somente)
      .map((r: any) => {
        const id = String(r.id)
        let abertas = tpes.filter((t: any) => String(t.responsavel_id) === id && t.status !== 'FINALIZADA' && !t.arquivada)
        if (ordem && ordem.recurso === id) {
          const pos = new Map(ordem.ids.map((x, i) => [x, i]))
          abertas = [...abertas].sort((a, b) => (pos.get(a.id) ?? 9999) - (pos.get(b.id) ?? 9999))
        } else abertas = [...abertas].sort((a, b) => (a.sequencia ?? 9999) - (b.sequencia ?? 9999))
        const concluidas = tpes
          .filter((t: any) => String(t.responsavel_id) === id && t.status === 'FINALIZADA' && !t.arquivada && iso(t.data_fim) && iso(t.data_fim)! >= ini)
          .sort((a, b) => String(a.data_fim).localeCompare(String(b.data_fim)))
        return { id, nome: r.nome as string, abertas, concluidas }
      })
      .filter((p) => p.abertas.length || p.concluidas.length || p.id === destaque)
    let fim = hoje
    for (const p of pistas) for (const t of [...p.abertas, ...p.concluidas]) { fim = maior(fim, iso(t.prazo)); fim = maior(fim, iso(t.data_fim)) }
    fim = somaDias(fim, 3)
    const dias = diasEntre(ini, fim) + 1
    // marcações do eixo: toda segunda-feira (ou a cada 2 semanas em janelas longas) e o 1º dia de cada mês
    const passo = dias > 120 ? 14 : 7
    const marcas: { d: string; mes: boolean }[] = []
    let semana = 0
    for (let i = 0; i < dias; i++) {
      const d = somaDias(ini, i)
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
      if (d.endsWith('-01')) marcas.push({ d, mes: true })
      else if (dow === 1 && semana++ % (passo / 7) === 0) marcas.push({ d, mes: false })
    }
    // evita rótulos sobrepostos: some a segunda-feira que cai a menos de 4 dias do início de um mês
    const meses = marcas.filter((m) => m.mes).map((m) => m.d)
    const limpas = marcas.filter((m) => m.mes || meses.every((d) => Math.abs(diasEntre(d, m.d)) >= 4))
    return { ini, fim, dias, pistas, marcas: limpas }
  }, [tpes, recursos, ordem, destaque, somente, hoje])

  const { ini, fim, dias, pistas, marcas } = dados
  const x = (d: string) => Math.max(0, Math.min(100, (diasEntre(ini, d) / dias) * 100))
  /** Barra do dia a até o dia b (inclusive), recortada na janela. */
  const barra = (a: string, b: string) => {
    if (b < ini || a > fim) return null
    const l = x(a < ini ? ini : a), r = x(somaDias(b > fim ? fim : b, 1))
    return { left: `${l}%`, width: `${Math.max(r - l, 0.6)}%` }
  }

  if (!pistas.length) return <div className="vazio small">Nenhuma tarefa ativa ou concluída nos últimos {DIAS_ANTES} dias.</div>

  return (
    <div className="gantt">
      <div className="gantt-legenda small">
        <span><i className="lg plan" /> Planejado (início → prazo)</span>
        <span><i className="lg prazo" /> Prazo</span>
        <span><i className="lg real" /> Realizado (apontamentos)</span>
        <span><i className="lg atraso" /> Após o prazo</span>
        <span><i className="lg hoje" /> Hoje</span>
      </div>
      <div className="gantt-corpo">
        <div className="gantt-eixo">
          <div className="gantt-rot" />
          <div className="gantt-trilha">
            {marcas.map((m) => (
              <span key={m.d} className={`gantt-marca ${m.mes ? 'mes' : ''}`} style={{ left: `${x(m.d)}%` }}>
                {m.mes ? new Date(`${m.d}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '') : dataBR(m.d).slice(0, 5)}
              </span>
            ))}
          </div>
        </div>
        {pistas.map((p) => {
          const atrasadas = p.abertas.filter((t) => t.prazo && iso(t.prazo)! < hoje).length
          const cab = (
            <>
              <strong>{p.nome}</strong>
              <span className="muted small">
                {plural(p.abertas.length, 'em aberto', 'em aberto')}
                {atrasadas > 0 && <> · <span className="texto-atraso">{plural(atrasadas, 'atrasada', 'atrasadas')}</span></>}
                {p.concluidas.length > 0 && <> · {plural(p.concluidas.length, 'concluída', 'concluídas')} no período</>}
              </span>
            </>
          )
          return (
            <section key={p.id} className={`gantt-pista ${p.id === destaque ? 'destaque' : ''}`} aria-label={`Cronograma de ${p.nome}`}>
              {aoEscolher
                ? <button type="button" className="gantt-nome" onClick={() => aoEscolher(p.id)} title="Ver a sequência deste projetista">{cab}</button>
                : <div className="gantt-nome">{cab}</div>}
              {[...p.abertas.map((t, i) => ({ t, rot: `${i + 1}`, feita: false })), ...p.concluidas.map((t) => ({ t, rot: '✓', feita: true }))].map(({ t, rot, feita }) => {
                const prazo = iso(t.prazo)
                const iniPlan = iso(t.data_inicio) ?? iso(t.primeiro_apontamento)
                const iniReal = iso(t.primeiro_apontamento) ?? (t.status === 'EM ANDAMENTO' ? iso(t.data_inicio) : null)
                const fimReal = iso(t.data_fim) ?? (t.status === 'EM ANDAMENTO' ? hoje : iso(t.ultimo_apontamento))
                const fimEfetivo = iso(t.data_fim) ?? hoje
                const atraso = prazo && fimEfetivo > prazo ? diasEntre(prazo, fimEfetivo) : 0
                const plan = iniPlan && prazo ? barra(iniPlan, prazo) : null
                const real = iniReal && fimReal ? barra(iniReal, prazo && fimReal > prazo ? prazo : fimReal) : null
                const realAtraso = iniReal && fimReal && prazo && fimReal > prazo ? barra(maior(somaDias(prazo, 1), iniReal), fimReal) : null
                const lacuna = atraso && prazo ? barra(somaDias(prazo, 1), fimEfetivo) : null
                const dica = [
                  `${t.codigo} · ${t.grupo ?? ''}`, t.descricao,
                  `Planejado: ${dataBR(iniPlan)} → ${dataBR(prazo)}`,
                  `Realizado: ${iniReal ? `${dataBR(iniReal)} → ${feita ? dataBR(fimReal) : t.status === 'EM ANDAMENTO' ? 'em andamento' : `último registro ${dataBR(fimReal)}`}` : 'sem apontamentos'}`,
                  atraso ? `${feita ? 'Concluída' : 'Está'} ${plural(atraso, 'dia', 'dias')} após o prazo` : prazo ? (feita ? 'Concluída no prazo' : 'Dentro do prazo') : 'Sem prazo definido',
                ].filter(Boolean).join('\n')
                return (
                  <div key={t.id} className={`gantt-linha ${feita ? 'feita' : ''} ${atraso && !feita ? 'em-atraso' : ''}`} title={dica}>
                    <div className="gantt-rot"><span className="gantt-n">{rot}</span><span className="gantt-cod">{t.codigo}</span></div>
                    <div className="gantt-trilha">
                      {lacuna && <div className="gantt-lacuna" style={lacuna} />}
                      {plan && <div className="gantt-plan" style={plan} />}
                      {real && <div className="gantt-real" style={real} />}
                      {realAtraso && <div className="gantt-real tarde" style={realAtraso} />}
                      {prazo && prazo >= ini && prazo <= fim && <div className="gantt-prazo" style={{ left: `${x(somaDias(prazo, 1))}%` }} />}
                      {!prazo && <span className="gantt-semprazo small">sem prazo</span>}
                    </div>
                    <span className="sr-only">{dica}</span>
                  </div>
                )
              })}
              {!p.abertas.length && !p.concluidas.length && <div className="muted small" style={{ padding: '6px 0 4px' }}>Sem tarefas no período.</div>}
            </section>
          )
        })}
        <div className="gantt-hoje" style={{ left: `calc(var(--rot) + (100% - var(--rot)) * ${(x(hoje) + x(somaDias(hoje, 1))) / 200})` }}>
          <span>Hoje · {SEM[new Date(`${hoje}T12:00:00Z`).getUTCDay()]} {dataBR(hoje).slice(0, 5)}</span>
        </div>
      </div>
    </div>
  )
}
