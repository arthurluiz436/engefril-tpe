import { useEffect, useState } from 'react'
import { carregarEquipe, faltaMigracao } from '../../lib/dados'
import { mensagemErro } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { corRecurso } from '../../lib/agenda'
import { Aviso, Cabecalho, Carregando } from '../../components/ui'
import Gantt from '../../components/Gantt'

const ZOOM: Record<string, { rot: string; px: number | 'ajustar' }> = {
  ajustar: { rot: 'Caber na tela', px: 'ajustar' }, dias: { rot: 'Dias', px: 30 }, semanas: { rot: 'Semanas', px: 12 },
}

/** Cronograma da equipe para o projetista: só o gráfico (sem indicadores nem pontos de atenção). */
export default function CronogramaProjetista() {
  const { perfil } = useAuth()
  const [equipe, setEquipe] = useState<Awaited<ReturnType<typeof carregarEquipe>> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [zoom, setZoom] = useState('ajustar')
  const [diasAntes, setDiasAntes] = useState(15)
  const [ocultos, setOcultos] = useState<Set<string>>(new Set())
  useEffect(() => {
    carregarEquipe().then(setEquipe).catch((e) => setErro(faltaMigracao(e)
      ? 'O cronograma da equipe ainda não está disponível. Peça ao Supervisor para aplicar a atualização do banco (migração 0008).' : mensagemErro(e)))
  }, [])
  if (erro) return <div className="stack"><Cabecalho titulo="Cronograma da equipe" /><Aviso tipo="atencao">{erro}</Aviso></div>
  if (!equipe) return <Carregando />
  const recursos = equipe.recursos.filter((r: any) => r.ativo !== false)
  const visiveis = recursos.filter((r: any) => !ocultos.has(String(r.id))).map((r: any) => String(r.id))
  const alternar = (id: string) => { const s = new Set(ocultos); if (s.has(id)) s.delete(id); else s.add(id); setOcultos(s) }
  return (
    <div className="stack">
      <Cabecalho titulo="Cronograma da equipe" texto="As tarefas de cada projetista na ordem prevista: a barra de cima é o planejado e a de baixo o realizado. Setas ligam as TPEs que dependem de outra; tracejadas quando passam de uma pessoa para outra." />
      <div className="card stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="segmentos" role="group" aria-label="Zoom">
            {Object.entries(ZOOM).map(([k, z]) => <button key={k} type="button" aria-pressed={zoom === k} onClick={() => setZoom(k)}>{z.rot}</button>)}
          </div>
          <select value={diasAntes} onChange={(e) => setDiasAntes(Number(e.target.value))} style={{ maxWidth: 190 }} aria-label="Dias antes de hoje">
            {[7, 15, 30, 60].map((n) => <option key={n} value={n}>Desde {n} dias atrás</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {recursos.map((r: any, i: number) => (
            <button key={r.id} type="button" className={`chip-proj ${ocultos.has(String(r.id)) ? 'off' : ''}`} style={{ borderColor: corRecurso(r, i) }}
              aria-pressed={!ocultos.has(String(r.id))} onClick={() => alternar(String(r.id))}>
              <span className="g2-ponto" style={{ background: corRecurso(r, i) }} />{r.nome}{String(r.id) === String(perfil?.recurso_id) ? ' (você)' : ''}</button>))}
        </div>
        <Gantt tpes={equipe.tpes} recursos={recursos} feriados={equipe.feriados} somente={visiveis} diasAntes={diasAntes} pxDia={ZOOM[zoom].px} ausencias={equipe.ausencias}
          destaque={perfil?.recurso_id ? String(perfil.recurso_id) : undefined} rotulo={180} />
      </div>
    </div>
  )
}
