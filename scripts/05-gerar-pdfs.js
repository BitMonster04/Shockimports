import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import config from '../config.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const linha = () => console.log('-'.repeat(60));
const titulo = (t) => { console.log(''); linha(); console.log('  ' + t); linha(); };
const ok = (m) => console.log('  OK   ' + m);
const aviso = (m) => console.log('  !    ' + m);
const erro = (m) => console.log('  X    ' + m);

const COR_LARANJA = '#F2720C';
const COR_LARANJA_ESCURO = '#C85300';
const COR_CINZA = '#232323';
const COR_CINZA_MEDIO = '#8C8D91';
const COR_BRANCO = '#FFFFFF';

const A4 = { width: 595.28, height: 841.89 };
const MARGEM = 30;
const PRODUTOS_POR_PAGINA = 6;
const COLUNAS = 2;
const LINHAS = 3;

const GRID_LARGURA = A4.width - MARGEM * 2;
const GRID_ALTURA = A4.height - 200;
const CARD_LARGURA = GRID_LARGURA / COLUNAS - 8;
const CARD_ALTURA = GRID_ALTURA / LINHAS - 8;
const CARD_IMG_ALTURA = CARD_ALTURA * 0.62;

// Cache de imagens já convertidas pra JPEG (evita converter 2x)
const cacheImagens = new Map();

async function carregarImagemComoJpeg(caminhoWebp) {
  if (cacheImagens.has(caminhoWebp)) {
    return cacheImagens.get(caminhoWebp);
  }
  if (!fs.existsSync(caminhoWebp)) {
    cacheImagens.set(caminhoWebp, null);
    return null;
  }
  try {
    const buf = await sharp(caminhoWebp)
      .resize({ width: config.pdf.larguraImagem, withoutEnlargement: true })
      .jpeg({ quality: config.pdf.qualidade })
      .toBuffer();
    cacheImagens.set(caminhoWebp, buf);
    return buf;
  } catch (e) {
    cacheImagens.set(caminhoWebp, null);
    return null;
  }
}

function fmtPreco(v) {
  if (v === null || v === undefined) return '';
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}

function dataBR() {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function desenharCard(doc, produto, imgBuffer, x, y, largura, altura) {
  doc.rect(x, y, largura, altura)
     .lineWidth(0.5)
     .strokeColor('#E0E0E0')
     .stroke();

  const imgX = x + 6;
  const imgY = y + 6;
  const imgW = largura - 12;
  const imgH = CARD_IMG_ALTURA;

  doc.rect(imgX, imgY, imgW, imgH).fill('#F5F5F5');

  if (imgBuffer) {
    try {
      doc.image(imgBuffer, imgX + 4, imgY + 4, {
        fit: [imgW - 8, imgH - 8],
        align: 'center',
        valign: 'center',
      });
    } catch (e) {}
  } else {
    doc.fontSize(8).fillColor(COR_CINZA_MEDIO).font('Helvetica')
       .text('Foto em breve', imgX, imgY + imgH / 2 - 4, { width: imgW, align: 'center' });
  }

  let infoY = imgY + imgH + 6;
  const infoX = x + 8;
  const infoW = largura - 16;

  doc.fontSize(7).fillColor(COR_CINZA_MEDIO).font('Helvetica-Bold')
     .text(produto.codigo, infoX, infoY, { width: infoW });
  infoY += 10;

  doc.fontSize(8).fillColor(COR_CINZA).font('Helvetica-Bold')
     .text(produto.nome, infoX, infoY, { width: infoW, height: 22, ellipsis: true });
  infoY += 24;

  doc.fontSize(11).fillColor(COR_LARANJA).font('Helvetica-Bold')
     .text(fmtPreco(produto.preco), infoX, infoY, { width: infoW });
  infoY += 14;

  doc.fontSize(7).fillColor(COR_CINZA_MEDIO).font('Helvetica');
  const partes = [];
  if (produto.qtde_caixa) partes.push(produto.qtde_caixa + ' un/cx');
  if (produto.ean) partes.push('EAN: ' + produto.ean);
  if (partes.length) {
    doc.text(partes.join('  -  '), infoX, infoY, { width: infoW });
  }
}

function gerarPDF(produtosComImg, titulo, nomeArquivo) {
  return new Promise((resolve, reject) => {
    const caminho = path.join(ROOT, config.pdfSaida, nomeArquivo);
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const stream = fs.createWriteStream(caminho);
    doc.pipe(stream);

    doc.addPage();
    doc.rect(0, 0, A4.width, 8).fill(COR_LARANJA);

    const logo = path.join(ROOT, 'public', 'Logo Shock Imports.png');
    if (fs.existsSync(logo)) {
      try {
        doc.image(logo, A4.width / 2 - 90, 120, { fit: [180, 120], align: 'center' });
      } catch (e) {}
    }

    doc.fontSize(28).fillColor(COR_CINZA).font('Helvetica-Bold')
       .text(titulo, 0, 320, { align: 'center', width: A4.width });

    doc.fontSize(12).fillColor(COR_CINZA_MEDIO).font('Helvetica')
       .text('Catalogo de Produtos', 0, 365, { align: 'center', width: A4.width });

    doc.fontSize(10).fillColor(COR_CINZA_MEDIO)
       .text(produtosComImg.length + ' produtos  -  ' + dataBR(), 0, 420, {
         align: 'center', width: A4.width,
       });

    doc.fontSize(9).fillColor(COR_CINZA_MEDIO)
       .text('Shock Imports Comercial Ltda', 0, A4.height - 60, {
         align: 'center', width: A4.width,
       });

    for (let i = 0; i < produtosComImg.length; i += PRODUTOS_POR_PAGINA) {
      doc.addPage();
      const pagina = Math.floor(i / PRODUTOS_POR_PAGINA) + 1;
      const totalPaginas = Math.ceil(produtosComImg.length / PRODUTOS_POR_PAGINA);

      doc.rect(0, 0, A4.width, 6).fill(COR_LARANJA);
      doc.fontSize(10).fillColor(COR_CINZA).font('Helvetica-Bold')
         .text('SHOCK IMPORTS', MARGEM, 18);
      doc.fontSize(8).fillColor(COR_CINZA_MEDIO).font('Helvetica')
         .text(titulo, MARGEM, 34);
      doc.fontSize(8).fillColor(COR_CINZA_MEDIO)
         .text('Pag. ' + pagina + '/' + totalPaginas, 0, 18, {
           align: 'right', width: A4.width - MARGEM,
         });

      const bloco = produtosComImg.slice(i, i + PRODUTOS_POR_PAGINA);
      bloco.forEach((item, j) => {
        const col = j % COLUNAS;
        const lin = Math.floor(j / COLUNAS);
        const x = MARGEM + col * (CARD_LARGURA + 8);
        const y = 60 + lin * (CARD_ALTURA + 8);
        desenharCard(doc, item.produto, item.imagem, x, y, CARD_LARGURA, CARD_ALTURA);
      });

      doc.fontSize(7).fillColor(COR_CINZA_MEDIO)
         .text('Shock Imports Comercial Ltda  -  Gerado em ' + dataBR(),
               0, A4.height - 20, { align: 'center', width: A4.width });
    }

    doc.end();
    stream.on('finish', () => resolve(caminho));
    stream.on('error', reject);
  });
}

console.log('');
console.log('SHOCK CATALOGO - Gerar PDFs');
console.log('============================');

titulo('Lendo o JSON do catalogo');
const caminhoJson = path.join(ROOT, config.jsonSaida);
if (!fs.existsSync(caminhoJson)) {
  erro('JSON nao existe: ' + config.jsonSaida + '. Rode: npm run json');
  process.exit(1);
}
const dadosCatalogo = JSON.parse(fs.readFileSync(caminhoJson, 'utf8'));
ok('JSON: ' + config.jsonSaida);

titulo('Lendo produtos');
const produtos = dadosCatalogo.produtos.map(p => ({
  codigo: p.codigo,
  nome: p.nome,
  categoria: p.categoria,
  preco: p.preco,
  qtde_caixa: p.qtdeCaixa,
  ean: p.ean,
  imagem: p.imagem,
}));
ok('Produtos para o PDF: ' + produtos.length);

titulo('Pre-convertendo imagens WebP para JPEG');
const tPrep = Date.now();
const produtosComImg = [];
for (let i = 0; i < produtos.length; i++) {
  const p = produtos[i];
  const imgBuffer = p.imagem ? await carregarImagemComoJpeg(path.join(ROOT, 'public', p.imagem)) : null;
  produtosComImg.push({ produto: p, imagem: imgBuffer });

  if ((i + 1) % 100 === 0) {
    console.log('  ' + (i + 1) + '/' + produtos.length + ' imagens convertidas...');
  }
}
ok('Conversao concluida em ' + ((Date.now() - tPrep) / 1000).toFixed(1) + 's');
ok('Imagens em cache: ' + cacheImagens.size);

titulo('Preparando pasta de saida');
const pastaPdf = path.join(ROOT, config.pdfSaida);
fs.mkdirSync(pastaPdf, { recursive: true });
ok('Destino: ' + config.pdfSaida);

titulo('Gerando PDF completo');
const t0 = Date.now();
const caminhoCompleto = await gerarPDF(produtosComImg, 'Catalogo Completo', 'catalogo-completo.pdf');
const tamanhoMB = (fs.statSync(caminhoCompleto).size / 1024 / 1024).toFixed(2);
ok('catalogo-completo.pdf (' + tamanhoMB + ' MB, ' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');

titulo('Gerando PDFs por categoria');
const categorias = [...new Set(produtos.map(p => p.categoria))].sort();
for (const cat of categorias) {
  const doCat = produtosComImg.filter(x => x.produto.categoria === cat);
  const slug = cat
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const nomeArq = 'catalogo-' + slug + '.pdf';
  const t = Date.now();
  const caminho = await gerarPDF(doCat, cat, nomeArq);
  const mb = (fs.statSync(caminho).size / 1024 / 1024).toFixed(2);
  ok(nomeArq + ' (' + doCat.length + ' produtos, ' + mb + ' MB, ' + ((Date.now() - t) / 1000).toFixed(1) + 's)');
}

titulo('Resumo');
console.log('');
console.log('  PDFs gerados em: ' + config.pdfSaida);
console.log('  Total de arquivos: ' + (1 + categorias.length));
console.log('');
console.log('  Proximo passo: subir pro GitHub');
console.log('');

