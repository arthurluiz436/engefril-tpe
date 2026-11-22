"""Gera private/fixture_excel.json com os valores CALCULADOS pelo Excel (VER_035) para os testes de equivalência.
Uso local apenas: o arquivo resultante contém dados corporativos e fica em private/ (ignorado pelo git)."""
import json, sys, datetime as dt, openpyxl
src = sys.argv[1] if len(sys.argv) > 1 else 'private/TAREF_PROJ_ENGEFRIL_VER_035.xlsx'
wb = openpyxl.load_workbook(src, data_only=True)
def h(x):
    if x is None: return 0.0
    if isinstance(x, dt.timedelta): return x.total_seconds()/3600
    if isinstance(x, dt.time): return x.hour + x.minute/60 + x.second/3600
    return float(x)*24
def t(x): return x.strftime('%H:%M') if isinstance(x, dt.time) else None
crm = wb['CRM_ANALITICO']; rows = []
for r in crm.iter_rows(min_row=2, values_only=True):
    if r[0] is None: continue
    rows.append({'seq': r[0], 'tpe': r[1], 'os': r[2], 'recurso': r[12], 'dia': r[14].strftime('%Y-%m-%d'),
                 'hora_inicio': t(r[16]), 'hora_fim': t(r[17]), 'horas_extras': h(r[18]), 'horas_normais': h(r[19]),
                 'custo_normal': r[20], 'custo_he': r[21], 'custo_total': r[22], 'tipo_dia': r[23], 'inicio_jornada': t(r[25]), 'fim_jornada': t(r[26])})
k = wb['KPI']
def v(c):
    x = k[c].value
    return x.strftime('%Y-%m-%d') if isinstance(x, dt.datetime) else x
kpi = {c: v(c) for c in ['B5','B6','B7','B8','B9','B10','B11','B12','B13','B14','B15','B16','B17','B18','B19','B156','B157','B158','B159','B160','B161','B162','B163','B164','B165','G127','G128']}
recursos = {k.cell(r,1).value: {'dias': k.cell(r,4).value, 'capacidade': k.cell(r,5).value, 'horas': k.cell(r,8).value, 'alocacao': k.cell(r,9).value, 'tpes': k.cell(r,12).value} for r in range(72,76)}
principal = {k.cell(r,1).value: {'qtd': k.cell(r,2).value, 'fin': k.cell(r,3).value, 'horas': k.cell(r,4).value, 'he': k.cell(r,5).value, 'tm': k.cell(r,6).value, 'prazo': k.cell(r,7).value} for r in range(24,31)}
meses = {k.cell(r,1).value.strftime('%Y-%m-01'): {'capacidade': k.cell(r,4).value, 'equipe': k.cell(r,13).value, 'extras': k.cell(r,14).value} for r in range(81,89)}
vend = {k.cell(r,1).value: {'os': k.cell(r,2).value, 'qtd': k.cell(r,3).value, 'horas': k.cell(r,4).value, 'reab': k.cell(r,8).value} for r in range(133,137)}
json.dump({'apontamentos': rows, 'kpi': kpi, 'recursos': recursos, 'principal': principal, 'meses': meses, 'vendedor': vend},
          open('private/fixture_excel.json','w'), ensure_ascii=False, indent=1, default=str)
print(len(rows), 'apontamentos;', 'fixture gravada em private/fixture_excel.json')
