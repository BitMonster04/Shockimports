import fs from 'node:fs';
import path from 'node:path';

const base = {
  xlsx: {
    pasta: 'dados',
    padraoNome: /Cat[aá]logo.*Shock.*\.xlsx$/i,
    aba: 'products',
    linhasCabecalho: 7,
  },
  imagens: {
    origem: 'dados/imagens_originais',
    destino: 'public/img/produtos',
    formato: 'webp',
    larguraMax: 600,
    qualidade: 80,
    extensoes: ['.jpg', '.jpeg', '.png'],
    ignorarPastas: ['_sem_correspondencia'],
  },
  banco: 'banco/catalogo.db',
  jsonSaida: 'public/dados/produtos.json',
  pdfSaida: 'public/pdf',
  // PDFs sao gerados pelo GitHub Actions (scripts/05-gerar-pdfs.js le o JSON)
  pdf: {
    larguraImagem: 400,
    qualidade: 72,
  },
  relatorios: {
    pasta: 'relatorios',
    semFoto: 'relatorio-sem-foto.txt',
    fotosOrfas: 'relatorio-fotos-orfas.txt',
  },
  catalogo: {
    incluirSemFoto: false,
    apenasAtivos: true,
  },
  logs: {
    pasta: 'logs',
    retencaoDias: 7,
  },
  lockFile: 'banco/.atualizar.lock',
  // Travas do atualizar-tudo.js
  seguranca: {
    maxQuedaPct: 30,      // aborta sem publicar se fotos ou produtos cairem mais que isso
    minParaComparar: 20,  // so compara quedas quando o total anterior for >= isso
    estabilidadeSeg: 60,  // arquivo mexido ha menos que isso = ainda sendo copiado
    ramLivreMinMB: 120,   // com menos RAM livre que isso, adia a rodada (protege o bot)
  },
  git: {
    publicar: true,
    remoto: 'origin',
    branch: 'main',
  },
};

// Sobreposicao local (nao vai pro git): config.local.json
// Ex.: {"catalogo": {"incluirSemFoto": true}}  -> use: npm run sem-foto -- on
let local = {};
try {
  local = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'config.local.json'), 'utf8'));
} catch {}

const ehObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof RegExp);
function mesclar(a, b) {
  const saida = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    saida[k] = ehObjeto(a[k]) && ehObjeto(v) ? mesclar(a[k], v) : v;
  }
  return saida;
}

export default mesclar(base, local);
