// Configuração do Firebase
const db = firebase.database();

// Variáveis globais
let currentUser = null;
let qrScanner = null;
let stepQrScanner = null;
let currentProcesses = [];
let currentStepModalProcessId = null;
let currentStepModalStage = null;
let cameras = [];

// Elementos da página
const elements = {
    startProcessBtn: document.getElementById('startProcessBtn'),
    operationsGrid: document.getElementById('operationsGrid'),
    startProcessModal: document.getElementById('startProcessModal'),
    processStepModal: document.getElementById('processStepModal'),
    currentUser: document.getElementById('currentUser'),
    
    // Modal de Início
    qrScanner: document.getElementById('qrScanner'),
    startScannerBtn: document.getElementById('startScannerBtn'),
    operatorName: document.getElementById('operatorName'),
    operatorInfo: document.getElementById('operatorInfo'),
    dtNumber: document.getElementById('dtNumber'),
    vehicleType: document.getElementById('vehicleType'),
    dockNumber: document.getElementById('dockNumber'),
    confirmProcessBtn: document.getElementById('confirmProcessBtn'),
    cancelProcessBtn: document.getElementById('cancelProcessBtn'),
    scanFeedback: document.getElementById('scanFeedback'),
    
    // Modal de Etapa
    processStepTitle: document.getElementById('processStepTitle'),
    processDtNumber: document.getElementById('processDtNumber'),
    processVehicleType: document.getElementById('processVehicleType'),
    processDockNumber: document.getElementById('processDockNumber'),
    stepQrScanner: document.getElementById('stepQrScanner'),
    startStepScannerBtn: document.getElementById('startStepScannerBtn'),
    stepOperatorName: document.getElementById('stepOperatorName'),
    stepOperatorInfo: document.getElementById('stepOperatorInfo'),
    helpersList: document.getElementById('helpersList'),
    confirmStepBtn: document.getElementById('confirmStepBtn'),
    cancelStepBtn: document.getElementById('cancelStepBtn'),
    processStepFeedback: document.getElementById('processStepFeedback')
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
            initializeProcesses();
            setupEventListeners();
        }
    });
});

function initializeProcesses() {
    // Limpar qualquer intervalo existente
    if (window.processesInterval) {
        clearInterval(window.processesInterval);
    }

    db.ref('processes').on('value', snapshot => {
        currentProcesses = [];
        elements.operationsGrid.innerHTML = '';
        
        snapshot.forEach(childSnapshot => {
            const process = { id: childSnapshot.key, ...childSnapshot.val() };
            if (process.status !== 'completed') {
                currentProcesses.push(process);
                renderProcessCard(process);
            }
        });
        
        // Iniciar intervalo para atualizar os tempos
        startProcessesTimer();
    });
}

function renderProcessCard(process) {
    const card = document.createElement('div');
    card.className = 'operation-card';
    card.dataset.id = process.id;

    const currentStage = getCurrentStage(process);
    const elapsedTime = calculateElapsedTime(process);
    
    card.innerHTML = `
        <div class="operation-card-header">
            <div class="operation-card-title">Doca ${process.dock}</div>
            <div class="operation-status">${getStageLabel(currentStage)}</div>
            <div class="operation-stage">Etapa ${currentStage}</div>
        </div>
        
        <div class="operation-card-time timer">${formatTime(elapsedTime)}</div>
        
        <div class="operation-card-details">
            <div>DT: ${process.dtNumber}</div>
            <div>Veículo: ${process.vehicleType}</div>
            <div>Operador: ${process.operatorName || '-'}</div>
        </div>
        
        <div class="process-steps">
            ${renderProcessSteps(process, currentStage)}
        </div>
    `;

    elements.operationsGrid.appendChild(card);

    // Adicionar event listeners para os botões de etapa
    const stageButtons = card.querySelectorAll('.stage-action-btn');
    stageButtons.forEach(button => {
        button.addEventListener('click', () => {
            const stage = button.dataset.stage;
            showProcessStepModal(process.id, stage);
        });
    });
}

function renderProcessSteps(process, currentStage) {
    const stages = [
        { id: 1, name: 'Vistoria' },
        { id: 2, name: 'Abertura' },
        { id: 3, name: 'Separação' },
        { id: 4, name: 'Faturamento' },
        { id: 5, name: 'Carregamento' },
        { id: 6, name: 'Fechamento' }
    ];

    return stages.map(stage => {
        const isCompleted = process[`stage${stage.id}End`] !== undefined;
        const isActive = currentStage === stage.id;
        
        let stageContent = `<div class="process-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">`;
        stageContent += `<h4>${stage.id}. ${stage.name}</h4>`;
        
        if (isCompleted) {
            const startTime = process[`stage${stage.id}Start`];
            const endTime = process[`stage${stage.id}End`];
            const duration = formatTime(Math.floor((endTime - startTime) / 1000));
            stageContent += `<div>Tempo: ${duration}</div>`;
        } else if (isActive) {
            stageContent += `<button class="btn stage-action-btn" data-stage="${stage.id}">Registrar ${stage.name}</button>`;
        }
        
        stageContent += `</div>`;
        return stageContent;
    }).join('');
}

function getCurrentStage(process) {
    for (let i = 1; i <= 6; i++) {
        if (!process[`stage${i}End`]) {
            return i;
        }
    }
    return 6; // Se todas as etapas estiverem completas
}

function setupEventListeners() {
    // Botões principais
    elements.startProcessBtn.addEventListener('click', () => {
        resetStartProcessForm();
        elements.startProcessModal.style.display = 'flex';
    });
    
    // Modal de Início
    elements.startScannerBtn.addEventListener('click', startScanner);
    elements.cancelProcessBtn.addEventListener('click', () => {
        elements.startProcessModal.style.display = 'none';
        stopScanner();
    });
    elements.confirmProcessBtn.addEventListener('click', confirmStartProcess);
    
    // Modal de Etapa
    elements.startStepScannerBtn.addEventListener('click', startStepScanner);
    elements.cancelStepBtn.addEventListener('click', () => {
        elements.processStepModal.style.display = 'none';
        stopStepScanner();
    });
    elements.confirmStepBtn.addEventListener('click', confirmProcessStep);
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        firebase.auth().signOut().then(() => {
            window.location.href = 'index.html';
        });
    });
    
    // Fechar modais
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            elements.startProcessModal.style.display = 'none';
            elements.processStepModal.style.display = 'none';
            stopScanner();
            stopStepScanner();
        });
    });
}

function getRearCamera(cameras) {
    const rearCamera = cameras.find(camera => 
        camera.name.toLowerCase().includes('traseira') || 
        camera.name.toLowerCase().includes('rear') ||
        camera.name.toLowerCase().includes('back')
    );
    
    if (!rearCamera) {
        return cameras.find(camera => camera.facing === 'environment') || 
               cameras[cameras.length - 1];
    }
    
    return rearCamera;
}

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
        handleQrScan(content, 'start');
    });
    
    Instascan.Camera.getCameras()
        .then(cameraList => {
            cameras = cameraList;
            if (cameras.length === 0) {
                throw new Error('Nenhuma câmera encontrada');
            }
            
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

function startStepScanner() {
    stopStepScanner();
    
    elements.stepQrScanner.style.display = 'block';
    stepQrScanner = new Instascan.Scanner({
        video: elements.stepQrScanner,
        mirror: false,
        scanPeriod: 1,
        backgroundScan: false
    });
    
    stepQrScanner.addListener('scan', content => {
        handleQrScan(content, 'step');
    });
    
    Instascan.Camera.getCameras()
        .then(cameraList => {
            if (cameraList.length === 0) {
                throw new Error('Nenhuma câmera encontrada');
            }
            
            const selectedCamera = getRearCamera(cameraList);
            return stepQrScanner.start(selectedCamera);
        })
        .then(() => {
            showFeedback('Scanner iniciado com sucesso', 'success', 'processStepFeedback');
        })
        .catch(error => {
            console.error('Erro ao iniciar scanner:', error);
            showFeedback('Erro ao acessar câmera: ' + error.message, 'error', 'processStepFeedback');
        });
}

function stopScanner() {
    if (qrScanner) {
        qrScanner.stop();
        qrScanner = null;
    }
    elements.qrScanner.style.display = 'none';
}

function stopStepScanner() {
    if (stepQrScanner) {
        stepQrScanner.stop();
        stepQrScanner = null;
    }
    elements.stepQrScanner.style.display = 'none';
}

function handleQrScan(content, type) {
    const qrCodeRegex = /^GZL-EO-\d{5}$/;
    if (!qrCodeRegex.test(content)) {
        showFeedback('QR Code inválido! Formato deve ser GZL-EO-XXXXX', 'error', 
                     type === 'start' ? 'scanFeedback' : 'processStepFeedback');
        return;
    }

    showFeedback('Validando QR Code...', 'info', 
                 type === 'start' ? 'scanFeedback' : 'processStepFeedback');

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

            if (type === 'start') {
                // Lógica para operador principal
                elements.operatorName.textContent = employeeData.nome;
                elements.operatorInfo.style.display = 'block';
                elements.confirmProcessBtn.disabled = false;
                showFeedback('Operador validado com sucesso!', 'success', 'scanFeedback');
                stopScanner();
            } else {
                if (currentStepModalStage === 2 || currentStepModalStage === 6) {
                    // Etapas de abertura/fechamento (pode ter múltiplos ajudantes)
                    addHelperToList(employeeData);
                } else {
                    // Outras etapas (apenas um operador)
                    elements.stepOperatorName.textContent = employeeData.nome;
                    elements.stepOperatorInfo.style.display = 'block';
                    elements.confirmStepBtn.disabled = false;
                    showFeedback('Operador validado com sucesso!', 'success', 'processStepFeedback');
                    stopStepScanner();
                }
            }
        })
        .catch(error => {
            console.error('Erro ao validar QR Code:', error);
            showFeedback('Erro: ' + error.message, 'error', 
                        type === 'start' ? 'scanFeedback' : 'processStepFeedback');
        });
}

function addHelperToList(employeeData) {
    // Verifica se o funcionário já está na lista
    const existingHelper = Array.from(elements.helpersList.children).find(item => 
        item.textContent.includes(employeeData.nome)
    );
    
    if (existingHelper) {
        showFeedback(`${employeeData.nome} já está na lista`, 'info', 'processStepFeedback');
        return;
    }

    const helperItem = document.createElement('div');
    helperItem.className = 'helper-item';
    helperItem.innerHTML = `
        <span>${employeeData.nome} (${employeeData.cargo || 'Ajudante'})</span>
        <button class="btn remove-helper-btn"><i class="fas fa-times"></i></button>
    `;
    
    helperItem.querySelector('.remove-helper-btn').addEventListener('click', () => {
        helperItem.remove();
        checkHelpersList();
    });
    
    elements.helpersList.appendChild(helperItem);
    checkHelpersList();
    showFeedback(`${employeeData.nome} adicionado como ajudante`, 'success', 'processStepFeedback');
}

function checkHelpersList() {
    elements.confirmStepBtn.disabled = elements.helpersList.children.length === 0;
}

function confirmStartProcess() {
    const dtNumber = elements.dtNumber.value.trim();
    const vehicleType = elements.vehicleType.value;
    const dockNumber = elements.dockNumber.value;
    const operatorName = elements.operatorName.textContent;

    if (!dtNumber || !vehicleType || !dockNumber || !operatorName) {
        showFeedback('Preencha todos os campos obrigatórios', 'error', 'scanFeedback');
        return;
    }

    // Verificar se a doca já está em uso
    const isDockInUse = currentProcesses.some(process => 
        process.dock === dockNumber && getCurrentStage(process) <= 6
    );

    if (isDockInUse) {
        showFeedback(`Doca ${dockNumber} já está em uso`, 'error', 'scanFeedback');
        return;
    }

    elements.confirmProcessBtn.disabled = true;

    const newProcess = {
        dtNumber,
        vehicleType,
        dock: dockNumber,
        operatorName,
        status: 'in_progress',
        stage1Start: firebase.database.ServerValue.TIMESTAMP,
        createdBy: currentUser.uid,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref('processes').push(newProcess)
        .then(() => {
            showFeedback('Processo iniciado com sucesso!', 'success', 'scanFeedback');
            setTimeout(() => {
                elements.startProcessModal.style.display = 'none';
                resetStartProcessForm();
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao iniciar processo:', error);
            showFeedback('Erro ao iniciar processo: ' + error.message, 'error', 'scanFeedback');
        })
        .finally(() => {
            elements.confirmProcessBtn.disabled = false;
        });
}

function showProcessStepModal(processId, stage) {
    currentStepModalProcessId = processId;
    currentStepModalStage = parseInt(stage);
    
    const process = currentProcesses.find(p => p.id === processId);
    if (!process) return;
    
    // Configurar modal conforme a etapa
    resetProcessStepForm();
    elements.processStepTitle.textContent = `Etapa ${stage} - ${getStageLabel(stage)}`;
    elements.processDtNumber.textContent = process.dtNumber;
    elements.processVehicleType.textContent = process.vehicleType;
    elements.processDockNumber.textContent = process.dock;
    
    // Mostrar lista de ajudantes apenas para abertura/fechamento
    if (stage === 2 || stage === 6) {
        elements.helpersList.style.display = 'block';
    }
    
    elements.processStepModal.style.display = 'flex';
}

function confirmProcessStep() {
    const processId = currentStepModalProcessId;
    const stage = currentStepModalStage;
    const process = currentProcesses.find(p => p.id === processId);
    
    if (!process) {
        showFeedback('Processo não encontrado', 'error', 'processStepFeedback');
        return;
    }

    const updates = {};
    const now = firebase.database.ServerValue.TIMESTAMP;
    
    // Registrar finalização da etapa anterior
    updates[`stage${stage}End`] = now;
    
    // Se for abertura/fechamento, registrar ajudantes
    if (stage === 2 || stage === 6) {
        const helpers = [];
        Array.from(elements.helpersList.children).forEach(item => {
            helpers.push(item.textContent.trim().split(' (')[0]);
        });
        updates[`stage${stage}Helpers`] = helpers;
    } else {
        // Registrar operador da etapa
        updates[`stage${stage}Operator`] = elements.stepOperatorName.textContent;
    }
    
    // Se não for a última etapa, iniciar a próxima
    if (stage < 6) {
        updates[`stage${stage + 1}Start`] = now;
    } else {
        // Se for a última etapa, marcar processo como completo
        updates.status = 'completed';
        updates.completedAt = now;
    }
    
    // Calcular tempo de espera entre etapas
    if (stage > 1) {
        const prevStageEnd = process[`stage${stage - 1}End`] || now;
        updates[`waitTime${stage - 1}_${stage}`] = now - prevStageEnd;
    }
    
    elements.confirmStepBtn.disabled = true;

    db.ref(`processes/${processId}`).update(updates)
        .then(() => {
            if (stage === 6) {
                saveProcessHistory(processId);
            }
            showFeedback(`Etapa ${stage} registrada com sucesso!`, 'success', 'processStepFeedback');
            setTimeout(() => {
                elements.processStepModal.style.display = 'none';
            }, 1500);
        })
        .catch(error => {
            console.error('Erro ao registrar etapa:', error);
            showFeedback('Erro ao registrar: ' + error.message, 'error', 'processStepFeedback');
        })
        .finally(() => {
            elements.confirmStepBtn.disabled = false;
        });
}

function saveProcessHistory(processId) {
    const process = currentProcesses.find(p => p.id === processId);
    if (!process) return;

    const historyData = {
        processId,
        dtNumber: process.dtNumber,
        vehicleType: process.vehicleType,
        dock: process.dock,
        operator: process.operatorName,
        startTime: process.stage1Start,
        completedAt: firebase.database.ServerValue.TIMESTAMP,
        stages: {}
    };

    // Coletar dados de todas as etapas
    for (let i = 1; i <= 6; i++) {
        historyData.stages[i] = {
            start: process[`stage${i}Start`],
            end: process[`stage${i}End`],
            operator: process[`stage${i}Operator`],
            helpers: process[`stage${i}Helpers`]
        };
        
        if (i > 1) {
            historyData.stages[i].waitTime = process[`waitTime${i-1}_${i}`];
        }
    }

    db.ref('history').push(historyData)
        .then(() => {
            db.ref(`processes/${processId}`).remove();
        });
}

function startProcessesTimer() {
    // Limpar intervalo anterior se existir
    if (window.processesInterval) {
        clearInterval(window.processesInterval);
    }

    // Atualizar os tempos a cada segundo
    window.processesInterval = setInterval(() => {
        const cards = document.querySelectorAll('.operation-card');
        cards.forEach(card => {
            const processId = card.dataset.id;
            const process = currentProcesses.find(p => p.id === processId);
            
            if (process) {
                const elapsedTime = calculateElapsedTime(process);
                const timeElement = card.querySelector('.timer');
                if (timeElement) {
                    timeElement.textContent = formatTime(elapsedTime);
                }
            }
        });
    }, 1000);
}

function calculateElapsedTime(process) {
    const currentStage = getCurrentStage(process);
    const now = Date.now();
    
    // Tempo total é a soma de todas as etapas completas + etapa atual
    let totalTime = 0;
    
    for (let i = 1; i <= currentStage; i++) {
        const start = process[`stage${i}Start`] || now;
        const end = i < currentStage ? (process[`stage${i}End`] || now) : now;
        
        totalTime += (end - start);
    }
    
    return Math.floor(totalTime / 1000);
}

// Funções auxiliares
function resetStartProcessForm() {
    elements.dtNumber.value = '';
    elements.vehicleType.value = '';
    elements.dockNumber.value = '';
    elements.operatorName.textContent = '';
    elements.operatorInfo.style.display = 'none';
    elements.confirmProcessBtn.disabled = true;
    elements.scanFeedback.style.display = 'none';
}

function resetProcessStepForm() {
    elements.stepOperatorName.textContent = '';
    elements.stepOperatorInfo.style.display = 'none';
    elements.helpersList.innerHTML = '';
    elements.helpersList.style.display = 'none';
    elements.confirmStepBtn.disabled = true;
    elements.processStepFeedback.style.display = 'none';
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

function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getStageLabel(stage) {
    const labels = {
        1: 'Vistoria',
        2: 'Abertura',
        3: 'Separação',
        4: 'Faturamento',
        5: 'Carregamento',
        6: 'Fechamento'
    };
    return labels[stage] || `Etapa ${stage}`;
}