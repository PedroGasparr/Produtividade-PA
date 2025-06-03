
    // Configuração do Firebase
    const database = firebase.database();
    const { jsPDF } = window.jspdf;

    // Gera um código de funcionário no formato GZL-EO-XXXXX
    function gerarCodigoFuncionario() {
        const digitos = 5; // Quantidade fixa de dígitos
        let codigo = 'GZL-EO-';
        for (let i = 0; i < digitos; i++) {
            codigo += Math.floor(Math.random() * 10);
        }
        return codigo;
    }

    // Cadastra um novo funcionário no Firebase
    async function cadastrarFuncionario(event) {
        event.preventDefault();

        const nome = document.getElementById('nomeFuncionario').value.trim();
        const cargo = document.getElementById('cargoFuncionario').value.trim();
        
        if (!nome || !cargo) {
            mostrarNotificacao('Por favor, preencha todos os campos.', 'error');
            return;
        }

        const codigo = gerarCodigoFuncionario();

        try {
            mostrarNotificacao('Cadastrando funcionário...', 'info');
            
            const funcionariosRef = database.ref('funcionarios');
            const novoFuncionarioRef = funcionariosRef.push();

            await novoFuncionarioRef.set({
                nome,
                cargo,
                codigo,
                dataCadastro: firebase.database.ServerValue.TIMESTAMP
            });

            atualizarVisual(nome, cargo, codigo);
            mostrarNotificacao('Funcionário cadastrado com sucesso!', 'success');
        } catch (error) {
            console.error("Erro ao cadastrar funcionário:", error);
            mostrarNotificacao(`Erro ao cadastrar: ${error.message}`, 'error');
        }
    }

    // Atualiza a interface com os dados do funcionário
    function atualizarVisual(nome, cargo, codigo) {
        // Limpa e atualiza os dados na tela
        const qrCodeContainer = document.getElementById('qrcode');
        qrCodeContainer.innerHTML = '';
        
        document.getElementById('qrNome').textContent = nome;
        document.getElementById('qrCargo').textContent = cargo;
        document.getElementById('qrCodigo').textContent = codigo;

        // Gera o QR Code
        new QRCode(qrCodeContainer, {
            text: codigo,
            width: 150,
            height: 150,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // Exibe a seção de QR Code
        document.getElementById('qrSection').style.display = 'block';
        document.getElementById('qrSection').scrollIntoView({ behavior: 'smooth' });
        
        // Reseta o formulário
        document.getElementById('funcionarioForm').reset();
    }

    // Gera o PDF com o QR Code do funcionário
    async function gerarPDFQRCode() {
        const nome = document.getElementById('qrNome').textContent;
        const cargo = document.getElementById('qrCargo').textContent;
        const codigo = document.getElementById('qrCodigo').textContent;

        if (!codigo) {
            mostrarNotificacao("Nenhum QR Code disponível para download.", 'error');
            return;
        }

        try {
            mostrarNotificacao("Gerando PDF...", 'info');
            
            // Criar um novo PDF
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [80, 120]
            });

            // Adicionar conteúdo ao PDF
            pdf.setFontSize(10);
            pdf.text('Identificação Funcionário', 40, 10, { align: 'center' });
            
            // Adicionar informações do funcionário
            pdf.setFontSize(8);
            pdf.text(`Nome: ${nome}`, 10, 20);
            pdf.text(`Cargo: ${cargo}`, 10, 25);
            pdf.text(`Código: ${codigo}`, 10, 30);
            
            // Opção 1: Gerar QR Code diretamente (mais confiável)
            try {
                const qrCodeData = await generateQRCodeDataURL(codigo);
                pdf.addImage(qrCodeData, 'PNG', 25, 35, 30, 30);
            } catch (qrError) {
                console.warn("Falha ao gerar QR direto, tentando método alternativo:", qrError);
                
                // Opção 2: Método alternativo usando html2canvas
                const qrCodeElement = document.getElementById('qrcode');
                const canvas = await html2canvas(qrCodeElement, {
                    scale: 2,
                    logging: true,
                    useCORS: true,
                    allowTaint: true
                });
                
                const imgData = canvas.toDataURL('image/png');
                pdf.addImage(imgData, 'PNG', 25, 35, 30, 30);
            }
            
            // Salvar o PDF
            pdf.save(`QR_${codigo}.pdf`);
            mostrarNotificacao("PDF gerado com sucesso!", 'success');
            
        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            mostrarNotificacao(`Erro ao gerar PDF: ${error.message}`, 'error');
            
            // Fallback: PDF simples sem imagem
            if (error.message.includes('PNG')) {
                generateSimplePDF(nome, cargo, codigo);
            }
        }
    }

    // Gera QR Code como Data URL
    function generateQRCodeDataURL(text) {
        return new Promise((resolve) => {
            const qrContainer = document.createElement('div');
            new QRCode(qrContainer, {
                text: text,
                width: 120,
                height: 120,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            
            setTimeout(() => {
                const canvas = qrContainer.querySelector('canvas');
                resolve(canvas.toDataURL('image/png'));
            }, 100);
        });
    }

    // Fallback para PDF simples
    function generateSimplePDF(nome, cargo, codigo) {
        try {
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [80, 120]
            });
            
            pdf.setFontSize(10);
            pdf.text('Identificação Funcionário', 40, 10, { align: 'center' });
            
            pdf.setFontSize(8);
            pdf.text(`Nome: ${nome}`, 10, 20);
            pdf.text(`Cargo: ${cargo}`, 10, 25);
            pdf.text(`Código: ${codigo}`, 10, 30);
            pdf.text('QR Code não pôde ser gerado', 10, 40);
            
            pdf.save(`QR_${codigo}_simple.pdf`);
            mostrarNotificacao("PDF alternativo gerado!", 'info');
        } catch (simpleError) {
            console.error("Erro no fallback:", simpleError);
            mostrarNotificacao("Falha ao gerar versão alternativa", 'error');
        }
    }

    // Sistema de notificações melhorado
    function mostrarNotificacao(mensagem, tipo = 'info') {
        // Remove notificações antigas
        const notificacoesAntigas = document.querySelectorAll('.notificacao');
        notificacoesAntigas.forEach(not => not.remove());

        const cores = {
            success: '#4CAF50',
            error: '#F44336',
            info: '#2196F3',
            warning: '#FF9800'
        };

        const notificacao = document.createElement('div');
        notificacao.className = `notificacao ${tipo}`;
        notificacao.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px;
            background-color: ${cores[tipo] || cores.info};
            color: white;
            border-radius: 5px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;
        
        notificacao.textContent = mensagem;
        document.body.appendChild(notificacao);

        // Remove após 5 segundos
        setTimeout(() => {
            notificacao.style.animation = 'fadeOut 0.5s ease-out';
            setTimeout(() => notificacao.remove(), 500);
        }, 5000);
    }

    // Adiciona estilos para as animações
    function adicionarEstilosNotificacao() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // Inicialização do sistema
    document.addEventListener('DOMContentLoaded', () => {
        adicionarEstilosNotificacao();
        
        // Formulário de cadastro
        document.getElementById('funcionarioForm').addEventListener('submit', cadastrarFuncionario);
        
        // Botão de download do QR Code
        document.getElementById('downloadQrBtn').addEventListener('click', gerarPDFQRCode);
        
        // Verificação de autenticação
        firebase.auth().onAuthStateChanged(user => {
            if (!user) {
                window.location.href = 'login.html';
            } else {
                document.getElementById('currentUser').textContent = user.email;
            }
        });
        
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            firebase.auth().signOut().then(() => {
                window.location.href = 'login.html';
            });
        });
    });
