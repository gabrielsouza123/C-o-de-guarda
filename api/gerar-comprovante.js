const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Função para formatar o valor em reais (R$)
function formatarValorEmReais(valor) {
    const valorNumerico = typeof valor === 'string' ? parseFloat(valor) : valor;
    if (isNaN(valorNumerico)) {
        throw new Error('Valor inválido');
    }
    return valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

module.exports = async (req, res) => {
    const dados = req.body;
    const valorFormatado = formatarValorEmReais(dados.valor);

    try {
        // Renderiza o template EJS com os dados fornecidos
        const html = await renderTemplate(req.app, 'comprovante', {
            nomeEmissor: dados.nomeEmissor,
            documentoEmissor: dados.documentoEmissor,
            bancoEmissor: dados.bancoEmissor,
            agenciaEmissor: dados.agenciaEmissor,
            contaEmissor: dados.contaEmissor,
            nomeReceptor: dados.nomeReceptor,
            documentoReceptor: dados.documentoReceptor,
            bancoReceptor: dados.bancoReceptor,
            agenciaReceptor: dados.agenciaReceptor,
            contaReceptor: dados.contaReceptor,
            valor: valorFormatado,
            dataTransacao: dados.dataTransacao,
            transacaoId: dados.transacaoId
        });

        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        
        // Carrega o conteúdo HTML gerado pelo EJS
        await page.setContent(html);
        
        // Calcula o tamanho do conteúdo
        const contentSize = await page.evaluate(() => {
            const element = document.querySelector('.comprovante-wrapper');
            const { width, height } = element.getBoundingClientRect();
            return { width, height };
        });
        
        // Define o tamanho da página com base no tamanho do conteúdo
        await page.setViewport({
            width: Math.ceil(contentSize.width),
            height: Math.ceil(contentSize.height),
            deviceScaleFactor: 2 // Para melhor qualidade
        });
        
        // Captura a tela incluindo a margem de 24px
        const fileName = `comprovante-${Date.now()}.jpg`;
        const imagePath = path.join(__dirname, '..', 'comprovantes', fileName);
        await page.screenshot({
            path: imagePath,
            type: 'jpeg',
            quality: 100,
            clip: {
                x: 0,
                y: 0,
                width: Math.ceil(contentSize.width),
                height: Math.ceil(contentSize.height)
            }
        });

        // Fecha o Puppeteer
        await browser.close();

        // Retorne a URL do comprovante gerado
        const fileUrl = `${req.protocol}://${req.get('host')}/comprovantes/${fileName}`;

        // Retorna a URL na resposta
        res.json({ url: fileUrl });
    } catch (error) {
        console.error('Erro ao gerar o comprovante:', error);
        res.status(500).send('Erro ao gerar o comprovante');
    }
};
