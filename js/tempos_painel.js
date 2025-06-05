// painel_de_controle.js - Versão independente mas compatível

// Elementos da página
const timeElements = {
    avgLoadingTime: document.getElementById('avgLoadingTime'),
    avgFreeTime: document.getElementById('avgFreeTime'),
    avgBindingTime: document.getElementById('avgBindingTime')
};

// Variáveis globais específicas para este script
let timeMetricsOperations = [];

// Função para carregar dados específicos para as métricas de tempo
function loadTimeMetricsData() {
    // Verifica se o Firebase já está inicializado
    if (!firebase.apps.length) {
        console.error("Firebase não foi inicializado");
        return;
    }
    
    const db = firebase.database();
    
    db.ref('operations').once('value')
        .then(snapshot => {
            timeMetricsOperations = [];
            snapshot.forEach(childSnapshot => {
                const operation = childSnapshot.val();
                operation.id = childSnapshot.key;
                timeMetricsOperations.push(operation);
            });
            
            calculateTimeMetrics();
        })
        .catch(error => {
            console.error("Erro ao carregar dados de tempo:", error);
        });
}

// Calcula as métricas de tempo
function calculateTimeMetrics() {
    if (timeMetricsOperations.length === 0) {
        resetTimeMetricsDisplay();
        return;
    }
    
    // Filtra apenas operações completas para cálculo
    const completedOps = timeMetricsOperations.filter(op => op.status === 'completed');
    
    if (completedOps.length === 0) {
        resetTimeMetricsDisplay();
        return;
    }
    
    const { avgLoading, avgFree, avgBinding } = calculateAverageTimes(completedOps);
    
    updateTimeMetricsDisplay(avgLoading, avgFree, avgBinding);
}

function calculateAverageTimes(operations) {
    let totalLoading = 0, totalFree = 0, totalBinding = 0;
    let validBindingOps = 0;
    
    operations.forEach(op => {
        // Tempo de carregamento
        if (op.startTime && op.loadingEndTime) {
            totalLoading += (op.loadingEndTime - op.startTime) / 1000;
            
            // Tempo livre entre carregamento e amarriação
            if (op.bindingStartTime) {
                totalFree += (op.bindingStartTime - op.loadingEndTime) / 1000;
            }
        }
        
        // Tempo de amarriação
        if (op.bindingStartTime && op.bindingEndTime) {
            totalBinding += (op.bindingEndTime - op.bindingStartTime) / 1000;
            validBindingOps++;
        }
    });
    
    return {
        avgLoading: totalLoading / operations.length,
        avgFree: totalFree / operations.length,
        avgBinding: validBindingOps > 0 ? totalBinding / validBindingOps : 0
    };
}

function updateTimeMetricsDisplay(loading, free, binding) {
    timeElements.avgLoadingTime.textContent = formatTime(loading);
    timeElements.avgFreeTime.textContent = formatTime(free);
    timeElements.avgBindingTime.textContent = formatTime(binding);
}

function resetTimeMetricsDisplay() {
    timeElements.avgLoadingTime.textContent = "00:00:00";
    timeElements.avgFreeTime.textContent = "00:00:00";
    timeElements.avgBindingTime.textContent = "00:00:00";
}

// Formata tempo (segundos para HH:MM:SS)
function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00:00";
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Inicialização modificada para evitar conflitos
function initTimeMetrics() {
    // Espera a autenticação do script principal
    const checkAuth = setInterval(() => {
        if (firebase.auth().currentUser) {
            clearInterval(checkAuth);
            loadTimeMetricsData();
            
            // Configura o botão de refresh para este script
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    loadTimeMetricsData();
                });
            }
        }
    }, 500);
}

// Inicia quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initTimeMetrics);