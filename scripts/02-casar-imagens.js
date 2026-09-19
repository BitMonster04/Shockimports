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

// Normaliza codigo vindo da imagem:
// - trim + uppercase
// - remove sufixo " (n)" ou "(n)" antes da extensao
function normalizarCodigoImagem(nomeArquivo) {
  const ext = path.extname(nomeArquivo);
  let base = nomeArquivo.slice(0, -ext.length);
  base = base.replace(/\s*\(\d+\)\s*$/, ''); // remove " (1)" / "(4)"
  base = base.trim().toUpperCase();
  return base;
}

// Normaliza codigo vindo do banco (ja esta uppercase, mas garantimos)
function normalizarCodigoBanco(c) {
  return String(c || '').trim().toUpperCase();
}

console.log('');
console.log('SHOCK CATALOGO - Casar imagens com produtos');
console.log('=============================================');

// ------------------------------------------------------------
// 1. Abre o banco
// ------------------------------------------------------------
titulo('Abrindo banco');
const caminhoBanco = path.join(ROOT, config.banco);
if (!fs.existsSync(caminhoBanco)) {
  erro('Banco nao existe. Rode primeiro: npm run importar');
  process.exit(1);
}
const db = new Database(caminhoBanco);
ok('Banco: ' + config.banco);

// ------------------------------------------------------------
// 2. Le produtos do banco
// ------------------------------------------------------------
titulo('Lendo produtos');
const produtos = db.prepare('SELECT id, codigo, nome, ativo FROM produtos').all();
ok('Total de produtos: ' + produtos.length);

// Mapa: codigo normalizado -> produto
const mapaProdutos = new Map();
for (const p of produtos) {
  mapaProdutos.set(normalizarCodigoBanco(p.codigo), p);
}
ok('Codigos unicos no banco: ' + mapaProdutos.size);

// ------------------------------------------------------------
// 3. Escaneia pasta de imagens
// ------------------------------------------------------------
titulo('Escaneando imagens');
const pastaImg = path.join(ROOT, config.imagens.origem);
if (!fs.existsSync(pastaImg)) {
  erro('Pasta ' + config.imagens.origem + ' nao existe');
  process.exit(1);
}

const entradas = fs.readdirSync(pastaImg, { withFileTypes: true });
const fotos = entradas
  .filter(e => e.isFile())
  .filter(e => config.imagens.extensoes.includes(path.extname(e.name).toLowerCase()))
  .map(e => e.name);

ok('Fotos encontradas: ' + fotos.length);

// ------------------------------------------------------------
// 4. Casa produto <-> foto
// ------------------------------------------------------------
titulo('Casando produtos com fotos');

// Mapa: codigo -> melhor arquivo (se houver duplicata, prefere o "limpo" e .jpg/.jpeg/.png nessa ordem)
const mapaFotos = new Map();
for (const nomeArquivo of fotos) {
  const codigo = normalizarCodigoImagem(nomeArquivo);
  if (!codigo) continue;

  const existente = mapaFotos.get(codigo);
  if (!existente) {
    mapaFotos.set(codigo, nomeArquivo);
  } else {
    // Ja existe: escolhe o "melhor"
    // Regra: se um tem sufixo "(n)" e o outro nao, fica o sem sufixo
    const temSufixoExistente = /\(\d+\)\s*\./i.test(existente);
    const temSufixоАtual = /\(\d+\)\s*\./i.test(nomeArquivo);
    if (temSufixoExistente && !temSufixоАtual) {
      mapaFotos.set(codigo, nomeArquivo);
    }
    // senao, mantem o primeiro (ja existente)
  }
}

ok('Codigos unicos de imagem: ' + mapaFotos.size);

let comFoto = 0;
let semFoto = 0;
let ativosComFoto = 0;
let ativosSemFoto = 0;
const codigosCasaram = new Set();

const updateFoto = db.prepare('UPDATE produtos SET imagem = @imagem WHERE codigo = @codigo');

const transacao = db.transaction(() => {
  for (const [codigo, produto] of mapaProdutos) {
    const arquivo = mapaFotos.get(codigo);
    if (arquivo) {
      // Guarda caminho relativo. O script 03 vai gerar a versao otimizada
      // e a extensao final sera .webp
      const base = path.basename(arquivo, path.extname(arquivo));
      const codigoLimpo = base.replace(/\s*\(\d+\)\s*$/, '').trim();
      const caminhoRelativo = 'img/produtos/' + codigoLimpo + '.webp';
      updateFoto.run({ imagem: caminhoRelativo, codigo: produto.codigo });
      codigosCasaram.add(codigo);
      comFoto++;
      if (produto.ativo) ativosComFoto++;
    } else {
      updateFoto.run({ imagem: null, codigo: produto.codigo });
      semFoto++;
      if (produto.ativo) ativosSemFoto++;
    }
  }
});

transacao();

ok('Produtos com foto:    ' + comFoto);
ok('Produtos sem foto:    ' + semFoto);
ok('  - ativos com foto:  ' + ativosComFoto);
ok('  - ativos sem foto:  ' + ativosSemFoto);

// ------------------------------------------------------------
// 5. Fotos orfas (imagem sem produto)
// ------------------------------------------------------------
titulo('Fotos orfas');

const codigosProdutos = new Set(mapaProdutos.keys());
const fotosOrfas = [];
for (const [codigo, arquivo] of mapaFotos) {
  if (!codigosProdutos.has(codigo)) {
    fotosOrfas.push({ codigo, arquivo });
  }
}

if (fotosOrfas.length === 0) {
  ok('Nenhuma foto orfa');
} else {
  aviso(fotosOrfas.length + ' fotos sem produto correspondente');
}

// ------------------------------------------------------------
// 6. Relatorio: produtos sem foto
// ------------------------------------------------------------
titulo('Gerando relatorios');
const pastaRel = path.join(ROOT, config.relatorios.pasta);
fs.mkdirSync(pastaRel, { recursive: true });

// 6a. Sem foto
const semFotoLista = db.prepare(
  'SELECT codigo, nome, categoria, ativo FROM produtos WHERE imagem IS NULL ORDER BY ativo DESC, categoria, codigo'
).all();

const linhasSemFoto = [];
linhasSemFoto.push('='.repeat(70));
linhasSemFoto.push('RELATORIO - PRODUTOS SEM FOTO');
linhasSemFoto.push('='.repeat(70));
linhasSemFoto.push('');
linhasSemFoto.push('Data: ' + new Date().toLocaleString('pt-BR'));
linhasSemFoto.push('Total de produtos sem foto: ' + semFotoLista.length);
linhasSemFoto.push('  - ativos (apareceriam no catalogo se tivessem foto): ' + semFotoLista.filter(p => p.ativo).length);
linhasSemFoto.push('  - inativos (nao aparecem de qualquer forma):        ' + semFotoLista.filter(p => !p.ativo).length);
linhasSemFoto.push('');
linhasSemFoto.push('Legenda de ativo:');
linhasSemFoto.push('  VERDADEIRO = produto tem estoque e deveria aparecer no catalogo');
linhasSemFoto.push('  FALSO      = produto em falta, nao aparece no catalogo');
linhasSemFoto.push('');
linhasSemFoto.push('-' .repeat(70));
linhasSemFoto.push('LISTA (ativos primeiro, depois por categoria e codigo)');
linhasSemFoto.push('-' .repeat(70));
linhasSemFoto.push('');

for (const p of semFotoLista) {
  const status = p.ativo ? 'ATIVO   ' : 'inativo ';
  linhasSemFoto.push(
    status + ' | ' + String(p.codigo).padEnd(15) + ' | ' +
    String(p.categoria || '(sem categoria)').padEnd(25) + ' | ' + p.nome
  );
}

linhasSemFoto.push('');
linhasSemFoto.push('='.repeat(70));

fs.writeFileSync(
  path.join(pastaRel, config.relatorios.semFoto),
  linhasSemFoto.join('\n'),
  'utf8'
);
ok('Salvo: ' + config.relatorios.pasta + '/' + config.relatorios.semFoto);

// 6b. Fotos orfas
const linhasOrfas = [];
linhasOrfas.push('='.repeat(70));
linhasOrfas.push('RELATORIO - FOTOS SEM PRODUTO CORRESPONDENTE');
linhasOrfas.push('='.repeat(70));
linhasOrfas.push('');
linhasOrfas.push('Data: ' + new Date().toLocaleString('pt-BR'));
linhasOrfas.push('Total de fotos orfas: ' + fotosOrfas.length);
linhasOrfas.push('');
linhasOrfas.push('Essas fotos existem na pasta mas NAO tem produto correspondente');
linhasOrfas.push('no XLSX. Podem ser:');
linhasOrfas.push('  - fotos de produtos que foram removidos do catalogo');
linhasOrfas.push('  - fotos com codigo digitado errado');
linhasOrfas.push('  - fotos de produtos novos que ainda nao foram cadastrados');
linhasOrfas.push('');
linhasOrfas.push('-' .repeat(70));
linhasOrfas.push('LISTA');
linhasOrfas.push('-' .repeat(70));
linhasOrfas.push('');

for (const f of fotosOrfas) {
  linhasOrfas.push(String(f.codigo).padEnd(20) + ' | ' + f.arquivo);
}

linhasOrfas.push('');
linhasOrfas.push('='.repeat(70));

fs.writeFileSync(
  path.join(pastaRel, config.relatorios.fotosOrfas),
  linhasOrfas.join('\n'),
  'utf8'
);
ok('Salvo: ' + config.relatorios.pasta + '/' + config.relatorios.fotosOrfas);

// ------------------------------------------------------------
// 7. Resumo final
// ------------------------------------------------------------
titulo('Resumo');
console.log('');
console.log('  Produtos:              ' + produtos.length);
console.log('  Com foto:              ' + comFoto);
console.log('  Sem foto:              ' + semFoto);
console.log('    - ativos sem foto:   ' + ativosSemFoto + '  (apareceriam no catalogo)');
console.log('  Fotos orfas:           ' + fotosOrfas.length);
console.log('');
console.log('  Proximo passo: npm run otimizar');
console.log('');

db.close();
