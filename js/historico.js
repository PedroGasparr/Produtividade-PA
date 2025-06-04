const db = firebase.database();
        
        // Elementos da página
        const elements = {
            authSection: document.querySelector('.auth-section'),
            accessPassword: document.getElementById('accessPassword'),
            authBtn: document.getElementById('authBtn'),
            authError: document.getElementById('authError'),
            
            filters: document.querySelector('.filters'),
            monthFilter: document.getElementById('monthFilter'),
            yearFilter: document.getElementById('yearFilter'),
            employeeFilter: document.getElementById('employeeFilter'),
            applyFilters: document.getElementById('applyFilters'),
            resetFilters: document.getElementById('resetFilters'),
            
            stats: document.querySelector('.stats'),
            totalOperations: document.getElementById('totalOperations'),
            avgLoadingTime: document.getElementById('avgLoadingTime'),
            avgFreeTime: document.getElementById('avgFreeTime'),
            avgBindingTime: document.getElementById('avgBindingTime'),
            completedOperations: document.getElementById('completedOperations'),
            totalEarnings: document.getElementById('totalEarnings'),
            
            ranking: document.querySelector('.ranking'),
            rankingLoading: document.getElementById('rankingLoading'),
            rankingTable: document.getElementById('rankingTable'),
            rankingBody: document.getElementById('rankingBody'),
            
            history: document.querySelector('.history'),
            historyLoading: document.getElementById('historyLoading'),
            historyTable: document.getElementById('historyTable'),
            historyBody: document.getElementById('historyBody'),
            
            logoutBtn: document.getElementById('logoutBtn')
        };
        
        // Variáveis globais
        let authenticated = false;
        let operationsHistory = [];
        let currentFilters = {
            month: 'all',
            year: new Date().getFullYear().toString(),
            employee: ''
        };
        
        // Constantes
        const ACCESS_PASSWORD = "senha123";
        const VALOR_POR_CARREGAMENTO = 16.66;
        
        // Event Listeners
        elements.authBtn.addEventListener('click', authenticate);
        elements.applyFilters.addEventListener('click', applyFilters);
        elements.resetFilters.addEventListener('click', resetFilters);
        elements.logoutBtn.addEventListener('click', logout);
        
        // Função de autenticação
        function authenticate() {
            const password = elements.accessPassword.value.trim();
            
            if (password === ACCESS_PASSWORD) {
                authenticated = true;
                elements.authSection.style.display = 'none';
                elements.filters.style.display = 'block';
                elements.stats.style.display = 'grid';
                elements.ranking.style.display = 'block';
                elements.history.style.display = 'block';
                
                // Carrega os dados
                loadHistoryData();
            } else {
                elements.authError.textContent = "Senha incorreta. Tente novamente.";
                elements.authError.style.display = 'block';
            }
        }
        
        // Carrega os dados do histórico
        function loadHistoryData() {
            elements.rankingTable.style.display = 'none';
            elements.historyTable.style.display = 'none';
            elements.rankingLoading.style.display = 'block';
            elements.historyLoading.style.display = 'block';
            
            db.ref('operations').once('value')
                .then(snapshot => {
                    operationsHistory = [];
                    snapshot.forEach(childSnapshot => {
                        const operation = childSnapshot.val();
                        operation.id = childSnapshot.key;
                        operationsHistory.push(operation);
                    });
                    
                    // Processa os dados
                    processHistoryData();
                })
                .catch(error => {
                    console.error("Erro ao carregar histórico:", error);
                    elements.rankingLoading.textContent = "Erro ao carregar dados.";
                    elements.historyLoading.textContent = "Erro ao carregar dados.";
                });
        }
        
        // Aplica os filtros
        function applyFilters() {
            currentFilters = {
                month: elements.monthFilter.value,
                year: elements.yearFilter.value,
                employee: elements.employeeFilter.value.trim()
            };
            
            processHistoryData();
        }
        
        // Reseta os filtros
        function resetFilters() {
            elements.monthFilter.value = 'all';
            elements.yearFilter.value = new Date().getFullYear().toString();
            elements.employeeFilter.value = '';
            
            applyFilters();
        }
        
        // Processa os dados do histórico e atualiza a UI
        function processHistoryData() {
            // Filtra os dados
            let filteredData = operationsHistory.filter(operation => {
                // Usa confirmedAt como data de referência (ou bindingEndTime se não existir)
                const opTimestamp = operation.confirmedAt || operation.bindingEndTime || operation.loadingEndTime;
                const opDate = new Date(opTimestamp);
                const opMonth = opDate.getMonth() + 1; // getMonth() retorna 0-11
                const opYear = opDate.getFullYear();
                
                // Aplica filtro de mês
                if (currentFilters.month !== 'all' && opMonth.toString() !== currentFilters.month) {
                    return false;
                }
                
                // Aplica filtro de ano
                if (opYear.toString() !== currentFilters.year) {
                    return false;
                }
                
                // Aplica filtro de funcionário
                if (currentFilters.employee) {
                    const employeeName = currentFilters.employee.toLowerCase();
                    const operatorMatch = operation.operatorName && operation.operatorName.toLowerCase().includes(employeeName);
                    const bindersMatch = operation.binders && Object.values(operation.binders).some(b => 
                        typeof b === 'string' && b.toLowerCase().includes(employeeName)
                    );
                    
                    if (!operatorMatch && !bindersMatch) {
                        return false;
                    }
                }
                
                return true;
            });
            
            // Ordena por data (mais recente primeiro)
            filteredData.sort((a, b) => {
                const timeA = a.confirmedAt || a.bindingEndTime || a.loadingEndTime || 0;
                const timeB = b.confirmedAt || b.bindingEndTime || b.loadingEndTime || 0;
                return timeB - timeA;
            });
            
            // Calcula estatísticas
            calculateStatistics(filteredData);
            
            // Gera ranking
            generateRanking(filteredData);
            
            // Exibe histórico
            displayHistory(filteredData);
            
            // Esconde loadings e mostra tabelas
            elements.rankingLoading.style.display = 'none';
            elements.historyLoading.style.display = 'none';
            elements.rankingTable.style.display = 'table';
            elements.historyTable.style.display = 'table';
        }
        
        // Calcula as estatísticas
        function calculateStatistics(data) {
            const totalOperations = data.length;
            elements.totalOperations.textContent = totalOperations;
            
            // Conta operações concluídas
            const completedOps = data.filter(op => op.status === 'completed').length;
            elements.completedOperations.textContent = completedOps;
            
            // Calcula valor total ganho
            let totalEarnings = 0;
            data.forEach(op => {
                if (op.status === 'completed') {
                    totalEarnings += VALOR_POR_CARREGAMENTO;
                }
            });
            elements.totalEarnings.textContent = `R$ ${totalEarnings.toFixed(2).replace('.', ',')}`;
            
            if (totalOperations === 0) {
                elements.avgLoadingTime.textContent = "00:00:00";
                elements.avgFreeTime.textContent = "00:00:00";
                elements.avgBindingTime.textContent = "00:00:00";
                return;
            }
            
            // Calcula tempos médios
            let totalLoadingTime = 0;
            let totalFreeTime = 0;
            let totalBindingTime = 0;
            let validBindingOps = 0;
            
            data.forEach(op => {
                if (op.startTime && op.loadingEndTime) {
                    const loadingTime = (op.loadingEndTime - op.startTime) / 1000;
                    totalLoadingTime += loadingTime;
                    
                    if (op.bindingStartTime) {
                        const freeTime = (op.bindingStartTime - op.loadingEndTime) / 1000;
                        totalFreeTime += freeTime;
                    }
                }
                
                if (op.bindingStartTime && op.bindingEndTime) {
                    const bindingTime = (op.bindingEndTime - op.bindingStartTime) / 1000;
                    totalBindingTime += bindingTime;
                    validBindingOps++;
                }
            });
            
            const avgLoading = totalLoadingTime / totalOperations;
            const avgFree = totalFreeTime / totalOperations;
            const avgBinding = validBindingOps > 0 ? totalBindingTime / validBindingOps : 0;
            
            elements.avgLoadingTime.textContent = formatTime(avgLoading);
            elements.avgFreeTime.textContent = formatTime(avgFree);
            elements.avgBindingTime.textContent = formatTime(avgBinding);
        }
        
        // Gera o ranking de funcionários
        function generateRanking(data) {
            const employees = {};
            
            // Processa cada operação para contabilizar os funcionários
            data.forEach(op => {
                if (op.status !== 'completed') return;
                
                // Calcula quantas pessoas trabalharam na operação
                const totalPeople = 1 + (op.binders ? Object.keys(op.binders).length : 0);
                const valorPorPessoa = VALOR_POR_CARREGAMENTO / totalPeople;
                
                // Operador principal
                if (op.operatorName) {
                    const operatorName = op.operatorName;
                    if (!employees[operatorName]) {
                        employees[operatorName] = {
                            name: operatorName,
                            operations: 0,
                            totalTime: 0,
                            role: 'Operador',
                            totalEarnings: 0
                        };
                    }
                    
                    employees[operatorName].operations += 1;
                    employees[operatorName].totalEarnings += valorPorPessoa;
                    if (op.startTime && op.loadingEndTime) {
                        employees[operatorName].totalTime += (op.loadingEndTime - op.startTime) / 1000;
                    }
                }
                
                // Amarradores
                if (op.binders) {
                    Object.values(op.binders).forEach(binder => {
                        if (typeof binder !== 'string') return;
                        
                        if (!employees[binder]) {
                            employees[binder] = {
                                name: binder,
                                operations: 0,
                                totalTime: 0,
                                role: 'Amarrador',
                                totalEarnings: 0
                            };
                        }
                        
                        employees[binder].operations += 1;
                        employees[binder].totalEarnings += valorPorPessoa;
                        if (op.bindingStartTime && op.bindingEndTime) {
                            employees[binder].totalTime += (op.bindingEndTime - op.bindingStartTime) / 1000;
                        }
                    });
                }
            });
            
            // Converte para array e ordena
            const ranking = Object.values(employees).map(emp => ({
                ...emp,
                avgTime: emp.operations > 0 ? emp.totalTime / emp.operations : 0
            }));
            
            ranking.sort((a, b) => b.operations - a.operations || a.avgTime - b.avgTime);
            
            // Exibe o ranking
            elements.rankingBody.innerHTML = '';
            
            ranking.forEach((emp, index) => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${emp.name}</td>
                    <td>${emp.operations}</td>
                    <td>${formatTime(emp.avgTime)}</td>
                    <td>${emp.role}</td>
                    <td>R$ ${emp.totalEarnings.toFixed(2).replace('.', ',')}</td>
                `;
                
                elements.rankingBody.appendChild(row);
            });
        }
        
        // Exibe o histórico completo
        function displayHistory(data) {
            elements.historyBody.innerHTML = '';
            
            data.forEach(op => {
                const row = document.createElement('tr');
                
                // Determina o timestamp mais relevante para exibição
                const displayTime = op.confirmedAt || op.bindingEndTime || op.loadingEndTime || op.startTime;
                const opDate = displayTime ? new Date(displayTime) : null;
                
                const formattedDate = opDate ? opDate.toLocaleDateString('pt-BR') : 'N/A';
                const formattedTime = opDate ? opDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
                
                // Calcula tempo total (carregamento + enlonamento)
                let totalTime = 0;
                if (op.startTime && op.loadingEndTime) {
                    totalTime = (op.loadingEndTime - op.startTime) / 1000;
                    if (op.bindingEndTime) {
                        totalTime = (op.bindingEndTime - op.startTime) / 1000;
                    }
                }
                
                // Formata amarradores
                let bindersList = 'Nenhum';
                if (op.binders && Object.keys(op.binders).length > 0) {
                    bindersList = Object.values(op.binders).filter(b => typeof b === 'string').join(', ');
                }
                
                // Formata status
                let statusBadge = '';
                if (op.status === 'completed') {
                    statusBadge = '<span class="badge badge-success">Concluído</span>';
                } else {
                    statusBadge = '<span class="badge badge-primary">Em andamento</span>';
                }
                
                // Calcula valor por pessoa
                let valuePerPerson = 'N/A';
                if (op.status === 'completed') {
                    const totalPeople = 1 + (op.binders ? Object.keys(op.binders).length : 0);
                    const valor = VALOR_POR_CARREGAMENTO / totalPeople;
                    valuePerPerson = `R$ ${valor.toFixed(2).replace('.', ',')}`;
                } else {
                    valuePerPerson = '<span class="badge badge-warning">Pendente</span>';
                }
                
                row.innerHTML = `
                    <td>${formattedDate} ${formattedTime}</td>
                    <td>${op.dtNumber || 'N/A'}</td>
                    <td>${op.operatorName || 'N/A'}</td>
                    <td>${bindersList}</td>
                    <td>${op.dock || 'N/A'}</td>
                    <td>${formatTime(totalTime)}</td>
                    <td>${valuePerPerson}</td>
                    <td>${statusBadge}</td>
                `;
                
                elements.historyBody.appendChild(row);
            });
        }
        
        // Formata tempo (segundos para HH:MM:SS)
        function formatTime(seconds) {
            if (isNaN(seconds)) return "00:00:00";
            
            const hrs = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        // Logout
        function logout() {
            authenticated = false;
            elements.authSection.style.display = 'block';
            elements.filters.style.display = 'none';
            elements.stats.style.display = 'none';
            elements.ranking.style.display = 'none';
            elements.history.style.display = 'none';
            elements.accessPassword.value = '';
        }
        
        // Inicializa o ano atual no filtro
        function initYearFilter() {
            const currentYear = new Date().getFullYear();
            elements.yearFilter.value = currentYear;
            currentFilters.year = currentYear.toString();
        }
        
        // Inicializa a página
        initYearFilter();