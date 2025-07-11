// ================= CONFIGURAÇÃO INICIAL ================= //

// 1. Configuração do Firebase
const firebaseConfig = {
    apiKey: "SUA_CHAVE_API",
    authDomain: "SEU_DOMINIO.firebaseapp.com",
    projectId: "SEU_PROJETO",
    storageBucket: "SEU_BUCKET.appspot.com",
    messagingSenderId: "SEU_SENDER_ID",
    appId: "SEU_APP_ID"
};

// 2. Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ================= VARIÁVEIS GLOBAIS ================= //

// 3. Estado do aplicativo
let currentUser = null;           // Usuário logado
let qrScanner = null;             // Scanner QR Code principal
let stepQrScanner = null;         // Scanner para etapas
let currentProcesses = [];        // Lista de processos ativos
let currentOperation = null;      // Operação atual (para ajudantes)
let cameras = [];                 // Lista de câmeras disponíveis
let currentCamera = null;         // Câmera em uso
let cameraMode = 'rear';          // Modo da câmera ('front' ou 'rear')

// ================= ELEMENTOS DA PÁGINA ================= //

// 4. Mapeamento dos elementos HTML
const elements = {
    startProcessBtn: document.getElementById('startProcessBtn'),
    cameraToggleBtn: document.getElementById('cameraToggleBtn'),
    operationsGrid: document.getElementById('operationsGrid'),
    startProcessModal: document.getElementById('startProcessModal'),
    processStepModal: document.getElementById('processStepModal'),
    currentUser: document.getElementById('currentUser'),
    
    // Modal de novo processo
    qrScanner: document.getElementById('qrScanner'),
    operatorName: document.getElementById('operatorName'),
    dtNumber: document.getElementById('dtNumber'),
    vehicleType: document.getElementById('vehicleType'),
    dockNumber: document.getElementById('dockNumber'),
    
    // Modal de etapas
    helpersList: document.getElementById('helpersList'),
    confirmStepBtn: document.getElementById('confirmStepBtn')
};

// ================= INICIALIZAÇÃO ================= //

// 5. Quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    // Verifica se o usuário está logado
    firebase.auth().onAuthStateChanged(user => {
        if (!user) {
            // Se não estiver logado, redireciona
            window.location.href = '../index.html';
        } else {
            // Configura o usuário atual
            currentUser = user;
            elements.currentUser.textContent = user.displayName || user.email;
            
            // Carrega os processos e configura eventos
            initializeProcesses();
            setupEventListeners();
        }
    });
});

// ================= FUNÇÕES PRINCIPAIS ================= //

// 6. Carrega os processos do Firebase
function initializeProcesses() {
    // Remove timer antigo se existir
    if (window.processesInterval) {
        clearInterval(window.processesInterval);
    }

    // Observa mudanças na lista de processos
    db.ref('processes').on('value', snapshot => {
        currentProcesses = [];
        elements.operationsGrid.innerHTML = '';
        
        // Para cada processo
        snapshot.forEach(childSnapshot => {
            const process = { 
                id: childSnapshot.key, 
                ...childSnapshot.val() 
            };
            
            // Mostra apenas processos não finalizados
            if (process.status !== 'completed') {
                currentProcesses.push(process);
                renderProcessCard(process);
            }
        });
        
        // Inicia o timer para atualizar os tempos
        startProcessesTimer();
    });
}

// 7. Exibe um processo no painel
function renderProcessCard(process) {
    const card = document.createElement('div');
    card.className = 'operation-card';
    card.dataset.id = process.id;

    // Calcula estágio atual e tempo decorrido
    const currentStage = getCurrentStage(process);
    const elapsedTime = calculateElapsedTime(process);
    
    // HTML do card
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
        </div>
        
        <div class="process-steps">
            ${renderProcessSteps(process, currentStage)}
        </div>
    `;

    // Adiciona ao painel
    elements.operationsGrid.appendChild(card);

    // Configura eventos dos botões
    setupCardButtons(card);
}

// 8. Exibe os passos do processo
function renderProcessSteps(process, currentStage) {
    const stages = [
        { id: 1, name: 'Vistoria' },
        { id: 2, name: 'Abertura' },
        { id: 3, name: 'Separação' },
        { id: 4, name: 'Faturamento' },
        { id: 5, name: 'Carregamento' },
        { id: 6, name: 'Fechamento' }
    ];

    // Gera HTML para cada etapa
    return stages.map(stage => {
        const isCompleted = process[`stage${stage.id}End`] !== undefined;
        const isActive = currentStage === stage.id;
        
        let stepHTML = `<div class="process-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">`;
        stepHTML += `<h4>${stage.id}. ${stage.name}</h4>`;
        
        if (isCompleted) {
            // Mostra tempo concluído
            const duration = calculateStageDuration(process, stage.id);
            stepHTML += `<div>Tempo: ${formatTime(duration)}</div>`;
        } else if (isActive) {
            // Botões para etapas ativas
            if (!process[`stage${stage.id}Start`]) {
                stepHTML += `<button class="btn stage-start-btn" data-stage="${stage.id}">Iniciar</button>`;
            } else {
                const currentDuration = Math.floor((Date.now() - process[`stage${stage.id}Start`]) / 1000);
                stepHTML += `
                    <div>Tempo: ${formatTime(currentDuration)}</div>
                    <button class="btn stage-finish-btn" data-stage="${stage.id}">Finalizar</button>
                `;
            }
        }
        
        stepHTML += `</div>`;
        return stepHTML;
    }).join('');
}

// ================= CONTROLE DE CÂMERA ================= //

// 9. Alterna entre câmera frontal e traseira
function toggleCamera() {
    cameraMode = cameraMode === 'rear' ? 'front' : 'rear';
    elements.cameraToggleBtn.textContent = `Câmera: ${cameraMode === 'rear' ? 'Traseira' : 'Frontal'}`;
    
    // Reinicia o scanner com a nova câmera
    if (qrScanner) {
        startScanner();
    }
}

// 10. Inicia o scanner QR Code
function startScanner() {
    // Para o scanner atual
    stopScanner();
    
    // Configura novo scanner
    elements.qrScanner.style.display = 'block';
    qrScanner = new Instascan.Scanner({
        video: elements.qrScanner,
        mirror: cameraMode === 'front', // Espelha se for frontal
        scanPeriod: 1,
        backgroundScan: false
    });
    
    // Quando ler um QR Code
    qrScanner.addListener('scan', content => {
        handleQrScan(content, 'process');
    });
    
    // Obtém as câmeras disponíveis
    Instascan.Camera.getCameras()
        .then(cameraList => {
            cameras = cameraList;
            if (cameras.length === 0) {
                throw new Error('Nenhuma câmera encontrada.');
            }
            
            // Seleciona câmera conforme o modo
            const selectedCamera = cameraMode === 'rear' ? 
                cameras.find(cam => cam.facing === 'environment') || cameras[0] :
                cameras.find(cam => cam.facing === 'user') || cameras[0];
            
            currentCamera = selectedCamera;
            return qrScanner.start(selectedCamera);
        })
        .then(() => {
            showFeedback('Scanner pronto!', 'success');
        })
        .catch(error => {
            console.error('Erro na câmera:', error);
            showFeedback('Erro: ' + error.message, 'error');
        });
}

// ================= CONTROLE DE PROCESSOS ================= //

// 11. Inicia uma nova etapa
function startStage(processId, stage) {
    // Etapas que requerem ajudantes
    if (stage === 2 || stage === 6) {
        showHelpersModal(processId, stage);
        return;
    }
    
    // Atualiza no Firebase
    const updates = {};
    updates[`stage${stage}Start`] = firebase.database.ServerValue.TIMESTAMP;
    
    db.ref(`processes/${processId}`).update(updates)
        .then(() => {
            showFeedback(`Etapa ${stage} iniciada!`, 'success');
        })
        .catch(error => {
            showFeedback('Erro: ' + error.message, 'error');
        });
}

// 12. Finaliza uma etapa
function finishStage(processId, stage) {
    const updates = {
        [`stage${stage}End`]: firebase.database.ServerValue.TIMESTAMP
    };
    
    // Se não for a última etapa, inicia a próxima
    if (stage < 6) {
        updates[`stage${stage + 1}Start`] = firebase.database.ServerValue.TIMESTAMP;
    } else {
        updates.status = 'completed';
    }
    
    db.ref(`processes/${processId}`).update(updates)
        .then(() => {
            if (stage === 6) {
                saveProcessHistory(processId);
            }
            showFeedback(`Etapa ${stage} finalizada!`, 'success');
        })
        .catch(error => {
            showFeedback('Erro: ' + error.message, 'error');
        });
}

// ================= CONTROLE DE AJUDANTES ================= //

// 13. Mostra modal para adicionar ajudantes
function showHelpersModal(processId, stage) {
    currentOperation = { processId, stage };
    
    // Configura o modal
    elements.processStepTitle.textContent = `Etapa ${stage} - ${getStageLabel(stage)}`;
    elements.helpersList.innerHTML = '';
    elements.helpersList.style.display = 'block';
    elements.confirmStepBtn.textContent = 'Confirmar Ajudantes';
    elements.processStepModal.style.display = 'flex';
}

// 14. Adiciona um ajudante à lista
function addHelper(employeeData) {
    const helperItem = document.createElement('div');
    helperItem.className = 'helper-item';
    helperItem.innerHTML = `
        <span>${employeeData.nome}</span>
        <button class="remove-helper-btn"><i class="fas fa-times"></i></button>
    `;
    
    // Botão para remover
    helperItem.querySelector('.remove-helper-btn').addEventListener('click', () => {
        helperItem.remove();
    });
    
    elements.helpersList.appendChild(helperItem);
}

// 15. Confirma os ajudantes e inicia a etapa
function confirmHelpers() {
    if (elements.helpersList.children.length === 0) {
        showFeedback('Adicione pelo menos 1 ajudante!', 'error');
        return;
    }
    
    const helpers = [];
    Array.from(elements.helpersList.children).forEach(item => {
        helpers.push(item.textContent.trim());
    });
    
    const updates = {
        [`stage${currentOperation.stage}Start`]: firebase.database.ServerValue.TIMESTAMP,
        [`stage${currentOperation.stage}Helpers`]: helpers
    };
    
    db.ref(`processes/${currentOperation.processId}`).update(updates)
        .then(() => {
            elements.processStepModal.style.display = 'none';
            showFeedback('Ajudantes confirmados!', 'success');
        })
        .catch(error => {
            showFeedback('Erro: ' + error.message, 'error');
        });
}

// ================= FUNÇÕES AUXILIARES ================= //

// 16. Calcula o estágio atual do processo
function getCurrentStage(process) {
    for (let i = 1; i <= 6; i++) {
        if (!process[`stage${i}End`]) {
            return i;
        }
    }
    return 6;
}

// 17. Formata o tempo (segundos para HH:MM:SS)
function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 18. Mostra mensagens de feedback
function showFeedback(message, type) {
    const feedbackElement = document.getElementById('feedback');
    feedbackElement.textContent = message;
    feedbackElement.className = `feedback ${type}`;
    feedbackElement.style.display = 'block';
    
    setTimeout(() => {
        feedbackElement.style.display = 'none';
    }, 5000);
}

// ================= INICIALIZAÇÃO FINAL ================= //

// 19. Configura todos os eventos
function setupEventListeners() {
    // Botão para alternar câmera
    elements.cameraToggleBtn.addEventListener('click', toggleCamera);
    
    // Botão de novo processo
    elements.startProcessBtn.addEventListener('click', () => {
        elements.startProcessModal.style.display = 'flex';
    });
    
    // Botão de confirmar ajudantes
    elements.confirmStepBtn.addEventListener('click', confirmHelpers);
    
    // Eventos de clique nos cards
    document.addEventListener('click', (e) => {
        // Iniciar etapa
        if (e.target.classList.contains('stage-start-btn')) {
            const stage = parseInt(e.target.dataset.stage);
            const processId = e.target.closest('.operation-card').dataset.id;
            startStage(processId, stage);
        }
        
        // Finalizar etapa
        if (e.target.classList.contains('stage-finish-btn')) {
            const stage = parseInt(e.target.dataset.stage);
            const processId = e.target.closest('.operation-card').dataset.id;
            finishStage(processId, stage);
        }
    });
}

// 20. Inicia o aplicativo
setupEventListeners();