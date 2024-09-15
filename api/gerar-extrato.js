const puppeteer = require('puppeteer');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Inicializa o dotenv para carregar variáveis do arquivo .env
dotenv.config();

// Token estático para autenticação
const BEARER_TOKEN = process.env['auth_token'];

// Função para formatar a data no formato 00/00/0000
function formatarData(data) {
    const dataObj = new Date(data);
    const dia = String(dataObj.getDate()).padStart(2, '0');
    const mes = String(dataObj.getMonth() + 1).padStart(2, '0'); // Meses começam em 0
    const ano = dataObj.getFullYear();
    return `${dia}/${mes}/${ano}`;
}

// Função para formatar valores em BRL com 2 casas decimais
function formatarValorBRL(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
    }).format(valor);
}

// Função para renderizar o template EJS
function renderTemplate(app, templateName, data) {
    return new Promise((resolve, reject) => {
        app.render(templateName, data, (err, html) => {
            if (err) {
                return reject(err);
            }
            resolve(html);
        });
    });
}

// Função para validar as transações
function validarTransacoes(transacoes) {
    const transacoesValidas = transacoes.filter(transacao => {
        const { data, descricao, valor } = transacao;
        const isValid = (data && descricao && valor !== undefined);  // Verifica se o valor existe
        return isValid;
    });

    const transacoesInvalidas = transacoes.length - transacoesValidas.length;
    return {
        validas: transacoesValidas,
        invalidas: transacoesInvalidas
    };
}

// Função para dividir um array em blocos menores
function dividirEmBlocos(array, tamanho) {
    const blocos = [];
    for (let i = 0; i < array.length; i += tamanho) {
        blocos.push(array.slice(i, i + tamanho));
    }
    return blocos;
}

module.exports = async (req, res) => {
    // Importação dinâmica do `pdf-merger-js`
    const PDFMerger = (await import('pdf-merger-js')).default;

    // Verificação do token de autorização
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== BEARER_TOKEN) {
        return res.status(401).json({
            message: "Erro: Token inválido ou ausente."
        });
    }

    const dados = req.body;  // Dados enviados no corpo da requisição
    const bancos = dados.bancos;  // Bancos vindos da requisição
    // Verifica se o celular é válido no formato BR
    const celular = dados.celular.replace(/\D/g, ''); 

    // Verifica se o payload está vazio
    if (!dados || !bancos || bancos.length === 0) {
        return res.status(400).json({
            message: "Erro: O payload não pode estar vazio. Pelo menos um banco com transações deve ser enviado."
        });
    }

    try {
        const browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        const transacoesPorBancoPorPagina = 9;
        const transacoesPorPagina = 8; // Limite de 9 transações por página
        const nomeUsuarioSemEspacos = dados.nomeUsuario.replace(/\s+/g, '_'); // Substitui espaços por '_'
        const timestamp = Date.now(); // Usando o mesmo timestamp para gerar a URL e o nome do arquivo
        
        // Formatar o nome do arquivo com as datas fornecidas
        const pdfFileName = `extrato-${nomeUsuarioSemEspacos}-${dados.dataInicio}-${dados.dataFim}.pdf`;
        
        // Cria um diretório para o celular do usuário
        const userDir = path.join(__dirname, '..', 'extratos', celular);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        
        const pdfFilePath = path.join(userDir, pdfFileName);
        const merger = new PDFMerger(); // Instância para juntar os PDFs temporários

        // Processa e divide os bancos e suas transações
        const bancosProcessados = [];

        for (let banco of bancos) {
            if (!banco.transacoes || banco.transacoes.length === 0) {
                return res.status(400).json({
                    message: `Erro: O banco ${banco.nome} deve conter pelo menos uma transação.`
                });
            }
        
            const validacao = validarTransacoes(banco.transacoes);
            banco.transacoes = validacao.validas.map(transacao => {
                return {
                    ...transacao,
                    valor: parseFloat(transacao.valor) || 0  // Garante que 'valor' seja um número
                };
            });
        
            if (validacao.invalidas > 0) {
                return res.status(400).json({
                    message: `Erro: ${validacao.invalidas} transações inválidas encontradas no banco ${banco.nome}.`
                });
            }
        
            // Dividir as transações em blocos de 4
            const blocosTransacoes = dividirEmBlocos(banco.transacoes, transacoesPorBancoPorPagina);
            const totalBanco = banco.transacoes.reduce((acc, transacao) => acc + transacao.valor, 0);
        
            // Para cada bloco de transações, criar uma "subconta" para renderização
            blocosTransacoes.forEach((transacoes, index) => {
                const subconta = {
                    nome: banco.nome,
                    agencia: banco.agencia,
                    conta: banco.conta,
                    transacoes: transacoes,
                    total: formatarValorBRL(totalBanco), // Formata o total em BRL
                    mostrarTotal: index === blocosTransacoes.length - 1 // Só mostra o total na última subconta
                };
                bancosProcessados.push(subconta);
            });
        }

        // Agrupar as subcontas em páginas com até 9 transações por página
        const paginas = [];
        let paginaAtual = [];
        let transacoesNaPagina = 0;

        for (let banco of bancosProcessados) {
            // Para cada banco, se o número de transações exceder o limite da página, cria uma nova página
            const transacoesBanco = banco.transacoes.length;

            if (transacoesNaPagina + transacoesBanco > transacoesPorPagina) {
                // Adiciona a página atual ao array de páginas e cria uma nova página
                paginas.push(paginaAtual);
                paginaAtual = [];
                transacoesNaPagina = 0;
            }

            // Adiciona o banco à página atual e incrementa o contador de transações
            paginaAtual.push(banco);
            transacoesNaPagina += transacoesBanco;
        }

        // Adiciona a última página (caso tenha ficado alguma pendente)
        if (paginaAtual.length > 0) {
            paginas.push(paginaAtual);
        }

        // Gera o HTML para cada página e cria PDFs temporários
        for (let pagina of paginas) {
            const html = await renderTemplate(req.app, 'extrato', {
                nomeUsuario: dados.nomeUsuario,
                numeroContas: dados.numeroContas,
                dataInicio: formatarData(dados.dataInicio),
                dataFim: formatarData(dados.dataFim), 
                bancos: pagina
            });

            // Estilos aplicados para ajustar à folha A4
            const htmlComEstilos = `
                <style>
                    .content {
                        width: 100%;
                        height: 100%;
                        padding: 10mm;
                        box-sizing: border-box;
                        overflow: hidden;
                    }
                </style>
                <div class="content">
                    ${html}
                </div>
            `;

            // Carrega o conteúdo HTML gerado pelo EJS com os estilos aplicados
            await page.setContent(htmlComEstilos, { waitUntil: 'networkidle0' });

            // Gera o PDF temporário para a página atual
            const tempPdfPath = path.join(userDir, `temp-${Date.now()}.pdf`);
            await page.pdf({
                path: tempPdfPath,
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '0mm',
                    bottom: '0mm',
                    left: '0mm',
                    right: '0mm'
                },
                width: '210mm',
                height: '297mm'
            });

            // Adiciona o PDF temporário ao merger
            merger.add(tempPdfPath);
        }

        // Fecha o navegador
        await browser.close();

        // Junta todos os PDFs temporários em um único arquivo
        await merger.save(pdfFilePath);

        // Limpa os PDFs temporários
        fs.readdirSync(userDir).forEach(file => {
            if (file.startsWith('temp-')) {
                fs.unlinkSync(path.join(userDir, file));
            }
        });
        
        // Retorna o arquivo PDF final com a URL real
        res.json({
            message: 'PDF gerado com sucesso!',
            arquivo: `https://app.chatbank.com.br/extratos/${celular}/${pdfFileName}`
        });

    } catch (error) {
        console.error('Erro ao gerar o extrato:', error);
        res.status(500).send('Erro ao gerar o extrato');
    }
};
