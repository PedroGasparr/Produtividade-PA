 const db = firebase.database();
        
        // Variáveis globais
        let currentUser = null;
        let operations = [];
        let historyData = [];
        let docks = Array.from({length: 11}, (_, i) => ({number: i+1, status: 'free'}));
        
        // Constantes
        const TIME_LIMIT = 120;
        const DAILY_TARGET_TRUCKS = 30;
        const DAILY_TARGET_TONS = 1500;
        const MONTHLY_TARGET_TRUCKS = 600;
        const MONTHLY_TARGET_TONS = 30000;
        
        // Inicialização do painel
        document.addEventListener('DOMContentLoaded', () => {
            // Verificar autenticação
            firebase.auth().onAuthStateChanged(user => {
                if (!user) {
                    window.location.href = 'index.html';
                } else {
                    currentUser = user;
                    document.getElementById('currentUser').textContent = user.displayName || user.email;
                    loadData();
                    setupEventListeners();
                }
            });
        });
        
        function setupEventListeners() {
            document.getElementById('refreshBtn').addEventListener('click', loadData);
            document.getElementById('logoutBtn').addEventListener('click', () => {
                firebase.auth().signOut().then(() => {
                    window.location.href = 'index.html';
                });
            });
        }
        
        function loadData() {
            // Carrega operações ativas
            db.ref('operations').on('value', snapshot => {
                operations = [];
                snapshot.forEach(childSnapshot => {
                    operations.push({ id: childSnapshot.key, ...childSnapshot.val() });
                });
                updateDocksStatus();
            });
            
            // Carrega histórico para métricas
            const today = new Date().toISOString().split('T')[0];
            const currentMonth = new Date().toISOString().substring(0, 7);
            
            db.ref('history').orderByChild('completedAt').once('value')
                .then(snapshot => {
                    historyData = [];
                    snapshot.forEach(childSnapshot => {
                        historyData.push(childSnapshot.val());
                    });
                    calculateMetrics(today, currentMonth);
                });
        }
        
        function updateDocksStatus() {
            docks = docks.map(dock => {
                const operation = operations.find(op => op.dock == dock.number && 
                    ['loading', 'binding', 'paused', 'awaiting_binding'].includes(op.status));
                
                if (operation) {
                    return {
                        ...dock,
                        status: 'busy',
                        operation: operation
                    };
                } else {
                    return {
                        ...dock,
                        status: 'free',
                        operation: null
                    };
                }
            });
            
            renderDocks();
        }
        
        function renderDocks() {
            const docksContainer = document.getElementById('docksContainer');
            docksContainer.innerHTML = '';
            
            docks.forEach(dock => {
                const dockCard = document.createElement('div');
                dockCard.className = 'dock-card';
                
                if (dock.status === 'busy') {
                    const elapsedTime = calculateElapsedTime(dock.operation);
                    const progressPercentage = Math.min((elapsedTime / TIME_LIMIT) * 100, 100);
                    const timeRemaining = TIME_LIMIT - elapsedTime;
                    
                    let progressClass = 'dock-progress-normal';
                    let timeRemainingClass = 'normal';
                    
                    if (progressPercentage > 70) {
                        progressClass = 'dock-progress-warning';
                        timeRemainingClass = 'warning';
                    }
                    if (progressPercentage > 90) {
                        progressClass = 'dock-progress-danger';
                        timeRemainingClass = 'danger';
                    }
                    if (timeRemaining <= 0) {
                        timeRemainingClass = 'danger';
                    }
                    
                    // Formatação do tempo
                    const formattedElapsed = formatMinutesToTime(elapsedTime);
                    const formattedRemaining = formatMinutesToTime(Math.max(timeRemaining, 0));
                    
                    // Lista de colaboradores
                    let workersList = '';
                    if (dock.operation.binders) {
                        workersList = Object.values(dock.operation.binders)
                            .map(name => `<span class="dock-worker">${name}</span>`)
                            .join('');
                    }
                    
                    dockCard.innerHTML = `
                        <div class="dock-header">
                            <div class="dock-number">Doca ${dock.number}</div>
                            <div class="dock-status busy">Ocupada</div>
                        </div>
                        
                        <div class="dock-progress">
                            <div class="dock-progress-bar ${progressClass}" style="width: ${progressPercentage}%"></div>
                        </div>
                        
                        <div class="dock-info">
                            <div class="dock-info-row">
                                <span class="dock-info-label">DT:</span>
                                <span class="dock-info-value">${dock.operation.dtNumber}</span>
                            </div>
                            <div class="dock-info-row">
                                <span class="dock-info-label">Início:</span>
                                <span class="dock-info-value">${formatTimestamp(dock.operation.startTime)}</span>
                            </div>
                            <div class="dock-info-row">
                                <span class="dock-info-label">Tempo decorrido:</span>
                                <span class="dock-info-value">${formattedElapsed}</span>
                            </div>
                            <div class="dock-info-row">
                                <span class="dock-info-label">Tempo restante:</span>
                                <span class="dock-info-value time-remaining ${timeRemainingClass}">${formattedRemaining}</span>
                            </div>
                        </div>
                        
                        <div class="dock-workers">
                            <div class="dock-workers-title">Colaboradores:</div>
                            ${workersList || '<span class="dock-worker">Nenhum amarrador vinculado</span>'}
                        </div>
                    `;
                } else {
                    dockCard.innerHTML = `
                        <div class="dock-header">
                            <div class="dock-number">Doca ${dock.number}</div>
                            <div class="dock-status free">Livre</div>
                        </div>
                        
                        <div class="dock-progress">
                            <div class="dock-progress-bar" style="width: 0%"></div>
                        </div>
                        
                        <div class="dock-info">
                            <div class="dock-info-row">
                                <span class="dock-info-label">Status:</span>
                                <span class="dock-info-value">Disponível para carregamento</span>
                            </div>
                        </div>
                    `;
                }
                
                docksContainer.appendChild(dockCard);
            });
        }
        
        function calculateMetrics(today, currentMonth) {
            // Filtra dados do dia atual
            const todayData = historyData.filter(item => {
                const itemDate = new Date(item.completedAt).toISOString().split('T')[0];
                return itemDate === today;
            });
            
            // Filtra dados do mês atual
            const monthData = historyData.filter(item => {
                const itemMonth = new Date(item.completedAt).toISOString().substring(0, 7);
                return itemMonth === currentMonth;
            });
            
            // Calcula métricas diárias
            const dailyTrucks = todayData.length;
            const dailyTons = todayData.reduce((sum, item) => sum + (item.tonnage || 0), 0);
            const dailyAvgTime = todayData.length > 0 ? 
                todayData.reduce((sum, item) => sum + calculateOperationTime(item), 0) / todayData.length : 0;
            const dailyAvgMix = todayData.length > 0 ? 
                todayData.reduce((sum, item) => sum + (item.mixCount || 1), 0) / todayData.length : 0;
            
            // Calcula métricas mensais
            const monthlyTrucks = monthData.length;
            const monthlyTons = monthData.reduce((sum, item) => sum + (item.tonnage || 0), 0);
            const monthlyAvgTime = monthData.length > 0 ? 
                monthData.reduce((sum, item) => sum + calculateOperationTime(item), 0) / monthData.length : 0;
            const monthlyAvgMix = monthData.length > 0 ? 
                monthData.reduce((sum, item) => sum + (item.mixCount || 1), 0) / monthData.length : 0;
            
            // Atualiza a UI com as métricas
            updateMetricsUI(
                dailyTrucks, dailyTons, dailyAvgTime, dailyAvgMix,
                monthlyTrucks, monthlyTons, monthlyAvgTime, monthlyAvgMix
            );
        }
        
        function updateMetricsUI(
            dailyTrucks, dailyTons, dailyAvgTime, dailyAvgMix,
            monthlyTrucks, monthlyTons, monthlyAvgTime, monthlyAvgMix
        ) {
            // Diário
            document.getElementById('dailyTrucks').textContent = dailyTrucks;
            document.getElementById('dailyTons').textContent = dailyTons.toFixed(1);
            document.getElementById('dailyAvgTime').textContent = formatMinutesToTime(dailyAvgTime);
            document.getElementById('dailyAvgMix').textContent = dailyAvgMix.toFixed(1);
            
            // Comparativos diários
            const dailyTrucksDiff = ((dailyTrucks / DAILY_TARGET_TRUCKS) * 100 - 100).toFixed(1);
            const dailyTonsDiff = ((dailyTons / DAILY_TARGET_TONS) * 100 - 100).toFixed(1);
            const dailyTimeDiff = (100 - (dailyAvgTime / TIME_LIMIT) * 100).toFixed(1);
            
            document.getElementById('dailyTrucksComparison').textContent = `${Math.abs(dailyTrucksDiff)}% ${dailyTrucksDiff >= 0 ? 'acima' : 'abaixo'} da meta`;
            document.getElementById('dailyTonsComparison').textContent = `${Math.abs(dailyTonsDiff)}% ${dailyTonsDiff >= 0 ? 'acima' : 'abaixo'} da meta`;
            document.getElementById('dailyTimeComparison').textContent = `${Math.abs(dailyTimeDiff)}% ${dailyTimeDiff >= 0 ? 'abaixo' : 'acima'} do limite`;
            
            // Mensal
            document.getElementById('monthlyTrucks').textContent = monthlyTrucks;
            document.getElementById('monthlyTons').textContent = monthlyTons.toFixed(1);
            document.getElementById('monthlyAvgTime').textContent = formatMinutesToTime(monthlyAvgTime);
            document.getElementById('monthlyAvgMix').textContent = monthlyAvgMix.toFixed(1);
            
            // Comparativos mensais
            const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
            const daysPassed = new Date().getDate();
            const monthlyTargetTrucksNow = (MONTHLY_TARGET_TRUCKS / daysInMonth) * daysPassed;
            const monthlyTargetTonsNow = (MONTHLY_TARGET_TONS / daysInMonth) * daysPassed;
            
            const monthlyTrucksDiff = ((monthlyTrucks / monthlyTargetTrucksNow) * 100 - 100).toFixed(1);
            const monthlyTonsDiff = ((monthlyTons / monthlyTargetTonsNow) * 100 - 100).toFixed(1);
            const monthlyTimeDiff = (100 - (monthlyAvgTime / TIME_LIMIT) * 100).toFixed(1);
            
            document.getElementById('monthlyTrucksComparison').textContent = `${Math.abs(monthlyTrucksDiff)}% ${monthlyTrucksDiff >= 0 ? 'acima' : 'abaixo'} da meta`;
            document.getElementById('monthlyTonsComparison').textContent = `${Math.abs(monthlyTonsDiff)}% ${monthlyTonsDiff >= 0 ? 'acima' : 'abaixo'} da meta`;
            document.getElementById('monthlyTimeComparison').textContent = `${Math.abs(monthlyTimeDiff)}% ${monthlyTimeDiff >= 0 ? 'abaixo' : 'acima'} do limite`;
            
            // Atualiza classes para indicar positivo/negativo
            updateComparisonClass('dailyTrucksComparison', dailyTrucksDiff);
            updateComparisonClass('dailyTonsComparison', dailyTonsDiff);
            updateComparisonClass('monthlyTrucksComparison', monthlyTrucksDiff);
            updateComparisonClass('monthlyTonsComparison', monthlyTonsDiff);
        }
        
        function updateComparisonClass(elementId, difference) {
            const element = document.getElementById(elementId);
            element.className = `metric-comparison ${difference >= 0 ? 'positive' : 'negative'}`;
        }
        
        function calculateElapsedTime(operation) {
            if (!operation.startTime) return 0;
            
            const now = Date.now();
            const start = operation.startTime;
            const end = operation.status === 'completed' ? 
                (operation.bindingEndTime || operation.loadingEndTime || now) : now;
            
            let pausedTime = 0;
            if (operation.pauses) {
                Object.values(operation.pauses).forEach(p => {
                    const pauseStart = p.start || 0;
                    const pauseEnd = p.end || (operation.status === 'paused' ? now : p.start || 0);
                    pausedTime += pauseEnd - pauseStart;
                });
            }
            
            return Math.floor((end - start - pausedTime) / (1000 * 60)); // Retorna em minutos
        }
        
        function calculateOperationTime(operation) {
            if (!operation.startTime || !operation.bindingEndTime) return 0;
            return (operation.bindingEndTime - operation.startTime) / (1000 * 60); // Retorna em minutos
        }
        
        function formatMinutesToTime(minutes) {
            const hrs = Math.floor(minutes / 60);
            const mins = Math.floor(minutes % 60);
            return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        }
        
        function formatTimestamp(timestamp) {
            if (!timestamp) return '--:--';
            const date = new Date(timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        // Atualiza os dados a cada minuto
        setInterval(() => {
            updateDocksStatus();
        }, 60000);