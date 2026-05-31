// ==========================================
// 🌐 CONFIGURACIÓN GLOBAL Y ESTADO CACHÉ
// ==========================================
const API_BASE = 'http://localhost:8000/api'; 
// Asegúrate de que termine en /uploads/ para que concatene bien con el hash del archivo
const FILE_SERVER = 'http://localhost:8000/';

let AppState = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user')) || null
};

// ==========================================
// 📢 UTILIDADES DE INTERFAZ COMPARTIDAS
// ==========================================
function displayAlert(message, type = 'success') {
    const alertBox = document.getElementById('globalAlert');
    if (!alertBox) return;

    alertBox.className = `flex items-center gap-2 p-4 mb-4 text-sm rounded-lg border shadow-sm transition-all duration-300 ${
        type === 'success' 
        ? 'bg-green-50 border-green-200 text-green-800' 
        : 'bg-red-50 border-red-200 text-red-800'
    }`;
    alertBox.innerHTML = `<i class="ti ti-${type === 'success' ? 'circle-check' : 'alert-circle'} text-lg"></i> <span>${message}</span>`;
    alertBox.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => { alertBox.classList.add('hidden'); }, 6000);
}

function handleLogout() {
    // 1. Destruir almacenamiento local por completo
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.clear();

    // 2. Forzar limpieza del objeto en memoria viva
    AppState.token = null;
    AppState.user = null;

    // 3. Redirección forzada limpiando el historial para que no pueda volver atrás
    window.location.replace('index.html');
}

// Verificar protección de rutas básicas al cargar la utilidad
function checkAuth(roleRequired = null) {
    if (!AppState.token || !AppState.user) {
        window.location.replace('index.html'); // Usamos replace para borrar el historial de esa página
        return false;
    }
    if (roleRequired && AppState.user.rol !== roleRequired) {
        window.location.replace('index.html');
        return false;
    }
    return true;
}