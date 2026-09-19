import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config from '../config.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const linha = () => console.log('-'.repeat(60));
const titulo = (t) => { console.log(''); linha(); console.log('  ' + t); linha(); };
const ok = (m) => console.log('  OK   ' + m);
const aviso = (m) => console.log('  !    ' + m);
const erro = (m) => console.log('  X    ' + m);

console.log('');
console.log('SHOCK CATALOGO - Gerar JSON para o site');
console.log('========================================');

titulo('Abrindo banco');
const caminhoBanco = path.join(ROOT, config.banco);
if (!fs.existsSync(caminhoBanco)) {
  erro('Banco nao existe. Rode primeiro: npm run importar');
  process.exit(1);
}
const db = new Database(caminhoBanco);
ok('Banco: ' + config.banco);

titulo('Lendo produtos');

let sql = 'SELECT id, codigo, nome, categoria, ativo, preco, qtde_caixa, ean, imagem FROM produtos WHERE 1=1';
if (config.catalogo.apenasAtivos) {
  sql += ' AND ativo = 1';
}
if (!config.catalogo.incluirSemFoto) {
  sql += ' AND imagem IS NOT NULL';
}
// Produtos sem foto (quando incluidos) ficam no fim de cada categoria
sql += ' ORDER BY categoria, (imagem IS NULL), nome, codigo';

const produtos = db.prepare(sql).all();
ok('Produtos no catalogo: ' + produtos.length);

// So publica imagem que existe de verdade em public/ (evita foto quebrada no site)
const semArquivo = [];
const itens = produtos
  .map(p => {
    let imagem = p.imagem;
    if (imagem && !fs.existsSync(path.join(ROOT, 'public', imagem))) {
      semArquivo.push(p.codigo);
      imagem = null;
    }
    return {
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      categoria: p.categoria || 'Sem categoria',
      preco: p.preco,
      qtdeCaixa: p.qtde_caixa,
      ean: p.ean,
      imagem,
    };
  })
  .filter(i => config.catalogo.incluirSemFoto || i.imagem);

if (semArquivo.length) {
  aviso(semArquivo.length + ' produto(s) com foto casada mas arquivo WebP ausente: ' + semArquivo.slice(0, 10).join(', ') + (semArquivo.length > 10 ? ' ...' : ''));
}
if (itens.length !== produtos.length) {
  ok('Apos checar arquivos de imagem: ' + itens.length);
}

const categorias = [...new Set(itens.map(i => i.categoria))].sort();
ok('Categorias: ' + categorias.length);

const comPreco = itens.filter(i => i.preco !== null && i.preco !== undefined).length;
const comQtde = itens.filter(i => i.qtdeCaixa !== null && i.qtdeCaixa !== undefined).length;
const comEan = itens.filter(i => i.ean).length;

titulo('Gravando JSON');
const pasta = path.join(ROOT, path.dirname(config.jsonSaida));
fs.mkdirSync(pasta, { recursive: true });
const caminhoJson = path.join(ROOT, config.jsonSaida);

const conteudo = {
  total: itens.length,
  categorias,
  produtos: itens,
};

// Se o conteudo nao mudou, mantem o arquivo (e o geradoEm) como esta.
// Assim o git so ve mudanca quando o catalogo realmente mudou.
let geradoEm = new Date().toISOString();
let mudou = true;
if (fs.existsSync(caminhoJson)) {
  try {
    const antigo = JSON.parse(fs.readFileSync(caminhoJson, 'utf8'));
    const { geradoEm: geradoAntigo, ...resto } = antigo;
    if (geradoAntigo && JSON.stringify(resto) === JSON.stringify(conteudo)) {
      geradoEm = geradoAntigo;
      mudou = false;
    }
  } catch {}
}

if (mudou) {
  fs.writeFileSync(caminhoJson, JSON.stringify({ geradoEm, ...conteudo }, null, 2), 'utf8');
  const kb = (fs.statSync(caminhoJson).size / 1024).toFixed(1);
  ok('Arquivo: ' + config.jsonSaida + ' (' + kb + ' KB)');
} else {
  ok('JSON sem mudancas: arquivo mantido');
}

titulo('Resumo');
console.log('');
console.log('  Produtos no JSON:      ' + itens.length);
console.log('  Com preco:             ' + comPreco);
console.log('  Com qtde de caixa:     ' + comQtde);
console.log('  Com EAN:               ' + comEan);
console.log('  Categorias:            ' + categorias.length);
console.log('');

db.close();
