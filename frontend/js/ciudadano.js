// Caché global para almacenar el registro de incidencias por vecino y optimizar las consultas.
let VECINO_INCIDENCIAS_CACHE = [];

/**
 * Inicializa la interfaz y los componentes del módulo de 'Ciudadano' 
 * una vez que el DOM está completamente cargado.
 * * - Valida el rol de autenticación en el cliente.
 * - Muestra el nombre del usuario en la pantalla de bienvenida.
 * - Configura la navegación interna, formularios y carga de datos iniciales.
 * - Asigna el manejador de eventos para el cierre de sesión de forma controlada.
 */

document.addEventListener("DOMContentLoaded", function() {
    if (!checkAuth('Ciudadano')) return; 
    
    const lblNombre = document.getElementById('lblVecinoNombre');
    if (lblNombre && AppState.user) {
        lblNombre.innerText = AppState.user.nombre;
    }

    initCiudadanoNavigation();
    initIncidentFormListener();
    loadVecinoDashboard(); //
    cargarSectoresEnSelect('repoSector');
    cargarDaniosEnSelect('repoDanio');

    const btnLogout = document.getElementById('navBtnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }
});

/**
 * Configura los manejadores de eventos para la navegación interna de la interfaz de usuario.
 * Controla el intercambio de visibilidad entre la vista del panel principal (Dashboard) 
 * y la vista del formulario de reporte mediante la manipulación de clases CSS (`hidden`).
 * * Además, implementa carga perezosa (lazy loading) para la geolocalización, 
 * activando la captura por GPS únicamente cuando el usuario accede al formulario de reporte.
 */
function initCiudadanoNavigation() {
    const btnIrAReportar = document.getElementById('btnIrAReportar');
    const btnVolver = document.getElementById('btnVolverAlDashboard');
    const viewDashboard = document.getElementById('viewCiudadanoDashboard');
    const viewReportar = document.getElementById('viewReportar');

    if (btnIrAReportar && viewDashboard && viewReportar) {
        btnIrAReportar.addEventListener('click', () => {

            viewDashboard.classList.add('hidden');
            viewReportar.classList.remove('hidden');
            
            capturarUbicacion({
                boxId: 'geoStatusBox',
                titleId: 'geoTitle',
                coordsId: 'geoCoords',
                btnSubmitId: 'btnReportarSubmit',
                latInputId: 'incLatitud',
                lngInputId: 'incLongitud'
            });
        });
    }

    if (btnVolver && viewDashboard && viewReportar) {
        btnVolver.addEventListener('click', () => {
            viewReportar.classList.add('hidden');
            viewDashboard.classList.remove('hidden');
        });
    }
}

/**
 * Inicializa el escucha de eventos (listener) para el formulario de reporte de incidencias.
 * Captura el evento 'submit', previene el comportamiento por defecto y envía los datos
 * estructurados (incluyendo archivos adjuntos si los hay) a la API mediante una petición POST autenticada.
 * * Tras una respuesta exitosa, limpia el formulario, actualiza el listado del panel principal,
 * muestra una alerta de confirmación y redirige automáticamente al usuario al Dashboard.
 * En caso de fallo, captura el error y despliega un mensaje informativo.
 */
function initIncidentFormListener() {
    const formIncidencia = document.getElementById('formIncidencia');
    if (!formIncidencia) return;

    formIncidencia.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(formIncidencia);

        try {
            const response = await fetch(API_BASE + '/incidencias', {
                method: 'POST',
                headers: { 'Authorization': AppState.token },
                body: formData 
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Error al procesar subida.');

            displayAlert('¡Gracias! Incidencia subida con éxito.');
            formIncidencia.reset();

            loadVecinoDashboard();
            
            document.getElementById('btnVolverAlDashboard').click();
        } catch (err) {
            displayAlert(err.message, 'error');
        }
    });
}

/**
 * Consulta las incidencias registradas en el servidor para actualizar el panel del ciudadano.
 * Realiza una petición GET autenticada a la API; si la respuesta es exitosa, almacena los
 * datos en la caché global (`VECINO_INCIDENCIAS_CACHE`) y renderiza la vista aplicando el
 * filtro por defecto ('activas').
 * * En caso de recibir una respuesta fallida o capturar un error de red, limpia o muestra
 * el estado vacío en los contenedores de la interfaz de usuario.
 */

async function loadVecinoDashboard() {
    try {
        const response = await fetch(API_BASE + '/incidencias', {
            method: 'GET',
            headers: { 'Authorization': AppState.token }
        });
        const result = await response.json();
        
        if (response.ok) {

            VECINO_INCIDENCIAS_CACHE = result.data || [];
            
            filtrarIncidenciasVecino('activas');
        } else {
            marcarListasVacias();
        }
    } catch (err) {
        console.error("Error cargando el feed del ciudadano:", err);
        marcarListasVacias();
    }
}

/**
 * Renderiza y distribuye los listados de incidencias en la interfaz de usuario.
 * Divide el conjunto de datos recibido en dos bloques comparando de forma estricta los IDs:
 * - "Mis Reportes": Incidencias creadas por el ciudadano autenticado.
 * - "Reportes de la Comunidad": Incidencias reportadas por otros usuarios del sector.
 * * En caso de haber elementos en los arreglos correspondientes, genera de forma dinámica 
 * la estructura HTML utilizando la función helper `generarTarjetaVecino`. Si los arreglos 
 * están vacíos, inserta un contenedor informativo con un diseño predeterminado para estado vacío.
 * * @param {Array<object>} incidencias - Lista de incidencias filtradas que se van a representar en pantalla.
 */
function renderListadosVecino(incidencias) {
    const contenedorMisReportes = document.getElementById('listaMisReportes');
    const contenedorSector = document.getElementById('listaReportesSector');
    
    if (!contenedorMisReportes || !contenedorSector) return;

    const miId = AppState.user ? AppState.user.id : null;

    const misReportes = incidencias.filter(inc => String(inc.usuario_id) === String(miId));

    const reportesComunidad = incidencias.filter(inc => String(inc.usuario_id) !== String(miId));

    if (misReportes.length === 0) {
        contenedorMisReportes.innerHTML = `<p class="text-xs text-slate-400 text-center py-5 bg-slate-900/40 rounded-xl border border-dashed border-slate-800/80 italic shadow-inner"> No tienes reportes en este sector.</p>`;
    } else {
        contenedorMisReportes.innerHTML = misReportes.map(inc => generarTarjetaVecino(inc, true)).join('');
    }

    if (reportesComunidad.length === 0) {
        contenedorSector.innerHTML = `<p class="text-xs text-slate-400 text-center py-5 bg-slate-900/40 rounded-xl border border-dashed border-slate-800/80 italic shadow-inner"> No hay reportes activos de otros vecinos en el barrio.</p>`;
    } else {
        contenedorSector.innerHTML = reportesComunidad.map(inc => generarTarjetaVecino(inc, false)).join('');
    }
}

/**
 * Genera la estructura HTML de una tarjeta de incidencia para la vista del vecino.
 * - Mantiene todas las opciones disponibles por auditoría.
 * - Distribuye los botones y metadatos de forma limpia para evitar amontonamientos.
 * - Resalta visualmente los estados especiales (Resuelta/Rechazada).
 */
function generarTarjetaVecino(inc, esPropio) {

    let bgTarjeta = 'bg-slate-900 border-slate-800 text-slate-100';
    let badgeEstado = 'bg-slate-950 text-slate-400 border-slate-800';
    
    if (inc.estado === 'En Proceso') {
        badgeEstado = 'bg-amber-950/40 text-amber-400 border-amber-900/50';
    } else if (inc.estado === 'Resuelta' || inc.estado === 'Resuelto') {
        badgeEstado = 'bg-emerald-600 text-white shadow-sm border-transparent';
        bgTarjeta = 'bg-emerald-950/10 border-slate-800/80 border-l-4 border-l-emerald-500 text-slate-100'; 
    } else if (inc.estado === 'Rechazada' || inc.estado === 'Rechazado') {
        badgeEstado = 'bg-rose-950/40 text-rose-400 font-bold border-rose-900/40';
        bgTarjeta = 'bg-rose-950/10 border-slate-800/80 border-l-4 border-l-rose-500 text-slate-100'; 
    }

    const tituloEscapado = inc.titulo ? inc.titulo.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Incidencia Vecinal';
    const descEscapada = inc.descripcion ? inc.descripcion.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
    const sectorEscapado = inc.sector ? inc.sector.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'General';
    
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

    const campoFecha = inc.creado_en || inc.fecha;
    let fechaFormateada = campoFecha ? new Date(campoFecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : 'Reciente';

    const esResuelta = inc.estado === 'Resuelta' || inc.estado === 'Resuelto';
    const esRechazada = inc.estado === 'Rechazada' || inc.estado === 'Rechazado';
    
    let botonEvidencia = '';
    if (esResuelta) {
        const fotoCierreSegura = (inc.foto_cierre && inc.foto_cierre !== 'null') ? inc.foto_cierre : '';
        const notaLimpia = inc.nota_cierre ? inc.nota_cierre.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '¡Reporte solucionado con éxito por la administración!';
        
        botonEvidencia = `
            <button onclick="verEvidenciaCierre('${fotoCierreSegura}', '${notaLimpia}')" 
                    class="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-900/50 px-2 py-1 rounded-md transition-all cursor-pointer">
                📸 Ver Solución
            </button>`;
    } else if (esRechazada) {
        const tieneNotaReal = inc.nota_cierre && inc.nota_cierre !== 'null' && inc.nota_cierre !== 'undefined' && inc.nota_cierre.trim() !== '';
        const motivoLimpio = tieneNotaReal ? inc.nota_cierre.replace(/'/g, "\\'").replace(/"/g, '&quot;') : ''; 
        
        botonEvidencia = `
            <button onclick="abrirModalMotivoRechazoUnico('${tituloEscapado}', '${motivoLimpio}')" 
                    class="text-[10px] font-bold text-rose-400 bg-rose-950/40 border border-rose-900/40 px-2 py-1 rounded-md hover:bg-rose-900/60 transition-all cursor-pointer">
                🚫 Ver Motivo
            </button>`;
    }

    return `
        <div class="flex rounded-xl border shadow-xl overflow-hidden min-h-[95px] transition-all duration-300 hover:border-slate-700 ${bgTarjeta}">
            
            <div class="w-20 h-auto bg-slate-950 flex-shrink-0 relative border-r border-slate-800/50">
                <img src="${urlFoto}" alt="Evidencia" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=150'">
                ${esResuelta ? `<div class="absolute inset-0 bg-emerald-950/40 flex items-center justify-center backdrop-blur-[1px]"><i class="ti ti-circle-check text-emerald-400 text-xl drop-shadow-md"></i></div>` : ''}
                ${esRechazada ? `<div class="absolute inset-0 bg-rose-950/40 flex items-center justify-center backdrop-blur-[1px]"><i class="ti ti-ban text-rose-500 text-xl drop-shadow-md"></i></div>` : ''}
            </div>
            
            <div class="p-3 flex-1 flex flex-col justify-between min-w-0">
                
                <div>
                    <div class="flex justify-between items-center mb-1 gap-2">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="text-[9px] uppercase font-bold tracking-tight bg-slate-950 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded truncate">${inc.tipo_danio || 'Urbano'}</span>
                            ${esPropio ? `<span class="text-blue-400 font-bold text-[9px] bg-blue-950/40 border border-blue-900/50 px-1.5 py-0.5 rounded flex-shrink-0">Tu reporte</span>` : ''}
                        </div>
                        <span class="text-[9px] font-bold ${badgeEstado} px-2 py-0.5 rounded-full uppercase tracking-wider border flex-shrink-0">${inc.estado}</span>
                    </div>
                    
                    <p class="text-xs text-slate-400 line-clamp-1 pr-1 font-medium">${inc.descripcion}</p>
                </div>
                
                <div class="flex items-end justify-between text-[10px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-800/60 gap-2">
                    
                    <div class="flex flex-col gap-0.5 min-w-0 text-slate-500 font-medium">
                        <span class="truncate text-slate-400"><i class="ti ti-map-pin text-[11px] text-slate-500"></i> ${inc.sector || 'General'}</span>
                        <span class="text-[9px] text-slate-500/80">${fechaFormateada}</span>
                    </div>
                    
                    <div class="flex items-center gap-1.5 flex-shrink-0">
                        ${botonEvidencia} 
                        
                        <button onclick="abrirModalDetalleIncidencia('${inc.id}', '${tituloEscapado}', '${descEscapada}', '${urlFoto}', '${inc.estado}', '${sectorEscapado}', '', '${inc.latitud}', '${inc.longitud}')" 
                                class="text-[10px] bg-slate-950 hover:bg-slate-800 text-slate-300 px-2 py-1 rounded-md font-bold transition-all border border-slate-800 hover:border-slate-700 cursor-pointer">
                            Ver reporte
                        </button>
                    </div>

                </div>
            </div>
        </div>
    `;
}

/**
 * Inyecta un mensaje de estado de error o vacío en los contenedores principales del panel del vecino.
 * Define una plantilla HTML estándar con un diseño estilizado que notifica la imposibilidad de 
 * cargar la información, y la inserta de forma segura validando previamente la existencia en el DOM 
 * tanto de la lista de reportes propios (`listaMisReportes`) como de la comunitaria (`listaReportesSector`).
 */
function marcarListasVacias() {
    const vacioHtml = `<p class="text-xs text-slate-400 text-center py-5 bg-slate-900/40 rounded-xl border border-dashed border-slate-800/80 italic shadow-inner">¡Todo en orden! No hay incidencias activas en este momento.</p>`;
    if(document.getElementById('listaMisReportes')) document.getElementById('listaMisReportes').innerHTML = vacioHtml;
    if(document.getElementById('listaReportesSector')) document.getElementById('listaReportesSector').innerHTML = vacioHtml;
}

/**
 * Filtra y segmenta el conjunto de incidencias en caché basándose en el criterio seleccionado.
 * * - Modifica la apariencia visual de los botones/píldoras de filtro, alternando dinámicamente las clases CSS de estado activo e inactivo.
 * - Conmuta la visibilidad en el DOM de la sección comunitaria (`columnaReportesZona`), ocultándola por completo si el filtro es exclusivo para el usuario autenticado.
 * - Discrimina los registros de la caché global (`VECINO_INCIDENCIAS_CACHE`) bajo tres condiciones predefinidas: 'activas' (Pendiente/En Proceso), 'mis_reportes' (por ID de usuario) o 'resueltas' (Resuelta/Resuelto).
 * - Envía la subcolección resultante al módulo de renderizado (`renderListadosVecino`) o despliega el estado vacío en pantalla si no se hallan coincidencias.
 * * @param {string} tipo - Criterio de filtrado solicitado ('activas', 'mis_reportes' o 'resueltas').
 */
function filtrarIncidenciasVecino(tipo) {
    ['Activas', 'MisReportes', 'Resueltas'].forEach(f => {
        const btn = document.getElementById(`btnFiltro${f}`);
        if(btn) {

            btn.classList.remove(
                'bg-slate-900', 'border-slate-800', 'text-slate-400', 'font-medium', 'hover:bg-slate-800',
                'bg-slate-100', 'text-slate-900', 'font-semibold', 'shadow-sm'
            );
            
            if(f.toLowerCase() === tipo.replace('_', '')) {

                btn.classList.add('bg-slate-100', 'text-slate-900', 'font-semibold', 'shadow-sm');
            } else {

                btn.classList.add('bg-slate-900', 'border', 'border-slate-800', 'text-slate-400', 'font-medium', 'hover:bg-slate-800');
            }
        }
    });

    const miId = AppState.user ? AppState.user.id : null;

    const colZona = document.getElementById('columnaReportesZona');
    if (colZona) {
        if (tipo === 'mis_reportes') {
            colZona.classList.add('hidden'); 
        } else {
            colZona.classList.remove('hidden'); 
        }
    }

    const incidenciasFiltradas = VECINO_INCIDENCIAS_CACHE.filter(inc => {
        if (tipo === 'activas') {
            return inc.estado === 'Pendiente' || inc.estado === 'En Proceso';
        }
        if (tipo === 'mis_reportes') {
            return String(inc.usuario_id) === String(miId); 
        }
        if (tipo === 'resueltas') {
            return inc.estado === 'Resuelta' || inc.estado === 'Resuelto';
        }
        return true;
    });

    if (incidenciasFiltradas.length === 0) {
        marcarListasVacias();
    } else {
        renderListadosVecino(incidenciasFiltradas);
    }
}

/**
 * Construye y despliega una ventana modal interactiva para la visualización de las evidencias de cierre de un reporte.
 * Evalúa y normaliza los parámetros de texto e imagen para prevenir valores nulos o cadenas vacías, asignando una
 * fotografía por defecto o resolviendo la URL absoluta mediante el servidor de archivos del sistema. Genera de forma
 * dinámica la estructura del contenedor HTML aplicando estilos visuales y de animación mediante clases de Tailwind CSS,
 * e inyecta el componente directamente en el DOM para permitir la consulta inmediata de los adjuntos y notas informativas.
 */
function verEvidenciaCierre(fotoCierre, notaCierre) {

    const notaMostrar = (notaCierre && notaCierre !== 'null' && notaCierre !== 'undefined') 
        ? notaCierre 
        : 'El administrador marcó este reporte como solucionado con éxito.';

    let urlFotoCierre = 'https://images.unsplash.com/photo-1584467541268-b040f83be3fd?w=500'; 
    if (fotoCierre && fotoCierre !== 'null' && fotoCierre !== 'undefined') {
        urlFotoCierre = fotoCierre.startsWith('http') ? fotoCierre : FILE_SERVER + fotoCierre;
    }

    const modal = document.createElement('div');
    modal.id = 'modalEvidenciaCierre';
    modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in";
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl overflow-hidden shadow-xl max-w-sm w-full border border-slate-100 flex flex-col transform scale-95 transition-all duration-200">
            <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-emerald-50/50">
                <div class="flex items-center gap-2 text-emerald-800">
                    <i class="ti ti-circle-check text-lg"></i>
                    <span class="font-bold text-xs uppercase tracking-wider">Evidencia de Solución</span>
                </div>
                <button onclick="cerrarModalEvidencia()" class="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                    <i class="ti ti-x text-xs"></i>
                </button>
            </div>
            
            <div class="w-full h-48 bg-slate-100 relative">
                <img src="${urlFotoCierre}" alt="Trabajo Terminado" class="w-full h-full object-cover">
                <div class="absolute bottom-2 right-2 bg-emerald-600 text-white font-bold text-[9px] px-2 py-0.5 rounded-full shadow-sm">
                    ¡Reparado!
                </div>
            </div>
            
            <div class="p-4 flex flex-col gap-1 bg-slate-50/50">
                <span class="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Mensaje de la Cuadrilla</span>
                <p class="text-xs text-slate-600 leading-relaxed italic">
                    "${notaMostrar}"
                </p>
            </div>
            
            <div class="p-3 border-t border-slate-100 bg-white flex justify-end">
                <button onclick="cerrarModalEvidencia()" class="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-medium hover:bg-slate-800 transition-colors shadow-sm">
                    Entendido, ¡Gracias!
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

/**
 * Crea, estructura y despliega dinámicamente un modal flotante (pop-up) para mostrar
 * la evidencia de resolución de una incidencia ya solucionada.
 * * - Valida y sanea de forma segura la nota de cierre suministrada por la administración, 
 * asignando un texto informativo genérico en caso de ausencia o invalidez del dato.
 * - Resuelve la ruta lógica para la imagen de evidencia, anteponiendo el servidor de 
 * archivos estáticos correspondientes o asignando una imagen de respaldo predeterminada.
 * - Genera mediante manipulación del DOM (`createElement`) un nodo contenedor con estilos 
 * de desenfoque y capas de superposición (`backdrop-blur-sm`, `z-50`).
 * - Inyecta la plantilla HTML maquetada bajo diseño responsivo (Mobile-First) y añade el 
 * nodo al árbol del documento (`appendChild`).
 * * @param {string} fotoCierre - Ruta o URL absoluta de la fotografía que constata la reparación.
 * @param {string} notaCierre - Mensaje, justificación o comentarios finales emitidos por la cuadrilla técnica.
 */
function cerrarModalEvidencia() {
    const modal = document.getElementById('modalEvidenciaCierre');
    if (modal) {
        modal.remove();
    }
}

/**
 * Abre un modal minimalista y exclusivo para mostrar únicamente la nota de cierre o motivo de rechazo.
 * @param {string} titulo - Título de la incidencia para dar contexto al vecino.
 * @param {string} motivo - El texto explicativo enviado por el servidor (nota_cierre).
 */
function abrirModalMotivoRechazoUnico(titulo, motivo) {
    const modalExistente = document.getElementById('modal-rechazo-unico');
    if (modalExistente) modalExistente.remove();

    let textoMostrar = motivo;
    if (!motivo || motivo === 'null' || motivo === 'undefined' || motivo.trim() === '') {
        textoMostrar = 'Este reporte no cumple con las directrices comunitarias establecidas por la administración.';
    }

    const estructuraModal = `
        <div id="modal-rechazo-unico" class="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
            <div class="bg-white w-full max-w-md rounded-xl shadow-xl border border-slate-100 overflow-hidden transform transition-all scale-100">
                
                <div class="bg-rose-50 px-4 py-3 border-b border-rose-100 flex items-center justify-between">
                    <div class="flex items-center gap-2 text-rose-700 font-bold text-xs uppercase tracking-wider">
                        <span>🚫</span> Motivo de Rechazo
                    </div>
                    <button onclick="document.getElementById('modal-rechazo-unico').remove()" class="text-slate-400 hover:text-slate-600 transition-colors text-lg font-bold cursor-pointer px-1">&times;</button>
                </div>

                <div class="p-4">
                    <span class="text-[9px] uppercase font-bold tracking-tight bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded block w-fit mb-2">
                        Reporte: ${titulo}
                    </span>
                    
                    <div class="bg-rose-50/50 border border-rose-100 p-3.5 rounded-lg">
                        <p class="text-xs text-rose-950 font-medium leading-relaxed">
                            "${textoMostrar}"
                        </p>
                    </div>
                </div>

                <div class="bg-slate-50 px-4 py-2.5 border-t border-slate-100 flex justify-end">
                    <button onclick="document.getElementById('modal-rechazo-unico').remove()" class="text-[11px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1 rounded-md transition-colors cursor-pointer">
                        Entendido
                    </button>
                </div>

            </div>
        </div>
    `;

    // Inyectar el modal directamente al final del body para asegurar el orden visual
    document.body.insertAdjacentHTML('beforeend', estructuraModal);
}