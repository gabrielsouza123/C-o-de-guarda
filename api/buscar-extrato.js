const path = require('path');
const fs = require('fs');

// Função para converter de DD/MM/YYYY para YYYY-MM-DD
function formatarDataParaISO(data) {
    const [dia, mes, ano] = data.split('/');
    return `${ano}-${mes}-${dia}`;
}

// Função para formatar data do formato YYYY-MM-DD para DD/MM/YYYY
function formatarDataParaUsuario(data) {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
}

// Função para comparar datas no formato YYYY-MM-DD
function compararDatas(data1, data2) {
    return new Date(data1) <= new Date(data2);
}

module.exports = async (req, res) => {
    const { celular, dataInicio, dataFim } = req.query; // Obtem os parâmetros da URL
    const userDir = path.join(__dirname, '..', 'extratos', celular); // Diretório do celular

    // Verifica se o celular foi enviado na query
    if (!celular) {
        return res.status(400).json({
            message: 'Erro: O campo celular é obrigatório.'
        });
    }

    // Verifica se o diretório do celular existe
    if (!fs.existsSync(userDir)) {
        return res.status(404).json({
            message: `Erro: Nenhum extrato encontrado para o número de celular ${celular}.`
        });
    }

    try {
        // Lê todos os arquivos PDF do diretório do celular
        let arquivos = fs.readdirSync(userDir).filter(file => file.endsWith('.pdf'));

        // Se dataInicio e dataFim forem enviados, filtra os arquivos pela data
        if (dataInicio && dataFim) {
            const dataInicioISO = formatarDataParaISO(dataInicio);
            const dataFimISO = formatarDataParaISO(dataFim);

            arquivos = arquivos.filter(file => {
                // Extrai as datas do nome do arquivo (no formato YYYY-MM-DD)
                const matches = file.match(/extrato-.*-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})\.pdf/);
                if (matches) {
                    const fileDataInicio = matches[1];
                    const fileDataFim = matches[2];

                    // Retorna true se o intervalo do arquivo estiver completamente dentro do intervalo fornecido
                    return compararDatas(dataInicioISO, fileDataInicio) && compararDatas(fileDataFim, dataFimISO);
                }
                return false;
            });
        }

        // Verifica se encontrou algum arquivo após o filtro
        if (arquivos.length === 0) {
            return res.status(404).json({
                message: 'Nenhum extrato encontrado para os parâmetros fornecidos.'
            });
        }

        // Mapeia os arquivos encontrados para URLs acessíveis e inclui as datas formatadas
        const arquivosDetalhados = arquivos.map(file => {
            const matches = file.match(/extrato-.*-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})\.pdf/);
            const fileDataInicio = matches[1];
            const fileDataFim = matches[2];

            return {
                url: `https://app.chatbank.com.br/extratos/${celular}/${file}`,
                dataInicio: formatarDataParaUsuario(fileDataInicio),
                dataFim: formatarDataParaUsuario(fileDataFim)
            };
        });

        res.json({
            message: 'Extratos encontrados:',
            arquivos: arquivosDetalhados
        });
    } catch (error) {
        console.error('Erro ao buscar os extratos:', error);
        res.status(500).send('Erro ao buscar os extratos');
    }
};