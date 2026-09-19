import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import config from '../config.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const linha = () => console.log('-'.repeat(60));
const titulo = (t) => { console.log(''); linha(); console.log('  ' + t); linha(); };
const ok = (m) => console.log('  OK   ' + m);
const aviso = (m) => console.log('  !    ' + m);
const erro = (m) => console.log('  X    ' + m);

// Pouca RAM: 1 imagem por vez, cache do sharp pequeno
sharp.concurrency(1);
sharp.cache({ memory: 32, files: 0, items: 32 });

function hashArquivo(caminho) {
  const stat = fs.statSync(caminho);
  const str = caminho + '|' + stat.size + '|' + stat.mtimeMs;
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 12);
}

function acharArquivoOriginal(codigo) {
  const pasta = path.join(ROOT, config.imagens.origem);
  for (const ext of config.imagens.extensoes) {
    const p = path.join(pasta, codigo + ext);
    if (fs.existsSync(p)) return p;
  }
  // Tenta variações (caixa mista, sufixos)
  const entradas = fs.readdirSync(pasta);
  const alvo = codigo.toUpperCase();
  for (const nome of entradas) {
    const ext = path.extname(nome);
    if (!config.imagens.extensoes.includes(ext.toLowerCase())) continue;
    const base = nome.slice(0, -ext.length).replace(/\s*\(\d+\)\s*$/, '').trim().toUpperCase();
    if (base === alvo) return path.join(pasta, nome);
  }
  return null;
}

console.log('');
console.log('SHOCK CATALOGO - Otimizar imagens (WebP ' + config.imagens.larguraMax + 'px)');
console.log('===============================================');
console.log('');
console.log('  Inicio: ' + new Date().toLocaleString('pt-BR'));

titulo('Abrindo banco');
const caminhoBanco = path.join(ROOT, config.banco);
if (!fs.existsSync(caminhoBanco)) {
  erro('Banco nao existe. Rode primeiro: npm run importar && npm run casar');
  process.exit(1);
}
const db = new Database(caminhoBanco);
ok('Banco: ' + config.banco);

titulo('Lendo produtos com foto');
// Produto inativo nao aparece no site: nao gasta tempo nem espaco com a foto dele
let sql = 'SELECT codigo, imagem FROM produtos WHERE imagem IS NOT NULL';
if (config.catalogo.apenasAtivos) sql += ' AND ativo = 1';
sql += ' ORDER BY codigo';
const produtos = db.prepare(sql).all();
ok('Produtos com foto' + (config.catalogo.apenasAtivos ? ' (so ativos)' : '') + ': ' + produtos.length);

const tiraFoto = db.prepare('UPDATE produtos SET imagem = NULL WHERE codigo = ?');

titulo('Preparando pasta destino');
const pastaDestino = path.join(ROOT, config.imagens.destino);
fs.mkdirSync(pastaDestino, { recursive: true });
ok('Destino: ' + config.imagens.destino);

titulo('Otimizando');
console.log('');

const formato = config.imagens.formato;
const mantidos = new Set(); // arquivos de saida que devem continuar existindo
let processadas = 0;
let puladas = 0;
let falhas = 0;
const inicioTotal = Date.now();
let ultimoPrint = 0;

for (const produto of produtos) {
  const codigo = produto.codigo;
  const original = acharArquivoOriginal(codigo);
  if (!original) {
    aviso('Original nao encontrada: ' + codigo);
    falhas++;
    tiraFoto.run(codigo);
    continue;
  }

  const nomeSaida = codigo + '.' + formato;
  const caminhoSaida = path.join(pastaDestino, nomeSaida);

  // Cache: se ja existe e o original nao mudou, pula
  const hashFile = caminhoSaida + '.hash';
  const hashAtual = hashArquivo(original);
  if (fs.existsSync(caminhoSaida) && fs.existsSync(hashFile)) {
    const hashAntigo = fs.readFileSync(hashFile, 'utf8').trim();
    if (hashAntigo === hashAtual) {
      puladas++;
      mantidos.add(nomeSaida);
      continue;
    }
  }

  // Grava em arquivo temporario e renomeia: nunca deixa WebP pela metade
  const temporario = path.join(pastaDestino, codigo + '.tmp.' + formato);
  try {
    await sharp(original)
      .rotate() // respeita a orientacao EXIF da foto
      .resize({ width: config.imagens.larguraMax, withoutEnlargement: true })
      .toFormat(formato, { quality: config.imagens.qualidade })
      .toFile(temporario);
    fs.renameSync(temporario, caminhoSaida);

    fs.writeFileSync(hashFile, hashAtual);
    processadas++;
    mantidos.add(nomeSaida);
  } catch (e) {
    aviso('Falha em ' + codigo + ': ' + e.message);
    falhas++;
    fs.rmSync(temporario, { force: true });
    tiraFoto.run(codigo); // sem WebP valido, o produto fica sem foto ate a proxima rodada
  }

  // Progresso a cada 25 fotos ou 10s
  const agora = Date.now();
  if (processadas % 25 === 0 || agora - ultimoPrint > 10000) {
    const total = produtos.length;
    const feitas = processadas + puladas + falhas;
    const pct = ((feitas / total) * 100).toFixed(1);
    const decorrido = ((agora - inicioTotal) / 1000).toFixed(0);
    console.log('  [' + feitas + '/' + total + '] ' + pct + '% | ok ' + processadas + ' | puladas ' + puladas + ' | falhas ' + falhas + ' | ' + decorrido + 's');
    ultimoPrint = agora;
  }
}

// Falha em massa (ex.: sharp quebrado): aborta ANTES de limpar qualquer coisa
if (produtos.length >= 10 && falhas >= produtos.length * 0.3) {
  erro('Falhas em massa (' + falhas + ' de ' + produtos.length + '). Nada foi removido. Confira o sharp e a pasta de fotos.');
  db.close();
  process.exit(1);
}

titulo('Limpando WebP que nao sao mais usados');
if (produtos.length === 0) {
  aviso('Nenhum produto com foto: nada removido (protecao)');
} else {
  let removidos = 0;
  for (const nome of fs.readdirSync(pastaDestino)) {
    const ehHash = nome.endsWith('.hash');
    const ehImagem = nome.endsWith('.' + formato);
    if (!ehHash && !ehImagem) continue; // so mexe no que este script gera
    const nomeImagem = ehHash ? nome.slice(0, -'.hash'.length) : nome;
    if (mantidos.has(nomeImagem)) continue;
    fs.rmSync(path.join(pastaDestino, nome), { force: true });
    if (ehImagem) removidos++;
  }
  ok('WebP removidos (inativos, sem foto ou renomeados): ' + removidos);
}

console.log('');
titulo('Resumo');
console.log('');
console.log('  Total:      ' + produtos.length);
console.log('  Processadas: ' + processadas);
console.log('  Puladas:     ' + puladas + '  (ja estavam em cache)');
console.log('  Falhas:      ' + falhas);
console.log('  Tempo:       ' + ((Date.now() - inicioTotal) / 1000).toFixed(0) + 's');
console.log('');
console.log('  Fim: ' + new Date().toLocaleString('pt-BR'));
console.log('');
console.log('  Proximo passo: npm run json');
console.log('');

db.close();
