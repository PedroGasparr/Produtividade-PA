// Inicialização do Firebase
const db = firebase.database();

let currentCameraIndex = 0;
let cameras = [];

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
    // Verificar autenticação
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
    
    finishLoadingBtn.addEventListener('click', () => finishLoadingModal.style.display = 'none');
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
    document.getElementById('confirmFinishBtn').addEventListener('click', confirmFinishLoading);

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
        </div>
        
        <div class="operation-card-actions">
            ${operation.status === 'loading' ? `
            <button class="btn small-btn primary-btn finish-loading-btn" data-id="${operation.id}">
                <i class="fas fa-stop"></i> Finalizar Carregamento
            </button>
            ` : ''}
            
            ${operation.status === 'awaiting_binding' ? `
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
        card.querySelector('.start-binding-btn').addEventListener('click', () => startOperationBinding(operation.id));
    }
    
    if (operation.status === 'binding') {
        card.querySelector('.finish-binding-btn').addEventListener('click', () => finishOperationBinding(operation.id));
    }
}

function showFinishLoadingModal(operationId) {
    resetFinishLoadingForm();
    startLoadingModal.style.display = 'flex';
    
    // Configurar o modal para finalização
    document.querySelector('#startLoadingModal h2').textContent = 'Finalizar Carregamento';
    document.getElementById('confirmLoadingBtn').textContent = 'Confirmar Finalização';
    document.getElementById('confirmLoadingBtn').dataset.operationId = operationId;
    document.getElementById('confirmLoadingBtn').onclick = confirmFinishOperationLoading;
    
    // Esconder campos não necessários para finalização
    document.getElementById('dtNumber').style.display = 'none';
    document.getElementById('vehicleType').style.display = 'none';
    document.getElementById('dockNumber').style.display = 'none';
    document.querySelector('.input-method-toggle').style.display = 'none';
    document.getElementById('startScannerBtn').style.display = 'none';
    
    // Mostrar apenas o scanner
    document.getElementById('qrScannerContainer').style.display = 'block';
    document.getElementById('qrScanner').style.display = 'block';
    startScanner();
}

function startOperationBinding(operationId) {
    resetFinishLoadingForm();
    finishLoadingModal.style.display = 'flex';
    
    // Configurar o modal para enlonamento
    document.querySelector('#finishLoadingModal h2').textContent = 'Iniciar Enlonamento';
    document.getElementById('confirmFinishBtn').textContent = 'Iniciar Enlonamento';
    document.getElementById('confirmFinishBtn').dataset.operationId = operationId;
    document.getElementById('confirmFinishBtn').onclick = confirmStartBinding;
    
    // Mostrar apenas o scanner e lista de amarradores
    document.getElementById('finishQrScannerContainer').style.display = 'block';
    document.getElementById('finishQrScanner').style.display = 'block';
    document.getElementById('bindersList').style.display = 'block';
    
    startFinishScanner();
}

function confirmStartBinding() {
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
        status: 'binding',
        binders,
        bindingStartTime: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref(`operations/${operationId}`).update(updates)
        .then(() => {
            finishLoadingModal.style.display = 'none';
            stopAllScanners();
        })
        .catch(error => {
            console.error('Erro ao iniciar enlonamento:', error);
            alert('Erro ao iniciar enlonamento');
        });
}

function finishOperationBinding(operationId) {
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
    const operatorName = document.getElementById('operatorName').textContent;

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
        })
        .catch(error => {
            console.error('Erro ao finalizar enlonamento:', error);
            alert('Erro ao finalizar enlonamento');
        });
}

function confirmFinishOperationLoading() {
    const operationId = this.dataset.operationId;
    const operatorName = document.getElementById('operatorName').textContent;

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
            startLoadingModal.style.display = 'none';
            stopAllScanners();
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
    const video = document.getElementById('qrScanner');
    video.style.display = 'block';
    
    qrScanner = new Instascan.Scanner({
        video: video,
        mirror: false,
        scanPeriod: 5,
        backgroundScan: false
    });
    
    qrScanner.addListener('scan', function(content) {
        handleQrScan(content, 'operator');
    });
    
    Instascan.Camera.getCameras().then(function(cameraList) {
        cameras = cameraList;
        if (cameras.length > 0) {
            qrScanner.start(cameras[currentCameraIndex]);
        } else {
            alert('Nenhuma câmera encontrada!');
        }
    }).catch(function(e) {
        console.error(e);
        alert('Erro ao acessar a câmera');
    });
}

function startFinishScanner() {
    const video = document.getElementById('finishQrScanner');
    video.style.display = 'block';
    
    finishQrScanner = new Instascan.Scanner({
        video: video,
        mirror: false,
        scanPeriod: 5,
        backgroundScan: false
    });
    
    finishQrScanner.addListener('scan', function(content) {
        handleQrScan(content, 'binder');
    });
    
    Instascan.Camera.getCameras().then(function(cameraList) {
        cameras = cameraList;
        if (cameras.length > 0) {
            currentFinishCameraIndex = 0;
            finishQrScanner.start(cameras[currentFinishCameraIndex]);
        } else {
            alert('Nenhuma câmera encontrada!');
        }
    }).catch(function(e) {
        console.error(e);
        alert('Erro ao acessar a câmera');
    });
}

function stopAllScanners() {
    if (qrScanner) {
        qrScanner.stop();
        document.getElementById('qrScanner').style.display = 'none';
    }
    if (finishQrScanner) {
        finishQrScanner.stop();
        document.getElementById('finishQrScanner').style.display = 'none';
    }
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
    }
}

function handleQrScan(result, type) {
    const qrCodeRegex = /^GZL-EO-\d{5}$/;
    if (!qrCodeRegex.test(result)) {
        alert('QR Code inválido! O formato deve ser GZL-EO-XXXXX (onde X são números)');
        return;
    }

    const employeeId = result.split('-')[2];
    
    db.ref(`funcionarios`).orderByChild('codigo').equalTo(result).once('value')
        .then(snapshot => {
            if (!snapshot.exists()) {
                alert('Funcionário não encontrado! Verifique o QR Code.');
                return;
            }

            let employeeData = null;
            snapshot.forEach(child => {
                employeeData = child.val();
            });

            if (!employeeData) {
                alert('Dados do funcionário não encontrados!');
                return;
            }
            
            if (type === 'operator') {
                document.getElementById('operatorName').textContent = employeeData.nome;
                document.getElementById('operatorInfo').style.display = 'block';
                document.getElementById('confirmLoadingBtn').disabled = false;
                stopAllScanners();
            } else if (type === 'binder') {
                addBinderToList(employeeData, employeeId);
            }
        })
        .catch(error => {
            console.error('Erro ao buscar funcionário:', error);
            alert('Erro ao buscar dados do funcionário');
        });
}

function addBinderToList(employee, employeeId) {
    const bindersList = document.getElementById('bindersList');
    const existing = Array.from(bindersList.children).some(item => 
        item.dataset.id === employeeId
    );

    if (!existing) {
        const binderItem = document.createElement('div');
        binderItem.className = 'binder-item';
        binderItem.dataset.id = employeeId;
        binderItem.innerHTML = `
            <span>${employee.nome} (${employee.funcao})</span>
            <button class="btn small-btn danger-btn remove-binder-btn">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        bindersList.appendChild(binderItem);
        
        binderItem.querySelector('.remove-binder-btn').addEventListener('click', () => {
            binderItem.remove();
        });
        
        document.getElementById('confirmFinishBtn').disabled = false;
    }
}

function confirmStartLoading() {
    const dtNumber = document.getElementById('dtNumber').value;
    const vehicleType = document.getElementById('vehicleType').value;
    const dockNumber = document.getElementById('dockNumber').value;
    const operatorName = document.getElementById('operatorName').textContent;

    if (!dtNumber || !vehicleType || !dockNumber || !operatorName) {
        alert('Preencha todos os campos!');
        return;
    }

    const operation = {
        dtNumber,
        vehicleType,
        dock: dockNumber,
        operatorName,
        status: 'loading',
        startTime: firebase.database.ServerValue.TIMESTAMP,
        pauses: {},
        createdBy: currentUser.uid,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    const newOperationRef = operationsRef.push();
    newOperationRef.set(operation)
        .then(() => {
            startLoadingModal.style.display = 'none';
            resetStartLoadingForm();
        })
        .catch(error => {
            console.error('Erro ao iniciar operação:', error);
            alert('Erro ao iniciar operação');
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

    db.ref('history').push(historyData);
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
    document.getElementById('dtNumber').value = '';
    document.getElementById('vehicleType').value = 'Caminhão';
    document.getElementById('dockNumber').value = '1';
    document.getElementById('operatorName').textContent = '';
    document.getElementById('operatorInfo').style.display = 'none';
    document.getElementById('confirmLoadingBtn').disabled = true;
    document.getElementById('confirmLoadingBtn').onclick = confirmStartLoading;
    document.querySelector('#startLoadingModal h2').textContent = 'Iniciar Carregamento';
    document.getElementById('confirmLoadingBtn').textContent = 'Iniciar Carregamento';
    document.getElementById('dtNumber').style.display = 'block';
    document.getElementById('vehicleType').style.display = 'block';
    document.getElementById('dockNumber').style.display = 'block';
    document.querySelector('.input-method-toggle').style.display = 'flex';
    document.getElementById('startScannerBtn').style.display = 'block';
}

function resetFinishLoadingForm() {
    document.getElementById('operatorName').textContent = '';
    document.getElementById('operatorInfo').style.display = 'none';
    document.getElementById('confirmFinishBtn').disabled = true;
    document.getElementById('bindersList').innerHTML = '';
    document.querySelector('#finishLoadingModal h2').textContent = 'Finalizar Amarração';
    document.getElementById('confirmFinishBtn').textContent = 'Finalizar Amarração';
    document.getElementById('finishQrScannerContainer').style.display = 'none';
    document.getElementById('bindersList').style.display = 'none';
}