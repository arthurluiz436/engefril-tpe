// Falha se o build contiver chave secreta real ou arquivo de dados.
// Procura valores de chave (não apenas a palavra "service_role", que existe no código de proteção).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
const raiz = process.argv[2] ?? 'dist'
const proibidas = new Set(['.xlsx', '.xlsm', '.xls', '.csv', '.sql', '.dump', '.gpg', '.env'])
const problemas = []
function* arquivos(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? yield* arquivos(p) : yield p } }
for (const arq of arquivos(raiz)) {
  if (proibidas.has(extname(arq).toLowerCase())) { problemas.push(`arquivo de dados: ${arq}`); continue }
  const txt = readFileSync(arq, 'latin1')
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(txt)) problemas.push(`chave sb_secret_ em ${arq}`)
  for (const [jwt] of txt.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)) {
    try {
      const carga = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
      if (carga.role && carga.role !== 'anon') problemas.push(`JWT com role=${carga.role} em ${arq}`)
    } catch { /* não é JWT */ }
  }
}
if (problemas.length) { console.error('Build bloqueado:\n- ' + problemas.join('\n- ')); process.exit(1) }
console.log(`OK: nenhum segredo ou arquivo de dados em ${raiz}/`)
