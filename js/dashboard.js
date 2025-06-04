// Configuração do Firebase
const db = firebase.database();

// Variáveis globais
let currentUser = null;
let qrScanner = null;
let finishQrScanner = null;
let currentOperations = [];
let cameras = [];
let currentCameraIndex = 0;

// Elementos da página
const elements = {
    startLoadingBtn: document.getElementById('startLoadingBtn'),
    finishLoadingBtn: document.getElementById('finishLoadingBtn'),
    operationsGrid: document.getElementById('operationsGrid'),
    startLoadingModal: document.getElementById('startLoadingModal'),
    finishLoadingModal: document.getElementById('finishLoadingModal'),
    currentUser: document.getElementById('currentUser'),
    
    // Modal de Início
    qrScanner: document.getElementById('qrScanner'),
    startScannerBtn: document.getElementById('startScannerBtn'),
    operatorName: document.getElementById('operatorName'),
    operatorInfo: document.getElementById('operatorInfo'),
    dtNumber: document.getElementById('dtNumber'),
    vehicleType: document.getElementById('vehicleType'),
    dockNumber: document.getElementById('dockNumber'),
    confirmLoadingBtn: document.getElementById('confirmLoadingBtn'),
    cancelLoadingBtn: document.getElementById('cancelLoadingBtn'),
    scanFeedback: document.getElementById('scanFeedback'),
    
    // Modal de Finalização
    finishQrScanner: document.getElementById('finishQrScanner'),
    startFinishScannerBtn: document.getElementById('startFinishScannerBtn'),
    operatorFinishName: document.getElementById('operatorFinishName'),
    operatorFinishInfo: document.getElementById('operatorFinishInfo'),
    bindersList: document.getElementById('bindersList'),
    confirmFinishBtn: document.getElementById('confirmFinishBtn'),
    cancelFinishBtn: document.getElementById('cancelFinishBtn'),
    finishScanFeedback: document.getElementById('finishScanFeedback'),
    finishModalTitle: document.getElementById('finishModalTitle')
};

// Inicialização do dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticação
    firebase.auth().onAuthStateChanged(user => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            currentUser = user;
            elements.currentUser.textContent = user.displayName || user.email;
            initializeOperations();
            setupEventListeners();
        }
    });
});

function initializeOperations() {
    // Limpar qualquer intervalo existente
    if (window.operationsInterval) {
        clearInterval(window.operationsInterval);
    }

    db.ref('operations').on('value', snapshot => {
        currentOperations = [];
        elements.operationsGrid.innerHTML = '';
        
        snapshot.forEach(childSnapshot => {
            const operation = { id: childSnapshot.key, ...childSnapshot.val() };
            if (['loading', 'binding', 'paused', 'awaiting_binding'].includes(operation.status)) {
                currentOperations.push(operation);
                renderOperationCard(operation);
            }
        });
        
        elements.finishLoadingBtn.disabled = currentOperations.length === 0;

        // Iniciar intervalo para atualizar os tempos
        startOperationsTimer();
    });
}

function renderOperationCard(operation) {
    const card = document.createElement('div');
    card.className = 'operation-card';
    card.dataset.id = operation.id;

    const elapsedTime = calculateElapsedTime(operation);
    
    card.innerHTML = `
        <div class="operation-card-header">
            <div class="operation-card-title">Doca ${operation.dock}</div>
            <div class="operation-status ${operation.status}">${getStatusLabel(operation.status)}</div>
        </div>
        
        <div class="operation-card-time real-time">${formatTime(elapsedTime)}</div>
        
        <div class="operation-card-details">
            <div>DT: ${operation.dtNumber}</div>
            <div>Veículo: ${operation.vehicleType}</div>
            <div>Operador: ${operation.operatorName}</div>
            ${operation.binders ? `<div>Amarradores: ${Object.values(operation.binders).join(', ')}</div>` : ''}
        </div>
        
        <div class="operation-card-actions">
            ${operation.status === 'loading' ? 
                `<button class="btn finish-loading-btn" data-id="${operation.id}">Finalizar Carregamento</button>` : ''}
            
            ${operation.status === 'awaiting_binding' ? `
                <button class="btn bind-operators-btn" data-id="${operation.id}">Vincular Amarradores</button>
                <button class="btn start-binding-btn" data-id="${operation.id}">Iniciar Enlonamento</button>
            ` : ''}
            
            ${operation.status === 'binding' ? 
                `<button class="btn finish-binding-btn" data-id="${operation.id}">Finalizar Enlonamento</button>` : ''}
        </div>
    `;

    elements.operationsGrid.appendChild(card);

    // Restante do código permanece o mesmo...
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

function setupEventListeners() {
    // Botões principais
    elements.startLoadingBtn.addEventListener('click', () => {
        resetStartLoadingForm();
        elements.startLoadingModal.style.display = 'flex';
    });
    
    // Modal de Início
    elements.startScannerBtn.addEventListener('click', startScanner);
    elements.cancelLoadingBtn.addEventListener('click', () => {
        elements.startLoadingModal.style.display = 'none';
        stopScanner();
    });
    elements.confirmLoadingBtn.addEventListener('click', confirmStartLoading);
    
    // Modal de Finalização
    elements.startFinishScannerBtn.addEventListener('click', startFinishScanner);
    elements.cancelFinishBtn.addEventListener('click', () => {
        elements.finishLoadingModal.style.display = 'none';
        stopFinishScanner();
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
            window.location.href = 'index.html';
        });
    });
    
    // Fechar modais
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            elements.startLoadingModal.style.display = 'none';
            elements.finishLoadingModal.style.display = 'none';
            stopScanner();
            stopFinishScanner();
        });
    });
}

function getRearCamera(cameras) {
    // Primeiro tenta encontrar por nome (em português ou inglês)
    const rearCamera = cameras.find(camera => 
        camera.name.toLowerCase().includes('traseira') || 
        camera.name.toLowerCase().includes('rear') ||
        camera.name.toLowerCase().includes('back')
    );
    
    // Se não encontrar por nome, tenta pela posição (em alguns dispositivos)
    if (!rearCamera) {
        return cameras.find(camera => camera.facing === 'environment') || 
               cameras[cameras.length - 1]; // Última câmera geralmente é a traseira
    }
    
    return rearCamera;
}

// Modificação na função startScanner
function startScanner() {
    stopScanner();
    
    elements.qrScanner.style.display = 'block';
    qrScanner = new Instascan.Scanner({
        video: elements.qrScanner,
        mirror: false,
        scanPeriod: 1,
        backgroundScan: false
    });
    
    qrScanner.addListener('scan', content => {
        handleQrScan(content, 'operator');
    });
    
    Instascan.Camera.getCameras()
        .then(cameraList => {
            cameras = cameraList;
            if (cameras.length === 0) {
                throw new Error('Nenhuma câmera encontrada');
            }
            
            // Sempre tentar usar a câmera traseira
            const selectedCamera = getRearCamera(cameras);
            
            return qrScanner.start(selectedCamera);
        })
        .then(() => {
            showFeedback('Scanner iniciado com sucesso', 'success', 'scanFeedback');
        })
        .catch(error => {
            console.error('Erro ao iniciar scanner:', error);
            showFeedback('Erro ao acessar câmera: ' + error.message, 'error', 'scanFeedback');
        });
}

function startOperationsTimer() {
    // Limpar intervalo anterior se existir
    if (window.operationsInterval) {
        clearInterval(window.operationsInterval);
    }

    // Atualizar os tempos a cada segundo
    window.operationsInterval = setInterval(() => {
        const cards = document.querySelectorAll('.operation-card');
        cards.forEach(card => {
            const operationId = card.dataset.id;
            const operation = currentOperations.find(op => op.id === operationId);
            
            if (operation) {
                const elapsedTime = calculateElapsedTime(operation);
                const timeElement = card.querySelector('.operation-card-time');
                if (timeElement) {
                    timeElement.textContent = formatTime(elapsedTime);
                }
            }
        });
    }, 1000); // Atualiza a cada segundo
}


function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function startFinishScanner() {
    stopFinishScanner();
    
    elements.finishQrScanner.style.display = 'block';
    finishQrScanner = new Instascan.Scanner({
        video: elements.finishQrScanner,
        mirror: false,
        scanPeriod: 1,
        backgroundScan: false
    });
    
    finishQrScanner.addListener('scan', content => {
        handleQrScan(content, 'finish');
    });
    
    Instascan.Camera.getCameras()
        .then(cameraList => {
            if (cameraList.length === 0) {
                throw new Error('Nenhuma câmera encontrada');
            }
            
            // Sempre tentar usar a câmera traseira
            const selectedCamera = getRearCamera(cameraList);
            
            return finishQrScanner.start(selectedCamera);
        })
        .then(() => {
            showFeedback('Scanner iniciado com sucesso', 'success', 'finishScanFeedback');
        })
        .catch(error => {
            console.error('Erro ao iniciar scanner:', error);
            showFeedback('Erro ao acessar câmera: ' + error.message, 'error', 'finishScanFeedback');
        });
}

function stopScanner() {
    if (qrScanner) {
        qrScanner.stop();
        qrScanner = null;
    }
    elements.qrScanner.style.display = 'none';
}

function stopFinishScanner() {
    if (finishQrScanner) {
        finishQrScanner.stop();
        finishQrScanner = null;
    }
    elements.finishQrScanner.style.display = 'none';
}

function handleQrScan(content, type) {
    const qrCodeRegex = /^GZL-EO-\d{5}$/;
    if (!qrCodeRegex.test(content)) {
        showFeedback('QR Code inválido! Formato deve ser GZL-EO-XXXXX', 'error', type === 'operator' ? 'scanFeedback' : 'finishScanFeedback');
        return;
    }

    showFeedback('Validando QR Code...', 'info', type === 'operator' ? 'scanFeedback' : 'finishScanFeedback');

    db.ref('funcionarios').orderByChild('codigo').equalTo(content).once('value')
        .then(snapshot => {
            if (!snapshot.exists()) {
                throw new Error('Funcionário não encontrado');
            }

            let employeeData = null;
            snapshot.forEach(child => {
                employeeData = child.val();
                return true;
            });

            if (type === 'operator') {
                elements.operatorName.textContent = employeeData.nome;
                elements.operatorInfo.style.display = 'block';
                elements.confirmLoadingBtn.disabled = false;
                showFeedback('Operador validado com sucesso!', 'success', 'scanFeedback');
                stopScanner();
            } else {
                if (elements.finishModalTitle.textContent.includes('Vincular')) {
                    addBinderToList(employeeData, snapshot.key);
                } else {
                    elements.operatorFinishName.textContent = employeeData.nome;
                    elements.operatorFinishInfo.style.display = 'block';
                    elements.confirmFinishBtn.disabled = false;
                    showFeedback('Operador validado com sucesso!', 'success', 'finishScanFeedback');
                    stopFinishScanner();
                }
            }
        })
        .catch(error => {
            console.error('Erro ao validar QR Code:', error);
            showFeedback('Erro: ' + error.message, 'error', type === 'operator' ? 'scanFeedback' : 'finishScanFeedback');
        });
}

function addBinderToList(employeeData, employeeId) {
    if (Array.from(elements.bindersList.children).some(item => item.dataset.id === employeeId)) {
        showFeedback(`${employeeData.nome} já está na lista`, 'info', 'finishScanFeedback');
        return;
    }

    const binderItem = document.createElement('div');
    binderItem.className = 'binder-item';
    binderItem.dataset.id = employeeId;
    binderItem.innerHTML = `
        <span>${employeeData.nome} (${employeeData.cargo})</span>
        <button class="btn remove-binder-btn"><i class="fas fa-times"></i></button>
    `;
    
    binderItem.querySelector('.remove-binder-btn').addEventListener('click', () => {
        binderItem.remove();
        checkBindersList();
    });
    
    elements.bindersList.appendChild(binderItem);
    checkBindersList();
    showFeedback(`${employeeData.nome} adicionado como amarrador`, 'success', 'finishScanFeedback');
}

function checkBindersList() {
    elements.confirmFinishBtn.disabled = elements.bindersList.children.length === 0;
}

// Funções de Operação
function confirmStartLoading() {
    const dtNumber = elements.dtNumber.value.trim();
    const vehicleType = elements.vehicleType.value;
    const dockNumber = elements.dockNumber.value;
    const operatorName = elements.operatorName.textContent;

    if (!dtNumber || !vehicleType || !dockNumber || !operatorName) {
        showFeedback('Preencha todos os campos obrigatórios', 'error', 'scanFeedback');
        return;
    }

    // Verificar se a doca já está em uso
    const isDockInUse = currentOperations.some(op => 
        op.dock === dockNumber && ['loading', 'binding', 'paused'].includes(op.status)
    );

    if (isDockInUse) {
        showFeedback(`Doca ${dockNumber} já está em uso`, 'error', 'scanFeedback');
        return;
    }

    elements.confirmLoadingBtn.disabled = true;

    const newOperation = {
        dtNumber,
        vehicleType,
        dock: dockNumber,
        operatorName,
        status: 'loading',
        startTime: firebase.database.ServerValue.TIMESTAMP,
        createdBy: currentUser.uid
    };

    db.ref('operations').push(newOperation)
        .then(() => {
            showFeedback('Carregamento iniciado com sucesso!', 'success', 'scanFeedback');
            setTimeout(() => {
                elements.startLoadingModal.style.display = 'none';
                resetStartLoadingForm();
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao iniciar carregamento:', error);
            showFeedback('Erro ao iniciar carregamento: ' + error.message, 'error', 'scanFeedback');
        })
        .finally(() => {
            elements.confirmLoadingBtn.disabled = false;
        });
}

function showFinishLoadingModal(operationId) {
    resetFinishLoadingForm();
    elements.finishModalTitle.textContent = 'Finalizar Carregamento';
    elements.confirmFinishBtn.textContent = 'Finalizar Carregamento';
    elements.confirmFinishBtn.onclick = () => confirmFinishOperation(operationId, 'loading');
    elements.finishLoadingModal.style.display = 'flex';
}

function showBindOperatorsModal(operationId) {
    resetFinishLoadingForm();
    elements.finishModalTitle.textContent = 'Vincular Amarradores';
    elements.confirmFinishBtn.textContent = 'Confirmar Amarradores';
    elements.bindersList.style.display = 'block';
    elements.confirmFinishBtn.onclick = () => confirmBinders(operationId);
    elements.finishLoadingModal.style.display = 'flex';
}

function startOperationBinding(operationId) {
    const operation = currentOperations.find(op => op.id === operationId);
    if (!operation.binders || Object.keys(operation.binders).length === 0) {
        alert('Adicione pelo menos um amarrador antes de iniciar');
        return;
    }

    db.ref(`operations/${operationId}`).update({
        status: 'binding',
        bindingStartTime: firebase.database.ServerValue.TIMESTAMP
    })
    .then(() => {
        alert('Enlonamento iniciado com sucesso');
    })
    .catch(error => {
        console.error('Erro ao iniciar enlonamento:', error);
        alert('Erro ao iniciar enlonamento');
    });
}

function showFinishBindingModal(operationId) {
    resetFinishLoadingForm();
    elements.finishModalTitle.textContent = 'Finalizar Enlonamento';
    elements.confirmFinishBtn.textContent = 'Finalizar Enlonamento';
    elements.confirmFinishBtn.onclick = () => confirmFinishOperation(operationId, 'binding');
    elements.finishLoadingModal.style.display = 'flex';
}

function confirmFinishOperation(operationId, operationType) {
    const operatorName = elements.operatorFinishName.textContent;
    if (!operatorName) {
        showFeedback('Escaneie o QR Code do operador', 'error', 'finishScanFeedback');
        return;
    }

    const updates = {
        confirmedBy: operatorName,
        confirmedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (operationType === 'loading') {
        updates.status = 'awaiting_binding';
        updates.loadingEndTime = firebase.database.ServerValue.TIMESTAMP;
    } else {
        updates.status = 'completed';
        updates.bindingEndTime = firebase.database.ServerValue.TIMESTAMP;
    }

    elements.confirmFinishBtn.disabled = true;

    db.ref(`operations/${operationId}`).update(updates)
        .then(() => {
            if (operationType === 'binding') {
                saveOperationHistory(operationId);
            }
            showFeedback('Operação finalizada com sucesso!', 'success', 'finishScanFeedback');
            setTimeout(() => {
                elements.finishLoadingModal.style.display = 'none';
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao finalizar operação:', error);
            showFeedback('Erro ao finalizar: ' + error.message, 'error', 'finishScanFeedback');
        })
        .finally(() => {
            elements.confirmFinishBtn.disabled = false;
        });
}

function confirmBinders(operationId) {
    const binders = {};
    Array.from(elements.bindersList.children).forEach(item => {
        const employeeId = item.dataset.id;
        binders[employeeId] = item.textContent.trim().split(' (')[0];
    });

    if (Object.keys(binders).length === 0) {
        showFeedback('Adicione pelo menos um amarrador', 'error', 'finishScanFeedback');
        return;
    }

    elements.confirmFinishBtn.disabled = true;

    db.ref(`operations/${operationId}`).update({ binders })
        .then(() => {
            showFeedback('Amarradores vinculados com sucesso!', 'success', 'finishScanFeedback');
            setTimeout(() => {
                elements.finishLoadingModal.style.display = 'none';
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao vincular amarradores:', error);
            showFeedback('Erro ao vincular: ' + error.message, 'error', 'finishScanFeedback');
        })
        .finally(() => {
            elements.confirmFinishBtn.disabled = false;
        });
}

function saveOperationHistory(operationId) {
    const operation = currentOperations.find(op => op.id === operationId);
    if (!operation) return;

    const historyData = {
        operationId,
        dtNumber: operation.dtNumber,
        vehicleType: operation.vehicleType,
        dock: operation.dock,
        operator: operation.operatorName,
        binders: operation.binders,
        startTime: operation.startTime,
        loadingEndTime: operation.loadingEndTime,
        bindingStartTime: operation.bindingStartTime,
        bindingEndTime: operation.bindingEndTime,
        completedAt: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref('history').push(historyData)
        .then(() => {
            db.ref(`operations/${operationId}`).remove();
        });
}

// Funções auxiliares
function resetStartLoadingForm() {
    elements.dtNumber.value = '';
    elements.vehicleType.value = '';
    elements.dockNumber.value = '';
    elements.operatorName.textContent = '';
    elements.operatorInfo.style.display = 'none';
    elements.confirmLoadingBtn.disabled = true;
    elements.scanFeedback.style.display = 'none';
}

function resetFinishLoadingForm() {
    elements.operatorFinishName.textContent = '';
    elements.operatorFinishInfo.style.display = 'none';
    elements.bindersList.innerHTML = '';
    elements.bindersList.style.display = 'none';
    elements.confirmFinishBtn.disabled = true;
    elements.finishScanFeedback.style.display = 'none';
}

function showFeedback(message, type, elementId) {
    const feedbackElement = document.getElementById(elementId);
    if (!feedbackElement) return;

    feedbackElement.textContent = message;
    feedbackElement.style.display = 'block';
    
    // Configurar cores baseadas no tipo
    const colors = {
        error: { bg: '#ffebee', text: '#c62828' },
        success: { bg: '#e8f5e9', text: '#2e7d32' },
        info: { bg: '#e3f2fd', text: '#1565c0' }
    };
    
    feedbackElement.style.backgroundColor = colors[type]?.bg || '#f5f5f5';
    feedbackElement.style.color = colors[type]?.text || '#333';
    
    // Esconder após alguns segundos
    if (type !== 'success') {
        setTimeout(() => {
            feedbackElement.style.display = 'none';
        }, 5000);
    }
}

function calculateElapsedTime(operation) {
    if (!operation.startTime) return 0;
    
    const now = Date.now();
    const start = operation.startTime;
    const end = operation.status === 'completed' ? (operation.bindingEndTime || operation.loadingEndTime || now) : now;
    
    let pausedTime = 0;
    if (operation.pauses) {
        Object.values(operation.pauses).forEach(p => {
            const pauseStart = p.start || 0;
            const pauseEnd = p.end || (operation.status === 'paused' ? now : p.start || 0);
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