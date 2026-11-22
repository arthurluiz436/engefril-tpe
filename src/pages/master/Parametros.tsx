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
      <div className="row" role="tablist">{([['projetistas', 'Projetistas e custo H/H'], ['jornada', 'Jornada e hora extra'], ['feriados', 'Feriados'], ['catalogo', 'Catálogo de grupos'], ['listas', 'Listas']] as [Aba, string][]).map(([k, t]) =>
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

      {aba === 'feriados' && (
        <div className="card stack">
          <div className="row"><button className="btn sec pequeno" onClick={() => { const d = prompt('Data do feriado (AAAA-MM-DD):'); const n = d && prompt('Descrição:'); if (d && n) exec(supabase.from('feriados').insert({ data: d, descricao: n }), 'Feriado incluído.') }}><Icone n="mais" /> Incluir feriado</button>
            <span className="muted small">Inclua os feriados municipais de Santa Luzia/MG. Feriado = 100% hora extra.</span></div>
          <table className="tabela"><tbody>{feriados.map((f) => <tr key={f.data}><td>{dataBR(f.data)}</td><td>{f.descricao}</td>
            <td><button className="btn fantasma pequeno" onClick={async () => { if (await confirmar('Remover feriado', `Remover ${dataBR(f.data)}? Lançamentos desse dia passam a ser calculados como dia comum.`, 'Remover', true)) exec(supabase.from('feriados').delete().eq('data', f.data), 'Removido.') }}><Icone n="lixo" /></button></td></tr>)}</tbody></table>
        </div>
      )}

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
