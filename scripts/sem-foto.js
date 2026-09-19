// Liga/desliga a exibicao de produtos SEM foto no catalogo.
//
//   npm run sem-foto -- status
//   npm run sem-foto -- on            mostra os produtos sem foto ("Foto em breve") e ja atualiza
//   npm run sem-foto -- off           volta a esconder e ja atualiza
//   npm run sem-foto -- on --sem-rodar   so grava a opcao (o cron aplica na proxima rodada)
//
// A opcao fica em config.local.json (nao vai pro git) e vale ate voce mudar de novo.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import config from '../config.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const arquivo = path.join(ROOT, 'config.local.json');
const [acao, ...resto] = process.argv.slice(2);
const semRodar = resto.includes('--sem-rodar');

const estado = () => (config.catalogo.incluirSemFoto ? 'INCLUIDOS (aparecem como "Foto em breve")' : 'ESCONDIDOS (so entram com foto)');

if (!['on', 'off', 'status'].includes(acao)) {
  console.log('Uso: npm run sem-foto -- on | off | status   [--sem-rodar]');
  process.exit(acao ? 1 : 0);
}

if (acao === 'status') {
  console.log('Produtos sem foto: ' + estado());
  process.exit(0);
}

const querLigado = acao === 'on';
if (config.catalogo.incluirSemFoto === querLigado) {
  console.log('Ja esta assim. Produtos sem foto: ' + estado());
  process.exit(0);
}

let local = {};
try { local = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch {}
local.catalogo = { ...(local.catalogo || {}), incluirSemFoto: querLigado };
fs.writeFileSync(arquivo, JSON.stringify(local, null, 2) + '\n');
console.log(`Opcao gravada: produtos sem foto ${querLigado ? 'INCLUIDOS' : 'ESCONDIDOS'} (config.local.json)`);

if (semRodar) {
  console.log('Vale a partir da proxima atualizacao (cron ou: npm run atualizar).');
  process.exit(0);
}

console.log('Atualizando o catalogo agora...\n');
const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'atualizar-tudo.js')], { cwd: ROOT, stdio: 'inherit' });
process.exit(r.status ?? 1);
