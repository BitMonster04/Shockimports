export default {
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
};
