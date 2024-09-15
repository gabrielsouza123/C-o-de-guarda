const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

// Definir pasta de arquivos estáticos (imagens, CSS, JS)
const app = express();
app.use('/assets', express.static('assets'));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Função para formatar o valor em reais (R$)
function formatarValorEmReais(valor) {
    const valorNumerico = typeof valor === 'string' ? parseFloat(valor) : valor;
    if (isNaN(valorNumerico)) {
        throw new Error('Valor inválido');
    }
    return valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Rota POST para receber os dados e gerar o comprovante
app.post('/gerar-comprovante', async (req, res) => {
    const dados = req.body;
    const valorFormatado = formatarValorEmReais(dados.valor);

    try {
        // Renderiza o template EJS com os dados fornecidos
        const html = await renderTemplate('comprovante', {
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
        const imagePath = path.join(__dirname, 'comprovantes', `comprovante-${Date.now()}.jpg`);
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

        // Envia a imagem gerada
        res.set('Content-Type', 'image/jpeg');
        res.sendFile(imagePath);
    } catch (error) {
        console.error('Erro ao gerar o comprovante:', error);
        res.status(500).send('Erro ao gerar o comprovante');
    }
});

// Função para renderizar o template EJS
function renderTemplate(templateName, data) {
    return new Promise((resolve, reject) => {
        app.render(templateName, data, (err, html) => {
            if (err) {
                return reject(err);
            }
            resolve(html);
        });
    });
}

// Inicia o servidor na porta 3000
app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
});
