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
sql += ' ORDER BY categoria, nome, codigo';

const produtos = db.prepare(sql).all();
ok('Produtos no catalogo: ' + produtos.length);

const itens = produtos.map(p => ({
  id: p.id,
  codigo: p.codigo,
  nome: p.nome,
  categoria: p.categoria || 'Sem categoria',
  preco: p.preco,
  qtdeCaixa: p.qtde_caixa,
  ean: p.ean,
  imagem: p.imagem,
}));

const categorias = [...new Set(itens.map(i => i.categoria))].sort();
ok('Categorias: ' + categorias.length);

const comPreco = itens.filter(i => i.preco !== null && i.preco !== undefined).length;
const comQtde = itens.filter(i => i.qtdeCaixa !== null && i.qtdeCaixa !== undefined).length;
const comEan = itens.filter(i => i.ean).length;

titulo('Gravando JSON');
const pasta = path.join(ROOT, path.dirname(config.jsonSaida));
fs.mkdirSync(pasta, { recursive: true });

const saida = {
  geradoEm: new Date().toISOString(),
  total: itens.length,
  categorias,
  produtos: itens,
};

const caminhoJson = path.join(ROOT, config.jsonSaida);
fs.writeFileSync(caminhoJson, JSON.stringify(saida, null, 2), 'utf8');

const kb = (fs.statSync(caminhoJson).size / 1024).toFixed(1);
ok('Arquivo: ' + config.jsonSaida);
ok('Tamanho: ' + kb + ' KB');

titulo('Resumo');
console.log('');
console.log('  Produtos no JSON:      ' + itens.length);
console.log('  Com preco:             ' + comPreco);
console.log('  Com qtde de caixa:     ' + comQtde);
console.log('  Com EAN:               ' + comEan);
console.log('  Categorias:            ' + categorias.length);
console.log('');
console.log('  Proximo passo: npm run pdf');
console.log('');

db.close();

