// Configuração do Firebase
const database = firebase.database();
const { jsPDF } = window.jspdf;

// Variável para armazenar o funcionário selecionado
let selectedEmployee = null;

// Busca funcionários pelo nome
function buscarFuncionarios() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    
    if (!searchTerm) {
        mostrarNotificacao('Digite um nome para buscar', 'warning');
        return;
    }

    mostrarNotificacao('Buscando funcionários...', 'info');
    
    const funcionariosRef = database.ref('funcionarios');
    funcionariosRef.once('value')
        .then(snapshot => {
            const resultsList = document.getElementById('resultsList');
            resultsList.innerHTML = '';
            
            const funcionarios = [];
            snapshot.forEach(childSnapshot => {
                const funcionario = childSnapshot.val();
                funcionario.id = childSnapshot.key;
                funcionarios.push(funcionario);
            });
            
            // Corrigido: Filtra e depois ordena
            const resultados = funcionarios.filter(func => 
                func.nome.toLowerCase().includes(searchTerm))
                .sort((a, b) => a.nome.localeCompare(b.nome));
            
            if (resultados.length === 0) {
                resultsList.innerHTML = '<p class="empty-message">Nenhum funcionário encontrado com esse nome.</p>';
                return;
            }
            
            // Restante do código permanece igual...
            resultados.forEach(func => {
                const funcElement = document.createElement('div');
                funcElement.className = 'result-item';
                funcElement.innerHTML = `
                    <div class="func-info">
                        <h3>${func.nome}</h3>
                        <p><strong>Cargo:</strong> ${func.cargo}</p>
                        <p><strong>Código:</strong> ${func.codigo}</p>
                    </div>
                    <button class="btn primary-btn view-btn" data-id="${func.id}">
                        <i class="fas fa-eye"></i> Visualizar
                    </button>
                `;
                resultsList.appendChild(funcElement);
            });
            
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const funcId = this.getAttribute('data-id');
                    carregarFuncionario(funcId, resultados.find(f => f.id === funcId));
                });
            });
        })
        .catch(error => {
            console.error("Erro ao buscar funcionários:", error);
            mostrarNotificacao(`Erro ao buscar: ${error.message}`, 'error');
        });
}

// Carrega os dados de um funcionário específico
function carregarFuncionario(id, funcionario) {
    selectedEmployee = { id, ...funcionario };
    
    // Atualiza a visualização do QR Code
    const qrCodeContainer = document.getElementById('qrcode');
    qrCodeContainer.innerHTML = '';
    
    document.getElementById('qrNome').textContent = funcionario.nome;
    document.getElementById('qrCargo').textContent = funcionario.cargo;
    document.getElementById('qrCodigo').textContent = funcionario.codigo;

    // Gera o QR Code
    new QRCode(qrCodeContainer, {
        text: funcionario.codigo,
        width: 150,
        height: 150,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    // Exibe a seção de QR Code
    document.getElementById('qrSection').style.display = 'block';
    document.getElementById('qrSection').scrollIntoView({ behavior: 'smooth' });
}

// Exclui um funcionário
function excluirFuncionario() {
    if (!selectedEmployee || !selectedEmployee.id) {
        mostrarNotificacao('Nenhum funcionário selecionado', 'error');
        return;
    }

    if (!confirm(`Tem certeza que deseja excluir o funcionário ${selectedEmployee.nome}? Esta ação não pode ser desfeita.`)) {
        return;
    }

    mostrarNotificacao('Excluindo funcionário...', 'info');
    
    database.ref(`funcionarios/${selectedEmployee.id}`).remove()
        .then(() => {
            mostrarNotificacao('Funcionário excluído com sucesso!', 'success');
            document.getElementById('qrSection').style.display = 'none';
            document.getElementById('searchInput').value = '';
            document.getElementById('resultsList').innerHTML = '<p class="empty-message">Nenhum funcionário encontrado. Faça uma busca acima.</p>';
            selectedEmployee = null;
        })
        .catch(error => {
            console.error("Erro ao excluir funcionário:", error);
            mostrarNotificacao(`Erro ao excluir: ${error.message}`, 'error');
        });
}

// Gera o PDF com o QR Code do funcionário
async function gerarPDFQRCode() {
    if (!selectedEmployee) {
        mostrarNotificacao("Nenhum funcionário selecionado.", 'error');
        return;
    }

    const { nome, cargo, codigo } = selectedEmployee;

    try {
        mostrarNotificacao("Gerando PDF...", 'info');
        
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
        
        // Gera QR Code como imagem
        const qrContainer = document.createElement('div');
        new QRCode(qrContainer, {
            text: codigo,
            width: 120,
            height: 120,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        const canvas = qrContainer.querySelector('canvas');
        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 25, 35, 30, 30);
        
        pdf.save(`QR_${codigo}.pdf`);
        mostrarNotificacao("PDF gerado com sucesso!", 'success');
        
    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        mostrarNotificacao(`Erro ao gerar PDF: ${error.message}`, 'error');
    }
}

// Sistema de notificações (mesmo da tela de cadastro)
function mostrarNotificacao(mensagem, tipo = 'info') {
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

    setTimeout(() => {
        notificacao.style.animation = 'fadeOut 0.5s ease-out';
        setTimeout(() => notificacao.remove(), 500);
    }, 5000);
}

// Inicialização do sistema
document.addEventListener('DOMContentLoaded', () => {
    // Formulário de busca
    document.getElementById('searchBtn').addEventListener('click', buscarFuncionarios);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarFuncionarios();
    });
    
    // Botão de download do QR Code
    document.getElementById('downloadQrBtn').addEventListener('click', gerarPDFQRCode);
    
    // Botão de excluir funcionário
    document.getElementById('deleteFuncBtn').addEventListener('click', excluirFuncionario);
    
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