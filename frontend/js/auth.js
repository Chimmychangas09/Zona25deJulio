/**
 * Inicializa el ciclo de vida del script al completarse la carga del árbol DOM, 
 * actuando como un guardián automático de rutas y persistencia de sesión.
 * * - **Evita Falsos Positivos de Caché:** Consulta directamente las llaves físicas en `localStorage` 
 * para garantizar la lectura de credenciales vigentes en tiempo real.
 * - **Sincronización Bifásica del Estado:** * - **Si existen credenciales:** Actualiza de forma preventiva el estado global en memoria (`AppState`) 
 * y delega el control al enrutador elástico (`redirectByUserRole`) para desviar al usuario según su rol administrativo o ciudadano.
 * - **Si el almacenamiento está vacío:** Sanea y purga el objeto `AppState` a valores nulos y activa de forma 
 * inmediata los escuchadores de eventos para los formularios de acceso e inicio de sesión (`initAuthEventListeners`).
 */
document.addEventListener("DOMContentLoaded", function() {

    const tokenReal = localStorage.getItem('token');
    const userReal = JSON.parse(localStorage.getItem('user'));

    if (tokenReal && userReal) {

        AppState.token = tokenReal;
        AppState.user = userReal;
        
        redirectByUserRole(userReal.rol);
    } else {

        AppState.token = null;
        AppState.user = null;
        initAuthEventListeners();
    }
});

/**
 * Bandera de control booleana (Flag) que determina el modo activo de la interfaz de autenticación.
 * * - `true`: La vista se reestructura para exponer el formulario de registro de nuevos usuarios.
 * - `false`: La vista por defecto permanece configurada para el inicio de sesión ordinario (Login).
 */
let isRegisterMode = false;

/**
 * Inicializa y gestiona los escuchadores de eventos para el módulo unificado de autenticación (Login y Registro).
 * * - **Conmutador de Interfaz (Toggle):** Configura un evento de clic para alternar el estado visual de la pantalla entre 
 * acceso y registro de usuarios, modificando dinámicamente títulos, iconos, campos visibles y etiquetas de botón mediante `isRegisterMode`.
 * - **Control de Recursividad:** Invoca cíclicamente la misma función al mutar el `innerHTML` del contenedor de intercambio 
 * para garantizar el re-vinculado de los escuchadores sobre los nuevos nodos inyectados en el DOM.
 * - **Procesamiento asíncronico de Formularios:** Captura el evento `submit` para interceptar el envío, estructurar el cuerpo 
 * de datos (`bodyData`) adaptándolo de forma condicional al modo activo, y despachar la petición POST hacia la API correspondiente.
 * - **Gestión de Respuestas de Red:** * - *En Registro:* Notifica el éxito de la operación y simula un clic programático para retornar al usuario al modo de acceso.
 * - *En Login:* Persiste de forma segura las credenciales y el perfil del usuario en `localStorage`, actualiza el estado global 
 * `AppState` y difiere la redirección adaptativa mediante un temporizador para permitir la lectura de las alertas informativas.
 * - **Manejo de Excepciones:** Intercepta respuestas erróneas del servidor o fallos de red, canalizándolos hacia el componente global de alertas.
 */
function initAuthEventListeners() {
    const linkToggle = document.getElementById('linkSwitchRegister');
    const authTitle = document.getElementById('authTitle');
    const groupNombre = document.getElementById('groupNombre');
    const btnAuthSubmit = document.getElementById('btnAuthSubmit');
    const authToggleArea = document.getElementById('authToggleArea');
    const formAuth = document.getElementById('formAuth');

    if (!formAuth) return;

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

            initAuthEventListeners();
        });
    }


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

/**
 * Enruta de forma elástica la navegación de la aplicación redirigiendo al usuario
 * a su panel de control correspondiente en función de su rol de acceso verificado.
 * * - Evalúa si la cadena del rol de usuario equivale de manera estricta al privilegio 'Administrador'.
 * - **Derivación de Vistas:** Modifica la propiedad `window.location.href` para forzar la carga
 * del recurso web correspondiente: `admin.html` para el operador gubernamental/técnico, o
 * `ciudadano.html` para la interfaz de reporte vecinal y consulta ordinaria en cualquier otro caso.
 * * @param {string} rol - Etiqueta cualitativa o nivel de autorización del usuario (por ejemplo, 'Administrador' o 'Ciudadano').
 */
function redirectByUserRole(rol) {
    if (rol === 'Administrador') {
        window.location.href = 'admin.html';
    } else {
        window.location.href = 'ciudadano.html';
    }
}