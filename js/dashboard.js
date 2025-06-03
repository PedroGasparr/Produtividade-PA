// dashboard.js
// Inicialização do Firebase
const db = firebase.database();

let currentCameraIndex = 0;
let cameras = [];
let currentFinishCameraIndex = 0;

// Elementos da página
const startLoadingBtn = document.getElementById('startLoadingBtn');
const finishLoadingBtn = document.getElementById('finishLoadingBtn');
const pauseBtn = document.getElementById('pauseBtn');
const operationsGrid = document.getElementById('operationsGrid');

// Modais
const startLoadingModal = document.getElementById('startLoadingModal');
const finishLoadingModal = document.getElementById('finishLoadingModal');
const pauseModal = document.getElementById('pauseModal');

// Variáveis de estado
let currentOperations = [];
let currentUser = null;
let qrScanner = null;
let finishQrScanner = null;
let operationsRef = null;
let operationsListener = null;

// Inicialização do dashboard
document.addEventListener('DOMContentLoaded', () => {
     const criticalElements = [
        'operatorName', 'operatorInfo', 'scanFeedback',
        'bindersFeedback', 'bindersList', 'confirmLoadingBtn'
    ];

    criticalElements.forEach(id => {
        if (!document.getElementById(id)) {
            console.error(`Elemento crítico não encontrado: #${id}`);
        }
    });
    firebase.auth().onAuthStateChanged(user => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            currentUser = user;
            document.getElementById('currentUser').textContent = user.displayName || user.email;
            initializeOperations();
        }
    });

    // Configurar listeners
    setupEventListeners();
});

function initializeOperations() {
    operationsRef = db.ref('operations');
    
    if (operationsListener) {
        operationsRef.off('value', operationsListener);
    }
    
    operationsListener = operationsRef.on('value', snapshot => {
        currentOperations = [];
        operationsGrid.innerHTML = '';
        
        snapshot.forEach(childSnapshot => {
            const operation = { id: childSnapshot.key, ...childSnapshot.val() };
            if (['loading', 'binding', 'paused', 'awaiting_binding'].includes(operation.status)) {
                currentOperations.push(operation);
                renderOperationCard(operation);
            }
        });
        
        finishLoadingBtn.disabled = currentOperations.length === 0;
        pauseBtn.disabled = currentOperations.length === 0;
        
        // Iniciar atualização contínua dos tempos
        startTimeUpdates();
    });
}
function getElementSafe(id, context = '') {
    const el = document.getElementById(id);
    if (!el) {
        console.error(`Elemento não encontrado: #${id}`, context);
        return document.createElement('div'); // Retorna elemento vazio como fallback
    }
    return el;
}

let timeUpdateInterval = null;

function startTimeUpdates() {
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
    }
    
    timeUpdateInterval = setInterval(() => {
        currentOperations.forEach(op => {
            const card = document.querySelector(`.operation-card[data-id="${op.id}"]`);
            if (card) {
                const elapsedTime = calculateElapsedTime(op);
                const timeElement = card.querySelector('.operation-card-time');
                if (timeElement) {
                    timeElement.textContent = formatTime(elapsedTime);
                }
            }
        });
    }, 1000);
}

function setupEventListeners() {
    startLoadingBtn.addEventListener('click', () => {
        resetStartLoadingForm();
        startLoadingModal.style.display = 'flex';
    });
    
    finishLoadingBtn.addEventListener('click', () => {
        // Não faz nada, pois a finalização é feita pelos cards individuais
    });
    
    document.getElementById('switchCameraBtn').addEventListener('click', switchCamera);
    document.getElementById('switchFinishCameraBtn').addEventListener('click', switchFinishCamera);

    pauseBtn.addEventListener('click', () => showPauseModal());

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            startLoadingModal.style.display = 'none';
            finishLoadingModal.style.display = 'none';
            pauseModal.style.display = 'none';
            stopAllScanners();
        });
    });

    document.getElementById('startScannerBtn').addEventListener('click', startScanner);
    document.getElementById('cancelLoadingBtn').addEventListener('click', () => {
        startLoadingModal.style.display = 'none';
        stopAllScanners();
    });
    document.getElementById('confirmLoadingBtn').addEventListener('click', confirmStartLoading);

    document.getElementById('startFinishScannerBtn').addEventListener('click', startFinishScanner);
    document.getElementById('cancelFinishBtn').addEventListener('click', () => {
        finishLoadingModal.style.display = 'none';
        stopAllScanners();
    });

    document.getElementById('cancelPauseBtn').addEventListener('click', () => pauseModal.style.display = 'none');
    document.getElementById('confirmPauseBtn').addEventListener('click', confirmPause);

    document.getElementById('logoutBtn').addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
            window.location.href = 'index.html';
        });
    });
}

function switchCamera() {
    if (cameras.length < 2) return;
    
    currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
    
    if (qrScanner) {
        qrScanner.stop().then(() => {
            qrScanner.start(cameras[currentCameraIndex]);
        });
    }
}

function switchFinishCamera() {
    if (cameras.length < 2) return;
    
    currentFinishCameraIndex = (currentFinishCameraIndex + 1) % cameras.length;
    finishQrScanner.start(cameras[currentFinishCameraIndex]);
}

function renderOperationCard(operation) {
    const card = document.createElement('div');
    card.className = 'operation-card';
    card.dataset.id = operation.id;

    const elapsedTime = calculateElapsedTime(operation);
    
    card.innerHTML = `
        <div class="operation-card-header">
            <div class="operation-card-title">${operation.dock ? 'Doca ' + operation.dock : 'Operação'}</div>
            <div class="operation-status ${operation.status}">${getStatusLabel(operation.status)}</div>
        </div>
        
        <div class="operation-card-time" data-id="${operation.id}-time">${formatTime(elapsedTime)}</div>
        
        <div class="operation-card-details">
            <div class="operation-card-detail">
                <span class="operation-card-detail-label">DT:</span>
                <span>${operation.dtNumber || 'N/A'}</span>
            </div>
            <div class="operation-card-detail">
                <span class="operation-card-detail-label">Veículo:</span>
                <span>${operation.vehicleType || 'N/A'}</span>
            </div>
            <div class="operation-card-detail">
                <span class="operation-card-detail-label">Operador:</span>
                <span>${operation.operatorName || 'N/A'}</span>
            </div>
            ${operation.status === 'binding' ? `
            <div class="operation-card-detail">
                <span class="operation-card-detail-label">Amarradores:</span>
                <span>${operation.binders ? Object.values(operation.binders).join(', ') : 'N/A'}</span>
            </div>
            ` : ''}
        </div>
        
        <div class="operation-card-actions">
            ${operation.status === 'loading' ? `
            <button class="btn small-btn primary-btn finish-loading-btn" data-id="${operation.id}">
                <i class="fas fa-stop"></i> Finalizar Carregamento
            </button>
            ` : ''}
            
            ${operation.status === 'awaiting_binding' ? `
            <button class="btn small-btn primary-btn bind-operators-btn" data-id="${operation.id}">
                <i class="fas fa-link"></i> Vincular Amarradores
            </button>
            <button class="btn small-btn primary-btn start-binding-btn" data-id="${operation.id}">
                <i class="fas fa-play"></i> Iniciar Enlonamento
            </button>
            ` : ''}
            
            ${operation.status === 'binding' ? `
            <button class="btn small-btn primary-btn finish-binding-btn" data-id="${operation.id}">
                <i class="fas fa-check"></i> Finalizar Enlonamento
            </button>
            ` : ''}
        </div>
    `;

    operationsGrid.appendChild(card);

    // Adicionar event listeners para os botões
    if (operation.status === 'loading') {
        card.querySelector('.finish-loading-btn').addEventListener('click', () => showFinishLoadingModal(operation.id));
    }
    
    if (operation.status === 'awaiting_binding') {
        card.querySelector('.bind-operators-btn').addEventListener('click', () => showBindOperatorsModal(operation.id));
        card.querySelector('.start-binding-btn').addEventListener('click', () => startOperationBinding(operation.id));
    }
    
    if (operation.status === 'binding') {
        card.querySelector('.finish-binding-btn').addEventListener('click', () => showFinishBindingModal(operation.id));
    }
}

function showBindOperatorsModal(operationId) {
    resetFinishLoadingForm();
    finishLoadingModal.style.display = 'flex';
    
    // Configurar o modal para vincular amarradores
    document.querySelector('#finishLoadingModal h2').textContent = 'Vincular Amarradores';
    document.getElementById('confirmFinishBtn').textContent = 'Confirmar Amarradores';
    document.getElementById('confirmFinishBtn').dataset.operationId = operationId;
    document.getElementById('confirmFinishBtn').onclick = confirmBindOperators;
    
    // Mostrar apenas o scanner e lista de amarradores
    document.getElementById('finishQrScannerContainer').style.display = 'block';
    document.getElementById('finishQrScanner').style.display = 'block';
    document.getElementById('bindersList').style.display = 'block';
    
    startFinishScanner();
}

function confirmBindOperators() {
    const operationId = this.dataset.operationId;
    const bindersList = document.getElementById('bindersList');
    
    // Criar objeto de amarradores
    const binders = {};
    Array.from(bindersList.children).forEach(item => {
        const employeeId = item.dataset.id;
        binders[employeeId] = item.textContent.trim().split(' (')[0]; // Pega apenas o nome
    });

    if (Object.keys(binders).length === 0) {
        alert('Adicione pelo menos um amarrador!');
        return;
    }

    const updates = {
        binders: binders
    };

    db.ref(`operations/${operationId}`).update(updates)
        .then(() => {
            finishLoadingModal.style.display = 'none';
            stopAllScanners();
            alert('Amarradores vinculados com sucesso!');
        })
        .catch(error => {
            console.error('Erro ao vincular amarradores:', error);
            alert('Erro ao vincular amarradores');
        });
}

function showFinishLoadingModal(operationId) {
    resetFinishLoadingForm();
    finishLoadingModal.style.display = 'flex';
    
    // Configurar o modal de finalização
    document.querySelector('#finishLoadingModal h2').textContent = 'Finalizar Carregamento';
    document.getElementById('confirmFinishBtn').textContent = 'Confirmar Finalização';
    document.getElementById('confirmFinishBtn').dataset.operationId = operationId;
    document.getElementById('confirmFinishBtn').onclick = confirmFinishOperationLoading;
    
    // Mostrar apenas o scanner
    document.getElementById('finishQrScannerContainer').style.display = 'block';
    document.getElementById('finishQrScanner').style.display = 'block';
    document.getElementById('bindersList').style.display = 'none';
    
    startFinishScanner();
}

function startOperationBinding(operationId) {
    const operation = currentOperations.find(op => op.id === operationId);
    
    if (!operation || !operation.binders || Object.keys(operation.binders).length === 0) {
        alert('Por favor, vincule pelo menos um amarrador antes de iniciar o enlonamento!');
        return;
    }

    const updates = {
        status: 'binding',
        bindingStartTime: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref(`operations/${operationId}`).update(updates)
        .then(() => {
            alert('Enlonamento iniciado com sucesso!');
        })
        .catch(error => {
            console.error('Erro ao iniciar enlonamento:', error);
            alert('Erro ao iniciar enlonamento');
        });
}

function showFinishBindingModal(operationId) {
    resetFinishLoadingForm();
    finishLoadingModal.style.display = 'flex';
    
    // Configurar o modal para finalização de enlonamento
    document.querySelector('#finishLoadingModal h2').textContent = 'Finalizar Enlonamento';
    document.getElementById('confirmFinishBtn').textContent = 'Confirmar Finalização';
    document.getElementById('confirmFinishBtn').dataset.operationId = operationId;
    document.getElementById('confirmFinishBtn').onclick = confirmFinishOperationBinding;
    
    // Mostrar apenas o scanner
    document.getElementById('finishQrScannerContainer').style.display = 'block';
    document.getElementById('finishQrScanner').style.display = 'block';
    document.getElementById('bindersList').style.display = 'none';
    
    startFinishScanner();
}

function confirmFinishOperationBinding() {
    const operationId = this.dataset.operationId;
    const operatorName = getElementSafe('operatorName', 'handleOperatorScan').textContent;

    if (!operatorName) {
        alert('Por favor, escaneie o QR Code do operador para confirmar!');
        return;
    }

    const updates = {
        status: 'completed',
        bindingEndTime: firebase.database.ServerValue.TIMESTAMP,
        confirmedBy: operatorName,
        confirmedAt: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref(`operations/${operationId}`).update(updates)
        .then(() => {
            finishLoadingModal.style.display = 'none';
            stopAllScanners();
            saveOperationHistory(operationId);
            alert('Enlonamento finalizado com sucesso!');
        })
        .catch(error => {
            console.error('Erro ao finalizar enlonamento:', error);
            alert('Erro ao finalizar enlonamento');
        });
}

function confirmFinishOperationLoading() {
    const operationId = this.dataset.operationId;
    const operatorName = getElementSafe('operatorName', 'handleOperatorScan').textContent;

    if (!operatorName) {
        alert('Por favor, escaneie o QR Code do operador para confirmar!');
        return;
    }

    const updates = {
        status: 'awaiting_binding',
        loadingEndTime: firebase.database.ServerValue.TIMESTAMP,
        confirmedBy: operatorName,
        confirmedAt: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref(`operations/${operationId}`).update(updates)
        .then(() => {
            finishLoadingModal.style.display = 'none';
            stopAllScanners();
            alert('Carregamento finalizado com sucesso! Aguardando enlonamento.');
        })
        .catch(error => {
            console.error('Erro ao finalizar carregamento:', error);
            alert('Erro ao finalizar carregamento');
        });
}

function getStatusLabel(status) {
    const labels = {
        'loading': 'Carregando',
        'awaiting_binding': 'Aguardando Enlonamento',
        'binding': 'Enlonamento',
        'completed': 'Concluído',
        'paused': 'Pausado'
    };
    
    return labels[status] || status;
}

function startScanner() {
    // Parar qualquer scanner existente
    stopAllScanners();
    
    const video = document.getElementById('qrScanner');
    video.style.display = 'block';
    
    qrScanner = new Instascan.Scanner({
        video: video,
        mirror: false,
        scanPeriod: 1, // Scanner mais rápido
        backgroundScan: false
    });
    
    // Limpar listeners anteriores
    qrScanner.removeAllListeners('scan');
    
    qrScanner.addListener('scan', function(content) {
        handleQrScan(content, 'operator');
    });
    
    Instascan.Camera.getCameras()
        .then(function(cameraList) {
            cameras = cameraList;
            if (cameras.length > 0) {
                return qrScanner.start(cameras[currentCameraIndex]);
            } else {
                throw new Error('Nenhuma câmera encontrada!');
            }
        })
        .then(() => {
            console.log('Scanner iniciado com sucesso');
        })
        .catch(function(e) {
            console.error('Erro ao iniciar scanner:', e);
            alert('Erro ao acessar a câmera: ' + e.message);
            document.getElementById('qrScanner').style.display = 'none';
        });
}

function startFinishScanner() {
    const video = document.getElementById('finishQrScanner');
    video.style.display = 'block';
    
    // Parar o scanner existente se houver
    if (finishQrScanner) {
        finishQrScanner.stop();
    }
    
    finishQrScanner = new Instascan.Scanner({
        video: video,
        mirror: false,
        scanPeriod: 1, // Reduzir o tempo de verificação
        backgroundScan: false
    });
    
    finishQrScanner.addListener('scan', function(content) {
        handleQrScan(content, 'binder');
    });
    
    // Limpar listeners anteriores para evitar duplicação
    finishQrScanner.removeAllListeners('scan');
    finishQrScanner.addListener('scan', function(content) {
        handleQrScan(content, 'binder');
    });
    
    Instascan.Camera.getCameras().then(function(cameraList) {
        if (cameraList.length > 0) {
            currentFinishCameraIndex = currentFinishCameraIndex % cameraList.length;
            finishQrScanner.start(cameras[currentFinishCameraIndex])
                .then(() => {
                    console.log('Scanner de finalização iniciado com sucesso');
                })
                .catch(err => {
                    console.error('Erro ao iniciar scanner de finalização:', err);
                    alert('Erro ao iniciar câmera. Por favor, recarregue a página e tente novamente.');
                });
        } else {
            alert('Nenhuma câmera encontrada!');
        }
    }).catch(function(e) {
        console.error('Erro ao acessar câmeras:', e);
        alert('Erro ao acessar a câmera. Verifique as permissões.');
    });
}

function stopAllScanners() {
    try {
        // Parar e limpar o scanner de início
        if (qrScanner) {
            qrScanner.stop().catch(e => console.error('Erro ao parar qrScanner:', e));
            document.getElementById('qrScanner').style.display = 'none';
            qrScanner = null;
        }
        
        // Parar e limpar o scanner de finalização
        if (finishQrScanner) {
            finishQrScanner.stop().catch(e => console.error('Erro ao parar finishQrScanner:', e));
            document.getElementById('finishQrScanner').style.display = 'none';
            finishQrScanner = null;
        }
        
        // Limpar o intervalo de atualização de tempo
        if (timeUpdateInterval) {
            clearInterval(timeUpdateInterval);
            timeUpdateInterval = null;
        }
    } catch (e) {
        console.error('Erro ao parar scanners:', e);
    }
}

function handleQrScan(result, type) {
    // 1. Verificação robusta do input
    if (!result || typeof result !== 'string') {
        return showFeedback('QR Code inválido: conteúdo vazio ou não-texto', 'error', type);
    }

    // 2. Validação do formato
    const qrCodeRegex = /^GZL-EO-\d{5}$/;
    if (!qrCodeRegex.test(result)) {
        return showFeedback(`Formato inválido! Use: GZL-EO-XXXXX`, 'error', type);
    }

    // 3. Feedback visual
    showFeedback('Validando QR Code...', 'processing', type);

    // 4. Consulta ao Firebase com tratamento de erros
    db.ref('funcionarios').orderByChild('codigo').equalTo(result).once('value')
        .then(snapshot => {
            if (!snapshot.exists()) {
                throw new Error('Funcionário não encontrado no banco de dados');
            }

            // 5. Processamento dos dados
            let employeeData = null;
            snapshot.forEach(child => {
                employeeData = child.val();
                return true; // Encerra após o primeiro resultado
            });

            if (!employeeData) {
                throw new Error('Dados do funcionário inválidos');
            }

            // 6. Ação baseada no tipo (operator/binder)
            if (type === 'operator') {
                handleOperatorScan(employeeData);
            } else {
                handleBinderScan(employeeData, child.key);
            }
        })
        .catch(error => {
            console.error('Erro na consulta:', error);
            showFeedback(`Erro: ${error.message}`, 'error', type);
        });
}

function handleOperatorScan(employeeData) {
    const operatorName = document.getElementById('operatorName');
    const confirmBtn = document.getElementById('confirmLoadingBtn');
    
    if (!operatorName || !confirmBtn) {
        return showFeedback('Elementos do formulário não encontrados', 'error', 'operator');
    }

    operatorName.textContent = employeeData.nome;
    confirmBtn.disabled = false;
    showFeedback(`Operador ${employeeData.nome} identificado!`, 'success', 'operator');
}

function handleBinderScan(employeeData, employeeId) {
    const bindersList = document.getElementById('bindersList');
    if (!bindersList) {
        return showFeedback('Elemento bindersList não encontrado', 'error', 'binder');
    }

    // Verifica se já foi adicionado
    if (Array.from(bindersList.children).some(item => item.dataset.id === employeeId)) {
        return showFeedback(`${employeeData.nome} já está na lista`, 'info', 'binder');
    }

    // Adiciona novo amarrador
    const binderItem = document.createElement('div');
    binderItem.className = 'binder-item';
    binderItem.dataset.id = employeeId;
    binderItem.innerHTML = `
        <span>${employeeData.nome} (${employeeData.cargo})</span>
        <button class="btn small-btn danger-btn remove-binder-btn">
            <i class="fas fa-times"></i>
        </button>
    `;

    // Adiciona evento de remoção
    binderItem.querySelector('.remove-binder-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        binderItem.remove();
        checkBindersList();
    });

    bindersList.appendChild(binderItem);
    checkBindersList();
    showFeedback(`${employeeData.nome} adicionado como amarrador`, 'success', 'binder');
}

function showFeedback(message, type = 'info', context = 'operator') {
    const elementId = context === 'operator' ? 'scanFeedback' : 'bindersFeedback';
    const feedbackElement = document.getElementById(elementId);
    
    if (!feedbackElement) {
        console.error(`Elemento de feedback não encontrado: ${elementId}`);
        return;
    }

    // Configuração de estilos
    const styles = {
        error: { background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a' },
        success: { background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' },
        processing: { background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9' },
        info: { background: '#fff8e1', color: '#f57f17', border: '1px solid #ffe082' }
    };

    // Aplica estilos
    Object.assign(feedbackElement.style, {
        display: 'block',
        padding: '10px',
        margin: '10px 0',
        borderRadius: '4px',
        ...styles[type] || styles.info
    });

    feedbackElement.textContent = message;

    // Auto-esconde após 5 segundos (exceto sucesso)
    if (type !== 'success') {
        setTimeout(() => {
            feedbackElement.style.display = 'none';
        }, 5000);
    }
}

function updateOperatorInfo(employeeData) {
    const operatorNameElement = getElementSafe('operatorName', 'handleOperatorScan');
    const operatorInfoElement = document.getElementById('operatorInfo');
    
    if (operatorNameElement && operatorInfoElement) {
        operatorNameElement.textContent = employeeData.nome;
        operatorInfoElement.textContent = `Operador: ${employeeData.nome}`;
        operatorInfoElement.style.display = 'block';
        
        // Habilita o botão de confirmação
        const confirmBtn = document.getElementById('confirmLoadingBtn');
        if (confirmBtn) confirmBtn.disabled = false;
        
        showScanFeedback(`Operador ${employeeData.nome} identificado!`, 'success');
        
        // Fechar a câmera
        stopScanner();
    }
}

function stopScanner() {
    const qrScannerElement = document.getElementById('qrScanner');
    if (qrScannerElement) qrScannerElement.style.display = 'none';
    
    if (qrScanner) {
        qrScanner.stop().catch(e => console.error('Erro ao parar scanner:', e));
    }
}

// Função auxiliar para mostrar feedback
function showScanFeedback(message, type = 'info') {
    const feedbackElement = document.getElementById('scanFeedback');
    if (!feedbackElement) return;

    // Configura cores baseadas no tipo
    const styles = {
        error: {
            color: '#721c24',
            backgroundColor: '#f8d7da',
            borderColor: '#f5c6cb'
        },
        success: {
            color: '#155724',
            backgroundColor: '#d4edda',
            borderColor: '#c3e6cb'
        },
        info: {
            color: '#0c5460',
            backgroundColor: '#d1ecf1',
            borderColor: '#bee5eb'
        },
        processing: {
            color: '#004085',
            backgroundColor: '#cce5ff',
            borderColor: '#b8daff'
        }
    };

    feedbackElement.textContent = message;
    feedbackElement.style.display = 'block';
    
    // Aplica estilos
    Object.assign(feedbackElement.style, styles[type] || styles.info);

    // Esconde após 3 segundos (exceto para sucesso)
    if (type !== 'success') {
        setTimeout(() => {
            feedbackElement.style.display = 'none';
        }, 3000);
    }
}

function addBinderToList(employeeData, employeeId) {
    const bindersList = document.getElementById('bindersList');
    if (!bindersList) return;

    // Verifica se o amarrador já foi adicionado
    const existing = Array.from(bindersList.children).some(item => 
        item.dataset.id === employeeId
    );

    if (!existing) {
        const binderItem = document.createElement('div');
        binderItem.className = 'binder-item';
        binderItem.dataset.id = employeeId;
        binderItem.innerHTML = `
            <span>${employeeData.nome} (${employeeData.cargo})</span>
            <button class="btn small-btn danger-btn remove-binder-btn">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        bindersList.appendChild(binderItem);
        
        // Adiciona evento para remover
        binderItem.querySelector('.remove-binder-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            binderItem.remove();
            checkBindersList();
        });
        
        checkBindersList();
        showScanFeedback(`${employeeData.nome} adicionado como amarrador!`, 'success');
    } else {
        showScanFeedback(`${employeeData.nome} já está na lista!`, 'info');
    }
}

function checkBindersList() {
    const bindersList = document.getElementById('bindersList');
    const confirmBtn = document.getElementById('confirmFinishBtn');
    
    if (!bindersList || !confirmBtn) return;
    
    confirmBtn.disabled = bindersList.children.length === 0;
}

function confirmStartLoading() {
    // Obter todos os elementos de uma vez com verificações
    const elements = {
        dtNumber: document.getElementById('dtNumber'),
        vehicleType: document.getElementById('vehicleType'),
        dockNumber: document.getElementById('dockNumber'),
        operatorName: document.getElementById('operatorName'),
        confirmBtn: document.getElementById('confirmLoadingBtn')
    };

    // Verificar se todos os elementos existem
    for (const [key, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`Elemento não encontrado: ${key}`);
            return showFeedback('Erro interno no formulário', 'error', 'operator');
        }
    }

    // Obter valores trimados
    const values = {
        dtNumber: elements.dtNumber.value.trim(),
        vehicleType: elements.vehicleType.value.trim(),
        dockNumber: elements.dockNumber.value.trim(),
        operatorName: elements.operatorName.textContent.trim()
    };

    // Validação completa
    const errors = [];
    
    if (!values.dtNumber) errors.push('Número da DT');
    if (!values.vehicleType) errors.push('Tipo de Veículo');
    if (!values.dockNumber) errors.push('Número da Doca');
    if (!values.operatorName) errors.push('Operador (QR Code)');

    if (errors.length > 0) {
        return showFeedback(`Preencha: ${errors.join(', ')}`, 'error', 'operator');
    }

    // Verificar se a doca já está em uso
    const isDockInUse = currentOperations.some(op => 
        op.dock === values.dockNumber && 
        ['loading', 'binding', 'paused'].includes(op.status)
    );

    if (isDockInUse) {
        return showFeedback(`Doca ${values.dockNumber} já está em uso!`, 'error', 'operator');
    }

    // Desabilitar botão durante o processamento
    elements.confirmBtn.disabled = true;

    // Criar objeto da operação
    const newOperation = {
        dtNumber: values.dtNumber,
        vehicleType: values.vehicleType,
        dock: values.dockNumber,
        operatorName: values.operatorName,
        status: 'loading',
        startTime: firebase.database.ServerValue.TIMESTAMP,
        createdBy: currentUser.uid,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    // Adicionar ao Firebase
    db.ref('operations').push(newOperation)
        .then(() => {
            showFeedback('Carregamento iniciado!', 'success', 'operator');
            startLoadingModal.style.display = 'none';
            resetStartLoadingForm();
        })
        .catch(error => {
            console.error('Erro ao iniciar:', error);
            showFeedback(`Erro: ${error.message}`, 'error', 'operator');
        })
        .finally(() => {
            elements.confirmBtn.disabled = false;
        });
}

function saveOperationHistory(operationId) {
    const operation = currentOperations.find(op => op.id === operationId);
    
    if (!operation) return;

    const loadingTime = calculateElapsedTime({
        startTime: operation.startTime,
        endTime: operation.loadingEndTime,
        pauses: operation.pauses
    });

    const bindingTime = calculateElapsedTime({
        startTime: operation.bindingStartTime,
        endTime: operation.bindingEndTime,
        pauses: {}
    });

    const totalTime = loadingTime + bindingTime;

    const historyData = {
        operationId,
        dtNumber: operation.dtNumber,
        vehicleType: operation.vehicleType,
        dock: operation.dock,
        operator: operation.operatorName,
        binders: operation.binders,
        loadingTime,
        bindingTime,
        totalTime,
        completedAt: firebase.database.ServerValue.TIMESTAMP,
        completedBy: currentUser.uid
    };

    db.ref('history').push(historyData)
        .then(() => {
            // Remover a operação do banco de dados principal
            db.ref(`operations/${operationId}`).remove();
        })
        .catch(error => {
            console.error('Erro ao salvar histórico:', error);
        });
}

function showPauseModal() {
    const operationsToPause = document.getElementById('operationsToPause');
    operationsToPause.innerHTML = '';
    
    currentOperations
        .filter(op => op.status === 'loading' || op.status === 'binding')
        .forEach(op => {
            const opDiv = document.createElement('div');
            opDiv.className = 'operation-to-pause';
            opDiv.innerHTML = `
                <input type="checkbox" id="pause-${op.id}" value="${op.id}">
                <label for="pause-${op.id}">${op.dock ? 'Doca ' + op.dock : 'Operação'} - ${getStatusLabel(op.status)}</label>
            `;
            operationsToPause.appendChild(opDiv);
        });
    
    pauseModal.style.display = 'flex';
}

function confirmPause() {
    const selectedOperations = Array.from(document.querySelectorAll('#operationsToPause input:checked'))
        .map(input => input.value);
    
    if (selectedOperations.length === 0) {
        alert('Selecione pelo menos uma operação para pausar!');
        return;
    }

    const updates = {};
    const now = firebase.database.ServerValue.TIMESTAMP;
    
    selectedOperations.forEach(opId => {
        const operation = currentOperations.find(op => op.id === opId);
        
        if (operation) {
            const pauses = operation.pauses || {};
            const pauseId = generateId();
            pauses[pauseId] = { start: now };
            
            updates[`operations/${opId}/status`] = 'paused';
            updates[`operations/${opId}/pauses`] = pauses;
        }
    });
    
    db.ref().update(updates)
        .then(() => {
            pauseModal.style.display = 'none';
        })
        .catch(error => {
            console.error('Erro ao pausar operações:', error);
            alert('Erro ao pausar operações');
        });
}

function calculateElapsedTime(operation) {
    if (!operation.startTime) return 0;
    
    const start = operation.startTime;
    const end = operation.endTime || Date.now();
    
    let pausedTime = 0;
    if (operation.pauses) {
        Object.values(operation.pauses).forEach(p => {
            const pauseStart = p.start;
            const pauseEnd = p.end || Date.now();
            pausedTime += pauseEnd - pauseStart;
        });
    }
    
    return Math.floor((end - start - pausedTime) / 1000);
}

function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function generateId() {
    return db.ref().push().key;
}

function resetStartLoadingForm() {
    const elements = {
        dtNumber: document.getElementById('dtNumber'),
        vehicleType: document.getElementById('vehicleType'),
        dockNumber: document.getElementById('dockNumber'),
        operatorName: document.getElementById('operatorName'),
        operatorInfo: document.getElementById('operatorInfo'),
        confirmBtn: document.getElementById('confirmLoadingBtn'),
        feedback: document.getElementById('scanFeedback')
    };

    // Resetar valores
    if (elements.dtNumber) elements.dtNumber.value = '';
    if (elements.vehicleType) elements.vehicleType.value = 'Caminhão';
    if (elements.dockNumber) elements.dockNumber.value = '1';
    if (elements.operatorName) elements.operatorName.textContent = '';
    if (elements.operatorInfo) elements.operatorInfo.style.display = 'none';
    if (elements.confirmBtn) elements.confirmBtn.disabled = true;
    if (elements.feedback) elements.feedback.style.display = 'none';
}

function resetFinishLoadingForm() {
    getElementSafe('operatorName', 'handleOperatorScan').textContent = '';
    document.getElementById('operatorInfo').style.display = 'none';
    document.getElementById('confirmFinishBtn').disabled = true;
    document.getElementById('bindersList').innerHTML = '';
    document.getElementById('bindersFeedback').style.display = 'none';
    document.querySelector('#finishLoadingModal h2').textContent = 'Finalizar Amarração';
    document.getElementById('confirmFinishBtn').textContent = 'Finalizar Amarração';
    document.getElementById('finishQrScannerContainer').style.display = 'none';
    document.getElementById('bindersList').style.display = 'none';
}