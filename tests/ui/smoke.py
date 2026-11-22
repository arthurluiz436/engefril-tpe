"""Teste visual (smoke) das telas com back-end SIMULADO e dados 100% fictícios.
Não testa segurança (isso é feito em tests/db); verifica renderização, navegação e ausência de erros de JS."""
import json, base64, time, random, datetime as dt, sys, re
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

random.seed(7)
REC = [{'id': 1, 'nome': 'Ana Demo', 'inicio_padrao': '07:00:00', 'ativo': True}, {'id': 2, 'nome': 'Bruno Demo', 'inicio_padrao': '08:00:00', 'ativo': True}, {'id': 3, 'nome': 'Carla Demo', 'inicio_padrao': '07:00:00', 'ativo': True}]
CUSTO = {1: 50.0, 2: 62.0, 3: 45.0}
OS = [{'os': 7000 + i, 'nome': n, 'uf': 'MG', 'cidade': 'CIDADE DEMO', 'nivel': random.choice(['GRANDE', 'MÉDIO', 'PEQUENO']), 'vendedor': random.choice(['VENDEDOR A', 'VENDEDOR B']),
       'classificacao': random.choice(['EQUIPAMENTO', 'PROJETO COMPLETO']), 'projeto_engefril': 'SIM', 'data_inicio': '2026-08-01', 'prazo_final': '2026-12-15', 'status': 'EM ANDAMENTO', 'arquivada': False}
      for i, n in enumerate(['FRIGORÍFICO EXEMPLO', 'LATICÍNIO MODELO', 'PESCADOS FICTÍCIOS', 'AGRO DEMONSTRAÇÃO', 'CÂMARAS TESTE', 'SORVETES DEMO'])] + [{'os': 1, 'nome': 'ENGENHARIA (INTERNA)', 'status': 'EM ANDAMENTO', 'arquivada': False, 'uf': None, 'cidade': None, 'nivel': 'ND', 'vendedor': 'ND', 'classificacao': 'ND', 'prazo_final': None, 'data_inicio': None, 'projeto_engefril': 'ND'}]
GR = [('EQUIPAMENTO', 'VASO DE PRESSÃO'), ('EQUIPAMENTO', 'QUADRO DE VÁLVULAS'), ('EXECUTIVO', 'PLANO DE CARGA'), ('TUBULAÇÃO', 'TRAÇADO SALA DE MÁQUINA'), ('ISOLAMENTO', 'PORTA FRIGORIFICA'), ('ELETRICA', 'PROJETO PAINEL ELETRICO')]
hoje = dt.date(2026, 11, 21)
TPES, APS = [], []
seq = 0
for i in range(1, 23):
    p, g = random.choice(GR); o = random.choice(OS[:6])['os']; r = (i % 3) + 1
    st = 'FINALIZADA' if i < 12 else random.choice(['EM ANDAMENTO', 'NÃO INICIADA', 'EM ANDAMENTO'])
    ini = hoje - dt.timedelta(days=60 - i * 2)
    t = {'id': i, 'codigo': f'TPE-{i:03d}.0', 'numero': i, 'revisao': 0, 'os': o, 'principal': p, 'grupo': g, 'grupo_original': g, 'descricao': f'ELABORAÇÃO DO DESENHO DEMO {i}',
         'status': st, 'data_inicio': ini.isoformat(), 'data_fim': (ini + dt.timedelta(days=3)).isoformat() if st == 'FINALIZADA' else None,
         'prazo': (hoje + dt.timedelta(days=i - 15)).isoformat() if st != 'FINALIZADA' else None, 'instrucoes': 'Seguir a revisão B do cliente.' if i == 14 else None, 'arquivada': False,
         'responsavel_id': None if i == 20 else r, 'responsavel': None if i == 20 else REC[r - 1]['nome'], 'sequencia': i * 10}
    oo = next(x for x in OS if x['os'] == o)
    t.update({'cliente': oo['nome'], 'uf': oo['uf'], 'cidade': oo['cidade'], 'nivel': oo['nivel'], 'vendedor': oo['vendedor'], 'classificacao': oo['classificacao'], 'projeto_engefril': 'SIM'})
    hs = he = cu = 0; n = 0
    for k in range(random.randint(1, 6) if st != 'NÃO INICIADA' else 0):
        seq += 1; d = ini + dt.timedelta(days=k)
        if d.weekday() >= 5: d += dt.timedelta(days=2)
        a, b = random.choice([('07:00', '12:00'), ('13:00', '17:00'), ('07:00', '17:00'), ('13:00', '18:30')])
        dur = (int(b[:2]) * 60 + int(b[3:]) - int(a[:2]) * 60 - int(a[3:])) / 60 - (1 if a < '12:00' and b > '13:00' else 0)
        x = 1.5 if b == '18:30' else 0; nn = dur - x
        c = nn * CUSTO[r] + x * CUSTO[r] * 1.6
        APS.append({'id': seq, 'seq': seq, 'tpe_id': i, 'tpe_codigo': t['codigo'], 'os': o, 'principal': p, 'grupo': g, 'tpe_descricao': t['descricao'], 'recurso_id': r, 'recurso_nome': REC[r - 1]['nome'],
                    'dia': d.isoformat(), 'hora_inicio': a + ':00', 'hora_fim': b + ':00', 'descricao': 'Atividade demonstrativa', 'tipo_dia': 'DIA ÚTIL', 'adicional': 0.6, 'horas_normais': nn, 'horas_extras': x,
                    'horas_totais': nn + x, 'custo_hh': CUSTO[r], 'custo_normal': nn * CUSTO[r], 'custo_he': x * CUSTO[r] * 1.6, 'custo_total': c, 'mes': d.replace(day=1).isoformat(), 'origem': 'app', 'criado_em': '2026-11-20T12:00:00Z'})
        hs += nn; he += x; cu += c; n += 1
    t.update({'horas_normais': hs, 'horas_extras': he, 'horas_totais': hs + he, 'custo_total': cu, 'qtd_apontamentos': n})
    TPES.append(t)
PARAM = {'id': 1, 'vigente_desde': '2000-01-01', 'inicio_antecipado': '07:00:00', 'jornada_seg_qui': '10:00:00', 'jornada_sex': '09:00:00', 'almoco_inicio': '12:00:00', 'almoco_fim': '13:00:00',
         'adic_dia_util': 0.6, 'adic_sabado': 0.75, 'adic_dom_feriado': 1, 'descontar_feriados_capacidade': False, 'os_interna_limite': 1000}
MINHAS = [{'tpe_id': t['id'], 'codigo': t['codigo'], 'os': t['os'], 'cliente': t['cliente'], 'cidade': t['cidade'], 'uf': t['uf'], 'principal': t['principal'], 'grupo': t['grupo'], 'descricao': t['descricao'],
           'instrucoes': t['instrucoes'], 'status': t['status'], 'sequencia': t['sequencia'], 'prazo': t['prazo'], 'data_inicio': t['data_inicio'], 'horas_apontadas': t['horas_totais'], 'ultimo_apontamento': None}
          for t in TPES if t['responsavel_id'] == 2]
DADOS = {'recursos': REC, 'ordens_servico': OS, 'v_tpes': TPES, 'tpes': TPES, 'v_apontamentos': APS, 'feriados': [{'data': '2026-11-20', 'descricao': 'Consciência Negra'}],
         'visualizacoes': [], 'catalogo_grupos': [{'id': i, 'principal': p, 'grupo': g, 'ativo': True, 'ordem': i} for i, (p, g) in enumerate(GR)],
         'listas': [{'tipo': 'nivel', 'valor': v, 'ordem': i, 'ativo': True} for i, v in enumerate(['GRANDE', 'MÉDIO', 'PEQUENO'])], 'import_lotes': [], 'backups_registro': [], 'reconciliacao': [],
         'custos_hh': [{'id': k, 'recurso_id': k, 'valor': v, 'vigente_desde': '2000-01-01'} for k, v in CUSTO.items()], 'parametros': [PARAM], 'grupos_depara': [], 'auditoria': [], 'import_mapas': []}

def jwt(sub, papel='authenticated'):
    b = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
    return f"{b({'alg': 'HS256', 'typ': 'JWT'})}.{b({'sub': sub, 'role': papel, 'exp': int(time.time()) + 3600})}.assinatura"

def rodar(papel, recurso, saida, rotas, movel=False):
    uid = '00000000-0000-4000-8000-00000000000' + ('1' if papel == 'master' else '2')
    perfil = {'user_id': uid, 'nome': 'Usuário Demo', 'email': 'demo@exemplo.test', 'papel': papel, 'recurso_id': recurso, 'ativo': True, 'recursos': {'nome': REC[recurso - 1]['nome']} if recurso else None}
    sess = {'access_token': jwt(uid), 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'refresh_token': 'r',
            'user': {'id': uid, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'demo@exemplo.test', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}}
    erros = []
    with sync_playwright() as p:
        nav = p.chromium.launch(channel='chrome', args=['--no-sandbox'])
        ctx = nav.new_context(viewport={'width': 390, 'height': 844} if movel else {'width': 1440, 'height': 900}, locale='pt-BR', timezone_id='America/Sao_Paulo')
        ctx.add_init_script(f"localStorage.setItem('sb-demo-auth-token', JSON.stringify({json.dumps(sess)}));")
        def responder(route):
            u = urlparse(route.request.url); h = route.request.headers
            if '/auth/v1/user' in u.path: return route.fulfill(json=sess['user'])
            if '/auth/v1/' in u.path: return route.fulfill(json={})
            nome = u.path.split('/rest/v1/')[-1]
            if nome == 'profiles': corpo = [perfil]
            elif nome == 'rpc/minhas_tarefas': corpo = MINHAS
            elif nome == 'rpc/parametros_vigentes': return route.fulfill(json=PARAM)
            else: corpo = DADOS.get(nome, [])
            q = parse_qs(u.query)
            if nome == 'v_apontamentos' and papel != 'master': corpo = [a for a in corpo if a['recurso_id'] == recurso]
            if 'vnd.pgrst.object' in h.get('accept', ''): return route.fulfill(json=corpo[0] if corpo else None)
            route.fulfill(json=corpo, headers={'content-range': f'0-{max(0, len(corpo) - 1)}/{len(corpo)}'})
        ctx.route(re.compile(r'https://demo\.supabase\.co/.*'), responder)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
        for nome, rota in rotas:
            pg.goto(f'http://localhost:4173/#{rota}'); pg.wait_for_timeout(1500)
            pg.screenshot(path=f'{saida}/{nome}.png', full_page=True)
        nav.close()
    return erros

if __name__ == '__main__':
    out = sys.argv[1]
    e1 = rodar('projetista', 2, out, [('p1_inicio', '/'), ('p2_tarefas', '/minhas-tarefas'), ('p3_registrar', f'/registrar?tpe={MINHAS[-1]["tpe_id"]}'), ('p4_meus', '/meus-apontamentos')])
    e2 = rodar('master', 1, out, [('m1_painel', '/master'), ('m2_dados', '/master/dados'), ('m3_tpes', '/master/tpes'), ('m4_indicadores', '/master/indicadores'), ('m5_importar', '/master/importar'),
                                  ('m6_integridade', '/master/integridade'), ('m7_exportar', '/master/exportar'), ('m8_parametros', '/master/parametros'), ('m9_seq', '/master/sequencias')])
    e3 = rodar('projetista', 2, out, [('c1_movel_inicio', '/'), ('c2_movel_tarefas', '/minhas-tarefas')], movel=True)
    print('ERROS JS:', json.dumps(e1 + e2 + e3, ensure_ascii=False, indent=1))
