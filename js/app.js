// Configuração do Firebase (substitua com suas credenciais)
const firebaseConfig = {
  apiKey: "AIzaSyAROtfqwCp2i2DVqqQDge6QueiNbmlPzuI",
  authDomain: "produtividade-pa.firebaseapp.com",
  projectId: "produtividade-pa",
  storageBucket: "produtividade-pa.firebasestorage.app",
  messagingSenderId: "455228218660",
  appId: "1:455228218660:web:f48ae8a0a03ea1062ca7b1",
  measurementId: "G-3ER0DB83JV"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// Elementos da página
const loginCard = document.getElementById('loginCard');
const registerCard = document.getElementById('registerCard');
const forgotPasswordCard = document.getElementById('forgotPasswordCard');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');

const showRegister = document.getElementById('showRegister');
const showLogin = document.getElementById('showLogin');
const showForgotPassword = document.getElementById('showForgotPassword');
const showLoginFromForgot = document.getElementById('showLoginFromForgot');
const googleLogin = document.getElementById('googleLogin');

const messageDiv = document.getElementById('authMessage');

// Toggle password visibility
document.querySelectorAll('.toggle-password').forEach(toggle => {
    toggle.addEventListener('click', function() {
        const targetId = this.getAttribute('data-target');
        const input = document.getElementById(targetId);
        
        if (input.type === 'password') {
            input.type = 'text';
            this.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            this.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });
});

// Alternar entre cards
showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginCard.classList.add('hidden');
    registerCard.classList.remove('hidden');
    hideMessage();
});

showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerCard.classList.add('hidden');
    loginCard.classList.remove('hidden');
    hideMessage();
});

showForgotPassword.addEventListener('click', (e) => {
    e.preventDefault();
    loginCard.classList.add('hidden');
    forgotPasswordCard.classList.remove('hidden');
    hideMessage();
});

showLoginFromForgot.addEventListener('click', (e) => {
    e.preventDefault();
    forgotPasswordCard.classList.add('hidden');
    loginCard.classList.remove('hidden');
    hideMessage();
});

// Login com e-mail e senha
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    showMessage('Autenticando...', 'info');
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            showMessage('Login realizado com sucesso! Redirecionando...', 'success');
            setTimeout(() => window.location.href = './src/dashboard.html', 1500);
        })
        .catch(handleAuthError);
});

// Registro de nova conta
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    if (password !== confirmPassword) {
        showMessage('As senhas não coincidem', 'error');
        return;
    }
    
    showMessage('Criando sua conta...', 'info');
    
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Atualizar nome do usuário
            return userCredential.user.updateProfile({
                displayName: name
            });
        })
        .then(() => {
            showMessage('Conta criada com sucesso! Redirecionando...', 'success');
            setTimeout(() => window.location.href = './src/dashboard.html', 1500);
        })
        .catch(handleAuthError);
});

// Login com Google
googleLogin.addEventListener('click', (e) => {
    e.preventDefault();
    
    showMessage('Conectando com Google...', 'info');
    
    auth.signInWithPopup(provider)
        .then((result) => {
            showMessage('Login com Google realizado com sucesso! Redirecionando...', 'success');
            setTimeout(() => window.location.href = './src/dashboard.html', 1500);
        })
        .catch(handleAuthError);
});

// Recuperação de senha
forgotPasswordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('forgotEmail').value;
    
    showMessage('Enviando e-mail de recuperação...', 'info');
    
    auth.sendPasswordResetEmail(email)
        .then(() => {
            showMessage('E-mail de recuperação enviado. Verifique sua caixa de entrada.', 'success');
            forgotPasswordCard.classList.add('hidden');
            loginCard.classList.remove('hidden');
        })
        .catch(handleAuthError);
});

// auto LOGIN DESATIVADO
// auth.onAuthStateChanged((user) => {
//     if (user) {
//         // Usuário já está logado, redireciona para dashboard
//         window.location.href = './src/dashboard.html';
//     }
// });

// Funções auxiliares
function showMessage(message, type) {
    messageDiv.textContent = message;
    messageDiv.className = 'message';
    messageDiv.classList.add(type);
    messageDiv.style.display = 'block';
    
    if (type !== 'info') {
        setTimeout(hideMessage, 5000);
    }
}

function hideMessage() {
    messageDiv.style.display = 'none';
}

function handleAuthError(error) {
    let errorMessage = error.message;
    
    const errorMap = {
        'auth/user-not-found': 'Usuário não encontrado.',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/user-disabled': 'Esta conta foi desativada.',
        'auth/email-already-in-use': 'Este e-mail já está em uso.',
        'auth/weak-password': 'A senha deve ter no mínimo 6 caracteres.',
        'auth/operation-not-allowed': 'Operação não permitida.',
        'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
        'auth/popup-closed-by-user': 'O popup de autenticação foi fechado.',
        'auth/account-exists-with-different-credential': 'Este e-mail já está associado a outra conta.'
    };
    
    if (errorMap[error.code]) {
        errorMessage = errorMap[error.code];
    }
    
    showMessage(errorMessage, 'error');
    console.error(error);
}