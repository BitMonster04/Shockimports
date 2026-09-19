import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import config from '../config.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const linha = () => console.log('─'.repeat(60));
const titulo = (t) => { console.log(''); linha(); console.log('  ' + t); linha(); };
const ok = (m) => console.log('  OK   ' + m);
const aviso = (m) => console.log('  !    ' + m);
const erro = (m) => console.log('  X    ' + m);

console.log('');
console.log('SHOCK CATALOGO - Verificacao de Ambiente');
console.log('==========================================');

titulo('Node.js');
ok('Node: ' + process.version);
ok('Plataforma: ' + process.platform + ' / ' + process.arch);
try {
  const npm = execSync('npm --version').toString().trim();
  ok('npm: ' + npm);
} catch { erro('npm nao encontrado'); }

titulo('Hardware');
const cpus = os.cpus();
ok('CPU: ' + (cpus[0]?.model || 'desconhecido'));
ok('Nucleos: ' + cpus.length);
ok('RAM total: ' + (os.totalmem() / 1024 / 1024).toFixed(0) + ' MB');
ok('RAM livre: ' + (os.freemem() / 1024 / 1024).toFixed(0) + ' MB');

titulo('Disco');
try {
  const df = execSync('df -h / | tail -1').toString().trim().split(/\s+/);
  ok('Total: ' + df[1]);
  ok('Livre: ' + df[3]);
  ok('Uso:   ' + df[4]);
} catch { aviso('nao consegui rodar df'); }

titulo('Pasta do projeto');
ok('Root: ' + ROOT);

titulo('XLSX');
const pastaXlsx = path.join(ROOT, config.xlsx.pasta);
if (!fs.existsSync(pastaXlsx)) {
  erro('Pasta ' + config.xlsx.pasta + ' nao existe');
} else {
  const arqs = fs.readdirSync(pastaXlsx);
  const xlsx = arqs.find(a => config.xlsx.padraoNome.test(a));
  if (xlsx) {
    const kb = (fs.statSync(path.join(pastaXlsx, xlsx)).size / 1024).toFixed(0);
    ok('Encontrado: ' + xlsx + ' (' + kb + ' KB)');
  } else {
    erro('Nenhum XLSX casando com o padrao em ' + config.xlsx.pasta);
  }
}

titulo('Imagens originais');
const pastaImg = path.join(ROOT, config.imagens.origem);
if (!fs.existsSync(pastaImg)) {
  erro('Pasta ' + config.imagens.origem + ' nao existe');
} else {
  const entradas = fs.readdirSync(pastaImg, { withFileTypes: true });
  const pastas = entradas.filter(e => e.isDirectory()).map(e => e.name);
  const arqs = entradas.filter(e => e.isFile());
  const fotos = arqs.filter(a => config.imagens.extensoes.includes(path.extname(a.name).toLowerCase()));
  ok('Arquivos totais: ' + arqs.length);
  ok('Fotos validas:   ' + fotos.length);
  if (pastas.length) ok('Subpastas: ' + pastas.join(', '));
}

titulo('Pastas de saida');
for (const p of ['public', 'public/dados', 'public/img/produtos', 'public/pdf', 'banco', 'logs', 'relatorios']) {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) { fs.mkdirSync(full, { recursive: true }); ok('Criada: ' + p); }
  else ok('Ja existe: ' + p);
}

titulo('Resumo');
console.log('');
console.log('  Se tudo acima esta OK, o ambiente esta pronto.');
console.log('  Proximo passo: npm run verificar');
console.log('');
