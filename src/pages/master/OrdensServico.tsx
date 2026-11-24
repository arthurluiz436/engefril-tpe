import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useBase } from '../../lib/base'
import { supabase, mensagemErro } from '../../lib/supabase'
import { linhasDe } from '../../lib/conjuntos'
import { dataBR, diasEntre, h1, hojeISO, osBR, reais0 } from '../../lib/formato'
import { Aviso, Cabecalho, Campo, Carregando, Dialogo, Icone, Selo, SeloPrazo, useAvisar, useConfirmar } from '../../components/ui'

/** Parecer da O.S. finalizada: no prazo, antes do prazo (N dias) ou atrasada (N dias). */
export function parecerOS(o: any): { rot: string; cor: string; dias: number } | null {
  if (o.status !== 'FINALIZADA') return null
  if (!o.data_finalizacao) return { rot: 'Finalizada (sem data)', cor: '', dias: 0 }
  if (!o.prazo_final) return { rot: 'Finalizada (sem prazo)', cor: '', dias: 0 }
  const d = diasEntre(String(o.prazo_final).slice(0, 10), String(o.data_finalizacao).slice(0, 10))
  if (d === 0) return { rot: 'Finalizada no prazo', cor: 'verde', dias: 0 }
  if (d < 0) return { rot: `Antes do prazo · ${-d} ${d === -1 ? 'dia' : 'dias'}`, cor: 'azul', dias: d }
  return { rot: `Finalizada atrasada · ${d} ${d === 1 ? 'dia' : 'dias'}`, cor: 'vermelho', dias: d }
}

type Filtro = 'abertas' | 'atrasadas' | 'aptas' | 'finalizadas' | 'todas'

export default function OrdensServico() {
  const { base, recarregar } = useBase()
  const avisar = useAvisar()
  const { confirmar, elemento } = useConfirmar()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('abertas')
  const [ed, setEd] = useState<any | null>(null)
  const [fin, setFin] = useState<{ o: any; data: string } | null>(null)
  const [listas, setListas] = useState<Record<string, string[]>>({})
  useEffect(() => {
    supabase.from('listas').select('*').eq('ativo', true).order('ordem').then(({ data }) => {
      const m: Record<string, string[]> = {}; for (const l of data ?? []) (m[l.tipo] ??= []).push(l.valor); setListas(m)
    })
  }, [])
  const vendedores = useMemo(() => [...new Set([...(listas.vendedor ?? []), ...(base?.os ?? []).map((o: any) => o.vendedor).filter(Boolean)])].sort(), [listas, base])
  // a coluna data_finalizacao só existe depois da migração 0009
  const temFin = !!base?.os.length && 'data_finalizacao' in base.os[0]
  const hoje = hojeISO()
  const atrasada = (o: any) => o.status !== 'FINALIZADA' && !!o.prazo_final && String(o.prazo_final).slice(0, 10) < hoje
  /** O.S. em aberto com TPEs e nenhuma pendente ou em andamento: pode ser finalizada */
  const apta = (o: any) => o.status !== 'FINALIZADA' && Number(o.qtd_tpes) > 0 && Number(o.tpes_abertas) === 0
  // primeiro e último apontamento de cada O.S.
  const { primeiroAp, ultimoAp } = useMemo(() => {
    const ini = new Map<number, string>(), fim = new Map<number, string>()
    for (const a of base?.aps ?? []) {
      const d = String(a.dia).slice(0, 10); const o = Number(a.os)
      if (!ini.has(o) || d < ini.get(o)!) ini.set(o, d)
      if (!fim.has(o) || d > fim.get(o)!) fim.set(o, d)
    }
    return { primeiroAp: ini, ultimoAp: fim }
  }, [base])
  // filtros por coluna e ordenação (clique no título: menor → maior, de novo: maior → menor)
  const [fCliente, setFCliente] = useState('')
  const [fNivel, setFNivel] = useState('')
  const [fVendedor, setFVendedor] = useState('')
  const [ord, setOrd] = useState<{ k: string; dir: 1 | -1 } | null>(null)
  const VALOR: Record<string, (o: any) => any> = {
    os: (o) => o.os, cliente: (o) => String(o.nome ?? '').toLowerCase(), nivel: (o) => String(o.nivel ?? '').toLowerCase() || null,
    vendedor: (o) => String(o.vendedor ?? '').toLowerCase() || null, inicio: (o) => o.data_inicio ? String(o.data_inicio).slice(0, 10) : null,
    prazo: (o) => o.prazo_final ? String(o.prazo_final).slice(0, 10) : null, status: (o) => o.status, fin: (o) => o.data_finalizacao ? String(o.data_finalizacao).slice(0, 10) : null,
    tpes: (o) => Number(o.qtd_tpes), datas: (o) => ultimoAp.get(o.os) ?? null, horas: (o) => Number(o.horas), custo: (o) => Number(o.custo),
  }
  const Th = ({ k, children, num, title }: { k: string; children: ReactNode; num?: boolean; title?: string }) => {
    const ativo = ord?.k === k
    return (
      <th className={num ? 'num' : ''} title={title} aria-sort={ativo ? (ord!.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`th-ordem ${ativo ? 'ativo' : ''}`} onClick={() => setOrd({ k, dir: ativo && ord!.dir === 1 ? -1 : 1 })}>
          {children}<span className="seta-ordem" aria-hidden="true">{ativo ? (ord!.dir === 1 ? '▲' : '▼') : '↕'}</span>
        </button>
      </th>)
  }
  const { linhas, contagem, resumoFin } = useMemo(() => {
    const vazio = { linhas: [], contagem: { abertas: 0, atrasadas: 0, aptas: 0, finalizadas: 0, todas: 0 }, resumoFin: { prazo: 0, antes: 0, atrasada: 0 } }
    if (!base) return vazio
    const b = busca.toLowerCase()
    const todas = linhasDe('os', base).filter((o: any) => o.arquivada !== 'SIM' && (!b || `${o.os} ${osBR(o.os)} ${o.nome} ${o.cidade} ${o.vendedor}`.toLowerCase().includes(b))
      && (!fCliente || o.nome === fCliente) && (!fNivel || (o.nivel ?? '') === fNivel) && (!fVendedor || (o.vendedor ?? '') === fVendedor))
    const contagem = { abertas: todas.filter((o: any) => o.status !== 'FINALIZADA').length, atrasadas: todas.filter(atrasada).length, aptas: todas.filter(apta).length,
      finalizadas: todas.filter((o: any) => o.status === 'FINALIZADA').length, todas: todas.length }
    const resumoFin = { prazo: 0, antes: 0, atrasada: 0 }
    for (const o of todas) { const p = parecerOS(o); if (p?.cor === 'verde') resumoFin.prazo++; else if (p?.cor === 'azul') resumoFin.antes++; else if (p?.cor === 'vermelho') resumoFin.atrasada++ }
    const linhas = todas
      .filter((o: any) => filtro === 'todas' || (filtro === 'finalizadas' ? o.status === 'FINALIZADA' : filtro === 'atrasadas' ? atrasada(o) : filtro === 'aptas' ? apta(o) : o.status !== 'FINALIZADA'))
      // atrasadas primeiro (a mais vencida no topo), depois pela O.S. mais recente
      .sort((a: any, z: any) => {
        if (ord) {
          const va = VALOR[ord.k](a), vz = VALOR[ord.k](z)
          if (va == null || vz == null) return va == null && vz == null ? 0 : va == null ? 1 : -1 // vazios no fim
          return (va < vz ? -1 : va > vz ? 1 : 0) * ord.dir || z.os - a.os
        }
        return Number(atrasada(z)) - Number(atrasada(a)) || (atrasada(a) ? String(a.prazo_final).localeCompare(String(z.prazo_final)) : 0) || z.os - a.os
      })
    return { linhas, contagem, resumoFin }
  }, [base, busca, filtro, fCliente, fNivel, fVendedor, ord, ultimoAp]) // eslint-disable-line react-hooks/exhaustive-deps
  const opcoes = useMemo(() => {
    const os = (base?.os ?? []).filter((o: any) => !o.arquivada)
    const uniq = (f: (o: any) => any) => [...new Set(os.map(f).filter(Boolean))].sort() as string[]
    return { clientes: uniq((o) => o.nome), niveis: uniq((o) => o.nivel), vendedores: uniq((o) => o.vendedor) }
  }, [base])

  const erros = ed ? {
    os: !ed.os || Number(ed.os) < 0 ? 'Informe o número.' : ed.novo && base?.os.some((o: any) => o.os === Number(ed.os)) ? 'O.S. já cadastrada.' : null,
    nome: !ed.nome?.trim() ? 'Obrigatório.' : null,
    prazo: ed.prazo_final && ed.data_inicio && ed.prazo_final < ed.data_inicio ? 'Antes do início.' : null,
    fim: temFin && ed.status === 'FINALIZADA' && !ed.data_finalizacao ? 'Informe a data de finalização.' : null,
  } : {}
  async function salvar() {
    const reg: any = { nome: ed.nome.trim().toUpperCase(), uf: ed.uf || null, cidade: ed.cidade?.trim().toUpperCase() || null, projeto_engefril: ed.projeto_engefril || null,
      nivel: ed.nivel || null, vendedor: ed.vendedor?.trim().toUpperCase() || null, classificacao: ed.classificacao || null,
      data_inicio: ed.data_inicio || null, prazo_final: ed.prazo_final || null, status: ed.status }
    if (temFin) reg.data_finalizacao = ed.status === 'FINALIZADA' ? ed.data_finalizacao || null : null
    const { error } = ed.novo ? await supabase.from('ordens_servico').insert({ os: Number(ed.os), ...reg }) : await supabase.from('ordens_servico').update(reg).eq('os', ed.os)
    if (error) return avisar('erro', mensagemErro(error))
    avisar('ok', `O.S. ${osBR(ed.os)} salva.`); setEd(null); recarregar()
  }
  const abertasDe = (o: any) => base!.tpes.filter((t: any) => t.os === o.os && t.status !== 'FINALIZADA' && !t.arquivada)
  const erroFin = fin && (!fin.data ? 'Informe a data.' : fin.data > hoje ? 'A data não pode ser futura.' : fin.o.data_inicio && fin.data < String(fin.o.data_inicio).slice(0, 10) ? 'Anterior ao início da O.S.' : null)
  async function finalizar() {
    if (!fin || erroFin) return
    const { error } = await supabase.from('ordens_servico').update({ status: 'FINALIZADA', ...(temFin ? { data_finalizacao: fin.data } : {}) }).eq('os', fin.o.os)
    if (error) return avisar('erro', mensagemErro(error))
    avisar('ok', `O.S. ${osBR(fin.o.os)} finalizada em ${dataBR(fin.data)}.`); setFin(null); recarregar()
  }
  async function reabrir(o: any) {
    if (!(await confirmar('Reabrir O.S.', <>Reabrir a O.S. <strong>{osBR(o.os)}</strong>? Ela volta para “em andamento” e pode receber novas TPEs. {o.data_finalizacao ? <>A data de finalização ({dataBR(o.data_finalizacao)}) será apagada.</> : null}</>, 'Reabrir'))) return
    const { error } = await supabase.from('ordens_servico').update({ status: 'EM ANDAMENTO', ...(temFin ? { data_finalizacao: null } : {}) }).eq('os', o.os)
    avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : `O.S. ${osBR(o.os)} reaberta.`); recarregar()
  }
  async function arquivar(o: any) {
    if (!(await confirmar('Arquivar O.S.', <>Arquivar a O.S. <strong>{osBR(o.os)}</strong>? Ela some das listas, mas continua na base e nos indicadores.</>, 'Arquivar'))) return
    const { error } = await supabase.from('ordens_servico').update({ arquivada: true }).eq('os', o.os)
    avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : 'O.S. arquivada.'); recarregar()
  }
  async function apagar(o: any) {
    // conferência rápida antes de pedir confirmação (o banco confere de novo)
    const vinculadas = base!.tpes.filter((t: any) => t.os === o.os)
    if (vinculadas.length) {
      return avisar('erro', `A O.S. ${osBR(o.os)} não pode ser apagada porque tem ${vinculadas.length} TPE(s) vinculada(s): ${vinculadas.slice(0, 6).map((t: any) => t.codigo).join(', ')}${vinculadas.length > 6 ? '…' : ''}. Apague as TPEs ou mude a O.S. delas primeiro.`)
    }
    if (!(await confirmar('Apagar O.S.', <>Apagar definitivamente a O.S. <strong>{osBR(o.os)}</strong> ({o.nome})? Use para cadastros feitos por engano. Esta ação não pode ser desfeita.</>, 'Apagar', true))) return
    const { error } = await supabase.rpc('excluir_os', { p_os: o.os })
    if (error) return avisar('erro', /excluir_os/.test(error.message) && /function|schema cache/i.test(error.message) ? 'Para apagar O.S., aplique a migração 20261122000009 no Supabase.' : mensagemErro(error))
    avisar('ok', `O.S. ${osBR(o.os)} apagada.`); recarregar()
  }
  if (!base) return <Carregando />
  const sel = (k: string, ops: string[]) => <select value={ed[k] ?? ''} onChange={(e) => setEd({ ...ed, [k]: e.target.value })}><option value="">—</option>{ops.map((x) => <option key={x}>{x}</option>)}</select>
  return (
    <div className="stack">
      {elemento}
      <Cabecalho titulo="Clientes e O.S." texto="Cada O.S. é cadastrada uma vez; as TPEs herdam cliente, local, nível, vendedor e classificação daqui. O.S. finalizada não recebe TPE nova: reabra se precisar."
        acoes={<button className="btn" onClick={() => setEd({ novo: true, os: '', nome: '', status: 'EM ANDAMENTO', data_inicio: hojeISO() })}><Icone n="mais" /> Nova O.S.</button>} />
      <div className="row nao-imprimir">
        <input type="search" placeholder="Buscar O.S., cliente, cidade, vendedor…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 380 }} aria-label="Buscar" />
        <select value={fCliente} onChange={(e) => setFCliente(e.target.value)} aria-label="Cliente" style={{ maxWidth: 220 }}><option value="">Todos os clientes</option>{opcoes.clientes.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fNivel} onChange={(e) => setFNivel(e.target.value)} aria-label="Nível" style={{ maxWidth: 160 }}><option value="">Todos os níveis</option>{opcoes.niveis.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={fVendedor} onChange={(e) => setFVendedor(e.target.value)} aria-label="Vendedor" style={{ maxWidth: 180 }}><option value="">Todos os vendedores</option>{opcoes.vendedores.map((x) => <option key={x}>{x}</option>)}</select>
        {(fCliente || fNivel || fVendedor || ord) && <a href="#" className="small" onClick={(e) => { e.preventDefault(); setFCliente(''); setFNivel(''); setFVendedor(''); setOrd(null) }}>Limpar filtros e ordem</a>}
      </div>
      <div className="row nao-imprimir">
        <div className="segmentos" role="group" aria-label="Filtrar O.S.">
          {([['abertas', 'Em aberto'], ['atrasadas', 'Atrasadas'], ['aptas', 'Prontas p/ finalizar'], ['finalizadas', 'Finalizadas'], ['todas', 'Todas']] as const).map(([k, r]) => (
            <button key={k} type="button" aria-pressed={filtro === k} className={k === 'atrasadas' && contagem.atrasadas ? 'tem-atraso' : k === 'aptas' && contagem.aptas ? 'tem-apta' : ''} onClick={() => setFiltro(k)}>
              {r} <span className="contador">{contagem[k]}</span></button>))}
        </div>
      </div>
      {contagem.atrasadas > 0 && filtro !== 'atrasadas' && filtro !== 'finalizadas' && (
        <div className="faixa-atraso" role="status">
          <span className="badge atraso"><span className="ponto" aria-hidden="true" />{contagem.atrasadas} O.S. com prazo final vencido</span>
          <span className="small muted">Elas aparecem primeiro na lista, com a faixa vermelha à esquerda.</span>
          <button type="button" className="btn sec pequeno" onClick={() => setFiltro('atrasadas')}>Ver só as atrasadas</button>
        </div>)}
      {contagem.aptas > 0 && filtro !== 'aptas' && filtro !== 'finalizadas' && (
        <div className="faixa-apta" role="status">
          <span className="badge verde"><Icone n="check" t={14} /> {contagem.aptas} O.S. sem TPE em aberto</span>
          <span className="small muted">Todas as TPEs delas já foram finalizadas: estão prontas para finalizar (marcadas em verde ao lado do botão).</span>
          <button type="button" className="btn sec pequeno" onClick={() => setFiltro('aptas')}>Ver só as prontas</button>
        </div>)}
      {filtro === 'finalizadas' && contagem.finalizadas > 0 && (
        <div className="row small" role="status" style={{ gap: 8 }}>
          <span className="muted">Entregas:</span>
          <span className="badge verde">{resumoFin.prazo} no prazo</span><span className="badge azul">{resumoFin.antes} antes do prazo</span><span className="badge vermelho">{resumoFin.atrasada} atrasadas</span>
        </div>)}
      <div className="rolagem"><table className="tabela"><thead><tr><Th k="os">O.S.</Th><Th k="cliente">Cliente · local</Th><Th k="nivel">Nível · classificação</Th><Th k="vendedor">Vendedor</Th><Th k="inicio" title="Data de início informada no cadastro da O.S.">Início</Th><Th k="prazo">Prazo final</Th><Th k="status">Status</Th><Th k="fin">Finalização</Th><Th k="tpes" num>TPEs (abertas)</Th><Th k="datas" title="Do primeiro ao último apontamento em TPEs da O.S. (ordena pelo último)">Datas apontadas</Th><Th k="horas" num>Horas</Th><Th k="custo" num>Custo</Th><th></th></tr></thead>
        <tbody>{linhas.length === 0 && <tr><td colSpan={13} className="vazio">Nenhuma O.S. {({ abertas: 'em aberto', atrasadas: 'atrasada', aptas: 'pronta para finalizar', finalizadas: 'finalizada', todas: '' } as Record<string, string>)[filtro]} {busca ? 'para esta busca' : ''}.</td></tr>}
          {linhas.map((o: any) => {
            const p = parecerOS(o)
            return (
              <tr key={o.os} className={atrasada(o) ? 'linha-atraso' : ''}>
                <td className="sem-quebra"><Link to={`/master/os-indicadores?os=${o.os}`} title="Ver os indicadores desta O.S."><strong>{osBR(o.os)}</strong></Link>{o.tipo === 'INTERNA' && <div><span className="badge">interna</span></div>}</td>
                <td>{o.nome}<div className="small muted">{o.cidade}{o.uf ? `/${o.uf}` : ''}</div></td>
                <td className="small">{o.nivel}{o.classificacao && <div className="muted">{o.classificacao}</div>}</td>
                <td className="small">{o.vendedor}</td>
                <td className="sem-quebra">{o.data_inicio ? dataBR(o.data_inicio) : <span className="muted">—</span>}</td>
                <td className="sem-quebra">{dataBR(o.prazo_final)}{o.status !== 'FINALIZADA' && o.prazo_final && <div><SeloPrazo prazo={o.prazo_final} status={o.status} /></div>}</td>
                <td><Selo v={o.status} /></td>
                <td className="sem-quebra">{p ? <>{o.data_finalizacao ? dataBR(o.data_finalizacao) : '—'}<div><span className={`badge ${p.cor}`}>{p.rot}</span></div></> : <span className="muted">—</span>}</td>
                <td className="num">{o.qtd_tpes} ({o.tpes_abertas})</td>
                <td className="sem-quebra small">{ultimoAp.get(o.os) ? <>{dataBR(primeiroAp.get(o.os))} – {dataBR(ultimoAp.get(o.os))}<div className="muted">último {diasEntre(ultimoAp.get(o.os)!, hoje) === 0 ? 'hoje' : `há ${diasEntre(ultimoAp.get(o.os)!, hoje)} dia(s)`}</div></> : <span className="muted">—</span>}</td>
                <td className="num">{h1(o.horas)}</td><td className="num">{reais0(o.custo)}</td>
                <td className="nao-imprimir"><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <button className="btn sec pequeno" onClick={() => setEd({ ...o, data_inicio: o.data_inicio ?? '', prazo_final: o.prazo_final ?? '', data_finalizacao: o.data_finalizacao ?? '' })}>Editar</button>
                  {o.status !== 'FINALIZADA'
                    ? <button className={`btn pequeno btn-finalizar ${apta(o) ? 'pronta' : ''}`} onClick={() => setFin({ o, data: hoje })} title={apta(o) ? 'Todas as TPEs desta O.S. estão finalizadas' : undefined}><Icone n="check" /> Finalizar</button>
                    : <button className="btn sec pequeno" onClick={() => reabrir(o)} title="Volta para em andamento">Reabrir</button>}
                  <button className="btn fantasma pequeno" onClick={() => arquivar(o)} title="Arquivar (não exclui)" aria-label={`Arquivar ${osBR(o.os)}`}><Icone n="arquivo" /></button>
                  <button className="btn fantasma pequeno btn-apagar" onClick={() => apagar(o)} title="Apagar (cadastro errado)" aria-label={`Apagar ${osBR(o.os)}`}><Icone n="lixo" /></button>
                  {apta(o) && <span className="selo-apta" title="Nenhuma TPE pendente ou em andamento: a O.S. pode ser finalizada"><Icone n="check" t={13} /> Pronta para finalizar</span>}
                </div></td>
              </tr>)
          })}</tbody></table></div>
      <Dialogo titulo={`Finalizar O.S. ${fin ? osBR(fin.o.os) : ''}`} aberto={!!fin} aoFechar={() => setFin(null)}>
        {fin && (
          <div className="stack">
            <p style={{ margin: 0 }}><strong>{osBR(fin.o.os)}</strong> · {fin.o.nome}<br /><span className="small muted">Prazo final: {dataBR(fin.o.prazo_final)}</span></p>
            <Campo rotulo="Data de finalização no projeto" erro={erroFin}><input type="date" value={fin.data} max={hoje} onChange={(e) => setFin({ ...fin, data: e.target.value })} /></Campo>
            {!erroFin && (() => { const p = parecerOS({ ...fin.o, status: 'FINALIZADA', data_finalizacao: fin.data }); return p && <div><span className={`badge ${p.cor}`}>{p.rot}</span></div> })()}
            {abertasDe(fin.o).length > 0 && <Aviso tipo="atencao">Esta O.S. tem <strong>{abertasDe(fin.o).length}</strong> TPE(s) em aberto ({abertasDe(fin.o).slice(0, 6).map((t: any) => t.codigo).join(', ')}), que continuarão abertas. Finalize-as em TPEs e tarefas.</Aviso>}
            {!temFin && <Aviso tipo="info">Para guardar a data e o parecer (no prazo, antes ou atrasada), aplique a migração 20261122000009 no Supabase.</Aviso>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn sec" onClick={() => setFin(null)}>Cancelar</button>
              <button className="btn btn-finalizar" disabled={!!erroFin} onClick={finalizar}><Icone n="check" /> Finalizar O.S.</button>
            </div>
          </div>)}
      </Dialogo>
      <Dialogo titulo={ed?.novo ? 'Nova O.S.' : `O.S. ${osBR(ed?.os)}`} aberto={!!ed} aoFechar={() => setEd(null)} largo>
        {ed && (
          <div className="stack">
            <div className="grid4">
              <Campo rotulo="O.S." ajuda="6 dígitos (ex.: 061922)" erro={erros.os}><input inputMode="numeric" maxLength={6} placeholder="000000" value={ed.novo ? ed.os : osBR(ed.os)} readOnly={!ed.novo} onChange={(e) => setEd({ ...ed, os: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></Campo>
              <Campo rotulo="Cliente" erro={erros.nome}><input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} /></Campo>
              <Campo rotulo="UF">{sel('uf', listas.uf ?? [])}</Campo>
              <Campo rotulo="Cidade"><input value={ed.cidade ?? ''} onChange={(e) => setEd({ ...ed, cidade: e.target.value })} /></Campo>
              <Campo rotulo="Projeto Engefril">{sel('projeto_engefril', listas.projeto_engefril ?? [])}</Campo>
              <Campo rotulo="Nível">{sel('nivel', listas.nivel ?? [])}</Campo>
              <Campo rotulo="Vendedor"><input list="vendedores" value={ed.vendedor ?? ''} onChange={(e) => setEd({ ...ed, vendedor: e.target.value })} /><datalist id="vendedores">{vendedores.map((v) => <option key={v} value={v} />)}</datalist></Campo>
              <Campo rotulo="Classificação">{sel('classificacao', listas.classificacao ?? [])}</Campo>
              <Campo rotulo="Data de início"><input type="date" value={ed.data_inicio ?? ''} onChange={(e) => setEd({ ...ed, data_inicio: e.target.value })} /></Campo>
              <Campo rotulo="Prazo final" erro={erros.prazo}><input type="date" value={ed.prazo_final ?? ''} onChange={(e) => setEd({ ...ed, prazo_final: e.target.value })} /></Campo>
              <Campo rotulo="Status"><select value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value, data_finalizacao: e.target.value === 'FINALIZADA' ? ed.data_finalizacao || hoje : '' })}><option>EM ANDAMENTO</option><option>FINALIZADA</option></select></Campo>
              {temFin && ed.status === 'FINALIZADA' && <Campo rotulo="Data de finalização" erro={erros.fim}><input type="date" value={ed.data_finalizacao ?? ''} max={hoje} onChange={(e) => setEd({ ...ed, data_finalizacao: e.target.value })} /></Campo>}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sec" onClick={() => setEd(null)}>Cancelar</button>
              <button className="btn" disabled={Object.values(erros).some(Boolean)} onClick={salvar}>Salvar</button></div>
          </div>
        )}
      </Dialogo>
    </div>
  )
}
