// Orquestrador do catalogo (roda no Raspberry Pi).
//
//   npm run atualizar                    roda so se algo mudou (XLSX ou fotos)
//   npm run atualizar -- --forcar        roda mesmo sem mudancas
//   npm run atualizar -- --verificar     so diz se ha mudancas (nao altera nada)
//   npm run atualizar -- --sem-git       processa mas NAO publica no GitHub
//   npm run atualizar -- --aceitar-queda ignora a trava de "sumiram muitas fotos/produtos"
//
// Fluxo: checa mudancas -> importar -> casar -> (trava) -> otimizar -> json -> git push.
// O build do site e os PDFs acontecem no GitHub Actions.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import config from '../config.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const abs = (...p) => path.join(ROOT, ...p);
const VERSAO = 1; // aumente para forcar reprocessamento apos mudar a logica

try { process.loadEnvFile(abs('.env')); } catch {} // HEALTHCHECK_URL, se existir

const args = new Set(process.argv.slice(2));
const FORCAR = args.has('--forcar');
const SO_VERIFICAR = args.has('--verificar');
const SEM_GIT = args.has('--sem-git');
const ACEITAR_QUEDA = args.has('--aceitar-queda');
const seg = config.seguranca;

class Abortar extends Error {}

// ---------------------------------------------------------------- log
fs.mkdirSync(abs(config.logs.pasta), { recursive: true });
const arquivoLog = abs(config.logs.pasta, `atualizar-${new Date().toLocaleDateString('sv-SE')}.log`);

function log(msg = '', nivel = 'INFO') {
  const l = `${new Date().toLocaleString('sv-SE')} [${nivel}] ${msg}`;
  (nivel === 'ERRO' ? console.error : console.log)(l);
  try { fs.appendFileSync(arquivoLog, l + '\n'); } catch {}
}

function limparLogsAntigos() {
  const limite = Date.now() - config.logs.retencaoDias * 864e5;
  for (const f of fs.readdirSync(abs(config.logs.pasta))) {
    if (!/^atualizar-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue;
    const p = abs(config.logs.pasta, f);
    if (fs.statSync(p).mtimeMs < limite) fs.rmSync(p, { force: true });
  }
}

// ---------------------------------------------------------------- trava (1 execucao por vez)
const caminhoLock = abs(config.lockFile);
let temLock = false;
let filhoAtual = null;

function adquirirLock() {
  fs.mkdirSync(path.dirname(caminhoLock), { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(caminhoLock, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      temLock = true;
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(fs.readFileSync(caminhoLock, 'utf8'));
      let vivo = false;
      try { process.kill(pid, 0); vivo = true; } catch {}
      if (vivo) return false;
      fs.rmSync(caminhoLock, { force: true }); // trava velha de uma execucao que morreu
    }
  }
  return false;
}

process.on('exit', () => { if (temLock) fs.rmSync(caminhoLock, { force: true }); });
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => { try { filhoAtual?.kill(); } catch {} process.exit(130); });
}

// ---------------------------------------------------------------- aviso (Healthchecks.io, opcional)
async function ping(sufixo = '', corpo = '') {
  const url = process.env.HEALTHCHECK_URL;
  if (!url) return;
  try {
    await fetch(url.replace(/\/$/, '') + sufixo, { method: 'POST', body: corpo.slice(0, 500), signal: AbortSignal.timeout(10000) });
  } catch {}
}

// ---------------------------------------------------------------- entradas (XLSX e fotos)
const sha1 = (dado) => crypto.createHash('sha1').update(dado).digest('hex');

function acharXlsx() {
  const pasta = abs(config.xlsx.pasta);
  if (!fs.existsSync(pasta)) throw new Abortar(`Pasta ${config.xlsx.pasta} nao existe`);
  const achados = fs.readdirSync(pasta)
    .filter(a => config.xlsx.padraoNome.test(a) && !a.startsWith('~$'))
    .map(a => ({ nome: a, caminho: path.join(pasta, a), mtimeMs: fs.statSync(path.join(pasta, a)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!achados.length) throw new Abortar(`Nenhum XLSX casando com o padrao em ${config.xlsx.pasta}`);
  if (achados.length > 1) log(`Mais de um XLSX casa com o padrao; usando o mais recente: ${achados[0].nome}`, 'AVISO');
  return achados[0];
}

function escanearFotos() {
  const pasta = abs(config.imagens.origem);
  if (!fs.existsSync(pasta)) throw new Abortar(`Pasta de fotos nao existe: ${config.imagens.origem}`);
  const fotos = [];
  for (const e of fs.readdirSync(pasta, { withFileTypes: true })) {
    if (!e.isFile() || e.name.startsWith('.') || e.name.startsWith('~')) continue;
    if (!config.imagens.extensoes.includes(path.extname(e.name).toLowerCase())) continue;
    const st = fs.statSync(path.join(pasta, e.name));
    fotos.push({ nome: e.name, tamanho: st.size, mtimeMs: Math.round(st.mtimeMs) });
  }
  return fotos;
}

const recente = (mtimeMs) => { const idade = Date.now() - mtimeMs; return idade >= 0 && idade < seg.estabilidadeSeg * 1000; };

// ---------------------------------------------------------------- estado
const caminhoEstado = abs('banco', 'estado.json');
function lerEstado() { try { return JSON.parse(fs.readFileSync(caminhoEstado, 'utf8')); } catch { return {}; } }
function salvarEstado(e) { fs.mkdirSync(path.dirname(caminhoEstado), { recursive: true }); fs.writeFileSync(caminhoEstado, JSON.stringify(e, null, 2)); }

function lerJson() {
  try {
    const j = JSON.parse(fs.readFileSync(abs(config.jsonSaida), 'utf8'));
    return { total: j.total ?? j.produtos.length, codigos: new Set(j.produtos.map(p => p.codigo)) };
  } catch { return { total: 0, codigos: new Set() }; }
}

// JSON que esta no ar (ultimo commit): base para "entraram/sairam" e para a trava de queda
function lerJsonPublicado() {
  if (!SEM_GIT && config.git.publicar && fs.existsSync(abs('.git'))) {
    try {
      const j = JSON.parse(execFileSync('git', ['show', 'HEAD:' + config.jsonSaida], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }));
      return { total: j.total ?? j.produtos.length, codigos: new Set(j.produtos.map(p => p.codigo)) };
    } catch {}
  }
  return lerJson();
}

// ---------------------------------------------------------------- executa um script do pipeline
function rodarScript(nome) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    log(`>> ${nome}`);
    const filho = spawn(process.execPath, ['--max-old-space-size=256', abs('scripts', nome)], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    });
    filhoAtual = filho;
    let picoKB = 0;
    const timer = setInterval(() => { // pico de RAM do processo filho (Linux)
      try {
        const m = fs.readFileSync(`/proc/${filho.pid}/status`, 'utf8').match(/VmHWM:\s+(\d+)/);
        if (m) picoKB = Math.max(picoKB, Number(m[1]));
      } catch {}
    }, 400);
    const escreve = (d) => { process.stdout.write(d); try { fs.appendFileSync(arquivoLog, d); } catch {} };
    filho.stdout.on('data', escreve);
    filho.stderr.on('data', escreve);
    filho.on('close', (codigo) => {
      clearInterval(timer);
      filhoAtual = null;
      const r = { codigo, segundos: (Date.now() - t0) / 1000, picoMB: Math.round(picoKB / 1024) };
      log(`<< ${nome}: ${codigo === 0 ? 'ok' : 'FALHOU (codigo ' + codigo + ')'} em ${r.segundos.toFixed(1)}s ${r.picoMB ? '| pico de RAM ' + r.picoMB + ' MB' : ''}`);
      resolve(r);
    });
  });
}

async function etapa(nome) {
  const r = await rodarScript(nome);
  if (r.codigo !== 0) throw new Error(`${nome} falhou (codigo ${r.codigo}). Veja o log: ${path.relative(ROOT, arquivoLog)}`);
  return r;
}

// ---------------------------------------------------------------- git
function git(...a) {
  return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
}
function erroGit(e) { return (e.stderr || e.message || '').toString().trim(); }

function commitsAFrente() {
  try { return Number(git('rev-list', '--count', '@{u}..HEAD')); } catch { return 1; } // sem upstream: envia
}

function enviar() {
  const { remoto, branch } = config.git;
  try {
    git('push', '-u', remoto, `HEAD:${branch}`);
  } catch (e) {
    if (!/rejected|non-fast-forward|fetch first/i.test(erroGit(e))) throw new Error('git push falhou: ' + erroGit(e));
    log('Remoto tem commits novos; fazendo rebase e tentando de novo', 'AVISO');
    try {
      git('pull', '--rebase', '--autostash', remoto, branch);
      git('push', '-u', remoto, `HEAD:${branch}`);
    } catch (e2) {
      throw new Error('git push falhou apos rebase: ' + erroGit(e2));
    }
  }
}

function publicar(resumo) {
  if (SEM_GIT || !config.git.publicar) { log('Publicacao no GitHub desativada'); return 'desativado'; }
  if (!fs.existsSync(abs('.git'))) throw new Error('Esta pasta nao e um repositorio git');

  git('add', '-A', 'public'); // so a pasta public: nunca dados/, banco/, logs/ ...
  if (git('status', '--porcelain', '--', 'public')) {
    const msg = `Catalogo: +${resumo.entraram.length} / -${resumo.sairam.length} produtos (${resumo.total} no ar)`;
    try { git('commit', '-m', msg, '--', 'public'); } catch (e) { throw new Error('git commit falhou: ' + erroGit(e)); }
    log('Commit: ' + msg);
  } else {
    log('Nada mudou em public/: nenhum commit novo');
  }
  if (commitsAFrente() > 0) { enviar(); log('Enviado ao GitHub (o site atualiza em 2 a 3 minutos)'); return 'enviado'; }
  return 'nada-a-enviar';
}

// ---------------------------------------------------------------- principal
async function principal() {
  const inicio = Date.now();
  limparLogsAntigos();
  try { os.setPriority(0, 19); } catch {} // prioridade baixa: nao atrapalha o bot

  if (!adquirirLock()) { log('Ja existe uma atualizacao em andamento; saindo'); return; }

  const ramLivre = Math.round(os.freemem() / 1048576);
  if (ramLivre < seg.ramLivreMinMB && !FORCAR) {
    log(`Pouca RAM livre (${ramLivre} MB < ${seg.ramLivreMinMB} MB); adiando para a proxima rodada`, 'AVISO');
    return;
  }

  const xlsx = acharXlsx();
  const fotos = escanearFotos();

  if (recente(xlsx.mtimeMs) || fotos.some(f => recente(f.mtimeMs))) {
    log('Ha arquivos sendo copiados agora (modificados ha menos de ' + seg.estabilidadeSeg + 's); tento na proxima rodada');
    return;
  }

  // Trava 1: pasta de fotos sumiu/esvaziou (ex.: compartilhamento fora do ar)
  const estado = lerEstado();
  const fotosAntes = estado.totalFotos ?? 0;
  if (!ACEITAR_QUEDA) {
    if (fotos.length === 0) throw new Abortar('A pasta de fotos esta vazia. Nada foi alterado.');
    if (fotosAntes >= seg.minParaComparar && fotos.length < fotosAntes * (1 - seg.maxQuedaPct / 100)) {
      throw new Abortar(`A pasta tinha ${fotosAntes} fotos e agora tem ${fotos.length} (queda maior que ${seg.maxQuedaPct}%). Nada foi publicado. Se for intencional: npm run atualizar -- --aceitar-queda`);
    }
  }

  const parametros = { v: VERSAO, semFoto: config.catalogo.incluirSemFoto, ativos: config.catalogo.apenasAtivos, l: config.imagens.larguraMax, q: config.imagens.qualidade, f: config.imagens.formato };
  const impressao = sha1([sha1(fs.readFileSync(xlsx.caminho)), JSON.stringify(parametros), ...fotos.map(f => `${f.nome}|${f.tamanho}|${f.mtimeMs}`).sort()].join('\n'));

  const mudou = FORCAR || estado.impressao !== impressao;
  if (SO_VERIFICAR) { log(mudou ? 'HA mudancas a processar (modo --verificar: nada foi feito)' : 'Sem mudancas'); return; }

  if (!mudou) {
    let extra = '';
    if (!SEM_GIT && config.git.publicar && fs.existsSync(abs('.git')) && commitsAFrente() > 0) {
      enviar(); extra = ' (havia commit pendente; enviado)';
    }
    log('Sem mudancas no XLSX nem nas fotos' + extra);
    await ping('', 'sem mudancas');
    return;
  }

  log(`Mudancas detectadas (${fotos.length} fotos na pasta, XLSX: ${xlsx.nome}). RAM livre: ${ramLivre} MB`);
  const antes = lerJsonPublicado();
  let pico = 0;
  const somar = (r) => { pico = Math.max(pico, r.picoMB); };

  somar(await etapa('01-importar-xlsx.js'));
  somar(await etapa('02-casar-imagens.js'));

  // Trava 2: quantos produtos iriam ao ar (antes de mexer em public/)
  const db = new Database(abs(config.banco), { readonly: true });
  const candidatos = db.prepare(
    'SELECT COUNT(*) AS n FROM produtos WHERE 1=1' +
    (config.catalogo.apenasAtivos ? ' AND ativo = 1' : '') +
    (config.catalogo.incluirSemFoto ? '' : ' AND imagem IS NOT NULL')
  ).get().n;
  db.close();
  if (!ACEITAR_QUEDA && antes.total >= seg.minParaComparar && candidatos < antes.total * (1 - seg.maxQuedaPct / 100)) {
    throw new Abortar(`O catalogo tinha ${antes.total} produtos e agora teria ${candidatos} (queda maior que ${seg.maxQuedaPct}%). Nada foi publicado. Confira o XLSX. Se for intencional: npm run atualizar -- --aceitar-queda`);
  }

  somar(await etapa('03-otimizar-imagens.js'));
  somar(await etapa('04-gerar-json.js'));

  const depois = lerJson();
  if (depois.total === 0 && antes.total > 0 && !ACEITAR_QUEDA) throw new Abortar('O JSON ficou vazio. Nada foi publicado.');

  const entraram = [...depois.codigos].filter(c => !antes.codigos.has(c));
  const sairam = [...antes.codigos].filter(c => !depois.codigos.has(c));
  if (entraram.length) log(`Entraram no catalogo (${entraram.length}): ${entraram.slice(0, 15).join(', ')}${entraram.length > 15 ? ' ...' : ''}`);
  if (sairam.length) log(`Sairam do catalogo (${sairam.length}): ${sairam.slice(0, 15).join(', ')}${sairam.length > 15 ? ' ...' : ''}`);

  const resumo = { entraram, sairam, total: depois.total };
  const resultado = publicar(resumo);

  // Numeros para o resumo
  const db2 = new Database(abs(config.banco), { readonly: true });
  const ativosSemFoto = db2.prepare('SELECT COUNT(*) AS n FROM produtos WHERE ativo = 1 AND imagem IS NULL').get().n;
  db2.close();
  let orfas = '?';
  try { orfas = fs.readFileSync(abs(config.relatorios.pasta, config.relatorios.fotosOrfas), 'utf8').match(/Total de fotos orfas:\s*(\d+)/)?.[1] ?? '?'; } catch {}

  if (!SEM_GIT) {
    salvarEstado({ impressao, quando: new Date().toISOString(), totalFotos: fotos.length, totalProdutos: depois.total });
  } else {
    log('Modo --sem-git: estado NAO salvo (a proxima rodada normal vai publicar)');
  }

  const picoProprio = Math.round(process.resourceUsage().maxRSS / 1024);
  const texto = `no ar ${depois.total} (+${entraram.length}/-${sairam.length}) | ativos sem foto ${ativosSemFoto} | fotos orfas ${orfas} | ${((Date.now() - inicio) / 1000).toFixed(0)}s | pico de RAM ${Math.max(pico, picoProprio)} MB | git: ${resultado}`;
  log('RESUMO: ' + texto);
  await ping('', texto);
}

try {
  log('='.repeat(60));
  await principal();
} catch (e) {
  const abortada = e instanceof Abortar;
  log((abortada ? 'ABORTADO (seguranca): ' : 'ERRO: ') + e.message, 'ERRO');
  await ping('/fail', (abortada ? 'ABORTADO: ' : 'ERRO: ') + e.message);
  process.exitCode = 1;
}
