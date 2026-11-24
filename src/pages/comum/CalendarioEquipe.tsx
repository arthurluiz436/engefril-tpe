import { useEffect, useMemo, useState } from 'react'
import { useBase } from '../../lib/base'
import { calendarioEquipe, carregarEquipe, faltaMigracao, prazosDasOS } from '../../lib/dados'
import { mensagemErro } from '../../lib/supabase'
import { hojeISO } from '../../lib/formato'
import { Aviso, Cabecalho, Carregando } from '../../components/ui'
import Calendario, { gradeDoMes } from '../../components/Calendario'

/** Calendário do Supervisor: usa a base já carregada (com a descrição de cada apontamento). */
export function CalendarioSupervisor() {
  const { base } = useBase()
  const [mes, setMes] = useState(hojeISO().slice(0, 7))
  const entradas = useMemo(() => {
    if (!base) return []
    const [ini, fim] = gradeDoMes(mes)
    return base.aps.filter((a: any) => a.dia >= ini && a.dia <= fim)
  }, [base, mes])
  if (!base) return <Carregando />
  return (
    <div className="stack">
      <Cabecalho titulo="Calendário" texto="Apontamentos da equipe em cada dia, na cor de cada projetista. Passe o mouse sobre um item para ver a TPE e o que foi feito; clique nos nomes para mostrar ou ocultar projetistas." />
      <Calendario entradas={entradas} tpes={base.tpes} recursos={base.recursos} dias={base.feriadosLista ?? []} mes={mes} aoMudarMes={setMes} ausencias={base.ausencias} prazosOS={prazosDasOS(base.os)} />
    </div>
  )
}

const AVISO_MIGRACAO = 'O calendário da equipe ainda não está disponível. Peça ao Supervisor para aplicar a atualização do banco (migração 0008).'

/** Calendário do projetista: dados da equipe pela função protegida (sem custos). */
export function CalendarioProjetista() {
  const [mes, setMes] = useState(hojeISO().slice(0, 7))
  const [equipe, setEquipe] = useState<Awaited<ReturnType<typeof carregarEquipe>> | null>(null)
  const [entradas, setEntradas] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { carregarEquipe().then(setEquipe).catch((e) => setErro(faltaMigracao(e) ? AVISO_MIGRACAO : mensagemErro(e))) }, [])
  useEffect(() => {
    const [ini, fim] = gradeDoMes(mes)
    setCarregando(true)
    calendarioEquipe(ini, fim).then(setEntradas).catch((e) => setErro(faltaMigracao(e) ? AVISO_MIGRACAO : mensagemErro(e))).finally(() => setCarregando(false))
  }, [mes])
  return (
    <div className="stack">
      <Cabecalho titulo="Calendário da equipe" texto="O que cada projetista apontou em cada dia, na cor de cada um. Passe o mouse sobre um item para ver os detalhes da TPE." />
      {erro && <Aviso tipo="atencao">{erro}</Aviso>}
      {!equipe && !erro ? <Carregando /> : equipe && (
        <Calendario entradas={entradas} tpes={equipe.tpes} recursos={equipe.recursos.filter((r: any) => r.ativo !== false)} dias={equipe.dias} mes={mes} aoMudarMes={setMes} carregando={carregando} ausencias={equipe.ausencias} prazosOS={prazosDaEquipe(equipe.tpes)} />)}
    </div>
  )
}

/** Projetista: prazo final das O.S. das TPEs da equipe (vem da função protegida, sem acesso ao cadastro de O.S.). */
function prazosDaEquipe(tpes: any[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const t of tpes) if (t.os_prazo_final && t.status !== 'FINALIZADA') m.set(Number(t.os), String(t.os_prazo_final).slice(0, 10))
  return m
}
