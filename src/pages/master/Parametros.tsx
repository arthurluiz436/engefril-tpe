import { useEffect, useState } from 'react'
import { supabase, mensagemErro } from '../../lib/supabase'
import { useBase } from '../../lib/base'
import { dataBR, hojeISO, reais } from '../../lib/formato'
import { Aviso, Cabecalho, Campo, Icone, useAvisar, useConfirmar } from '../../components/ui'

type Aba = 'projetistas' | 'jornada' | 'feriados' | 'catalogo' | 'listas'

export default function Parametros() {
  const { recarregar } = useBase()
  const avisar = useAvisar()
  const { confirmar, elemento } = useConfirmar()
  const [aba, setAba] = useState<Aba>('projetistas')
  const [recursos, setRecursos] = useState<any[]>([])
  const [custos, setCustos] = useState<any[]>([])
  const [params, setParams] = useState<any[]>([])
  const [feriados, setFeriados] = useState<any[]>([])
  const [catalogo, setCatalogo] = useState<any[]>([])
  const [depara, setDepara] = useState<any[]>([])
  const [listas, setListas] = useState<any[]>([])
  const [np, setNp] = useState<any | null>(null)

  const carregar = () => {
    supabase.from('recursos').select('*').order('id').then(({ data }) => setRecursos(data ?? []))
    supabase.from('custos_hh').select('*').order('vigente_desde', { ascending: false }).then(({ data }) => setCustos(data ?? []))
    supabase.from('parametros').select('*').order('vigente_desde', { ascending: false }).then(({ data }) => setParams(data ?? []))
    supabase.from('feriados').select('*').order('data').then(({ data }) => setFeriados(data ?? []))
    supabase.from('catalogo_grupos').select('*').order('ordem').then(({ data }) => setCatalogo(data ?? []))
    supabase.from('grupos_depara').select('*').order('principal').then(({ data }) => setDepara(data ?? []))
    supabase.from('listas').select('*').order('tipo').order('ordem').then(({ data }) => setListas(data ?? []))
  }
  useEffect(carregar, [])
  const exec = async (p: PromiseLike<{ error: any }>, ok: string) => { const { error } = await p; avisar(error ? 'erro' : 'ok', error ? mensagemErro(error) : ok); carregar(); recarregar() }

  const custoAtual = (rid: number) => custos.filter((c) => c.recurso_id === rid && c.vigente_desde <= hojeISO())[0]
  async function novoCusto(r: any) {
    const v = prompt(`Novo custo H/H de ${r.nome} (R$/h):`, custoAtual(r.id)?.valor ?? ''); if (!v) return
    const valor = Number(v.replace(',', '.')); if (!(valor > 0)) return avisar('erro', 'Valor inválido.')
    const desde = prompt('Vigente a partir de (AAAA-MM-DD). Apontamentos anteriores mantêm o custo antigo:', hojeISO()); if (!desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde)) return
    if (!(await confirmar('Novo custo H/H', <>Registrar <strong>{reais(valor)}</strong>/h para {r.nome} a partir de {dataBR(desde)}? Os custos dos apontamentos a partir dessa data serão recalculados.</>))) return
    exec(supabase.from('custos_hh').upsert({ recurso_id: r.id, valor, vigente_desde: desde }, { onConflict: 'recurso_id,vigente_desde' }), 'Custo registrado com vigência.')
  }
  const atual = params.find((p) => p.vigente_desde <= hojeISO())
  // migração da jornada flexível ainda não aplicada no banco → coluna não vem na leitura
  const semFlex = recursos.length > 0 && !('jornada_flexivel' in recursos[0])
  return (
    <div className="stack">
      {elemento}
      <Cabecalho titulo="Parâmetros" texto="Regras de cálculo herdadas da planilha VER_035. Custos e jornada são versionados por vigência: uma mudança vale a partir da data informada e preserva a interpretação dos lançamentos antigos." />
      <div className="row" role="tablist">{([['projetistas', 'Projetistas e custo H/H'], ['jornada', 'Jornada e hora extra'], ['feriados', 'Feriado / dias atípicos'], ['catalogo', 'Catálogo de grupos'], ['listas', 'Listas']] as [Aba, string][]).map(([k, t]) =>
        <button key={k} role="tab" aria-selected={aba === k} className={`btn ${aba === k ? '' : 'sec'}`} onClick={() => setAba(k)}>{t}</button>)}</div>

      {aba === 'projetistas' && (
        <div className="card">
          {semFlex && <Aviso tipo="atencao">A opção de <strong>horário flexível</strong> precisa da migração <code>20261122000006_jornada_flexivel.sql</code> aplicada no Supabase (SQL Editor). Até lá, a coluna fica desativada.</Aviso>}
          <table className="tabela"><thead><tr><th>Projetista</th><th>Início padrão da jornada</th><th title="O projetista informa, a cada dia, se começou a jornada em um dos horários permitidos">Horário flexível</th><th>Custo H/H vigente</th><th>Histórico de custos</th><th>Ativo</th><th></th></tr></thead>
          <tbody>{recursos.map((r) => (
            <tr key={r.id}><td>{r.nome}</td>
              <td><input type="time" defaultValue={String(r.inicio_padrao).slice(0, 5)} style={{ maxWidth: 120 }} onBlur={(e) => e.target.value !== String(r.inicio_padrao).slice(0, 5) && exec(supabase.from('recursos').update({ inicio_padrao: e.target.value }).eq('id', r.id), 'Início padrão atualizado.')} aria-label="Início padrão" /></td>
              <td style={{ minWidth: 210 }}>
                <label className="row small" style={{ gap: 6, fontWeight: 600 }}>
                  <input type="checkbox" style={{ width: 16, minHeight: 0 }} disabled={semFlex} checked={!!r.jornada_flexivel}
                    onChange={(e) => exec(supabase.from('recursos').update({ jornada_flexivel: e.target.checked }).eq('id', r.id), e.target.checked ? `${r.nome} passa a informar a jornada de cada dia.` : 'Horário flexível desativado.')} aria-label={`Horário flexível de ${r.nome}`} />
                  {r.jornada_flexivel ? 'Ativo' : 'Não'}
                </label>
                {r.jornada_flexivel && (
                  <input className="small" style={{ marginTop: 6, maxWidth: 180, minHeight: 32, padding: '4px 8px' }} defaultValue={(r.inicios_flexiveis ?? []).map((x: string) => String(x).slice(0, 5)).join(', ')}
                    aria-label="Horários de início permitidos" title="Horários em que a jornada pode começar, separados por vírgula"
                    onBlur={(e) => {
                      const hs = [...new Set(e.target.value.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean).map((x) => (/^\d{1,2}$/.test(x) ? `${x.padStart(2, '0')}:00` : x)))].sort()
                      if (!hs.length || hs.some((x) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x) || x < '05:00' || x > '12:00')) return avisar('erro', 'Use horários entre 05:00 e 12:00, separados por vírgula (ex.: 07:00, 08:00).')
                      if (hs.join(',') !== (r.inicios_flexiveis ?? []).map((x: string) => String(x).slice(0, 5)).join(',')) exec(supabase.from('recursos').update({ inicios_flexiveis: hs }).eq('id', r.id), 'Horários de início atualizados.')
                    }} />)}
              </td>
              <td>{custoAtual(r.id) ? reais(custoAtual(r.id).valor) : <span className="badge vermelho">sem custo</span>}</td>
              <td className="small">{custos.filter((c) => c.recurso_id === r.id).map((c) => `${reais(c.valor)} desde ${c.vigente_desde === '2000-01-01' ? 'o início' : dataBR(c.vigente_desde)}`).join(' · ')}</td>
              <td><input type="checkbox" style={{ width: 16, minHeight: 0 }} checked={r.ativo} onChange={(e) => exec(supabase.from('recursos').update({ ativo: e.target.checked }).eq('id', r.id), 'Situação atualizada.')} aria-label="Ativo" /></td>
              <td><button className="btn sec pequeno" onClick={() => novoCusto(r)}>Novo custo</button></td></tr>))}</tbody></table>
          <p className="muted small">Início padrão: hora em que a jornada começa (07:00 para a maioria; 08:00 para quem trabalha 08–18). Se houver lançamento no dia começando até o “início antecipado”, a jornada começa nele — regra da VER_035.</p>
          <p className="muted small"><strong>Horário flexível:</strong> para quem em alguns dias trabalha 07–17 e em outros 08–18. Com a opção ativa, ao registrar atividade o projetista marca em que horário começou a jornada daquele dia, e a hora extra é calculada a partir dele (seg–qui: jornada de {String(atual?.jornada_seg_qui ?? '10:00').slice(0, 5)} h; sexta: {String(atual?.jornada_sex ?? '09:00').slice(0, 5)} h, com almoço).</p></div>
      )}

      {aba === 'jornada' && atual && (
        <div className="card stack">
          <h2>Parâmetros vigentes desde {atual.vigente_desde === '2000-01-01' ? 'o início' : dataBR(atual.vigente_desde)}</h2>
          <table className="tabela"><tbody>{([
            ['Início antecipado', String(atual.inicio_antecipado).slice(0, 5)], ['Jornada seg–qui (com almoço)', atual.jornada_seg_qui], ['Jornada sexta (com almoço)', atual.jornada_sex],
            ['Almoço', `${String(atual.almoco_inicio).slice(0, 5)}–${String(atual.almoco_fim).slice(0, 5)}`], ['Adicional H.E. dia útil', `${Number(atual.adic_dia_util) * 100}%`],
            ['Adicional H.E. sábado', `${Number(atual.adic_sabado) * 100}%`], ['Adicional H.E. domingo/feriado', `${Number(atual.adic_dom_feriado) * 100}%`],
            ['Descontar feriados da capacidade', atual.descontar_feriados_capacidade ? 'Sim' : 'Não (regra da VER_035)'], ['O.S. internas', `código menor que ${atual.os_interna_limite}`],
          ] as [string, string][]).map(([a, b]) => <tr key={a}><td>{a}</td><td><strong>{b}</strong></td></tr>)}</tbody></table>
          {!np ? <button className="btn sec" onClick={() => setNp({ ...atual, vigente_desde: hojeISO(), id: undefined, criado_em: undefined })}>Criar nova vigência</button> : (
            <div className="stack">
              <Aviso tipo="atencao">A nova vigência muda o cálculo dos apontamentos a partir da data escolhida. Os anteriores continuam com as regras antigas.</Aviso>
              <div className="grid4">
                <Campo rotulo="Vigente a partir de"><input type="date" value={np.vigente_desde} onChange={(e) => setNp({ ...np, vigente_desde: e.target.value })} /></Campo>
                <Campo rotulo="Adicional dia útil (0,60 = 60%)"><input type="number" step="0.01" value={np.adic_dia_util} onChange={(e) => setNp({ ...np, adic_dia_util: e.target.value })} /></Campo>
                <Campo rotulo="Adicional sábado"><input type="number" step="0.01" value={np.adic_sabado} onChange={(e) => setNp({ ...np, adic_sabado: e.target.value })} /></Campo>
                <Campo rotulo="Adicional dom./feriado"><input type="number" step="0.01" value={np.adic_dom_feriado} onChange={(e) => setNp({ ...np, adic_dom_feriado: e.target.value })} /></Campo>
                <Campo rotulo="Almoço início"><input type="time" value={String(np.almoco_inicio).slice(0, 5)} onChange={(e) => setNp({ ...np, almoco_inicio: e.target.value })} /></Campo>
                <Campo rotulo="Almoço fim"><input type="time" value={String(np.almoco_fim).slice(0, 5)} onChange={(e) => setNp({ ...np, almoco_fim: e.target.value })} /></Campo>
                <Campo rotulo="Jornada seg–qui (hh:mm)"><input value={np.jornada_seg_qui} onChange={(e) => setNp({ ...np, jornada_seg_qui: e.target.value })} /></Campo>
                <Campo rotulo="Jornada sexta (hh:mm)"><input value={np.jornada_sex} onChange={(e) => setNp({ ...np, jornada_sex: e.target.value })} /></Campo>
              </div>
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" style={{ width: 16, minHeight: 0 }} checked={np.descontar_feriados_capacidade} onChange={(e) => setNp({ ...np, descontar_feriados_capacidade: e.target.checked })} /> Descontar feriados da capacidade</label>
              <div className="row"><button className="btn sec" onClick={() => setNp(null)}>Cancelar</button>
                <button className="btn" onClick={async () => { if (await confirmar('Nova vigência', <>Gravar parâmetros válidos a partir de {dataBR(np.vigente_desde)}?</>)) { const { id, criado_em, ...r } = np; void id; void criado_em; await exec(supabase.from('parametros').insert(r), 'Nova vigência gravada.'); setNp(null) } }}>Gravar vigência</button></div>
            </div>)}
        </div>
      )}

      {aba === 'feriados' && <DiasAtipicos feriados={feriados} atual={atual} exec={exec} confirmar={confirmar} />}

      {aba === 'catalogo' && (
        <div className="grid2">
          <div className="card stack"><div className="row" style={{ justifyContent: 'space-between' }}><h2>Principal › grupo</h2>
            <button className="btn sec pequeno" onClick={() => { const p = prompt('Principal (ex.: EQUIPAMENTO):')?.trim().toUpperCase(); const g = p && prompt('Grupo:')?.trim().toUpperCase(); if (p && g) exec(supabase.from('catalogo_grupos').insert({ principal: p, grupo: g, ordem: catalogo.length + 1 }), 'Grupo incluído.') }}><Icone n="mais" /> Novo grupo</button></div>
            <div className="rolagem" style={{ maxHeight: 520 }}><table className="tabela"><thead><tr><th>Principal</th><th>Grupo</th><th>Ativo</th></tr></thead>
              <tbody>{catalogo.map((c) => <tr key={c.id}><td>{c.principal}</td><td>{c.grupo}</td><td><input type="checkbox" style={{ width: 16, minHeight: 0 }} checked={c.ativo} onChange={(e) => exec(supabase.from('catalogo_grupos').update({ ativo: e.target.checked }).eq('id', c.id), 'Atualizado.')} aria-label="Ativo" /></td></tr>)}</tbody></table></div></div>
          <div className="card stack"><h2>De-para da importação</h2><p className="muted small" style={{ margin: 0 }}>Grafias antigas convertidas para o grupo padronizado ao importar. O texto original fica guardado em cada TPE.</p>
            <table className="tabela"><thead><tr><th>Principal</th><th>Na planilha</th><th>Padronizado</th></tr></thead><tbody>{depara.map((d) => <tr key={d.principal + d.grupo_original}><td>{d.principal}</td><td>{d.grupo_original}</td><td>{d.grupo_padronizado}</td></tr>)}</tbody></table></div>
        </div>
      )}

      {aba === 'listas' && (
        <div className="grid2">{['nivel', 'classificacao', 'vendedor', 'projeto_engefril'].map((t) => (
          <div key={t} className="card"><div className="row" style={{ justifyContent: 'space-between' }}><h3>{{ nivel: 'Nível', classificacao: 'Classificação', vendedor: 'Vendedores', projeto_engefril: 'Projeto Engefril' }[t]}</h3>
            <button className="btn sec pequeno" onClick={() => { const v = prompt('Novo valor:')?.trim().toUpperCase(); if (v) exec(supabase.from('listas').insert({ tipo: t, valor: v, ordem: listas.filter((l) => l.tipo === t).length }), 'Incluído.') }}><Icone n="mais" /></button></div>
            <div className="row" style={{ marginTop: 8 }}>{listas.filter((l) => l.tipo === t).map((l) => <span key={l.valor} className="chip">{l.valor}</span>)}</div>
            {t === 'vendedor' && <p className="muted small">Vendedores também são reconhecidos a partir das O.S. importadas.</p>}</div>))}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Feriado / dias atípicos
const TIPOS: Record<string, { rot: string; ajuda: string; pct: boolean; cor: string }> = {
  FERIADO: { rot: 'Feriado', ajuda: 'Sem expediente. Todas as horas trabalhadas são hora extra a 100%.', pct: false, cor: 'vermelho' },
  NAO_TRABALHADO: { rot: 'Dia útil não trabalhado', ajuda: 'Ponte, folga coletiva etc. Sem expediente: todas as horas trabalhadas são hora extra com o percentual informado.', pct: true, cor: 'ambar' },
  DIA_NORMAL: { rot: 'Dia normal (sem hora extra)', ajuda: 'Ex.: sábado compensado. Conta como dia útil: dentro da jornada é hora normal, sem adicional.', pct: false, cor: 'verde' },
  PERCENTUAL: { rot: 'Hora extra com % próprio', ajuda: 'Mantém a regra do dia (sábado, domingo ou dia útil), mas a hora extra usa o percentual informado.', pct: true, cor: 'azul' },
}
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const semanaDe = (d: string) => SEMANA[new Date(`${String(d).slice(0, 10)}T12:00:00Z`).getUTCDay()]

function DiasAtipicos({ feriados, atual, exec, confirmar }: {
  feriados: any[]; atual: any; exec: (p: PromiseLike<{ error: any }>, ok: string) => Promise<void>
  confirmar: (titulo: string, texto: any, ok?: string, perigo?: boolean) => Promise<boolean>
}) {
  const semTipo = feriados.length > 0 && !('tipo' in feriados[0])
  const [nf, setNf] = useState({ data: '', tipo: 'FERIADO', pct: '100', descricao: '' })
  const [ano, setAno] = useState(hojeISO().slice(0, 4))
  const t = TIPOS[nf.tipo]
  const pctNum = Number(String(nf.pct).replace(',', '.'))
  const erro = !nf.data ? 'Informe a data.' : nf.descricao.trim().length < 2 ? 'Descreva o dia.' : t.pct && !(pctNum >= 0 && pctNum <= 300) ? 'Percentual entre 0 e 300.' : null
  const anos = [...new Set([hojeISO().slice(0, 4), ...feriados.map((f) => String(f.data).slice(0, 4))])].sort().reverse()
  const lista = feriados.filter((f) => String(f.data).startsWith(ano)).sort((a, b) => String(a.data).localeCompare(String(b.data)))
  const regra = (f: any) => {
    const tipo = f.tipo ?? 'FERIADO'
    if (tipo === 'FERIADO') return `tudo hora extra a ${Math.round(Number(atual?.adic_dom_feriado ?? 1) * 100)}%`
    if (tipo === 'DIA_NORMAL') return 'horas normais na jornada, sem adicional'
    if (tipo === 'NAO_TRABALHADO') return `tudo hora extra a ${Math.round(Number(f.adicional_he) * 100)}%`
    return `hora extra do dia a ${Math.round(Number(f.adicional_he) * 100)}%`
  }
  const escolherTipo = (k: string) => setNf({ ...nf, tipo: k, pct: k === 'PERCENTUAL' && nf.pct === '100' ? '50' : k === 'NAO_TRABALHADO' && !nf.pct ? '100' : nf.pct })
  async function incluir() {
    if (erro) return
    const reg: any = { data: nf.data, descricao: nf.descricao.trim() }
    if (!semTipo) { reg.tipo = nf.tipo; reg.adicional_he = t.pct ? pctNum / 100 : null }
    const existe = feriados.some((f) => String(f.data).slice(0, 10) === nf.data)
    if (existe && !(await confirmar('Substituir dia', `Já existe um registro em ${dataBR(nf.data)}. Substituir?`))) return
    await exec(supabase.from('feriados').upsert(reg, { onConflict: 'data' }), existe ? 'Dia atualizado.' : 'Dia incluído.')
    setNf({ data: '', tipo: nf.tipo, pct: nf.pct, descricao: '' })
  }
  const dia = nf.data ? semanaDe(nf.data) : ''
  const fimDeSemana = dia === 'sáb' || dia === 'dom'
  return (
    <div className="stack">
      <div className="card stack">
        <div><h2 style={{ margin: 0 }}>Incluir feriado ou dia atípico</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Vale para o cálculo de horas normais, horas extras e custos dos apontamentos desse dia. Ao mudar um dia, os lançamentos dele são recalculados.</p></div>
        {semTipo && <Aviso tipo="atencao">Para usar dias atípicos (não trabalhado, dia normal ou percentual próprio), aplique a migração <code>20261122000008_dias_atipicos_equipe.sql</code> no Supabase. Até lá só é possível cadastrar feriados.</Aviso>}
        <div className="segmentos rolavel" role="radiogroup" aria-label="Tipo de dia">
          {Object.entries(TIPOS).map(([k, v]) => (
            <button key={k} type="button" role="radio" aria-checked={nf.tipo === k} aria-pressed={nf.tipo === k} disabled={semTipo && k !== 'FERIADO'} onClick={() => escolherTipo(k)}>{v.rot}</button>))}
        </div>
        <p className="small" style={{ margin: 0 }}>{t.ajuda}</p>
        <div className="grid4">
          <Campo rotulo="Data"><input type="date" value={nf.data} onChange={(e) => setNf({ ...nf, data: e.target.value })} /></Campo>
          <Campo rotulo="Descrição"><input value={nf.descricao} maxLength={80} placeholder={nf.tipo === 'FERIADO' ? 'Ex.: Aniversário da cidade' : nf.tipo === 'DIA_NORMAL' ? 'Ex.: Sábado compensado' : 'Ex.: Ponte do feriado'} onChange={(e) => setNf({ ...nf, descricao: e.target.value })} /></Campo>
          {t.pct && <Campo rotulo="Adicional de hora extra (%)" ajuda="Ex.: 50, 60, 75 ou 100"><input type="number" min={0} max={300} step={5} value={nf.pct} onChange={(e) => setNf({ ...nf, pct: e.target.value })} /></Campo>}
          <div style={{ alignSelf: 'end' }}><button className="btn" disabled={!!erro} onClick={incluir} title={erro ?? ''}><Icone n="mais" /> Incluir</button></div>
        </div>
        {nf.data && <p className="muted small" style={{ margin: 0 }}>{dataBR(nf.data)} é {dia}.
          {nf.tipo === 'DIA_NORMAL' && !fimDeSemana ? ' Esse dia já é dia útil; “dia normal” serve para sábado ou domingo.' : ''}
          {nf.tipo === 'NAO_TRABALHADO' && fimDeSemana ? ' Fim de semana já é sem expediente; para mudar o percentual, use “% próprio”.' : ''}</p>}
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Cadastrados</h2>
          <select value={ano} onChange={(e) => setAno(e.target.value)} style={{ maxWidth: 120 }} aria-label="Ano">{anos.map((a) => <option key={a}>{a}</option>)}</select>
        </div>
        {lista.length === 0 ? <p className="muted small">Nenhum feriado ou dia atípico em {ano}.</p> : (
          <table className="tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Regra de cálculo</th><th></th></tr></thead>
            <tbody>{lista.map((f) => { const tipo = TIPOS[f.tipo ?? 'FERIADO'] ?? TIPOS.FERIADO; return (
              <tr key={f.data}><td className="sem-quebra">{dataBR(f.data)} <span className="muted small">{semanaDe(f.data)}</span></td>
                <td><span className={`badge ${tipo.cor}`}>{tipo.rot}</span></td><td>{f.descricao}</td><td className="small">{regra(f)}</td>
                <td><button className="btn fantasma pequeno" aria-label={`Remover ${dataBR(f.data)}`} onClick={async () => { if (await confirmar('Remover dia', `Remover ${dataBR(f.data)}? Os lançamentos desse dia voltam a ser calculados como dia comum.`, 'Remover', true)) exec(supabase.from('feriados').delete().eq('data', f.data), 'Removido.') }}><Icone n="lixo" /></button></td></tr>) })}</tbody></table>)}
        <p className="muted small">Inclua também os feriados municipais. Feriado e dia útil não trabalhado ficam fora da capacidade e da contagem de dias úteis dos prazos.</p>
      </div>
    </div>
  )
}
