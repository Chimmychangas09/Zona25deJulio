/**
 * Constantes de configuración global para las rutas de comunicación con el servidor.
 * * - `API_BASE`: Endpoint raíz para el consumo de los servicios RESTful (rutas y controladores backend).
 * - `FILE_SERVER`: Servidor de archivos estáticos para la recuperación y carga de archivos multimedia (imágenes/evidencias).
 */
const API_BASE = 'http://localhost:8000/api'; 
const FILE_SERVER = 'http://localhost:8000/';

/**
 * Objeto de estado global de la aplicación en el lado del cliente (State Management).
 * * - Recupera y mantiene en memoria la sesión activa del usuario de forma persistente.
 * - `token`: Cadena de autenticación (JWT o similar) extraída de `localStorage` para firmar peticiones HTTP.
 * - `user`: Objeto con los datos de perfil y rol del usuario, parseado de formato JSON a un objeto nativo de JavaScript.
 */
let AppState = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user')) || null
};

/**
 * Referencia global para la instancia del mapa interactivo (por ejemplo, Leaflet o Google Maps).
 * Se inicializa en `null` y se utiliza para controlar de forma centralizada la creación,
 * actualización de coordenadas y destrucción del componente del mapa en el DOM.
 */
let objetoMapa = null; 

/**
 * Despliega un componente de notificación (alerta) global en la parte superior de la interfaz de usuario.
 * * - Modifica dinámicamente las clases CSS del contenedor (`globalAlert`) aplicando estilos de éxito o error.
 * - Inyecta de forma dinámica el mensaje suministrado y un icono representativo basado en el tipo de alerta.
 * - Hace visible el elemento en el DOM y realiza un desplazamiento fluido (`smooth scroll`) de la ventana hacia el inicio.
 * - Configura un temporizador asíncrono para ocultar automáticamente la notificación tras transcurrir 6 segundos.
 * * @param {string} message - Texto descriptivo o notificación que se mostrará al usuario.
 * @param {string} [type='success'] - Criterio semántico de la alerta que determina el diseño visual ('success' o 'error').
 */
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

/**
 * Gestiona el proceso de cierre de sesión (Logout) de forma segura y destruye la sesión activa.
 * * - Elimina de forma explícita las claves de autenticación y datos de usuario en el `localStorage`, 
 * seguido de un vaciado preventivo total de los datos persistidos en el almacenamiento del navegador.
 * - Sanea y restablece a `null` las variables dinámicas de estado en memoria viva dentro del objeto global `AppState`.
 * - Redirige al usuario a la pantalla de acceso principal (`index.html`) utilizando un método de reemplazo 
 * de ubicación (`window.location.replace`), invalidando el historial de navegación para impedir el retorno 
 * de pantalla mediante los botones de retroceso del navegador.
 */
function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.clear();

    AppState.token = null;
    AppState.user = null;

    window.location.replace('index.html');
}

/**
 * Valida de forma estricta los privilegios de autenticación y autorizaciones de roles en el cliente.
 * * - Verifica la existencia del token de sesión y del objeto de usuario dentro del estado global (`AppState`).
 * - Evalúa si el rol asignado al usuario coincide con el privilegio obligatorio requerido por la vista actual (`roleRequired`).
 * - En caso de que falten credenciales o exista un conflicto de permisos, redirige de forma inmediata a la pantalla de acceso
 * (`index.html`) reemplazando el historial del navegador para prevenir accesos no autorizados mediante retroceso.
 * * @param {string|null} [roleRequired=null] - Nombre del rol o nivel de acceso requerido para validar la navegación (por ejemplo, 'Ciudadano').
 * @returns {boolean} Retorna `true` si el usuario cuenta con los permisos necesarios; de lo contrario, intercepta y retorna `false`.
 */
function checkAuth(roleRequired = null) {
    if (!AppState.token || !AppState.user) {
        window.location.replace('index.html');
        return false;
    }
    if (roleRequired && AppState.user.rol !== roleRequired) {
        window.location.replace('index.html');
        return false;
    }
    return true;
}
/**
 * Inicializa y gestiona la captura de coordenadas físicas mediante la API nativa de Geolocalización.
 * Mapea de forma dinámica las respuestas del hardware del dispositivo hacia componentes visuales del DOM.
 * * - Realiza una verificación preliminar de compatibilidad del hardware/navegador con la API de geolocalización.
 * - Activa un estado visual de carga intermedio y bloquea temporalmente el envío de formularios (`btnSubmit`).
 * - Consume el servicio de posicionamiento asíncrono (`getCurrentPosition`) configurando parámetros de alta precisión.
 * - **Callback de Éxito:** Almacena los valores de latitud y longitud en inputs ocultos del formulario, reestructura 
 * las clases CSS a un formato semántico positivo, calcula el margen de precisión métrica e instrumenta el botón de envío.
 * - **Callback de Error:** Intercepta excepciones físicas o de denegación de permisos de usuario, bloquea la acción de envío
 * y formatea dinámicamente un mensaje descriptivo para la subsanación del problema en el dispositivo del cliente.
 * * @param {object} config - Objeto de configuración que encapsula los identificadores (IDs) de los elementos HTML involucrados.
 * @param {string} config.boxId - ID del contenedor principal del estado de ubicación.
 * @param {string} config.titleId - ID del campo de texto destinado al encabezado del estado.
 * @param {string} config.coordsId - ID del contenedor que expondrá las coordenadas procesadas al usuario.
 * @param {string} config.btnSubmitId - ID del botón de formulario que se debe deshabilitar/habilitar según el flujo.
 * @param {string} config.latInputId - ID del input oculto destinado a almacenar el valor de la latitud.
 * @param {string} config.lngInputId - ID del input oculto destinado a almacenar el valor de la longitud.
 */
function capturarUbicacion(config) {
    const box = document.getElementById(config.boxId);
    const title = document.getElementById(config.titleId);
    const coordsSpan = document.getElementById(config.coordsId);
    const btnSubmit = document.getElementById(config.btnSubmitId);
    const inputLat = document.getElementById(config.latInputId);
    const inputLng = document.getElementById(config.lngInputId);

    if (!box) return;

    const baseClasses = 'rounded-lg p-3.5 mb-5 flex items-center gap-3 border transition-all duration-300';

    if (!navigator.geolocation) {

        box.className = `${baseClasses} bg-red-950/20 border-red-900/50 text-red-400`;
        if (title) {
            title.className = 'font-bold text-red-300 text-xs';
            title.innerText = 'Sensor Incompatible';
        }
        if (coordsSpan) {
            coordsSpan.className = 'text-slate-400 text-[11px] block';
            coordsSpan.innerText = 'Tu navegador no soporta la API de Geolocalización.';
        }
        return;
    }

    box.className = `${baseClasses} bg-amber-950/30 border-amber-900/50 text-amber-400`;
    if (title) {
        title.className = 'font-bold text-amber-300 text-xs';
        title.innerText = 'Adquiriendo Coordenadas GPS...';
    }
    if (coordsSpan) {
        coordsSpan.className = 'text-slate-400 text-[11px] block';
        coordsSpan.innerText = 'Buscando satélites de posicionamiento...';
    }
    if (btnSubmit) btnSubmit.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            if (inputLat) inputLat.value = lat;
            if (inputLng) inputLng.value = lng;

            box.className = `${baseClasses} bg-emerald-950/30 border-emerald-900/50 text-emerald-400`;
            if (title) {
                title.className = 'font-bold text-emerald-300 text-xs';
                title.innerText = 'Ubicación Satelital Fijada';
            }
            if (coordsSpan) {
                coordsSpan.className = 'text-slate-400 text-[11px] block';
                coordsSpan.innerText = `Lat: ${lat.toFixed(6)} | Lng: ${lng.toFixed(6)} (Precisión: ${position.coords.accuracy.toFixed(1)}m)`;
            }
            if (btnSubmit) btnSubmit.disabled = false;
        },
        (error) => {

            box.className = `${baseClasses} bg-red-950/20 border-red-900/50 text-red-400`;
            if (title) {
                title.className = 'font-bold text-red-300 text-xs';
                title.innerText = 'Fallo del Sensor GPS';
            }
            if (btnSubmit) btnSubmit.disabled = true;
            if (coordsSpan) {
                coordsSpan.className = 'text-slate-400 text-[11px] block';
                coordsSpan.innerText = error.code === error.PERMISSION_DENIED 
                    ? "Acceso denegado. Activa los permisos de ubicación."
                    : "No se logró capturar la ubicación física actual.";
            }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

/**
 * Determina y retorna un código de color hexadecimal asociado al nivel de prioridad o urgencia.
 * * - Utiliza encadenamiento opcional (`?.`) junto con normalización de cadenas (`toLowerCase`, `trim`) 
 * para prevenir excepciones por valores nulos, indefinidos o con espaciados irregulares.
 * - Evalúa mediante una estructura de control condicional (`switch`) el nivel de gravedad:
 * - 'alta', 'critica', 'crítica' -> Retorna código hexadecimal para color Rojo (#ef4444).
 * - 'media' -> Retorna código hexadecimal para color Ámbar (#f59e0b).
 * - 'baja' -> Retorna código hexadecimal para color Esmeralda (#10b981).
 * - Valor no registrado o nulo -> Retorna código hexadecimal para color Azul predeterminado (#3b82f6).
 * * @param {string} urgencia - Etiqueta cualitativa que define el nivel de prioridad de la incidencia.
 * @returns {string} Código de color hexadecimal equivalente a la paleta semántica de Tailwind CSS.
 */
function obtenerColorUrgencia(urgencia) {
    switch (urgencia?.toLowerCase().trim()) {
        case 'alta':
        case 'critica':
        case 'crítica':
            return '#ef4444'; 
        case 'media':
            return '#f59e0b'; 
        case 'baja':
            return '#10b981'; 
        default:
            return '#3b82f6'; 
    }
}

/**
 * Inicializa, estructura y renderiza un mapa interactivo georreferenciado con Leaflet, 
 * superponiendo una capa de mapa de calor (Heatmap) y marcadores circulares de prioridad.
 * * - **Mecanismos de Protección:** Valida la existencia física y las dimensiones reales del contenedor 
 * en el DOM (`offsetWidth`/`offsetHeight`) para mitigar errores de renderizado.
 * - **Gestión de Ciclo de Vida:** Remueve de memoria instancias previas del mapa (`objetoMapa`) evitando fugas de memoria.
 * - **Configuración Inicial:** Centra la cámara espacial en un área predeterminada (El Alto) e inyecta la capa base de OpenStreetMap.
 * - **Procesamiento de Datos:** Itera la colección de incidencias para estructurar una matriz de intensidad de calor (`puntosCalor`) 
 * y añade marcadores individuales (`L.circleMarker`) con colores dinámicos basados en la urgencia.
 * - **Saneamiento e Inyección Visual:** Sanea cadenas de texto, procesa y normaliza las URLs multimedia, y enlaza popups informativos
 * (`bindPopup`) con estructuras maquetadas mediante atributos personalizados `data-*`.
 * - **Manejo de Eventos Dinámicos:** Escucha la apertura de popups (`popupopen`) para delegar de forma elástica el evento 'click' 
 * al botón incrustado, invocando funciones globales de despliegue de modales externos (`abrirModalDetalleIncidencia`).
 * * @param {Array<object>} incidencias - Colección de registros georreferenciados que se representarán en el mapa.
 */
function inicializarMapaCalor(incidencias) {

    const mapaContenedor = document.getElementById('mapaIncidencias');
    if (!mapaContenedor) return;

    if (mapaContenedor.offsetWidth === 0 || mapaContenedor.offsetHeight === 0) {
        console.warn("El contenedor del mapa no tiene dimensiones aún. Reintentando en el próximo ciclo...");
        return;
    }

    if (objetoMapa !== null) {
        objetoMapa.remove();
        objetoMapa = null;
    }

    if (!incidencias || incidencias.length === 0) return;

    objetoMapa = L.map('mapaIncidencias').setView([-16.5120, -68.1980], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(objetoMapa);

    const puntosCalor = [];

    incidencias.forEach(inc => {
        if (!inc.latitud || !inc.longitud) return;

        const estadoClean = inc.estado ? inc.estado.toLowerCase().trim() : '';
        if (
            estadoClean.startsWith('resuelt') || 
            estadoClean.startsWith('rechazad') || 
            estadoClean === 'cancelada' || 
            estadoClean === 'cancelado'
        ) {
            return; 
        }

        const lat = parseFloat(inc.latitud);
        const lng = parseFloat(inc.longitud);

        puntosCalor.push([lat, lng, 0.5]); 

        let colorPin = '#ef4444'; 
        let bgBadge = 'bg-red-50 text-red-700 border-red-200';
        
        if (inc.estado === 'En Proceso') {
            colorPin = '#f59e0b'; 
            bgBadge = 'bg-amber-50 text-amber-700 border-amber-200';
        }

        const marker = L.circleMarker([lat, lng], {
            radius: 7,
            fillColor: colorPin,
            color: '#ffffff', 
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95
        }).addTo(objetoMapa);

        const fotoQueja = inc.foto_url;
        let urlFoto = 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=150';
        if (fotoQueja && fotoQueja !== 'null' && fotoQueja !== 'undefined' && fotoQueja.trim() !== '') {
            if (fotoQueja.startsWith('http')) {
                urlFoto = fotoQueja;
            } else if (fotoQueja.startsWith('uploads/')) {
                urlFoto = FILE_SERVER + fotoQueja; 
            } else {
                urlFoto = FILE_SERVER + 'uploads/' + fotoQueja;
            }
        }

        const tipoDanioTexto = inc.tipo_danio ? inc.tipo_danio.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Incidencia';
        const descEscapada = inc.descripcion ? inc.descripcion.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Sin descripción.';
        const sectorEscapado = inc.sector ? inc.sector.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'General';
        const vecinoNombre = inc.vecino_nombre ? inc.vecino_nombre.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Vecino Anónimo';

        const popupContent = `
            <div class="text-slate-800 font-sans p-1 flex flex-col gap-1" style="width: 230px; min-width: 230px;">
                <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 mb-1">
                    <h4 class="font-bold text-xs text-slate-900 uppercase truncate flex-1">${tipoDanioTexto}</h4>
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${bgBadge} uppercase shrink-0">
                        ${inc.estado}
                    </span>
                </div>
                <p class="text-[11px] text-slate-600 line-clamp-2 mb-2 leading-relaxed">${descEscapada}</p>
                
                <div class="flex items-center justify-between pt-1 w-full border-t border-slate-50">
                    <span class="text-[10px] text-slate-500 font-medium">${sectorEscapado}</span>
                    <button class="btn-ver-detalle text-[11px] text-blue-600 font-bold hover:text-blue-700 hover:underline cursor-pointer focus:outline-none bg-transparent border-none p-0"
                            data-id="${inc.id}"
                            data-titulo="${tipoDanioTexto}"
                            data-descripcion="${descEscapada}"
                            data-foto="${urlFoto}"
                            data-estado="${inc.estado}"
                            data-sector="${sectorEscapado}"
                            data-usuario="${vecinoNombre}"
                            data-latitud="${inc.latitud}"
                            data-longitud="${inc.longitud}">
                        Ver detalle →
                    </button>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent, {
            className: 'custom-light-popup',
            closeButton: false
        });
    });

    if (puntosCalor.length > 0) {
        L.heatLayer(puntosCalor, {
            radius: 25,
            blur: 15,
            maxZoom: 15,
            gradient: { 0.4: 'rgba(59,130,246,0.6)', 0.7: 'rgba(234,179,8,0.7)', 1: 'rgba(239,68,68,0.8)' }
        }).addTo(objetoMapa);
    }

    objetoMapa.on('popupopen', function(e) {
        const botonPopup = e.popup._contentNode.querySelector('.btn-ver-detalle');
        if (botonPopup) {
            botonPopup.addEventListener('click', function() {

                const id          = this.getAttribute('data-id');
                const titulo      = this.getAttribute('data-titulo');
                const descripcion = this.getAttribute('data-descripcion');
                const fotoUrl     = this.getAttribute('data-foto');
                const estado      = this.getAttribute('data-estado');
                const sector      = this.getAttribute('data-sector');
                const usuario     = this.getAttribute('data-usuario');
                const latitud     = this.getAttribute('data-latitud');
                const longitud    = this.getAttribute('data-longitud');

                if (typeof window.abrirModalDetalleIncidencia === 'function') {
                    window.abrirModalDetalleIncidencia(
                        id, titulo, descripcion, fotoUrl, estado, sector, usuario, latitud, longitud, true
                    );
                }
            });
        }
    });

    objetoMapa.invalidateSize();
}

/**
 * Escucha y gestiona de forma global los eventos de clic en el documento para implementar 
 * un mecanismo de delegación de eventos orientado a la búsqueda y enfoque de incidencias.
 * * - Intercepta los clics dirigidos a elementos con la clase `btn-ver-detalle` y previene su comportamiento por defecto.
 * - Extrae, normaliza y sanea el identificador único (`data-id`) para localizar la tarjeta correspondiente en el DOM (`incidencia-row-${id}`).
 * - **Desplazamiento Elástico y Foco:** Ejecuta un temporizador asíncrono (`setTimeout`) de 100ms para romper el hilo de ejecución principal 
 * (mitigando bloqueos de foco provocados por librerías externas como Leaflet), realizando un desplazamiento suave (`scrollIntoView`) 
 * que centra el elemento en pantalla y forzando su foco manual.
 * - **Retroalimentación Visual:** Aplica de forma inmediata clases de diseño temporales (iluminación de fondo, bordes resaltados y escalado) 
 * para guiar el ojo del usuario, las cuales se remueven automáticamente tras transcurrir un intervalo de 2.5 segundos.
 */
document.addEventListener('click', function (evento) {
    if (evento.target && evento.target.classList.contains('btn-ver-detalle')) {
        evento.preventDefault();
        
        const rawId = evento.target.getAttribute('data-id');
        if (!rawId) return;
        
        const incidenciaId = rawId.toString().trim();
        const tarjeta = document.getElementById(`incidencia-row-${incidenciaId}`);
        
        if (tarjeta) {
            console.log("¡Tarjeta encontrada! Forzando Scroll Alternativo...");

            setTimeout(() => {

                tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center' });
                

                tarjeta.focus({ preventScroll: true }); 
            }, 100);
            

            tarjeta.classList.add('bg-slate-700/80', 'border-l-blue-500', 'ring-2', 'ring-blue-500/50', 'scale-[1.02]');
            
            setTimeout(() => {
                tarjeta.classList.remove('bg-slate-700/80', 'border-l-blue-500', 'ring-2', 'ring-blue-500/50', 'scale-[1.02]');
            }, 2500);
        }
    }
});

/**
 * Registra una función en el ámbito global (`window`) para localizar, desplazar y resaltar 
 * visualmente un elemento específico de incidencia dentro del panel del administrador.
 * * - Busca de forma flexible el contenedor correspondiente en el DOM evaluando dos patrones 
 * de identificadores secuenciales (`incidencia-row-${id}` o `incidencia-${id}`).
 * - **Desplazamiento Suave:** Si halla el nodo, invoca el método nativo `scrollIntoView` 
 * configurando una transición fluida y forzando el centrado vertical del elemento en el viewport.
 * - **Destello Semántico:** Añade temporalmente clases CSS de realce visual (iluminación de fondo 
 * y bordes contrastados) para enfocar la atención del operador técnico.
 * - **Gestión de Ciclo de Vida:** Inicializa un temporizador asíncrono para remover los estilos 
 * de parpadeo tras 2 segundos o emite una advertencia de diagnóstico en la consola si el ID no existe en el DOM.
 * * @param {string|number} id - Identificador único de la incidencia que se desea rastrear en la lista.
 */
window.irAIncidenciaEnLista = (id) => {

    const elemento = document.getElementById(`incidencia-row-${id}`) || document.getElementById(`incidencia-${id}`);
    
    if (elemento) {

        elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        elemento.classList.add('bg-slate-700/50', 'border-blue-500');
        setTimeout(() => {
            elemento.classList.remove('bg-slate-700/50', 'border-blue-500');
        }, 2000);
    } else {
        console.warn(`No se encontró el elemento HTML para la incidencia ID: ${id}`);
    }
};


/**
 * Crea, estructura e inicializa dinámicamente un componente modal global para exponer
 * el desglose detallado de una incidencia, integrando georreferenciación externa y estilos oscuros.
 */
window.abrirModalDetalleIncidencia = function(id, titulo, descripcion, fotoUrl, estado, sector, usuario, latitud, longitud, esAdmin = false) {

    if (typeof objetoMapa !== 'undefined' && objetoMapa !== null) {
        objetoMapa.closePopup(); 
    }
    
    let modal = document.getElementById('modalDetalleGlobal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalDetalleGlobal';
        modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] hidden justify-center items-center p-4 transition-all duration-300';
        
        modal.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden transform scale-95 transition-transform duration-300 flex flex-col max-h-[90vh]">
                
                <div class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <h3 id="mdG-titulo" class="text-sm font-bold text-slate-100 uppercase tracking-wide truncate pr-4">Detalle de Incidencia</h3>
                    <button onclick="cerrarModalDetalleGlobal()" class="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer">
                        ✖
                    </button>
                </div>
                
                <div class="p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
                    <div class="w-full h-48 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-inner">
                        <img id="mdG-imagen" src="" alt="Evidencia" class="w-full h-full object-cover">
                    </div>
                    
                    <div>
                        <span class="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Descripción del reporte</span>
                        <p id="mdG-descripcion" class="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800/60 whitespace-pre-line"></p>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3 text-[11px] pt-2 border-t border-slate-800/60">
                        <div class="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/40">
                            <span class="text-slate-500 block text-[9px] uppercase font-bold mb-0.5">📍 Ubicación / Sector</span>
                            <span id="mdG-sector" class="text-slate-300 font-medium"></span>
                        </div>
                        <div class="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/40">
                            <span class="text-slate-500 block text-[9px] uppercase font-bold mb-0.5">👤 Reportado Por</span>
                            <span id="mdG-usuario" class="text-blue-400 font-bold truncate block"></span>
                        </div>
                    </div>

                    <div id="mdG-contenedor-ruta" class="pt-2"></div>
                </div>
                
                <div class="p-3.5 bg-slate-950/40 border-t border-slate-800 flex justify-between items-center px-5">
                    <div class="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                        <span class="text-[9px] uppercase font-bold text-slate-500">Estado:</span>
                        <span id="mdG-estado" class="px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider"></span>
                    </div>
                    <button onclick="cerrarModalDetalleGlobal()" class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-all cursor-pointer">
                        Cerrar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Inyección de datos
    document.getElementById('mdG-titulo').innerText = titulo || 'Detalle de Incidencia';
    document.getElementById('mdG-descripcion').innerText = descripcion || 'Sin descripción disponible.';
    document.getElementById('mdG-imagen').src = fotoUrl || 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=150';
    document.getElementById('mdG-sector').innerText = sector || 'Desconocido';
    
    // Si no viene usuario (como en la vista del vecino), muestra 'Vecino Anónimo'
    document.getElementById('mdG-usuario').innerText = usuario || 'Vecino Anónimo';
    
    // Configuración de la ruta para el Admin
    const contenedorRuta = document.getElementById('mdG-contenedor-ruta');
    if (esAdmin && latitud && longitud && latitud !== 'undefined' && longitud !== 'undefined') {
        const urlGoogleMaps = `https://www.google.com/maps/dir/?api=1&destination=${latitud},${longitud}&travelmode=driving`;
        
        contenedorRuta.innerHTML = `
            <a href="${urlGoogleMaps}" target="_blank" rel="noopener noreferrer" 
               class="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-950/50 cursor-pointer text-center block no-underline">
                🧭 ¡Trazar ruta GPS en Google Maps!
            </a>
        `;
        contenedorRuta.classList.remove('hidden');
    } else {
        contenedorRuta.innerHTML = '';
        contenedorRuta.classList.add('hidden');
    }

    // Estilos del Badge de Estado
    const badgeEstado = document.getElementById('mdG-estado');
    badgeEstado.innerText = estado || 'Pendiente';
    badgeEstado.className = "px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider";
    
    if (estado === 'En Proceso') {
        badgeEstado.classList.add('bg-amber-500/10', 'text-amber-400', 'border-amber-500/20');
    } else if (estado === 'Resuelta' || estado === 'Resuelto') {
        badgeEstado.classList.add('bg-green-500/10', 'text-green-400', 'border-green-500/20');
    } else if (estado === 'Rechazada') {
        badgeEstado.classList.add('bg-slate-500/10', 'text-slate-400', 'border-slate-700');
    } else {
        badgeEstado.classList.add('bg-red-500/10', 'text-red-400', 'border-red-500/20');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    setTimeout(() => {
        const transformContainer = modal.querySelector('.transform');
        if (transformContainer) {
            transformContainer.classList.remove('scale-95');
            transformContainer.classList.add('scale-100');
        }
    }, 10);
};

/**
 * Cierra el modal global de detalles revirtiendo las animaciones de escala y visibilidad.
 * * - Reduce la escala del contenedor interno (`scale-95`) para ejecutar la transición visual de salida.
 * - Difunde el cierre mediante un temporizador asíncrono (`setTimeout`) de 150ms para sincronizarse con 
 * las transiciones CSS antes de aplicar la clase de ocultación (`hidden`).
 */
window.cerrarModalDetalleGlobal = function() {
    const modal = document.getElementById('modalDetalleGlobal');
    if (modal) {
        modal.querySelector('.transform').classList.remove('scale-100');
        modal.querySelector('.transform').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }, 150); 
    }
};

/**
 * Consulta la API de forma asíncrona para poblar un elemento select de HTML con los sectores vecinales disponibles.
 * * - **Saneamiento de Autenticación:** Extrae el token de sesión desde `localStorage`, elimina prefijos redundantes 
 * mediante expresiones regulares y normaliza la cabecera bajo el formato requerido por el backend (`Bearer_token`).
 * - **Consumo RESTful:** Realiza una petición GET autenticada hacia el endpoint de configuración de sectores.
 * - **Población Dinámica del DOM:** Limpia el elemento de selección inyectando una opción por defecto condicional 
 * según el propósito del componente (filtrado general o formulario de registro).
 * - **Estructuración de Nodos:** Itera la colección de sectores recibida para instanciar nodos `<option>`, vinculando 
 * el identificador numérico como valor del campo y preservando el nombre del sector en un atributo personalizado `data-nombre`.
 * * @param {string} idSelectElemento - Identificador (ID) del elemento `<select>` de destino en el DOM.
 */
async function cargarSectoresEnSelect(idSelectElemento) {
    try {
        const selectSector = document.getElementById(idSelectElemento);
        if (!selectSector) return; 

        let tokenRaw = localStorage.getItem('token');

        if (!tokenRaw) {
            console.warn(`[utils.js] No se encontró el token en localStorage.`);
            return;
        }

        let tokenPuro = tokenRaw.replace(/^Bearer_/, '').replace(/^Bearer\s+/, '').trim();

        const authHeader = `Bearer_${tokenPuro}`;

        console.log(`[utils.js] Intentando formato nativo: "${authHeader.substring(0, 22)}..."`);

        const res = await fetch(`${API_BASE}/configuracion/sectores`, {
            method: 'GET',
            headers: { 
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) throw new Error(`Error en el servidor: ${res.status}`);
        
        const sectores = await res.json();
        
        if (idSelectElemento === 'sectorFilterSelect') {
            selectSector.innerHTML = '<option value="TODOS">Todos los Sectores</option>';
        } else {
            selectSector.innerHTML = '<option value="" disabled selected>-- Seleccione el sector --</option>';
        }
        sectores.forEach(s => {
            const option = document.createElement('option');
            option.value = s.id;
            option.setAttribute('data-nombre', s.nombre);
            option.textContent = s.nombre;
            selectSector.appendChild(option);
        });


    } catch (err) {
        console.error(`Error definitivo al cargar sectores en #${idSelectElemento}:`, err);
    }
}

/**
 * Consulta la API de forma asíncrona para poblar un elemento select de HTML con el catálogo 
 * de tipos de daño o categorías de incidencia parametrizados en el sistema.
 * * - **Saneamiento de Autenticación:** Extrae el token de sesión desde `localStorage`, elimina 
 * prefijos redundantes mediante expresiones regulares y normaliza la cabecera bajo el formato 
 * mandatorio requerido por el microframework Slim (`Bearer_token`).
 * - **Consumo RESTful:** Ejecuta una petición HTTP GET autenticada hacia el endpoint de configuración de daños.
 * - **Población Dinámica del DOM:** Sanea el elemento de selección inyectando una opción por defecto 
 * condicional basada en el ID del componente (búsqueda/filtrado general o formulario de inserción).
 * - **Estructuración y Enriquecimiento de Nodos:** Itera la colección de daños recibida para instanciar 
 * elementos `<option>`, asignando el ID único como valor del campo, indexando el nombre en minúsculas 
 * en un atributo personalizado `data-nombre` para optimizar filtros en el cliente, y mapeando la descripción 
 * nativa en el atributo `title` como texto de ayuda flotante (tooltip).
 * * @param {string} idSelectElemento - Identificador (ID) del elemento `<select>` de destino en el DOM.
 */
async function cargarDaniosEnSelect(idSelectElemento) {
    try {
        const selectDanio = document.getElementById(idSelectElemento);
        if (!selectDanio) return; 

        let tokenRaw = localStorage.getItem('token');
        if (!tokenRaw) {
            console.warn(`[utils.js] No se encontró el token para cargar tipos de daño.`);
            return;
        }

        let tokenPuro = tokenRaw.replace(/^Bearer_/, '').replace(/^Bearer\s+/, '').trim();
        const authHeader = `Bearer_${tokenPuro}`;

        const res = await fetch(`${API_BASE}/configuracion/tipos-danio`, {
            method: 'GET',
            headers: { 
                'Authorization': authHeader,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) throw new Error(`Error en el servidor: ${res.status}`);
        
        const danios = await res.json();

        if (idSelectElemento === 'searchFilterInput') {
            selectDanio.innerHTML = '<option value="TODOS">Todos los Tipos de Daño</option>';
        } else {
            selectDanio.innerHTML = '<option value="" disabled selected>-- Seleccione el tipo de daño --</option>';
        }
        
        danios.forEach(d => {
            const option = document.createElement('option');
            option.value = d.id; 
            option.setAttribute('data-nombre', d.nombre.toLowerCase()); 
            option.textContent = d.nombre;
            option.title = d.description || ''; 
            selectDanio.appendChild(option);
        });

    } catch (err) {
        console.error(`Error definitivo al cargar daños en #${idSelectElemento}:`, err);
    }
}

document.getElementById('incFotoArchivo')?.addEventListener('change', function() {
    actualizarAvisoArchivo(this, 'incFotoCamara');
});


document.getElementById('incFotoCamara')?.addEventListener('change', function() {
    actualizarAvisoArchivo(this, 'incFotoArchivo');
});
/**
 * Actualiza la interfaz de usuario para indicar que un archivo nuevo ha sido seleccionado para su carga.
 * Evalúa si el campo de entrada actual contiene algún elemento en su colección de archivos; de ser así,
 * restablece de forma preventiva el valor del campo alternativo para evitar cargas duplicadas o conflictivas.
 * Extrae el nombre del archivo seleccionado para desplegarlo en un contenedor del DOM, el cual se hace visible
 * de forma dinámica eliminando las restricciones de visualización, ocultándolo en caso de no detectar elementos.
 */
function actualizarAvisoArchivo(inputActual, inputA_Limpiar) {
    const contenedor = document.getElementById('vistaPreviaNombre');
    
    if (inputActual.files && inputActual.files.length > 0) {

        document.getElementById(inputA_Limpiar).value = "";
        
        const nombreArchivo = inputActual.files[0].name;
        contenedor.innerText = `📎 Listo para subir: ${nombreArchivo}`;
        contenedor.classList.remove('hidden');
    } else {
        contenedor.classList.add('hidden');
    }
}