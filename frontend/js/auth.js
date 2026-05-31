document.addEventListener("DOMContentLoaded", function() {
    // Leer directo del almacenamiento real para evitar falsos positivos de caché
    const tokenReal = localStorage.getItem('token');
    const userReal = JSON.parse(localStorage.getItem('user'));

    if (tokenReal && userReal) {
        // Doble check: Actualizar AppState por si acaso
        AppState.token = tokenReal;
        AppState.user = userReal;
        
        redirectByUserRole(userReal.rol);
    } else {
        // Si no hay nada real, nos aseguramos de limpiar AppState
        AppState.token = null;
        AppState.user = null;
        initAuthEventListeners();
    }
});

let isRegisterMode = false;

function initAuthEventListeners() {
    const linkToggle = document.getElementById('linkSwitchRegister');
    const authTitle = document.getElementById('authTitle');
    const groupNombre = document.getElementById('groupNombre');
    const btnAuthSubmit = document.getElementById('btnAuthSubmit');
    const authToggleArea = document.getElementById('authToggleArea');
    const formAuth = document.getElementById('formAuth');

    if (!formAuth) return;

    // Conmutador entre Login y Registro
    if (linkToggle) {
        linkToggle.addEventListener('click', (e) => {
            e.preventDefault();
            isRegisterMode = !isRegisterMode;
            if (isRegisterMode) {
                authTitle.innerHTML = `<i class="ti ti-user-plus"></i> Registro de Vecino`;
                groupNombre.classList.remove('hidden');
                btnAuthSubmit.innerHTML = `<i class="ti ti-user-check"></i> Registrarme`;
                authToggleArea.innerHTML = `¿Ya tienes cuenta? <a href="#" id="linkSwitchRegister" class="text-blue-700 font-semibold hover:underline">Inicia sesión aquí</a>`;
            } else {
                authTitle.innerHTML = `<i class="ti ti-lock"></i> Ingresar al Sistema`;
                groupNombre.classList.add('hidden');
                btnAuthSubmit.innerHTML = `<i class="ti ti-login"></i> Iniciar Sesión`;
                authToggleArea.innerHTML = `¿Eres nuevo vecino? <a href="#" id="linkSwitchRegister" class="text-blue-700 font-semibold hover:underline">Regístrate aquí</a>`;
            }
            // Re-vincular evento ya que alteramos el innerHTML
            initAuthEventListeners();
        });
    }

    // Envío del Formulario
    formAuth.addEventListener('submit', async (e) => {
        e.preventDefault();
        const correo = document.getElementById('authCorreo').value;
        const password = document.getElementById('authPassword').value;
        const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';
        
        let bodyData = { correo, password };
        if (isRegisterMode) bodyData.nombre = document.getElementById('authNombre').value;

        try {
            const response = await fetch(API_BASE + endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData)
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Error en la operación.');

            if (isRegisterMode) {
                displayAlert('Registro completado. Por favor, inicie sesión.');
                isRegisterMode = false;
                linkToggle.click(); 
            } else {
                localStorage.setItem('token', result.data.token);
                localStorage.setItem('user', JSON.stringify(result.data.user));
                AppState.token = result.data.token;
                AppState.user = result.data.user;
                
                displayAlert('Autenticación correcta. Redirigiendo...');
                setTimeout(() => {
                    redirectByUserRole(result.data.user.rol);
                }, 1000);
            }
            formAuth.reset();
        } catch (err) {
            displayAlert(err.message, 'error');
        }
    });
}

function redirectByUserRole(rol) {
    if (rol === 'Administrador') {
        window.location.href = 'admin.html';
    } else {
        window.location.href = 'ciudadano.html';
    }
}