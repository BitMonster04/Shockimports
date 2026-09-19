import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import pkg from 'xlsx';
import config from '../config.js';

const { readFile, utils } = pkg;
const XLSX = { readFile, utils };

const ROOT = path.resolve(import.meta.dirname, '..');

const linha = () => console.log('-'.repeat(60));
const titulo = (t) => { console.log(''); linha(); console.log('  ' + t); linha(); };
const ok = (m) => console.log('  OK   ' + m);
const aviso = (m) => console.log('  !    ' + m);
const erro = (m) => console.log('  X    ' + m);

function normalizarCodigo(c) {
  if (!c) return null;
  return String(c).trim().toUpperCase();
}

function paraNumero(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function extrairQtdeCaixa(txt) {
  if (!txt) return null;
  const m = String(txt).match(/Qtde:\s*(\d+)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return isNaN(n) ? null : n;
}

console.log('');
console.log('SHOCK CATALOGO - Importar XLSX para SQLite');
console.log('===========================================');

titulo('Localizando XLSX');
const pastaXlsx = path.join(ROOT, config.xlsx.pasta);
if (!fs.existsSync(pastaXlsx)) {
  erro('Pasta ' + config.xlsx.pasta + ' nao existe');
  process.exit(1);
}
const arquivos = fs.readdirSync(pastaXlsx);
const nomeXlsx = arquivos
  .filter(a => config.xlsx.padraoNome.test(a) && !a.startsWith('~$'))
  .sort((a, b) => fs.statSync(path.join(pastaXlsx, b)).mtimeMs - fs.statSync(path.join(pastaXlsx, a)).mtimeMs)[0];
if (!nomeXlsx) {
  erro('Nenhum XLSX casando com o padrao em ' + config.xlsx.pasta);
  process.exit(1);
}
const caminhoXlsx = path.join(pastaXlsx, nomeXlsx);
ok('Arquivo: ' + nomeXlsx);

titulo('Lendo XLSX');
const wb = XLSX.readFile(caminhoXlsx);
ok('Abas encontradas: ' + wb.SheetNames.join(', '));

const nomeAba = config.xlsx.aba;
if (!wb.Sheets[nomeAba]) {
  erro('Aba "' + nomeAba + '" nao encontrada');
  process.exit(1);
}
const ws = wb.Sheets[nomeAba];

const todasLinhas = XLSX.utils.sheet_to_json(ws, {
  header: 1,
  defval: '',
  blankrows: false,
});

titulo('Localizando cabecalho');
const colunasObrigatorias = ['id', 'nome', 'codigo', 'ativo', 'preco'];
let linhaCabecalho = -1;
for (let i = 0; i < todasLinhas.length; i++) {
  const linhaStr = todasLinhas[i].map(c => String(c).trim().toLowerCase());
  const encontradas = colunasObrigatorias.filter(c => linhaStr.includes(c));
  if (encontradas.length >= 4) {
    linhaCabecalho = i;
    ok('Cabecalho encontrado na linha ' + (i + 1));
    break;
  }
}

if (linhaCabecalho === -1) {
  erro('Nao consegui encontrar a linha de cabecalho no XLSX');
  process.exit(1);
}

const cabecalho = todasLinhas[linhaCabecalho].map(h => String(h).trim().toLowerCase());
ok('Cabecalho: ' + cabecalho.join(' | '));

const colunas = {
  id: 'id',
  nome: 'nome',
  codigo: 'codigo',
  ativo: 'ativo',
  preco: 'preco',
  categoria: 'categoria',
  frase_adicional: 'frase_adicional',
  descricao: 'descricao',
  ean: 'ean',
};

const idx = {};
const encontradas = [];
const faltando = [];
for (const [chave, nomeColuna] of Object.entries(colunas)) {
  const pos = cabecalho.indexOf(nomeColuna);
  idx[chave] = pos;
  if (pos >= 0) encontradas.push(nomeColuna);
  else faltando.push(nomeColuna);
}

ok('Colunas encontradas: ' + encontradas.length + '/' + Object.keys(colunas).length);
if (faltando.length) {
  aviso('Colunas faltando (viram null): ' + faltando.join(', '));
}

const obrigatoriasFaltando = colunasObrigatorias.filter(c => idx[c] < 0);
if (obrigatoriasFaltando.length) {
  erro('Colunas obrigatorias faltando: ' + obrigatoriasFaltando.join(', '));
  process.exit(1);
}

const linhasDados = todasLinhas.slice(linhaCabecalho + 1);
ok('Linhas de dados: ' + linhasDados.length);

titulo('Abrindo banco');
const caminhoBanco = path.join(ROOT, config.banco);
fs.mkdirSync(path.dirname(caminhoBanco), { recursive: true });
const db = new Database(caminhoBanco);

db.exec(`
  CREATE TABLE IF NOT EXISTS produtos (
    id             INTEGER PRIMARY KEY,
    codigo         TEXT UNIQUE NOT NULL,
    nome           TEXT NOT NULL,
    categoria      TEXT,
    ativo          INTEGER DEFAULT 1,
    preco          REAL,
    qtde_caixa     INTEGER,
    descricao      TEXT,
    ean            TEXT,
    imagem         TEXT,
    atualizado_em  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_codigo ON produtos(codigo);
  CREATE INDEX IF NOT EXISTS idx_ativo  ON produtos(ativo);
  CREATE INDEX IF NOT EXISTS idx_categoria ON produtos(categoria);
`);

const colunasExistentes = db.prepare("PRAGMA table_info(produtos)").all().map(c => c.name);
for (const nova of ['qtde_caixa', 'descricao', 'ean']) {
  if (!colunasExistentes.includes(nova)) {
    db.exec(`ALTER TABLE produtos ADD COLUMN ${nova} ${nova === 'qtde_caixa' ? 'INTEGER' : 'TEXT'}`);
    aviso('Coluna adicionada ao banco: ' + nova);
  }
}

ok('Banco: ' + config.banco);

titulo('Importando produtos');

const upsert = db.prepare(`
  INSERT INTO produtos (id, codigo, nome, categoria, ativo, preco, qtde_caixa, descricao, ean, atualizado_em)
  VALUES (@id, @codigo, @nome, @categoria, @ativo, @preco, @qtde_caixa, @descricao, @ean, @agora)
  ON CONFLICT(codigo) DO UPDATE SET
    id            = excluded.id,
    nome          = excluded.nome,
    categoria     = excluded.categoria,
    ativo         = excluded.ativo,
    preco         = excluded.preco,
    qtde_caixa    = excluded.qtde_caixa,
    descricao     = excluded.descricao,
    ean           = excluded.ean,
    atualizado_em = excluded.atualizado_em
`);

let importados = 0;
let ativos = 0;
let inativos = 0;
let semCodigo = 0;
let comQtde = 0;
let comEan = 0;
const codigosVistos = new Set();
const agora = new Date().toISOString();

function valor(row, chave) {
  const i = idx[chave];
  if (i < 0) return '';
  return row[i];
}

const transacao = db.transaction((rows) => {
  for (const row of rows) {
    const codigo = normalizarCodigo(valor(row, 'codigo'));
    if (!codigo) { semCodigo++; continue; }

    const ativoRaw = String(valor(row, 'ativo') || '').trim().toUpperCase();
    const ativo = (ativoRaw === 'VERDADEIRO' || ativoRaw === 'TRUE' || ativoRaw === '1') ? 1 : 0;

    const frase = valor(row, 'frase_adicional');
    const qtde = extrairQtdeCaixa(frase);
    if (qtde !== null) comQtde++;

    const ean = String(valor(row, 'ean') || '').trim() || null;
    if (ean) comEan++;

    const produto = {
      id: Number(valor(row, 'id')) || null,
      codigo,
      nome: String(valor(row, 'nome') || '').trim(),
      categoria: String(valor(row, 'categoria') || '').trim() || null,
      ativo,
      preco: paraNumero(valor(row, 'preco')),
      qtde_caixa: qtde,
      descricao: String(valor(row, 'descricao') || '').trim() || null,
      ean,
      agora,
    };

    upsert.run(produto);
    importados++;
    codigosVistos.add(codigo);
    if (ativo) ativos++; else inativos++;
  }
});

transacao(linhasDados);

ok('Importados: ' + importados);
ok('Ativos:     ' + ativos);
ok('Inativos:   ' + inativos);
ok('Com qtde de caixa: ' + comQtde);
ok('Com EAN: ' + comEan);
if (semCodigo) aviso('Sem codigo (ignorados): ' + semCodigo);
ok('Codigos unicos: ' + codigosVistos.size);

titulo('Resumo do banco');
const total = db.prepare('SELECT COUNT(*) AS n FROM produtos').get().n;
const totalAtivos = db.prepare('SELECT COUNT(*) AS n FROM produtos WHERE ativo = 1').get().n;
const totalInativos = db.prepare('SELECT COUNT(*) AS n FROM produtos WHERE ativo = 0').get().n;
const totalComQtde = db.prepare('SELECT COUNT(*) AS n FROM produtos WHERE qtde_caixa IS NOT NULL').get().n;
const totalComEan = db.prepare('SELECT COUNT(*) AS n FROM produtos WHERE ean IS NOT NULL').get().n;

ok('Total de produtos: ' + total);
ok('Ativos:            ' + totalAtivos);
ok('Inativos:          ' + totalInativos);
ok('Com qtde de caixa: ' + totalComQtde);
ok('Com EAN:           ' + totalComEan);

console.log('');
console.log('  Banco salvo em: ' + config.banco);
console.log('  Proximo passo: npm run casar');
console.log('');

db.close();
