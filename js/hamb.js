document.addEventListener('DOMContentLoaded', function() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.createElement('div');
    overlay.className = 'mobile-overlay';
    document.body.appendChild(overlay);

    // Abrir/fechar menu
    hamburgerBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // Impede que o clique propague
        sidebar.classList.toggle('active');
    });

    // Fechar menu ao clicar no overlay
    overlay.addEventListener('click', function() {
        sidebar.classList.remove('active');
    });

    // Fechar menu ao clicar em qualquer link do menu
    document.querySelectorAll('.sidebar-menu a').forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 992) {
                sidebar.classList.remove('active');
            }
        });
    });

    // Fechar menu ao clicar fora (em telas pequenas)
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 992 && 
            !sidebar.contains(e.target) && 
            e.target !== hamburgerBtn) {
            sidebar.classList.remove('active');
        }
    });
});