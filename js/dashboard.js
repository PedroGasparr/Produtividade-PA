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
            if (['loading', 'binding', 'paused'].includes(operation.status)) {
                currentOperations.push(operation);
                renderOperationCard(operation);
            }
        });

        finishLoadingBtn.disabled = currentOperations.length === 0;
        pauseBtn.disabled = currentOperations.length === 0;
    });
}

function setupEventListeners() {
    startLoadingBtn.addEventListener('click', () => startLoadingModal.style.display = 'flex');
    finishLoadingBtn.addEventListener('click', () => finishLoadingModal.style.display = 'flex');
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

    startLoadingBtn.addEventListener('click', () => {
    console.log('Botão de iniciar carregamento clicado');
    startLoadingModal.style.display = 'flex';
    console.log('Modal deve estar visível agora');
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
    console.log('Tentando trocar de câmera. Câmeras disponíveis:', cameras);
    
    if (cameras.length < 2) {
        console.log('Menos de 2 câmeras disponíveis. Não é possível trocar.');
        return;
    }
    
    currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
    console.log('Mudando para câmera:', currentCameraIndex, cameras[currentCameraIndex]);
    
    if (qrScanner) {
        qrScanner.stop().then(() => {
            console.log('Scanner parado com sucesso');
            qrScanner.start(cameras[currentCameraIndex]).then(() => {
                console.log('Scanner iniciado com nova câmera');
            }).catch(err => {
                console.error('Erro ao iniciar scanner com nova câmera:', err);
            });
        }).catch(err => {
            console.error('Erro ao parar scanner:', err);
        });
    }
}

let currentFinishCameraIndex = 0;

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
        
        <div class="operation-card-time">${formatTime(elapsedTime)}</div>
        
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
            ${operation.binders && Object.keys(operation.binders).length > 0 ? `
            <div class="operation-card-detail">
                <span class="operation-card-detail-label">Amarradores:</span>
                <span>${Object.values(operation.binders).map(b => b.name).join(', ')}</span>
            </div>
            ` : ''}
        </div>
        
        <div class="operation-card-actions">
            ${operation.status === 'loading' ? `
            <button class="btn small-btn primary-btn finish-loading-btn" data-id="${operation.id}">
                <i class="fas fa-stop"></i> Finalizar Carregamento
            </button>
            ` : ''}
            
            ${operation.status === 'binding' ? `
            <button class="btn small-btn primary-btn finish-binding-btn" data-id="${operation.id}">
                <i class="fas fa-check"></i> Finalizar Amarração
            </button>
            ` : ''}
            
            ${operation.status === 'paused' ? `
            <button class="btn small-btn secondary-btn resume-btn" data-id="${operation.id}">
                <i class="fas fa-play"></i> Retomar
            </button>
            ` : ''}
        </div>
    `;

    operationsGrid.appendChild(card);

    if (operation.status === 'loading') {
        card.querySelector('.finish-loading-btn').addEventListener('click', () => finishOperationLoading(operation.id));
    } else if (operation.status === 'binding') {
        card.querySelector('.finish-binding-btn').addEventListener('click', () => finishOperationBinding(operation.id));
    } else if (operation.status === 'paused') {
        card.querySelector('.resume-btn').addEventListener('click', () => resumeOperation(operation.id));
    }
}

// Funções atualizadas para leitura de QR Code
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
    
    if (cameras.length > 0) {
        finishQrScanner.start(cameras[currentFinishCameraIndex]);
    } else {
        alert('Nenhuma câmera disponível!');
    }
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
}

// Adicione isso no início do seu dashboard.js para verificar erros
window.addEventListener('error', function(e) {
    console.error('Erro global:', e.error);
    alert('Ocorreu um erro: ' + e.error.message);
});

// Modifique o event listener do botão para incluir logs
startLoadingBtn.addEventListener('click', () => {
    console.log('Botão de iniciar carregamento clicado');
    startLoadingModal.style.display = 'flex';
    console.log('Modal deve estar visível agora');
});

// Função melhorada para lidar com QR Codes
function handleQrScan(result, type) {
    // Verificar formato do QR Code (GZL-EO-XXXXX)
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

            // Obter dados do funcionário
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
                stopAllScanners();
            }
        })
        .catch(error => {
            console.error('Erro ao buscar funcionário:', error);
            alert('Erro ao buscar dados do funcionário');
        });
}

// Adicionar amarrador à lista (atualizado para usar ID como chave)
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
            <span>${employee.name} (${employee.age} anos)</span>
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

// Confirmar início de carregamento (atualizado para Realtime Database)
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

// Finalizar carregamento (iniciar amarração)
function finishOperationLoading(operationId) {
    const operation = currentOperations.find(op => op.id === operationId);
    
    if (!operation) {
        alert('Operação não encontrada!');
        return;
    }

    // Abrir modal para escanear QR Code dos amarradores
    finishLoadingModal.style.display = 'flex';
    document.getElementById('bindersList').innerHTML = '';
    document.getElementById('confirmFinishBtn').disabled = true;
    document.getElementById('confirmFinishBtn').dataset.operationId = operationId;
}

// Confirmar finalização de amarração (atualizado para Realtime Database)
function confirmFinishLoading() {
    const operationId = this.dataset.operationId;
    const bindersList = document.getElementById('bindersList');
    
    // Criar objeto de amarradores com IDs como chaves
    const binders = {};
    Array.from(bindersList.children).forEach(item => {
        const employeeId = item.dataset.id;
        const [name, agePart] = item.textContent.trim().split(' (');
        const age = agePart ? parseInt(agePart) : 0;
        binders[employeeId] = { name, age };
    });

    if (Object.keys(binders).length === 0) {
        alert('Adicione pelo menos um amarrador!');
        return;
    }

    const updates = {
        status: 'binding',
        binders,
        loadingEndTime: firebase.database.ServerValue.TIMESTAMP,
        bindingStartTime: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref(`operations/${operationId}`).update(updates)
        .then(() => {
            finishLoadingModal.style.display = 'none';
        })
        .catch(error => {
            console.error('Erro ao atualizar operação:', error);
            alert('Erro ao finalizar carregamento');
        });
}

// Finalizar amarração completamente (atualizado para Realtime Database)
function finishOperationBinding(operationId) {
    const operation = currentOperations.find(op => op.id === operationId);
    
    if (!operation) {
        alert('Operação não encontrada!');
        return;
    }

    const updates = {
        status: 'completed',
        bindingEndTime: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref(`operations/${operationId}`).update(updates)
        .then(() => {
            // Calcular tempos totais e salvar no histórico
            saveOperationHistory(operationId);
        })
        .catch(error => {
            console.error('Erro ao finalizar operação:', error);
            alert('Erro ao finalizar operação');
        });
}

// Salvar no histórico (atualizado para Realtime Database)
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

// Mostrar modal de pausa
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

// Confirmar pausa (atualizado para Realtime Database)
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
            // Adiciona um registro de pausa
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

// Retomar operação pausada (atualizado para Realtime Database)
function resumeOperation(operationId) {
    const operation = currentOperations.find(op => op.id === operationId);
    
    if (!operation || !operation.pauses || Object.keys(operation.pauses).length === 0) {
        alert('Operação inválida para retomar!');
        return;
    }

    // Encontrar a última pausa (que ainda não tem fim)
    let lastPauseId = null;
    let lastPause = null;
    
    Object.entries(operation.pauses).forEach(([pauseId, pause]) => {
        if (!pause.end) {
            lastPauseId = pauseId;
            lastPause = pause;
        }
    });

    if (!lastPauseId) {
        alert('Esta operação já está ativa!');
        return;
    }

    const updates = {
        [`operations/${operationId}/status`]: operation.loadingEndTime ? 'binding' : 'loading',
        [`operations/${operationId}/pauses/${lastPauseId}/end`]: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref().update(updates)
        .catch(error => {
            console.error('Erro ao retomar operação:', error);
            alert('Erro ao retomar operação');
        });
}

// Funções auxiliares
function resetStartLoadingForm() {
    document.getElementById('dtNumber').value = '';
    document.getElementById('vehicleType').value = 'truck';
    document.getElementById('dockNumber').value = '1';
    document.getElementById('operatorName').textContent = '';
    document.getElementById('operatorInfo').style.display = 'none';
    document.getElementById('confirmLoadingBtn').disabled = true;
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
    
    return Math.floor((end - start - pausedTime) / 1000); // Retorna em segundos
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
        'binding': 'Amarrando',
        'paused': 'Pausado',
        'completed': 'Concluído'
    };
    
    return labels[status] || status;
}

function generateId() {
    return db.ref().push().key;
}

// Implementação simplificada do QrScanner para exemplo (mantida igual)
class QrScanner {
    constructor(videoElement, callback, options) {
        this.video = videoElement;
        this.callback = callback;
        this.options = options || {};
        this.stream = null;
        this.interval = null;
    }
    
    start() {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                this.stream = stream;
                this.video.srcObject = stream;
                this.video.play();
                
                // Simulação de leitura QR Code
                this.interval = setInterval(() => {
                    // Em um caso real, aqui você usaria uma biblioteca como jsQR
                    // para ler o QR code do vídeo
                    if (Math.random() > 0.9) { // Simula leitura aleatória para exemplo
                        this.callback('GZL-EO-123456'); // QR Code de exemplo
                    }
                }, 1000);
            })
            .catch(error => {
                console.error('Erro ao acessar câmera:', error);
                alert('Não foi possível acessar a câmera');
            });
    }
    
    stop() {
        if (this.interval) clearInterval(this.interval);
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
    }
}