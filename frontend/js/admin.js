/**
 * Bloque de variables globales de control destinadas al almacenamiento en caché,
 * la gestión de estados de la interfaz y la sincronización de flujos de trabajo en el cliente.
 * * - `BACKEND_INCIDENCIAS_CACHE`: Matriz de almacenamiento temporal (Buffer) que indexa los registros completos
 * de incidencias vecinales recuperados de la API, optimizando las consultas de filtrado repetitivas.
 * - `cacheLogsAuditoria`: Vector persistente en memoria viva encargado de alojar las trazas de auditoría 
 * y operaciones del sistema para el panel de supervisión técnica.
 * - `cacheUsuariosMaster`: Catálogo centralizado que resguarda la nómina o listado maestro de cuentas de usuario del sistema.
 * - `vistaUsuariosActual`: Indicador de estado secuencial que segmenta la visualización activa de los registros de 
 * usuarios según sus propiedades de actividad (por defecto configurado para la subvista de usuarios 'activos').
 */
let BACKEND_INCIDENCIAS_CACHE = [];
let cacheLogsAuditoria = []; 
let cacheUsuariosMaster = [];
let vistaUsuariosActual = 'activos'; 

/**
 * Inicializa y orquesta de forma secuencial los módulos, componentes y flujos de datos 
 * del panel de control del administrador una vez que el árbol DOM ha sido completamente cargado.
 * * - **Filtro de Seguridad Inmediato:** Invoca la función `checkAuth` con el rol obligatorio 
 * de 'Administrador' para abortar prematuramente la ejecución en caso de accesos no autorizados.
 * - **Gestión de Sesión:** Vincula el evento de cierre de sesión (`handleLogout`) al botón 
 * interactivo de navegación (`navBtnLogout`) si este se encuentra presente en la vista.
 * - **Inicialización de Componentes de Interfaz:** Instrumenta de forma síncrona los subsistemas de la 
 * interfaz de usuario, incluyendo el centro de notificaciones, el motor de filtros y los modales globales de control 
 * (registro de administradores, generación de reportes y configuraciones del sistema).
 * - **Carga Asíncrona de Datos:** Despacha las directivas de lectura y renderizado para poblar el cuadro de mando principal 
 * (`loadAdminDashboard`), las bitácoras de auditoría, el listado maestro de usuarios y los componentes de selección geográfica 
 * e incidencias.
 * - **Población de Selectores Compartidos:** Invoca de forma consecutiva las rutinas de carga de datos externos 
 * (`cargarSectoresEnSelect` y `cargarDaniosEnSelect`) para alimentar con catálogos actualizados tanto los formularios 
 * de inserción como los inputs de búsqueda y filtrado analítico.
 */
document.addEventListener("DOMContentLoaded", function() {
    if (!checkAuth('Administrador')) return; 

    const btnLogout = document.getElementById('navBtnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }
    
    initFilterSystem();
    loadAdminDashboard();
    initRegistroAdminModal();
    loadAuditLogs(); 
    initReporteAdminModal();
    loadUsuariosMaster();
    initConfigSistemaModal();
    cargarSectoresEnSelect('repoSector');
    cargarDaniosEnSelect('repoDanio');
    cargarSectoresEnSelect('adminRepoSector'); 
    cargarDaniosEnSelect('adminRepoDanio');
    cargarSectoresEnSelect('sectorFilterSelect');
    cargarDaniosEnSelect('searchFilterInput'); 
});

/**
 * Consulta la API de forma asíncrona para recopilar los reportes de incidencias y orquestar 
 * la actualización de métricas, mapas e indicadores dentro del cuadro de mando del administrador.
 * * - **Extracción de Parámetros de Tiempo:** Recupera las fechas de corte desde los elementos del DOM 
 * (`filtroFechaInicio`/`filtroFechaFin`) para estructurar condicionalmente variables de consulta (Query Params).
 * - **Consumo RESTful:** Despacha una petición HTTP GET autenticada mediante el token de sesión hacia el endpoint de incidencias.
 * - **Gestión de Respuestas de Red:** * - **Si la petición es exitosa:** Sincroniza la colección de datos en la variable de persistencia temporal (`BACKEND_INCIDENCIAS_CACHE`), 
 * restablece el motor de filtrado del cliente, procesa la analítica de zonas críticas (`renderSectoresCriticos`) e inicializa de forma 
 * elástica la capa visual del mapa georreferenciado (`inicializarMapaCalor`).
 * - **Si el servidor responde con error o se intercepta una excepción física:** Interrumpe el flujo, emite un diagnóstico 
 * en la consola y delega el control a la rutina de contingencia (`clearDashboard`) para limpiar la interfaz visual.
 */
async function loadAdminDashboard() {
    try {
        const token = localStorage.getItem('token'); 
        const inputDesde = document.getElementById('filtroFechaInicio');
        const inputHasta = document.getElementById('filtroFechaFin');    
        const desde = inputDesde ? inputDesde.value : '';
        const hasta = inputHasta ? inputHasta.value : '';

        let url = API_BASE + '/incidencias';

        if (desde && hasta) {
            url += `?desde=${desde}&hasta=${hasta}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': token }
        });
        const result = await response.json();
        
        if (response.ok) {
            BACKEND_INCIDENCIAS_CACHE = result.data || [];

            initFilterSystem();
            
            renderSectoresCriticos(BACKEND_INCIDENCIAS_CACHE);
            
            if (typeof inicializarMapaCalor === 'function') {
                inicializarMapaCalor(BACKEND_INCIDENCIAS_CACHE);
            }
        } else {
            clearDashboard();
        }
    } catch (err) {
        console.error("Error cargando incidencias:", err);
        clearDashboard();
    }
}

/**
 * Orquesta la actualización de la interfaz de usuario en el panel de administración, 
 * recalculando los indicadores globales y renderizando la lista de tarjetas de incidencias.
 * * - **Cómputo de Indicadores:** Procesa la colección completa de reportes (`todasLasIncidencias`) 
 * para actualizar las métricas de estado consolidadas en el dashboard, independientemente de los filtros activos.
 * - **Control de Flujo Vacío:** Evalúa si la colección depurada para visualización (`incidenciasParaMostrar`) 
 * contiene registros; en caso negativo, limpia el contenedor e inyecta un aviso controlado de ausencia de datos.
 * - **Renderizado Dinámico Eficiente:** Mapea e itera el conjunto de registros filtrados para estructurar las 
 * plantillas HTML (`crearTarjetaIncidenciaHtml`) y las unifica en una sola cadena mediante `join('')` para realizar 
 * una única operación de escritura optimizada en el DOM (`innerHTML`).
 * * @param {Array<object>} todasLasIncidencias - Universo total de incidencias sin filtrar para el cálculo global de KPI.
 * @param {Array<object>} incidenciasParaMostrar - Subconjunto filtrado de incidencias destinadas a visualizarse en pantalla.
 */
function renderMetricsAndIncidencias(todasLasIncidencias, incidenciasParaMostrar) {
    const listContainer = document.getElementById('adminIncidenciasList');
    if (!listContainer) return;

    actualizarContadoresMetricas(todasLasIncidencias);

    if (!incidenciasParaMostrar || incidenciasParaMostrar.length === 0) {
        listContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No se encontraron incidencias para este filtro.</p>`;
        return;
    }

    listContainer.innerHTML = incidenciasParaMostrar.map(inc => crearTarjetaIncidenciaHtml(inc)).join('');
}

/**
 * Cuantifica y actualiza dinámicamente en la interfaz de usuario los contadores de métricas 
 * consolidadas (KPI) basándose en los estados del flujo de trabajo de las incidencias.
 * * - **Mapeo de Referencias:** Estructura un objeto de indexación (`counts`) para almacenar los nodos 
 * del DOM correspondientes a cada indicador de estado ('Pendiente', 'En Proceso', 'Resuelta', 'Rechazada').
 * - **Normalización y Filtrado:** Evalúa de forma defensiva la existencia de cada contenedor y ejecuta 
 * el método `filter` sobre la colección de incidencias para calcular su longitud (`length`), transformando los 
 * estados a minúsculas (`toLowerCase`) para mitigar discrepancias de formato o tipografía en los strings.
 * - **Resolución Flexible de Criterios:** En la métrica de finalización exitosa, implementa una lógica elástica 
 * que unifica bajo el mismo contador tanto las variaciones de género gramatical ('resuelta' o 'resuelto').
 * * @param {Array<object>} incidencias - Universo de registros provenientes del backend utilizados para el cómputo de métricas.
 */
function actualizarContadoresMetricas(incidencias) {
    const counts = {
        Pendientes: document.getElementById('countPendientes'),
        Proceso: document.getElementById('countProceso'),
        Resueltas: document.getElementById('countResueltas'),
        Rechazadas: document.getElementById('countRechazadas')
    };

    if (counts.Pendientes) {
        counts.Pendientes.innerText = incidencias.filter(i => (i.estado || '').toLowerCase() === 'pendiente').length;
    }
    if (counts.Proceso) {
        counts.Proceso.innerText = incidencias.filter(i => (i.estado || '').toLowerCase() === 'en proceso').length;
    }
    if (counts.Resueltas) {

        counts.Resueltas.innerText = incidencias.filter(i => {
            const est = (i.estado || '').toLowerCase();
            return est === 'resuelta' || est === 'resuelto';
        }).length;
    }
    if (counts.Rechazadas) {
        counts.Rechazadas.innerText = incidencias.filter(i => (i.estado || '').toLowerCase() === 'rechazada').length;
    }
}

/**
 * Genera de forma dinámica la plantilla de marcado HTML estructurada para representar 
 * una tarjeta de incidencia individual dentro del listado del administrador.
 * * - **Evaluación de Estados:** Clasifica el flujo de trabajo del reporte ('Pendiente', 'En Proceso', 
 * 'Resuelta', 'Rechazada') para asignar dinámicamente combinaciones específicas de bordes y etiquetas visuales (Badges).
 * - **Tratamiento Multimedia y Respaldo:** Normaliza la dirección de la evidencia fotográfica mapeando rutas 
 * absolutas y relativas sobre el servidor de archivos estáticos (`FILE_SERVER`), e inyecta un cargador de contingencia 
 * (`onerror`) con una imagen por defecto de Unsplash.
 * - **Lógica Condicional de Acciones:** * - *Casos Cerrados:* Bloquea la mutación ordinaria y despliega controles elásticos para reabrir el caso o, en su defecto, 
 * invocar componentes modales de revisión de soluciones (`abrirModalEditarSolucion`) escapando cadenas de texto de forma segura.
 * - *Casos Activos:* Renderiza un selector adaptativo (`<select>`) que detona mutaciones de estado directas hacia el servidor (`updateStatus`).
 * - **Saneamiento de Atributos:** Sanea y reemplaza las comillas simples y dobles de los textos descriptivos (`replace`) 
 * evitando roturas de sintaxis al inyectar cadenas complejas como argumentos directos en eventos inline (`onclick`).
 * * @param {object} inc - Entidad u objeto con los metadatos de la incidencia a procesar.
 * @returns {string} Estructura HTML parametrizada lista para su inserción en el DOM.
 */
function crearTarjetaIncidenciaHtml(inc) {

    let colorEstado = 'border-l-red-500';
    let badgeEstado = 'bg-red-500/20 text-red-400 border border-red-500/30';
    const esCasoCerrado = inc.estado === 'Resuelta' || inc.estado === 'Resuelto' || inc.estado === 'Rechazada';

    if (inc.estado === 'En Proceso') {
        colorEstado = 'border-l-amber-500';
        badgeEstado = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    } else if (inc.estado === 'Resuelta' || inc.estado === 'Resuelto') {
        colorEstado = 'border-l-green-500';
        badgeEstado = 'bg-green-500/20 text-green-400 border border-green-500/30';
    } else if (inc.estado === 'Rechazada') {
        colorEstado = 'border-l-slate-500';
        badgeEstado = 'bg-slate-500/20 text-slate-400 border border-slate-500/30';
    }

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

    let controlAccionHtml = '';
if (esCasoCerrado) {
    let botonVerSolucion = ''; 

    const estadoLimpio = inc.estado ? inc.estado.trim().toLowerCase() : '';

    if (estadoLimpio === 'resuelta' || estadoLimpio === 'resuelto') {
        const notaEscapada = inc.nota_cierre ? inc.nota_cierre.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '¡Reporte solucionado con éxito!';
        const fotoCierreSegura = inc.foto_cierre && inc.foto_cierre !== 'null' ? inc.foto_cierre : '';
        
        botonVerSolucion = `
            <button type="button" onclick="verEvidenciaCierre('${fotoCierreSegura}', '${notaEscapada}')" 
                    class="p-1 px-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded text-[9px] font-bold flex items-center gap-1 transition-all border border-emerald-500/20 cursor-pointer"
                    title="Ver la evidencia y nota de cierre del caso">
                <i class="ti ti-eye"></i> Ver Solución
            </button>
        `;
    }

    controlAccionHtml = `
        <div class="flex gap-1">
            ${botonVerSolucion}
            <button type="button" onclick="updateStatus('${inc.id}', 'En Proceso')" 
                    class="p-1 px-2 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded text-[9px] font-bold flex items-center gap-1 transition-all border border-amber-500/30 cursor-pointer"
                    title="Devolver incidencia a estado En Proceso">
                <i class="ti ti-arrow-back-up"></i> Reabrir Caso
            </button>
        </div>
    `;
} else {
        controlAccionHtml = `
            <select onchange="event.preventDefault(); event.stopPropagation(); updateStatus('${inc.id}', this.value, this); return false;" 
                    class="p-1 text-[10px] bg-slate-900 border border-slate-700 text-slate-300 rounded cursor-pointer outline-none font-medium focus:border-blue-500">
                <option value="Pendiente" ${inc.estado === 'Pendiente' ? 'selected' : ''}> Pendiente</option>
                <option value="En Proceso" ${inc.estado === 'En Proceso' ? 'selected' : ''}> En Proceso</option>
                <option value="Resuelta" ${(inc.estado === 'Resuelta' || inc.estado === 'Resuelto') ? 'selected' : ''}> Resuelta</option>
                <option value="Rechazada" ${inc.estado === 'Rechazada' ? 'selected' : ''}> Rechazada</option>
            </select>
        `;
    }

    const tituloEscapado = inc.titulo ? inc.titulo.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Incidencia';
    const descEscapada = inc.descripcion ? inc.descripcion.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
    const sectorEscapado = inc.sector ? inc.sector.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Desconocido';
    const nombreUsuarioEscapado = inc.vecino_nombre ? inc.vecino_nombre.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Vecino Anónimo';

    return `
        <div id="incidencia-row-${inc.id}" class="flex bg-slate-800 rounded-lg border border-slate-700 shadow-sm overflow-hidden border-l-4 ${colorEstado} transition-all duration-300">
            <div class="w-28 sm:w-36 h-auto min-h-[110px] bg-slate-900 flex-shrink-0">
                <img src="${urlFoto}" alt="Evidencia" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=150'">
            </div>
            <div class="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-start gap-2 mb-1">
                        <span class="text-[10px] uppercase font-bold tracking-tight bg-slate-700 text-slate-300 px-2 py-0.5 rounded">${inc.tipo_danio || 'Urbano'}</span>
                        <span class="text-[10px] font-semibold ${badgeEstado} px-2 py-0.5 rounded-full">${inc.estado}</span>
                    </div>
                    <p class="text-xs text-slate-300 line-clamp-2">${inc.descripcion}</p>
                </div>
                <div class="border-t border-slate-700 pt-2 mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span><i class="ti ti-map-pin"></i> ${inc.sector || 'Sector Desconocido'}</span>
                    
                    <div class="flex items-center gap-1.5">
                        <button onclick="abrirModalDetalleIncidencia('${inc.id}', '${tituloEscapado}', '${descEscapada}', '${urlFoto}', '${inc.estado}', '${sectorEscapado}', '${nombreUsuarioEscapado}', '${inc.latitud}', '${inc.longitud}', true)" 
                                class="p-1 px-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded text-[9px] font-bold flex items-center gap-1 transition-all border border-blue-500/30"
                                title="Ver todos los detalles de este reporte">
                            <i class="ti ti-eye"></i> Ver Detalle
                        </button>

                        ${controlAccionHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Construye y despliega dinámicamente una interfaz modal interactiva para visualizar las pruebas de cierre de una incidencia.
 * Evalúa y normaliza los argumentos de texto e imagen recibidos para mitigar valores nulos o indefinidos, aplicando una 
 * imagen por defecto o resolviendo la ruta absoluta a través del servidor de archivos estáticos. Estructura el contenedor 
 * visual utilizando componentes y clases de Tailwind CSS, inyecta la plantilla en el DOM y gestiona los eventos de interacción 
 * (botones de cierre y clics en el área exterior del contenedor) para asegurar la correcta remoción del elemento con una 
 * transición fluida de desvanecimiento.
 */
function verEvidenciaCierre(fotoCierre, notaCierre) {

    const notaMostrar = (notaCierre && notaCierre !== 'null' && notaCierre !== 'undefined') 
        ? notaCierre 
        : 'El reporte fue marcado como solucionado con éxito.';

    let urlFotoCierre = 'https://images.unsplash.com/photo-1584467541268-b040f83be3fd?w=500'; 
    if (fotoCierre && fotoCierre !== 'null' && fotoCierre !== 'undefined') {
        urlFotoCierre = fotoCierre.startsWith('http') ? fotoCierre : FILE_SERVER + fotoCierre;
    }

    const modal = document.createElement('div');
    modal.id = 'modalEvidenciaCierre';
    modal.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in";
    
    modal.innerHTML = `
        <div class="bg-slate-900 rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full border border-slate-800 flex flex-col transform scale-95 transition-all duration-200">
            
            <div class="p-4 border-b border-slate-800/60 flex justify-between items-center bg-slate-950/40">
                <div class="flex items-center gap-2 text-emerald-400">
                    <i class="ti ti-circle-check text-lg"></i>
                    <span class="font-bold text-xs uppercase tracking-wider">Evidencia de Solución</span>
                </div>
                <button id="btnCerrarEvidenciaX" class="w-6 h-6 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer">
                    <i class="ti ti-x text-xs"></i>
                </button>
            </div>
            
            <div class="w-full h-48 bg-slate-950 relative border-b border-slate-800/40">
                <img src="${urlFotoCierre}" alt="Trabajo Terminado" class="w-full h-full object-cover opacity-90">
                <div class="absolute bottom-2 right-2 bg-emerald-600 text-white font-bold text-[9px] px-2 py-0.5 rounded-full shadow-md shadow-emerald-950/50">
                    ¡Reparado!
                </div>
            </div>
            
            <div class="p-4 flex flex-col gap-1 bg-slate-950/20">
                <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Mensaje de la Cuadrilla / Sistema</span>
                <p class="text-xs text-slate-300 leading-relaxed italic">
                    "${notaMostrar}"
                </p>
            </div>
            
            <div class="p-3 border-t border-slate-800/60 bg-slate-950/40 flex justify-end">
                <button id="btnCerrarEvidenciaOk" class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all shadow-md border border-slate-700/40 cursor-pointer">
                    Cerrar Vista de Inspección
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const cerrarModal = () => {
        modal.classList.add('opacity-0'); 
        setTimeout(() => modal.remove(), 100);
    };

    document.getElementById('btnCerrarEvidenciaX').onclick = cerrarModal;
    document.getElementById('btnCerrarEvidenciaOk').onclick = cerrarModal;
    
    modal.onclick = (e) => {
        if (e.target === modal) cerrarModal();
    };
}

/**
 * Gestiona de forma asíncrona la mutación del estado operacional de una incidencia,
 * interceptando los flujos de finalización o despachando actualizaciones directas a la API.
 * * - **Intercepción de Cierre (Filtro Preventivo):** Evalúa si el nuevo estado implica la resolución, 
 * finalización o el rechazo del caso. En tal circunstancia, retiene temporalmente el flujo síncrono, 
 * almacena la referencia del elemento `<select>` de origen en el ámbito global (`window.selectStatusActual`) 
 * y despliega de forma condicional el formulario complementario de evidencias (`modalCierreIncidencia`).
 * - **Bifurcación Visual de Formularios:** Adaptará el comportamiento y las etiquetas del modal de cierre:
 * - *Rechazada:* Oculta el módulo de carga multimedia, remueve la obligatoriedad del input de archivo 
 * y reconfigura las etiquetas semánticas para exigir la justificación técnica del descarte.
 * - *Resuelta/Resuelto:* Adapta el título, blinda el formulario forzando la inyección obligatoria de un 
 * archivo fotográfico como evidencia física de la reparación y ajusta los estilos del botón de envío.
 * - **Mutación de Estado en Caliente (REST HTTP PUT):** Si la transición no requiere pasos complementarios 
 * (como el paso a 'En Proceso'), procesa una petición síncrona hacia el servidor.
 * - **Sincronización Reactiva de Caché y UI:** Una vez confirmada la respuesta en la API, muta el objeto 
 * referenciado en `BACKEND_INCIDENCIAS_CACHE`. Tras la actualización, detona el motor de filtros activos en 
 * pantalla (`ejecutarFiltradoActual`) o, en su defecto, actualiza en bloque las métricas visuales del dashboard.
 * - **Mecanismo Antifallos de Rollback:** En caso de interceptar un error de red o de validación, cancela 
 * los cambios locales, notifica al operador y reestablece de forma automática el valor del selector HTML (`selectElement`) 
 * al estado de persistencia inmediatamente anterior.
 * * @param {string|number} id - Identificador único de la incidencia.
 * @param {string} nuevoEstado - Estado de destino al que se desea transicionar el reporte ('Pendiente', 'En Proceso', 'Resuelta', 'Rechazada').
 * @param {HTMLSelectElement|null} [selectElement=null] - Referencia física del nodo del DOM que originó el cambio de estado.
 * @returns {Promise<boolean|void>} Retorna `false` de manera preventiva si se requiere la apertura del submodal de evidencias.
 */
async function updateStatus(id, nuevoEstado, selectElement = null) {

    if (nuevoEstado === 'Resuelta' || nuevoEstado === 'Resuelto' || nuevoEstado === 'Rechazada') {
        document.getElementById('cierreIncidenciaId').value = id;
        document.getElementById('cierreNuevoEstado').value = nuevoEstado;
        
        const tituloModal = document.getElementById('modalCierreTitulo');
        const lblNota = document.getElementById('lblCierreNota');
        const txtNota = document.getElementById('cierreNota');
        const divFoto = document.getElementById('contenedorFotoCierre');
        const inputFoto = document.getElementById('cierreFoto');
        const btnEnviar = document.getElementById('btnEnviarCierre');

        window.selectStatusActual = selectElement;

        if (nuevoEstado === 'Rechazada') {

            if (tituloModal) tituloModal.innerHTML = `<i class="ti ti-ban text-red-500"></i> Rechazar Incidencia`;
            if (lblNota) lblNota.textContent = 'Motivo del Rechazo (Obligatorio)';
            if (txtNota) txtNota.placeholder = 'Escribe detalladamente por qué se rechaza este reporte...';
            if (divFoto) divFoto.classList.add('hidden');
            if (inputFoto) inputFoto.removeAttribute('required');
            if (btnEnviar) {
                btnEnviar.classList.remove('bg-emerald-600');
                btnEnviar.classList.add('bg-red-600');
                btnEnviar.textContent = 'Confirmar Rechazo';
            }
        } else {

            if (tituloModal) tituloModal.innerHTML = `<i class="ti ti-checklist text-emerald-500"></i> Evidencia de Solución`;
            if (lblNota) lblNota.textContent = 'Nota Aclaratoria';
            if (txtNota) txtNota.placeholder = '';
            if (divFoto) divFoto.classList.remove('hidden');
            if (inputFoto) inputFoto.setAttribute('required', 'required');
            if (btnEnviar) {
                btnEnviar.classList.remove('bg-red-600');
                btnEnviar.classList.add('bg-emerald-600');
                btnEnviar.textContent = 'Cerrar Caso';
            }
        }
        
        document.getElementById('modalCierreIncidencia').classList.remove('hidden');
        return false;
    }

    try {
        const token = localStorage.getItem('token'); 
        const response = await fetch(`${API_BASE}/incidencias/${id}/estado`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ estado: nuevoEstado })
        });

        if (!response.ok) throw new Error('No se pudo actualizar el estado.');
        
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            background: '#0f172a', 
            color: '#f1f5f9',     
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            }
        });

        if (nuevoEstado === 'En Proceso') {
            Toast.fire({
                icon: 'info',
                title: `<span class="text-xs font-medium">Caso <b class="text-amber-400">#${id}</b> reabierto y enviado a revisión en el tablero.</span>`
            });
        } else {
            Toast.fire({
                icon: 'success',
                title: `<span class="text-xs font-medium">Incidencia <b class="text-emerald-400">#${id}</b> modificada con éxito a: <b>${nuevoEstado}</b></span>`
            });
        }
        
        const index = BACKEND_INCIDENCIAS_CACHE.findIndex(inc => String(inc.id) === String(id));
        if (index !== -1) {
            BACKEND_INCIDENCIAS_CACHE[index].estado = nuevoEstado;
            
            console.log("Actualizando renderizado respetando filtros activos...");

            if (typeof window.ejecutarFiltradoActual === 'function') {
                window.ejecutarFiltradoActual();
            } else {
                renderMetricsAndIncidencias(BACKEND_INCIDENCIAS_CACHE, BACKEND_INCIDENCIAS_CACHE);
            }

            if (typeof renderSectoresCriticos === 'function') {
                renderSectoresCriticos(BACKEND_INCIDENCIAS_CACHE);
            }

            if (typeof loadAuditLogs === 'function') {
                console.log("🔄 Refrescando logs de auditoría por reapertura...");
                loadAuditLogs(); 
            }
        }
    } catch (err) {
        displayAlert(err.message, 'error');

        if (selectElement && index !== -1) {
            selectElement.value = BACKEND_INCIDENCIAS_CACHE[index].estado;
        }
    }
}

/**
 * Procesa analíticamente el volumen de incidencias por zona geográfica y renderiza un listado 
 * de densidad en la interfaz de usuario para identificar los sectores más críticos.
 * * - **Agrupación y Frecuencia:** Itera sobre la colección de reportes (`incidencias`) para consolidar 
 * un mapa de frecuencias (`conteoSectores`), acumulando el total de quejas asociadas a cada sector identificado.
 * - **Renderizado de Densidad:** Extrae las claves del diccionario generado, iterando sobre ellas para construir 
 * dinámicamente elementos de lista (`<li>`) que exponen el nombre del sector y un contador con el volumen total de reportes.
 * - **Inyección Limpia en el DOM:** Consolida los fragmentos de maquetación en una sola cadena continua mediante `join('')` 
 * para actualizar el contenedor de destino (`sectorsDensityList`) en un único ciclo de reflow del navegador.
 * * @param {Array<object>} incidencias - Colección de registros georreferenciados del sistema utilizados para el conteo de densidad.
 */
function renderSectoresCriticos(incidencias) {
    const container = document.getElementById('sectorsDensityList');
    if (!container) return;
    
    const conteoSectores = {};
    
    incidencias.forEach(i => {

        const estadoClean = i.estado ? i.estado.toLowerCase().trim() : '';
        if (
            estadoClean.startsWith('resuelt') || 
            estadoClean.startsWith('rechazad') || 
            estadoClean === 'cancelada' || 
            estadoClean === 'cancelado'
        ) {
            return; 
        }

        if (i.sector) {
            conteoSectores[i.sector] = (conteoSectores[i.sector] || 0) + 1;
        }
    });

    const sectoresOrdenados = Object.keys(conteoSectores).sort((a, b) => conteoSectores[b] - conteoSectores[a]);

    if (sectoresOrdenados.length === 0) {
        container.innerHTML = `
            <li class="text-center py-4 text-xs text-slate-400 italic">
                ¡Felicidades! No hay incidencias activas en ningún sector.
            </li>
        `;
        return;
    }

    container.innerHTML = sectoresOrdenados.map(sector => `
        <li class="flex justify-between items-center py-2 border-b border-slate-800/40 text-slate-300 text-xs last:border-0">
            <span class="font-medium"> Sector ${sector}</span>
            <span class="bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full font-bold text-red-400 text-[10px]">
                ${conteoSectores[sector]} ${conteoSectores[sector] === 1 ? 'Reporte activo' : 'Reportes activos'}
            </span>
        </li>
    `).join('');
}

/**
 * Restablece y limpia los componentes de datos y visualización del cuadro de mando del administrador.
 * * - Vacía el búfer de persistencia en el cliente inicializando `BACKEND_INCIDENCIAS_CACHE` como un arreglo vacío.
 * - Despacha una colección sin registros hacia el componente central de renderizado (`renderMetricsAndIncidencias([])`) 
 * para blanquear los listados informativos y resetear a cero los contadores de las métricas globales (KPI).
 */
function clearDashboard() {
    BACKEND_INCIDENCIAS_CACHE = [];
    renderMetricsAndIncidencias([]);
}

/**
 * Inicializa e instrumenta el motor de filtrado reactivo multidimensional para la consulta 
 * y segmentación en tiempo real de las incidencias almacenadas en el búfer local.
 * * - **Validación de Componentes:** Verifica la presencia simultánea de los tres selectores de control 
 * en el DOM (categoría de daño, sector geográfico y estado operativo) para prevenir errores de referencia.
 * - **Algoritmo de Filtrado Avanzado (`filtrarCache`):** Extrae de forma defensiva los metadatos y atributos 
 * personalizados `data-nombre` de las opciones activas para evaluar iterativamente la matriz `BACKEND_INCIDENCIAS_CACHE`.
 * - **Evaluación Multicriterio de Registros:**
 * - *Filtro por Daño:* Compara de forma no estricta el tipo de daño indexado convirtiendo los campos a minúsculas.
 * - *Filtro por Sector:* Segmenta espacialmente las incidencias según la demarcación vecinal seleccionada.
 * - *Filtro Elástico de Estados:* Implementa un agrupador lógico para el término dinámico `'ACTIVAS'` (excluyendo 
 * casos resueltos, rechazados o cancelados) y unifica variaciones gramaticales de género para los cierres con éxito.
 * - **Sincronización Global de Eventos:** Vincula el disparador del algoritmo al evento `change` de cada selector de la interfaz 
 * y expone la rutina en el ámbito global (`window.ejecutarFiltradoActual`) para permitir actualizaciones forzadas desde módulos externos.
 * - **Renderizado Inicial:** Ejecuta un ciclo de filtrado preventivo inmediato al cargarse para renderizar la vista por defecto.
 */
function initFilterSystem() {
    const searchInput = document.getElementById('searchFilterInput');
    const sectorSelect = document.getElementById('sectorFilterSelect');
    const estadoSelect = document.getElementById('estadoFilterSelect');

    if (!searchInput || !sectorSelect || !estadoSelect) return;

    const filtrarCache = () => {
        const searchOption = searchInput.options[searchInput.selectedIndex];
        const query = searchOption ? (searchOption.getAttribute('data-nombre') || 'todos') : 'todos';
        const sectorOption = sectorSelect.options[sectorSelect.selectedIndex];
        const sectorSelected = sectorOption ? (sectorOption.getAttribute('data-nombre') || 'TODOS') : 'TODOS';
        const estadoSelected = estadoSelect.value;
        const listaAFiltrar = BACKEND_INCIDENCIAS_CACHE || [];
        const resultadoFiltrado = listaAFiltrar.filter(inc => {
        const descripcion = (inc.descripcion || '').toLowerCase();
        const tipoDanio = inc.tipo_danio ? inc.tipo_danio.toLowerCase() : '';
        const estadoIncidencia = (inc.estado || '').toLowerCase();
        const matchesSearch = query === 'todos' || tipoDanio.includes(query);
        const matchesSector = sectorSelected === 'TODOS' || inc.sector === sectorSelected;
            
            let matchesEstado = false;
            
            if (estadoSelected === 'ACTIVAS') {
                matchesEstado = estadoIncidencia !== 'resuelta' && 
                                estadoIncidencia !== 'resuelto' && 
                                estadoIncidencia !== 'rechazada' && 
                                estadoIncidencia !== 'cancelada';
            } else if (estadoSelected === 'TODOS') {
                matchesEstado = true;
            } else {
                const opcionElegida = estadoSelected.toLowerCase();

                if (opcionElegida === 'resuelto' || opcionElegida === 'resuelta') {
                    matchesEstado = (estadoIncidencia === 'resuelto' || estadoIncidencia === 'resuelta');
                } else {
                    matchesEstado = estadoIncidencia === opcionElegida;
                }
            }
            
            return matchesSearch && matchesSector && matchesEstado;
        });

        renderMetricsAndIncidencias(listaAFiltrar, resultadoFiltrado);
    };

    searchInput.addEventListener('change', filtrarCache);
    sectorSelect.addEventListener('change', filtrarCache);
    estadoSelect.addEventListener('change', filtrarCache);

    window.ejecutarFiltradoActual = filtrarCache;
    
    filtrarCache();
}

/**
 * Inicializa y gestiona el ciclo de vida del componente modal destinado al registro de nuevos 
 * perfiles con rango administrativo dentro de la plataforma.
 * * - **Control del Entorno de Capas (Modal):** Configura los escuchadores de eventos para alternar la 
 * visibilidad del contenedor (`modalRegAdmin`), habilitando el cierre interactivo mediante el botón de salida 
 * (`btnCerrarRegAdmin`) o por medio de clics sobre la capa de desenfoque de fondo (Backdrop).
 * - **Trazabilidad de Operaciones:** Intercepta de forma defensiva la sesión en `localStorage` (`user`) para 
 * extraer e indexar el ID único del administrador activo (`admin_operador_id`), garantizando que cada inserción 
 * cuente con una firma de auditoría vinculada a un operador responsable.
 * - **Procesamiento Asíncrono de Envío:** Captura el evento `submit` para consolidar el payload de datos (`bodyData`), 
 * forzando la conversión de tipos en el identificador del operador mediante `parseInt()`.
 * - **Consumo REST HTTP POST Autenticado:** Despacha la petición HTTP hacia el endpoint `/admin/usuarios` inyectando 
 * de forma obligatoria el token Bearer en las cabeceras de control.
 * - **Saneamiento y Contingencias:** Tras una respuesta exitosa, resetea de forma segura los campos del formulario 
 * (`form.reset()`), oculta la interfaz y canaliza cualquier fallo o excepción de red mediante ventanas de alerta controladas.
 */
function initRegistroAdminModal() {
    const modal = document.getElementById('modalRegAdmin');
    const form = document.getElementById('formRegistroAdmin');
    const btnCerrar = document.getElementById('btnCerrarRegAdmin');
    const btnAbrir = document.getElementById('btnAbrirRegAdmin'); 

    if (!modal || !form) return;

    if (btnAbrir) {
        btnAbrir.addEventListener('click', () => modal.classList.remove('hidden'));
    }

    if (btnCerrar) {
        btnCerrar.addEventListener('click', () => modal.classList.add('hidden'));
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nombre = document.getElementById('regAdminNombre').value;
        const correo = document.getElementById('regAdminCorreo').value;
        const password = document.getElementById('regAdminPassword').value;

        let adminOperadorId = null;
        const userRaw = localStorage.getItem('user'); 

        if (userRaw) {
            try {
                const userObj = JSON.parse(userRaw);
                adminOperadorId = userObj.id;
            } catch (err) {
                console.error("Error al procesar el usuario de la sesión:", err);
            }
        }

        if (!adminOperadorId) {
            Swal.fire({
                icon: 'error',
                title: '<span class="text-rose-400 font-bold text-sm">Sesión Expirada</span>',
                html: '<p class="text-xs text-slate-400">Inicia sesión nuevamente para continuar.</p>',
                background: '#0f172a',
                confirmButtonText: 'Entendido',
                customClass: { confirmButton: 'bg-slate-800 text-slate-200 text-xs px-4 py-2 rounded-lg' },
                buttonsStyling: false
            });
            return;
        }

        const bodyData = {
            nombre: nombre,
            correo: correo,
            password: password,
            admin_operador_id: parseInt(adminOperadorId)
        };

        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            background: '#0f172a',
            color: '#f1f5f9'
        });

        try {
            const token = localStorage.getItem('token'); 

            if (!token) throw new Error('No se encontró un token de sesión válido.');

            const response = await fetch(`${API_BASE}/admin/usuarios`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token 
                },
                body: JSON.stringify(bodyData)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Error en el registro.');

            Toast.fire({
                icon: 'success',
                title: `<span class="text-xs font-medium">¡Nuevo administrador <b class="text-emerald-400">${nombre}</b> registrado de forma segura!</span>`
            });

            form.reset(); 
            modal.classList.add('hidden');

            if (typeof loadAuditLogs === 'function') {
                console.log("Recargando historial de auditoría unificado...");
                loadAuditLogs(); 
            }
            if (typeof loadUsuariosMaster === 'function') {
                loadUsuariosMaster(vistaUsuariosActual);
            }

        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: '<span class="text-rose-400 font-bold text-sm">Error en Registro</span>',
                html: `<p class="text-xs text-slate-400">${error.message}</p>`,
                background: '#0f172a',
                confirmButtonText: 'Aceptar',
                customClass: { confirmButton: 'bg-slate-800 text-slate-200 text-xs px-4 py-2 rounded-lg' },
                buttonsStyling: false
            });
        }
    });
}

/**
 * Recupera de forma asíncrona las bitácoras de auditoría desde el servidor para registrar 
 * el historial de operaciones y renderizar la línea de tiempo en el panel técnico.
 * * - **Filtro de Entorno:** Comprueba de manera defensiva la existencia del contenedor de destino 
 * (`auditTimeline`) en el DOM antes de iniciar cualquier proceso de red.
 * - **Consumo RESTful Autenticado:** Realiza una petición HTTP GET al endpoint `/admin/auditoria` 
 * adjuntando el token de sesión guardado en `localStorage` en las cabeceras de control.
 * - **Sincronización de Persistencia Local:** Al validar una respuesta exitosa, almacena las trazas de 
 * auditoría en el búfer global `cacheLogsAuditoria` para mitigar la necesidad de re-consultas.
 * - **Inicialización y Pintado:** Detona de forma consecutiva los escuchadores de eventos para el filtrado 
 * de bitácoras (`initAuditFilterListeners`) y delega el renderizado visual de los nodos en la función 
 * especializada `renderizarTimelineAuditoria`.
 * - **Tratamiento Controlado de Fallos:** Captura excepciones físicas de red o denegaciones del servidor, 
 * registrando el diagnóstico en la consola e inyectando un contenedor visual de error con estilos de advertencia.
 */
async function loadAuditLogs() {
    
    const timeline = document.getElementById('auditTimeline');
    if (!timeline) return;

    try {
        const token = localStorage.getItem('token'); 
        const response = await fetch(`${API_BASE}/admin/auditoria`, {
            method: 'GET',
            headers: { 'Authorization': token }
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Error en el servidor");

        cacheLogsAuditoria = result.data || [];

        initAuditFilterListeners();
        renderizarTimelineAuditoria(cacheLogsAuditoria);

    } catch (error) {
        console.error(" Error en loadAuditLogs:", error);
        timeline.innerHTML = `<div class="text-center p-3 text-[11px] text-rose-500 font-medium"> No se pudo cargar la auditoría: ${error.message}</div>`;
    }
}

/**
 * Renderiza dinámicamente la línea de tiempo (timeline) de auditoría en el DOM.
 * * @param {Array<Object>} logs - Lista de registros de auditoría a procesar.
 * @param {string} [logs[].administrador_nombre] - Nombre del administrador que realizó la acción.
 * @param {string} [logs[].fecha_cambio] - Fecha del cambio (prioritaria).
 * @param {string} [logs[].creado_en] - Fecha de creación (alternativa).
 * @param {string} [logs[].incidencia_id] - ID de la incidencia afectada.
 * @param {string} [logs[].usuario_afectado_id] - ID del usuario afectado (alternativa si no hay incidencia).
 * @param {string} [logs[].accion] - Tipo de acción realizada (ej. 'CREAR_ADMIN', 'BAJA_USUARIO').
 * @param {string} [logs[].estado_anterior] - Estado previo del registro.
 * @param {string} [logs[].estado_nuevo] - Estado posterior al cambio.
 * @param {string} [logs[].tipo_danio] - Tipo de daño o categoría de la incidencia.
 * * @returns {void} No retorna ningún valor. Limpia el contenedor actual e inyecta 
 * los nuevos elementos HTML o un mensaje de vaciado si no hay datos.
 */
function renderizarTimelineAuditoria(logs) {
    const timeline = document.getElementById('auditTimeline');
    if (!timeline) return;
    
    timeline.innerHTML = ''; 

    if (!logs || logs.length === 0) {
        timeline.innerHTML = `<div class="text-center p-6 text-slate-500 italic text-[11px]">No hay registros que coincidan con los filtros.</div>`;
        return;
    }

    logs.forEach(log => {
        const item = document.createElement('div');
        item.className = "p-2.5 bg-slate-900 border border-slate-800/80 rounded-lg flex flex-col gap-1 hover:border-slate-700 transition-colors text-xs text-slate-100 mb-2";
        
        const nombreAdmin = log.administrador_nombre || 'Sistema (Revisa el SELECT del PHP)';
        const campoFecha = log.fecha_cambio || log.creado_en || 'Reciente';
        let fechaFormateada = campoFecha;
        
        if (campoFecha && campoFecha !== 'Reciente') {
            const fecha = new Date(campoFecha.replace(' ', 'T')); 
            fechaFormateada = fecha.toLocaleDateString('es-ES', { 
                day: '2-digit', 
                month: 'short', 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
        }

        const accionReal = (log.accion || log.estado_nuevo || '').toUpperCase();

        const idAfectado = log.incidencia_id || log.id || 'N/A';
        const labelRef = log.incidencia_id ? 'Incidencia:' : 'Log ID:';

        const ant = log.estado_anterior;
        const nvo = log.estado_nuevo;
        
        let tagAccion = '';
        let detalleTexto = '';

        if (accionReal === 'CREAR_ADMIN' || accionReal === 'ALTA_ADMIN') {
            tagAccion = `<span class="px-1.5 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 rounded text-[10px] font-bold uppercase">ALTA ADMIN</span>`;
 
            detalleTexto = `Registró un <strong class="text-emerald-400/90">${log.tipo_danio || 'nuevo perfil administrativo'}</strong> en el sistema.`;
        } 
        else if (accionReal === 'BAJA_USUARIO' || accionReal === 'ELIMINAR_USUARIO') {
            tagAccion = `<span class="px-1.5 py-0.5 bg-rose-950/40 text-rose-400 border border-rose-900/30 rounded text-[10px] font-bold uppercase">BAJA VECINO</span>`;
            detalleTexto = `Removió las credenciales de acceso de un usuario.`;
        }
        else if ((ant === 'Resuelta' || ant === 'Resuelto' || ant === 'Rechazada') && nvo === 'En Proceso') {
            tagAccion = `<span class="px-1.5 py-0.5 bg-amber-950/40 text-amber-400 border border-amber-900/40 rounded text-[10px] font-bold uppercase">REAPERTURA</span>`;
            detalleTexto = `Reabrió el caso de <strong class="text-amber-300/90">${log.tipo_danio || 'Incidencia'}</strong> para reevaluación.`;
        } 
        else if (nvo === 'Resuelta' || nvo === 'Resuelto') {
            tagAccion = `<span class="px-1.5 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold uppercase shadow-sm">RESOLUCIÓN</span>`;
            detalleTexto = `Solucionó exitosamente el reporte de <strong class="text-emerald-400/90">${log.tipo_danio || 'Incidencia'}</strong>.`;
        } 
        else if (nvo === 'Rechazada') {
            tagAccion = `<span class="px-1.5 py-0.5 bg-slate-950 text-slate-400 border border-slate-800 rounded text-[10px] font-bold uppercase">RECHAZADA</span>`;
            detalleTexto = `Desestimó el reporte de <strong class="text-slate-300">${log.tipo_danio || 'Incidencia'}</strong>.`;
        } 
        else {
            tagAccion = `<span class="px-1.5 py-0.5 bg-blue-950/40 text-blue-400 border border-blue-900/40 rounded text-[10px] font-bold uppercase">${accionReal || 'ACCION'}</span>`;
            detalleTexto = ant && nvo 
                ? `Cambió el estado del caso de <span class="text-slate-400">'${ant}'</span> a <span class="text-slate-300">'${nvo}'</span>.`
                : `Realizó una actualización general en el registro del sistema.`;
        }

        item.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-slate-200">${nombreAdmin}</span>
                <span class="text-[10px] text-slate-500 font-mono">${fechaFormateada}</span>
            </div>
            <div class="text-slate-400 text-[11px] flex flex-col gap-0.5 mt-0.5">
                <p class="text-slate-400/90 italic mb-0.5">${detalleTexto}</p>
                <div class="flex items-center gap-2 flex-wrap pt-0.5">
                    ${tagAccion}
                    <span class="text-slate-500">${labelRef} <strong class="font-mono text-slate-300">#${idAfectado}</strong></span>
                </div>
            </div>
        `;
        timeline.appendChild(item);
    });
}

/**
 * Inicializa los escuchadores de eventos (listeners) para los filtros de la sección de auditoría.
 * * Vincula los cambios en los inputs de administrador (evento input) y fecha (evento change) 
 * con la función de filtrado, y configura el botón de limpieza para restablecer los valores 
 * y repoblar el timeline con los datos originales almacenados en caché.
 * * @global {Function} ejecutarFiltradoAuditoria - Función que procesa y aplica los filtros activos.
 * @global {Function} renderizarTimelineAuditoria - Función que dibuja los elementos en el DOM.
 * @global {Array<Object>} cacheLogsAuditoria - Arreglo global con la totalidad de los registros de auditoría.
 * @returns {void} No retorna valor. Finaliza prematuramente si los inputs principales no existen en el DOM.
 */
function initAuditFilterListeners() {
    const inputAdmin = document.getElementById('filterAuditAdmin');
    const inputFecha = document.getElementById('filterAuditFecha');
    const btnLimpiar = document.getElementById('btnClearAuditFilters');

    if (!inputAdmin || !inputFecha) return;

    inputAdmin.oninput = ejecutarFiltradoAuditoria;
    inputFecha.onchange = ejecutarFiltradoAuditoria;
    
    if (btnLimpiar) {
        btnLimpiar.onclick = () => {
            inputAdmin.value = '';
            inputFecha.value = '';
            
            if (typeof cacheLogsAuditoria !== 'undefined' && cacheLogsAuditoria.length > 0) {
                renderizarTimelineAuditoria(cacheLogsAuditoria);
            } else if (typeof loadLogsAuditoria === 'function') {

                loadLogsAuditoria();
            }
        };
    }
}

/**
 * Filtra en memoria el historial de auditoría almacenado en caché basándose en criterios de operador y fecha.
 * Comprueba de forma preventiva la existencia y validez de la colección de datos en caché local antes de proceder.
 * Recupera los valores de los elementos de entrada del DOM de manera segura y evalúa cada registro del historial:
 * valida que el nombre del administrador coincida parcialmente mediante comparaciones en minúsculas y normaliza la
 * marca de tiempo del evento para contrastar únicamente el componente de fecha (año-mes-día). Finalmente, delega 
 * la colección depurada de registros a la función encargada de actualizar y renderizar el componente de la línea de tiempo.
 */
function ejecutarFiltradoAuditoria() {
    if (typeof cacheLogsAuditoria === 'undefined' || !cacheLogsAuditoria || cacheLogsAuditoria.length === 0) {
        console.warn("Alerta: La caché 'cacheLogsAuditoria' está vacía o no existe.");
        return;
    }

    const queryAdmin = document.getElementById('filterAuditAdmin')?.value.trim().toLowerCase() || '';
    const queryFecha = document.getElementById('filterAuditFecha')?.value || ''; 

    const logsFiltrados = cacheLogsAuditoria.filter((log, index) => {
        const nombreAdmin = log.usuario_nombre ? log.usuario_nombre.toLowerCase() : '';
        const cumpleAdmin = queryAdmin === '' || nombreAdmin.includes(queryAdmin);

        let cumpleFecha = true;
        
        if (queryFecha !== '') {
            if (log.created_at) {
                const fechaLimpiaEstandar = log.created_at.replace('T', ' '); 
                const fechaLogSoloDia = fechaLimpiaEstandar.substring(0, 10);

                cumpleFecha = (fechaLogSoloDia === queryFecha);
            } else {
                cumpleFecha = false;
            }
        }

        return cumpleAdmin && cumpleFecha;
    });

    if (typeof renderizarTimelineAuditoria === 'function') {
        renderizarTimelineAuditoria(logsFiltrados);
    }
}

/**
 * Ejecuta el proceso de filtrado sobre los registros de auditoría en caché y actualiza la vista.
 * * Obtiene los criterios de búsqueda (nombre del administrador y fecha) directamente desde el DOM,
 * evalúa cada registro guardado en la caché global y renderiza únicamente aquellos que 
 * coinciden simultáneamente con ambos filtros.
 * * @global {Array<Object>} cacheLogsAuditoria - Arreglo global que contiene todos los registros originales.
 * @global {Function} renderizarTimelineAuditoria - Función encargada de actualizar el componente visual en el DOM.
 * @returns {void} No retorna ningún valor.
 */
function ejecutarFiltradoAuditoria() {
    if (typeof cacheLogsAuditoria === 'undefined' || !cacheLogsAuditoria || cacheLogsAuditoria.length === 0) {
        console.warn("La caché de auditoría está vacía o no definida.");
        return;
    }

    const queryAdmin = document.getElementById('filterAuditAdmin')?.value.trim().toLowerCase() || '';
    const queryFecha = document.getElementById('filterAuditFecha')?.value || ''; 
    const logsFiltrados = cacheLogsAuditoria.filter(log => {
        
        const nombreAdmin = log.administrador_nombre ? log.administrador_nombre.toLowerCase() : '';
        const cumpleAdmin = queryAdmin === '' || nombreAdmin.includes(queryAdmin);

        let cumpleFecha = true;
        
        if (queryFecha !== '') {
            if (log.fecha_cambio) {

                const fechaLogSoloDia = log.fecha_cambio.substring(0, 10);

                cumpleFecha = (fechaLogSoloDia === queryFecha);
            } else {
                cumpleFecha = false; 
            }
        }

        return cumpleAdmin && cumpleFecha;
    });

    if (typeof renderizarTimelineAuditoria === 'function') {
        renderizarTimelineAuditoria(logsFiltrados);
    }
}

/**
 * Inicializa y configura los controladores de eventos para el módulo de reportes administrativos y filtros de fecha.
 * * Esta función centraliza la lógica del panel de administración para:
 * 1. Gestionar los rangos de filtrado por fechas (Hoy, Mes Actual, Año Actual) y actualizar el Dashboard.
 * 2. Controlar la apertura, cierre, geolocalización automática y restablecimiento del modal de creación de incidencias.
 * 3. Enlazar la funcionalidad de exportación a archivos Excel.
 * 4. Procesar el envío asíncrono del formulario (FormData con soporte multimedia) hacia la API REST,
 * adjuntando credenciales de sesión obtenidas de LocalStorage.
 * * @global {Function} [loadAdminDashboard] - Recarga las métricas y componentes del panel administrativo.
 * @global {Function} [loadIncidencias] - Recarga de contingencia para el listado general de incidencias.
 * @global {Function} [capturarUbicacion] - Dispara la API de geolocalización para rellenar coordenadas en el modal.
 * @global {Function} exportarReporte - Procesa la descarga del reporte consolidado en formato de hoja de cálculo.
 * @global {string} API_BASE - URL base global de los endpoints del backend.
 * * @async
 * @returns {void} No retorna ningún valor. Finaliza prematuramente si no se encuentran los elementos críticos del modal en el DOM.
 */
function initReporteAdminModal() {
    const modal = document.getElementById('modalReporteAdmin');
    const btnAbrir = document.getElementById('btnAbrirReporteAdmin');
    const btnCerrar = document.getElementById('btnCerrarReporteAdmin');
    const btnCancelar = document.getElementById('btnCancelarReporteAdmin');
    const form = document.getElementById('formReporteAdmin');
    const btnExportarExcel = document.getElementById('btnExportarExcel');
    const btnLimpiar = document.getElementById('btnLimpiarFiltros');
    const inputDesde = document.getElementById('filtroFechaInicio');
    const inputHasta = document.getElementById('filtroFechaFin');
    const inputCamara = document.getElementById('adminIncFotoCamara');
    const inputArchivo = document.getElementById('adminIncFotoArchivo');
    const vistaPrevia = document.getElementById('adminVistaPreviaNombre');

    if (inputDesde && inputHasta) {
        inputDesde.onchange = () => { if (typeof loadAdminDashboard === 'function') loadAdminDashboard(); };
        inputHasta.onchange = () => { if (typeof loadAdminDashboard === 'function') loadAdminDashboard(); };
    }

    const formatearFecha = (date) => date.toISOString().split('T')[0];
    
    const btnHoy = document.getElementById('btnFiltroHoy');
    if (btnHoy) {
        btnHoy.onclick = () => {
            const hoy = formatearFecha(new Date());
            if (inputDesde) inputDesde.value = hoy;
            if (inputHasta) inputHasta.value = hoy;
            if (typeof loadAdminDashboard === 'function') loadAdminDashboard();
        };
    }

    const btnMes = document.getElementById('btnFiltroMes');
    if (btnMes) {
        btnMes.onclick = () => {
            const ahora = new Date();
            const primero = formatearFecha(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
            const ultimo = formatearFecha(new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0));
            if (inputDesde) inputDesde.value = primero;
            if (inputHasta) inputHasta.value = ultimo;
            if (typeof loadAdminDashboard === 'function') loadAdminDashboard();
        };
    }

    const btnAno = document.getElementById('btnFiltroAno');
    if (btnAno) {
        btnAno.onclick = () => {
            const ano = new Date().getFullYear();
            if (inputDesde) inputDesde.value = `${ano}-01-01`;
            if (inputHasta) inputHasta.value = `${ano}-12-31`;
            if (typeof loadAdminDashboard === 'function') loadAdminDashboard();
        };
    }

    if (!modal || !btnAbrir || !form) return;

    if (btnLimpiar && inputDesde && inputHasta) {
        btnLimpiar.onclick = () => {
            inputDesde.value = ''; 
            inputHasta.value = ''; 
            if (typeof loadAdminDashboard === 'function') loadAdminDashboard();
        };
    }

    btnAbrir.onclick = () => {
        modal.classList.remove('hidden');
        if (typeof capturarUbicacion === 'function') {
            capturarUbicacion({
                boxId: 'adminGeoStatusBox',
                titleId: 'adminGeoTitle',
                coordsId: 'adminGeoCoords',
                btnSubmitId: 'btnReportarAdminSubmit',
                latInputId: 'adminIncLatitud',
                lngInputId: 'adminIncLongitud'
            });
        }
    };
    
    const cerrarModal = () => {
        form.reset();
        if (vistaPrevia) vistaPrevia.classList.add('hidden');
        modal.classList.add('hidden');
    };

    if (btnCerrar) btnCerrar.onclick = cerrarModal;
    if (btnCancelar) btnCancelar.onclick = cerrarModal;

    if (btnExportarExcel) {
        btnExportarExcel.onclick = exportarReporte;
    }

    const manejarCambioFoto = (input) => {
        if (input && input.files.length > 0 && vistaPrevia) {
            vistaPrevia.textContent = `Seleccionado: ${input.files[0].name}`;
            vistaPrevia.classList.remove('hidden');
        }
    };

    if (inputCamara) inputCamara.onchange = () => manejarCambioFoto(inputCamara);
    if (inputArchivo) inputArchivo.onchange = () => manejarCambioFoto(inputArchivo);

    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const swalConfig = {
            background: '#1e293b', 
            color: '#f8fafc',      
            confirmButtonColor: '#10b981', 
            cancelButtonColor: '#64748b'   
        };

        const btnSubmit = document.getElementById('btnReportarAdminSubmit');
        if (btnSubmit) {
            if (btnSubmit.disabled) return; 
            btnSubmit.disabled = true; 
        }

        let usuarioId = null;
        const userRaw = localStorage.getItem('user');
        if (userRaw) {
            try {
                usuarioId = JSON.parse(userRaw).id;
            } catch (err) {
                console.error("Error al decodificar sesión:", err);
            }
        }

        if (!usuarioId) {
            Swal.fire({
                ...swalConfig,
                icon: 'error',
                title: 'Error de sesión',
                text: 'No se pudo verificar tu credencial de Administrador. Por favor reingresa al sistema.'
            });
            if (btnSubmit) btnSubmit.disabled = false; 
            return;
        }

        const selectSector = document.getElementById('adminRepoSector');
        const selectDanio = document.getElementById('adminRepoDanio');
        const txtDescripcion = document.getElementById('adminRepoDescripcion');
        
        let archivoFoto = null;
        if (inputCamara && inputCamara.files.length > 0) {
            archivoFoto = inputCamara.files[0];
        } else if (inputArchivo && inputArchivo.files.length > 0) {
            archivoFoto = inputArchivo.files[0];
        }   
        
        const latReal = document.getElementById('adminIncLatitud')?.value || '0';
        const lngReal = document.getElementById('adminIncLongitud')?.value || '0';
        
        if (!txtDescripcion || txtDescripcion.value.trim() === '') {
            Swal.fire({
                ...swalConfig,
                icon: 'warning',
                title: 'Campo requerido',
                text: 'Por favor, escribe una descripción de la incidencia.'
            });
            if (btnSubmit) btnSubmit.disabled = false;
            return;
        }

        if (!archivoFoto) {
            Swal.fire({
                ...swalConfig,
                icon: 'warning',
                title: 'Falta la fotografía',
                text: 'Es mandatorio adjuntar una evidencia fotográfica de la incidencia.'
            });
            if (btnSubmit) btnSubmit.disabled = false;
            return;
        }

        const fData = new FormData();

        if (selectSector && selectSector.value) {
            fData.append('sector_id', parseInt(selectSector.value));
        }
        if (selectDanio && selectDanio.value) {
            fData.append('tipo_danio_id', parseInt(selectDanio.value));
        }
        
        fData.append('descripcion', txtDescripcion.value.trim());
        fData.append('latitud', latReal);
        fData.append('longitud', lngReal);
        fData.append('usuario_id', parseInt(usuarioId));
        fData.append('foto_archivo', archivoFoto);
        
        console.log("Enviando mapeo directo compatible con Slim (Panel Admin)...");

        Swal.fire({
            ...swalConfig,
            title: 'Subiendo reporte administrativo...',
            text: 'Guardando los datos en la base de datos central.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE}/incidencias`, {
                method: 'POST',
                headers: { 
                    'Authorization': token
                },
                body: fData
            });

            const result = await response.json();

            if (!response.ok) throw new Error(result.message || 'Error en el procesamiento del servidor.');

            Swal.fire({
                ...swalConfig,
                icon: 'success',
                title: '¡Reporte Creado!',
                text: 'Incidencia guardada correctamente desde el panel administrativo.',
                timer: 2000,
                showConfirmButton: false
            });

            cerrarModal();

            if (typeof loadAdminDashboard === 'function') {
                loadAdminDashboard();
            } else if (typeof loadIncidencias === 'function') {
                loadIncidencias();
            }

        } catch (error) {
            Swal.fire({
                ...swalConfig,
                icon: 'error',
                title: 'Error 400',
                text: error.message
            });
        } finally {
            if (btnSubmit) btnSubmit.disabled = false;
        }
    };
}

/**
 * Exporta el reporte consolidado de incidencias en formato Excel (.xlsx) desde el servidor.
 * * Envía una solicitud GET autenticada a la API de administración para obtener un flujo binario (Blob).
 * Tras recibir la respuesta exitosa, genera un enlace temporal de descarga en el DOM, simula el 
 * clic del usuario para forzar la bajada del archivo y realiza la limpieza de los recursos en memoria.
 * * @global {string} API_BASE - URL base global de los endpoints del backend.
 * * @async
 * @returns {Promise<void>} No retorna ningún valor de manera directa.
 * @throws {Error} Si el token no es válido, si falla la respuesta de la API o si ocurren problemas de red.
 */
async function exportarReporte() {

    Swal.fire({
        background: '#0f172a',
        color: '#f1f5f9',
        title: 'Generando Reporte...',
        text: 'Compilando el Excel con los filtros aplicados en pantalla.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('No se encontró un token de sesión válido.');

        const filterDano   = document.getElementById('searchFilterInput')?.value || 'TODOS';
        const filterSector = document.getElementById('sectorFilterSelect')?.value || 'TODOS';
        const filterEstado = document.getElementById('estadoFilterSelect')?.value || 'ACTIVAS';
        const inputDesde   = document.getElementById('filtroFechaInicio');
        const inputHasta   = document.getElementById('filtroFechaFin');
        
        const desde = inputDesde ? inputDesde.value : '';
        const hasta = inputHasta ? inputHasta.value : '';
        const params = new URLSearchParams();

        if (filterDano !== 'TODOS')     params.append('tipo_danio', filterDano);
        if (filterSector !== 'TODOS')   params.append('sector', filterSector);
        if (filterEstado !== 'TODOS')   params.append('estado', filterEstado); 
        if (desde)                      params.append('desde', desde);
        if (hasta)                      params.append('hasta', hasta);

        const queryStr = params.toString();
        const urlServidor = queryStr ? `${API_BASE}/admin/exportar?${queryStr}` : `${API_BASE}/admin/exportar`;

        const response = await fetch(urlServidor, { 
            method: 'GET', 
            headers: { 'Authorization': token }
        });

        if (!response.ok) {
            const errorResult = await response.json().catch(() => ({}));
            throw new Error(errorResult.message || 'Error al procesar el archivo en el servidor.');
        }

        const blob = await response.blob();
        const urlDescarga = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlDescarga;
        
        let nombreArchivo = 'Reporte_Incidencias_General.xls';
        if (desde && hasta) {
            nombreArchivo = `Reporte_Incidencias_${desde}_al_${hasta}.xls`;
        } else if (filterDano !== 'TODOS' || filterSector !== 'TODOS') {
            nombreArchivo = `Reporte_Segmentado_${filterDano}_${filterSector}.xls`.replace(/[^a-zA-Z0-0_.-]/g, '_');
        }

        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();

        a.remove();
        window.URL.revokeObjectURL(urlDescarga);

        Swal.close();

    } catch (error) {
        console.error('Error crítico al exportar incidencias:', error);
        
        Swal.fire({
            icon: 'error',
            background: '#0f172a',
            color: '#f1f5f9',
            title: '<span class="text-rose-400 font-bold text-sm">Error en Exportación</span>',
            html: `<p class="text-xs text-slate-400">${error.message}</p>`,
            confirmButtonText: 'Aceptar',
            customClass: { confirmButton: 'bg-slate-800 text-slate-200 text-xs px-4 py-2 rounded-lg' },
            buttonsStyling: false
        });
    }
}


async function loadUsuariosMaster(tipo = 'activos') {
    const tbody = document.getElementById('tablaUsuariosMasterBody');
    if (!tbody) return;

    const btnActivos = document.getElementById('btnTabActivos');
    const btnEliminados = document.getElementById('btnTabEliminados');

    if (btnActivos && btnEliminados) {
        if (tipo === 'activos') {

            btnActivos.className = "px-4 py-1.5 bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 rounded-md text-xs font-bold shadow-md shadow-emerald-950/50 transition-all duration-300 focus:outline-none cursor-pointer";

            btnEliminados.className = "px-4 py-1.5 text-slate-500 hover:text-slate-300 rounded-md text-xs font-medium transition-all duration-200 focus:outline-none cursor-pointer";
        } else {
            btnEliminados.className = "px-4 py-1.5 bg-rose-950/40 text-rose-400 border border-rose-500/30 rounded-md text-xs font-bold shadow-md shadow-rose-950/50 transition-all duration-300 focus:outline-none cursor-pointer";

            btnActivos.className = "px-4 py-1.5 text-slate-500 hover:text-slate-300 rounded-md text-xs font-medium transition-all duration-200 focus:outline-none cursor-pointer";
        }
    }

    vistaUsuariosActual = tipo; 

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/admin/usuarios-lista?tipo=${tipo}`, {
            method: 'GET',
            headers: { 'Authorization': token }
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        cacheUsuariosMaster = result.data || [];
        renderizarTablaUsuarios(cacheUsuariosMaster);

    } catch (error) {
        console.error("Error CRUD Usuarios:", error);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-rose-400 bg-slate-950/20 italic font-medium">❌ Error al cargar listado: ${error.message}</td></tr>`;
    }
}

/**
 * Solicita y carga de forma asíncrona el listado de usuarios desde el servidor según su estado.
 * * Realiza una petición GET autenticada a la API de administración parametrizando el tipo de usuario,
 * almacena el resultado en una estructura de caché global para optimizar operaciones posteriores
 * y delega la construcción visual de las filas a la función encargada del renderizado de la tabla.
 * Si ocurre un error de red o de permisos, inyecta un mensaje de alerta directamente en el DOM.
 * * @global {string} API_BASE - URL base global de los endpoints del backend.
 * @global {string} vistaUsuariosActual - Variable de estado global que rastrea el filtro activo (ej. 'activos', 'dados_baja').
 * @global {Array<Object>} cacheUsuariosMaster - Arreglo global donde se respaldan los objetos de usuario descargados.
 * @global {Function} renderizarTablaUsuarios - Función encargada de iterar los datos e inyectar el HTML en la tabla.
 * * @async
 * @param {string} [tipo='activos'] - Criterio de filtrado para la consulta en el servidor (ej. 'activos', 'inactivos', 'todos').
 * @returns {Promise<void>} No retorna ningún valor de manera directa.
 */
function renderizarTablaUsuarios(usuarios) {
    const tbody = document.getElementById('tablaUsuariosMasterBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    if (usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-slate-500 italic bg-slate-950/20">No hay usuarios en esta categoría.</td></tr>`;
        return;
    }

    usuarios.forEach(user => {
        const fila = document.createElement('tr');
        fila.className = "hover:bg-slate-900/60 odd:bg-slate-900/20 transition-colors duration-150 text-xs text-slate-300 border-b border-slate-800/50 group";

        let tagRol = '';
        
        if (vistaUsuariosActual === 'activos') {

            tagRol = user.rol_id == 1 
                ? `<span class="px-2 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 rounded-md font-bold text-[10px] tracking-wide">ADMIN</span>`
                : `<span class="px-2 py-0.5 bg-slate-950 text-slate-400 border border-slate-800 rounded-md font-bold text-[10px] tracking-wide">VECINO</span>`;
        } else {
            tagRol = user.rol_id == 1
                ? `<span class="px-2 py-0.5 bg-rose-950/30 text-rose-400 border border-rose-900/40 rounded-md font-bold text-[10px] tracking-wide">ADMIN INACTIVO</span>`
                : `<span class="px-2 py-0.5 bg-rose-950/20 text-rose-500/80 border border-rose-900/20 rounded-md font-bold text-[10px] tracking-wide">VECINO DE BAJA</span>`;
        }
            
        let botonesAccion = '';
        
        if (vistaUsuariosActual === 'activos') {
            botonesAccion = `
                <button onclick="abrirModalEditarUsuario('${user.id}')" 
                        class="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-950/50 border border-transparent hover:border-blue-900/30 rounded transition-all cursor-pointer" 
                        title="Editar Cuenta">
                    <i class="ti ti-edit text-base"></i>
                </button>
                <button onclick="eliminarUsuarioId('${user.id}')" 
                        class="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 border border-transparent hover:border-rose-900/30 rounded transition-all cursor-pointer" 
                        title="Dar de Baja">
                    <i class="ti ti-trash text-base"></i>
                </button>
            `;
        } else {

            botonesAccion = `
                <button onclick="reactivarUsuarioId('${user.id}')" 
                        class="p-1 px-2.5 bg-emerald-950/50 text-emerald-400 hover:text-emerald-300 border border-emerald-900/40 hover:bg-emerald-900/40 rounded-md font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer" 
                        title="Reactivar Cuenta">
                    <i class="ti ti-refresh text-xs"></i> Reactivar
                </button>
            `;
        }

        const claseId = vistaUsuariosActual === 'activos' ? 'text-slate-500' : 'text-slate-600/70 line-through';
        const claseNombre = vistaUsuariosActual === 'activos' ? 'text-slate-200' : 'text-slate-400/80 italic';

        fila.innerHTML = `
            <td class="p-3 font-mono ${claseId} group-hover:text-slate-400 transition-colors">#${user.id}</td>
            <td class="p-3 font-medium ${claseNombre}">${user.nombre}</td>
            <td class="p-3 font-mono text-slate-500">${user.correo}</td>
            <td class="p-3">${tagRol}</td>
            <td class="p-3 flex items-center justify-center gap-1">${botonesAccion}</td>
        `;
        tbody.appendChild(fila);
    });
}

/**
 * Reactiva de forma asíncrona la cuenta de un usuario previamente suspendido o dado de baja.
 * * Envía una solicitud POST autenticada a la API de administración utilizando el identificador 
 * único del usuario. Si la operación es exitosa en el servidor, notifica el resultado mediante 
 * una alerta visual y fuerza la recarga automática del listado de la papelera ('eliminados') 
 * para refrescar y sincronizar la interfaz del módulo de gestión.
 * * @global {string} API_BASE - URL base global de los endpoints del backend.
 * @global {Function} loadUsuariosMaster - Función encargada de consultar y renderizar el listado de usuarios por tipo.
 * * @async
 * @param {number|string} id - Identificador único del usuario que se desea reactivar en el sistema.
 * @returns {Promise<void>} No retorna ningún valor de manera directa.
 * @throws {Error} Si el token expira, la petición falla o el servidor devuelve un estado de error HTTP.
 */
async function reactivarUsuarioId(id) {
    const resultadoConfirmacion = await Swal.fire({
        title: '¿Reactivar usuario?',
        text: `El usuario recuperará el acceso completo al sistema de inmediato.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981', 
        cancelButtonColor: '#475569', 
        confirmButtonText: 'Sí, reactivar',
        cancelButtonText: 'Cancelar',
        background: '#0f172a',
        color: '#f8fafc'
    });

    if (!resultadoConfirmacion.isConfirmed) return;

    Swal.fire({
        background: '#0f172a',
        color: '#f8fafc',
        title: 'Restaurando cuenta...',
        text: 'Comunicándose con el servidor central.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/admin/usuarios/${id}/reactivar`, {
            method: 'POST',
            headers: { 'Authorization': token }
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        Swal.fire({
            icon: 'success',
            title: '¡Cuenta Reactivada!',
            text: result.message || 'El usuario ha sido restaurado con éxito.',
            timer: 1500,
            showConfirmButton: false,
            background: '#0f172a',
            color: '#f8fafc'
        });

        loadUsuariosMaster('eliminados'); 

    } catch (error) {

        Swal.fire({
            icon: 'error',
            title: 'Error al reactivar',
            text: error.message || 'No se pudo procesar la solicitud en el servidor.',
            confirmButtonColor: '#3b82f6',
            background: '#0f172a',
            color: '#f8fafc'
        });
    }
}

/**
 * Abre el modal de edición de usuario y precarga el formulario con sus datos actuales.
 * * Busca el objeto del usuario correspondiente dentro de la caché global utilizando el 
 * identificador provisto. Si el registro existe, inyecta sus propiedades (ID, nombre, 
 * correo electrónico y rol) en los campos de entrada del formulario del DOM y remueve 
 * la clase CSS de ocultamiento para hacer visible la ventana modal.
 * * @global {Array<Object>} cacheUsuariosMaster - Arreglo global con la lista de usuarios respaldados en memoria.
 * * @param {number|string} id - Identificador único del usuario cuyos datos se van a editar.
 * @returns {void} No retorna ningún valor. Finaliza prematuramente si no se localiza al usuario en la caché.
 */
function abrirModalEditarUsuario(id) {
    const usuario = cacheUsuariosMaster.find(u => u.id == id);
    if (!usuario) return;

    document.getElementById('editUserId').value = usuario.id;
    document.getElementById('editUserNombre').value = usuario.nombre;
    document.getElementById('editUserCorreo').value = usuario.correo;
    document.getElementById('editUserRol').value = usuario.rol_id;

    document.getElementById('modalEditarUsuario').classList.remove('hidden');
}

/**
 * Cierra la ventana modal de edición de usuario y restablece los campos del formulario.
 * * Limpia todos los valores y estados ingresados en los campos de entrada de datos del 
 * formulario correspondiente en el DOM y, posteriormente, oculta el contenedor de la 
 * ventana modal aplicando la clase CSS de ocultamiento.
 * * @returns {void} No retorna ningún valor.
 */
function cerrarModalEditarUsuario() {
    document.getElementById('formEditarUsuario').reset();
    document.getElementById('modalEditarUsuario').classList.add('hidden');
}

/**
 * Controlador de eventos asíncrono para procesar el envío del formulario de edición de usuario.
 * * Intercepta el comportamiento por defecto del evento 'submit', extrae los valores actualizados 
 * de los campos del formulario (nombre, correo y rol) y los envía serializados en formato JSON 
 * mediante una petición PUT autenticada hacia la API de administración.
 * * Tras una respuesta exitosa, muestra una confirmación visual, cierra el modal de edición 
 * y refresca el listado general de usuarios invocando la recarga desde el servidor.
 * * @global {string} API_BASE - URL base global de los endpoints del backend.
 * @global {Function} cerrarModalEditarUsuario - Función encargada de limpiar y ocultar el modal de edición.
 * @global {Function} loadUsuariosMaster - Función encargada de volver a consultar y renderizar el listado de usuarios.
 * * @async
 * @param {Event} e - Objeto del evento nativo de envío del formulario (submit).
 * @returns {Promise<void>} No retorna ningún valor de manera directa.
 * @throws {Error} Si el servidor responde con un estado de error HTTP o si falla la conexión de red.
 */
document.getElementById('formEditarUsuario').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;

    const bodyData = {
        nombre: document.getElementById('editUserNombre').value.trim(),
        correo: document.getElementById('editUserCorreo').value.trim(),
        rol_id: document.getElementById('editUserRol').value
    };

    Swal.fire({
        background: '#0f172a',
        color: '#f8fafc',
        title: 'Actualizando usuario...',
        text: 'Guardando los nuevos cambios en la base de datos.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/admin/usuarios/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': token 
            },
            body: JSON.stringify(bodyData)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        Swal.fire({
            icon: 'success',
            title: '¡Actualizado!',
            text: result.message || 'El perfil del usuario ha sido modificado con éxito.',
            timer: 1500,
            showConfirmButton: false,
            background: '#0f172a',
            color: '#f8fafc'
        });

        cerrarModalEditarUsuario();
        loadUsuariosMaster(); 

    } catch (error) {

        Swal.fire({
            icon: 'error',
            title: 'Error al actualizar',
            text: error.message || 'No se pudieron salvar los cambios en el servidor.',
            confirmButtonColor: '#3b82f6', 
            background: '#0f172a',
            color: '#f8fafc'
        });
    }
};

/**
 * Elimina de forma asíncrona la cuenta de un usuario específico en el sistema.
 * * Realiza una validación de seguridad inicial para impedir que el administrador autenticado 
 * elimine su propia cuenta en uso. Tras solicitar una confirmación explícita al usuario, 
 * envía una petición DELETE autenticada a la API de administración utilizando el identificador 
 * provisto. Si la operación es exitosa, despliega una notificación visual y actualiza el 
 * listado de usuarios en la interfaz.
 * * @global {string} API_BASE - URL base global de los endpoints del backend.
 * @global {Function} loadUsuariosMaster - Función encargada de volver a consultar y renderizar el listado de usuarios.
 * * @async
 * @param {number|string} id - Identificador único del usuario que se pretende eliminar.
 * @returns {Promise<void>} No retorna ningún valor de manera directa.
 * @throws {Error} Si la respuesta del servidor es negativa o existen fallos en la conexión de red.
 */
async function eliminarUsuarioId(id) {
    const miId = JSON.parse(localStorage.getItem('user'))?.id;
    
    if (id == miId) {
        Swal.fire({
            icon: 'error',
            title: 'Operación Denegada',
            text: 'No puedes eliminar tu propia cuenta de administrador en uso.',
            confirmButtonColor: '#3b82f6', 
            background: '#0f172a',       
            color: '#f8fafc'             
        });
        return;
    }

    const resultadoConfirmacion = await Swal.fire({
        title: '¿Estás seguro?',
        text: `Dar de baja`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444', 
        cancelButtonColor: '#475569', 
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        background: '#0f172a',
        color: '#f8fafc'
    });

    if (!resultadoConfirmacion.isConfirmed) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/admin/usuarios/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        Swal.fire({
            icon: 'success',
            title: '¡Eliminado!',
            text: result.message || 'El usuario fue removido con éxito.',
            confirmButtonColor: '#10b981', 
            background: '#0f172a',
            color: '#f8fafc'
        });

        loadUsuariosMaster();

    } catch (error) {

        Swal.fire({
            icon: 'error',
            title: 'Error al eliminar',
            text: error.message,
            confirmButtonColor: '#3b82f6',
            background: '#0f172a',
            color: '#f8fafc'
        });
    }
}

/**
 * Cierra la ventana modal de cierre de incidencias, restablece el formulario y restaura el estado visual previo.
 * * Realiza la limpieza integral de la interfaz del modal ejecutando las siguientes acciones:
 * 1. Restablece todos los campos de entrada de datos del formulario y oculta el contenedor del modal en el DOM.
 * 2. Restaura la visibilidad y obligatoriedad del campo de captura fotográfica.
 * 3. Si existe una referencia de cambio de estado pendiente (`window.selectStatusActual`), revierte el valor 
 * del selector en la vista al estado original de la incidencia (obtenido desde la caché) para cancelar la operación.
 * * @global {HTMLSelectElement|null} window.selectStatusActual - Referencia global al elemento select que disparó el flujo de cierre.
 * @global {Array<Object>} BACKEND_INCIDENCIAS_CACHE - Arreglo global con el respaldo en memoria de todas las incidencias.
 * * @returns {void} No retorna ningún valor.
 */
function cerrarModalCierre() {
    document.getElementById('formCierreIncidencia').reset();
    document.getElementById('modalCierreIncidencia').classList.add('hidden');
    
    const divFoto = document.getElementById('contenedorFotoCierre');
    const inputFoto = document.getElementById('cierreFoto');
    if (divFoto) divFoto.classList.remove('hidden');
    if (inputFoto) inputFoto.setAttribute('required', 'required');

    if (window.selectStatusActual) {
        const id = document.getElementById('cierreIncidenciaId').value;
        const caso = BACKEND_INCIDENCIAS_CACHE.find(inc => String(inc.id) === String(id));
        if (caso) {
            window.selectStatusActual.value = caso.estado;
        }
        window.selectStatusActual = null;
    }
}

/**
 * Controlador de eventos asíncrono para procesar el envío del formulario de cierre o rechazo de una incidencia.
 * * Intercepta y detiene la propagación del evento 'submit' para evaluar el destino del flujo según el `nuevoEstado`:
 * 1. Si el estado es 'Rechazada', envía una petición PUT con cabecera 'application/json' que incluye únicamente la justificación de texto.
 * 2. Para otros estados de resolución, envía una petición POST utilizando 'FormData' para empaquetar de forma binaria los campos y archivos adjuntos (evidencia fotográfica).
 * * Tras recibir una respuesta exitosa de la API, actualiza los datos del elemento modificado directamente dentro de la caché global 
 * (`BACKEND_INCIDENCIAS_CACHE`), restablece las variables de control de interfaz, cierra el modal, despliega una alerta de confirmación 
 * y dispara la revaluación de filtros, métricas de dashboard y mapas de sectores críticos en el DOM.
 * * @global {string} API_BASE - URL base global de los endpoints del backend.
 * @global {Array<Object>} BACKEND_INCIDENCIAS_CACHE - Arreglo global con el respaldo en memoria de todas las incidencias.
 * @global {HTMLSelectElement|null} window.selectStatusActual - Referencia global al elemento select que disparó el flujo de cierre.
 * @global {Function} [window.ejecutarFiltradoActual] - Función global que reaplica las reglas de filtrado activas sobre la vista.
 * @global {Function} cerrarModalCierre - Función encargada de limpiar y ocultar el modal de cierre.
 * @global {Function} displayAlert - Componente global de UI para renderizar notificaciones tipo "toast" o alertas flotantes.
 * @global {Function} renderMetricsAndIncidencias - Función encargada de redibujar contadores de métricas y tarjetas de incidencias.
 * @global {Function} [renderSectoresCriticos] - Función encargada de recalcular y renderizar las estadísticas por zonas geográficas.
 * * @async
 * @param {Event} e - Objeto del evento nativo de envío del formulario (submit).
 * @returns {Promise<boolean>} Retorna de forma explícita false para prevenir el comportamiento de recarga del navegador.
 */
document.getElementById('formCierreIncidencia').onsubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); 

    const id = document.getElementById('cierreIncidenciaId').value;
    const nuevoEstado = document.getElementById('cierreNuevoEstado').value;
    const form = document.getElementById('formCierreIncidencia');
    const notaCierreValue = document.getElementById('cierreNota').value.trim();

    try {
        const token = localStorage.getItem('token');
        let response;

        if (nuevoEstado === 'Rechazada') {
            response = await fetch(`${API_BASE}/incidencias/${id}/estado`, { 
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token 
                },
                body: JSON.stringify({ 
                    estado: nuevoEstado,
                    nota_cierre: notaCierreValue 
                })
            });
        } 
        else {
            const formData = new FormData(form);
            formData.append('estado', nuevoEstado); 

            response = await fetch(`${API_BASE}/incidencias/${id}/resolver`, {
                method: 'POST',
                headers: { 'Authorization': token },
                body: formData
            });
        }

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || `Error al procesar la incidencia como ${nuevoEstado}.`);

        const index = BACKEND_INCIDENCIAS_CACHE.findIndex(inc => String(inc.id) === String(id));
        if (index !== -1) {
            BACKEND_INCIDENCIAS_CACHE[index].estado = nuevoEstado;
            BACKEND_INCIDENCIAS_CACHE[index].nota_cierre = notaCierreValue;

            if (result.foto_cierre) {
                BACKEND_INCIDENCIAS_CACHE[index].foto_cierre = result.foto_cierre;
            }
        }

        window.selectStatusActual = null;
        cerrarModalCierre();
        
        const mensajeAlerta = nuevoEstado === 'Rechazada' 
            ? `Caso #${id} ha sido rechazado correctamente.` 
            : `Caso #${id} cerrado oficialmente con evidencia guardada.`;
            
        displayAlert(mensajeAlerta);

        if (typeof window.ejecutarFiltradoActual === 'function') {
            window.ejecutarFiltradoActual();
        } else {
            renderMetricsAndIncidencias(BACKEND_INCIDENCIAS_CACHE, BACKEND_INCIDENCIAS_CACHE);
        }

        if (typeof renderSectoresCriticos === 'function') {
            renderSectoresCriticos(BACKEND_INCIDENCIAS_CACHE);
        }

        if (typeof loadLogsAuditoria === 'function') {
            console.log("Refrescando logs de auditoría por cierre/rechazo exitoso...");
            loadLogsAuditoria();
        }

        if (typeof loadUsuariosMaster === 'function') {
            loadUsuariosMaster(vistaUsuariosActual);
        }

    } catch (err) {
        displayAlert(err.message, 'error');
    }

    return false; 
};

/**
 * Cierra y destruye la ventana modal de edición de soluciones para administradores.
 * * Busca el contenedor de la ventana modal en el árbol de nodos del documento 
 * utilizando su identificador único y, si el elemento se encuentra presente, 
 * lo remueve de forma definitiva del DOM para liberar los recursos asociados.
 * * @returns {void} No retorna ningún valor.
 */
function cerrarModalEditarSolucion() {
    const modal = document.getElementById('modalEditarSolucionAdmin');
    if (modal) modal.remove();
}

/**
 * Exporta de forma asíncrona el reporte de incidencias en formato Excel, aplicando filtros de fecha si existen.
 * * Recupera los límites de rango de fecha ('desde' y 'hasta') directamente desde el DOM para construir 
 * de manera condicional los parámetros de consulta (Query Strings). Envía una solicitud GET autenticada 
 * hacia la API de administración y procesa la respuesta binaria como un objeto Blob. Finalmente, orquesta 
 * la descarga automatizada en el navegador asignando un nombre de archivo dinámico basado en las fechas 
 * seleccionadas o un valor por defecto anual.
 * * @global {string} API_BASE - URL base global de los endpoints del backend.
 * * @async
 * @returns {Promise<void>} No retorna ningún valor de manera directa.
 * @throws {Error} Si la respuesta de la API no es exitosa o si ocurre un fallo en la comunicación de red.
 */
async function exportarReporte() {
    try {
        const token = localStorage.getItem('token');
        
        const inputDesde = document.getElementById('filtroFechaInicio');
        const inputHasta = document.getElementById('filtroFechaFin');
        const selectDano = document.getElementById('searchFilterInput');
        const selectSector = document.getElementById('sectorFilterSelect');
        const selectEstado = document.getElementById('estadoFilterSelect');

        const desde = inputDesde ? inputDesde.value : '';
        const hasta = inputHasta ? inputHasta.value : '';
        const tipoDanio = selectDano ? selectDano.value : 'TODOS';
        const sector = selectSector ? selectSector.value : 'TODOS';
        const estado = selectEstado ? selectEstado.value : 'ACTIVAS';

        const params = new URLSearchParams();
        
        if (desde) params.append('desde', desde);
        if (hasta) params.append('hasta', hasta);
        if (tipoDanio !== 'TODOS') params.append('tipo_danio', tipoDanio);
        if (sector !== 'TODOS') params.append('sector', sector);
        if (estado !== 'TODOS') params.append('estado', estado);

        const queryStr = params.toString();
        let urlServidor = queryStr ? `${API_BASE}/admin/exportar?${queryStr}` : `${API_BASE}/admin/exportar`; 

        const response = await fetch(urlServidor, { 
            method: 'GET', 
            headers: { 'Authorization': token }
        });

        if (!response.ok) {
            const errorResult = await response.json().catch(() => ({}));
            throw new Error(errorResult.message || 'Error al generar el reporte');
        }

        const blob = await response.blob();
        const urlDescarga = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlDescarga;
        
        a.download = (desde && hasta) 
            ? `Reporte_Filtrado_${desde}_a_${hasta}.xls` 
            : 'Reporte_Incidencias_Filtrado.xls';

        document.body.appendChild(a);
        a.click();
        
        a.remove();
        window.URL.revokeObjectURL(urlDescarga);

    } catch (error) {
        console.error('Hubo un problema:', error);
        alert(`No se pudo exportar: ${error.message}`);
    }
}

/**
 * Inicializa y configura los controladores de eventos para el modal de configuración del sistema.
 * * Centraliza la administración de sectores y tipos de daño. Gestiona el cambio de pestañas (tabs),
 * el restablecimiento de los formularios internos y expone de forma global la apertura del modal.
 * Utiliza un enfoque de funciones anidadas para proteger el alcance (scope) de las variables de edición.
 * * @global {string} API_BASE - URL base global de los endpoints del backend.
 * @global {Function} cargarSectoresEnSelect - Función externa que actualiza los selectores de sectores en la UI.
 * @global {Function} cargarDaniosEnSelect - Función externa que actualiza los selectores de daños en la UI.
 * @returns {void} No retorna ningún valor. Finaliza prematuramente si el modal no existe en el DOM.
 */
async function initConfigSistemaModal() {
    try {
        const modal = document.getElementById('modalConfig');
        const btnCerrar = document.getElementById('btnCerrarConfig');
        const btnAbrirDirecto = document.getElementById('btnAbrirConfigSistema');
        const token = localStorage.getItem('token') || 
                    sessionStorage.getItem('token') || 
                    localStorage.getItem('jwt') || 
                    sessionStorage.getItem('jwt');
        
        if (!modal) return;

        const tabSectores = document.getElementById('tabSectores');
        const tabDanios = document.getElementById('tabDanios');
        const vistaSectores = document.getElementById('vistaSectores');
        const vistaDanios = document.getElementById('vistaDanios');

        const inputNuevoSector = document.getElementById('inputNuevoSector');
        const btnAgregarSector = document.getElementById('btnAgregarSector');
        const listaSectores = document.getElementById('listaSectores');

        const inputNuevoDanio = document.getElementById('inputNuevoDanio');
        const inputDescDanio = document.getElementById('inputDescDanio');
        const btnAgregarDanio = document.getElementById('btnAgregarDanio');
        const listaDanios = document.getElementById('listaDanios');

        let sectorEditandoId = null;
        let danioEditandoId = null;
        
        const swalConfig = {
            background: '#1e293b', 
            color: '#f8fafc',    
            confirmButtonColor: '#4f46e5', 
            cancelButtonColor: '#64748b'   
        };

        window.forzarAbrirConfig = () => {
            modal.classList.remove('hidden');
            cargarSectores();
            cargarTiposDanio();
        };

        if (btnAbrirDirecto) {
            btnAbrirDirecto.addEventListener('click', (e) => {
                e.preventDefault();
                window.forzarAbrirConfig();
            });
        }

        if (btnCerrar) {
            btnCerrar.addEventListener('click', () => {
                modal.classList.add('hidden');
                resetFormularios();
                cargarSectoresEnSelect('repoSector');
                cargarDaniosEnSelect('repoDanio');
                cargarSectoresEnSelect('sectorFilterSelect');
                cargarDaniosEnSelect('searchFilterInput'); 
            });
        }

        if (tabSectores && tabDanios) {
            tabSectores.addEventListener('click', () => {
                vistaSectores.classList.remove('hidden');
                vistaDanios.classList.add('hidden');
                tabSectores.classList.add('border-purple-600', 'text-purple-600');
                tabDanios.classList.remove('border-purple-600', 'text-purple-600');
            });
            tabDanios.addEventListener('click', () => {
                vistaSectores.classList.add('hidden');
                vistaDanios.classList.remove('hidden');
                tabDanios.classList.add('border-purple-600', 'text-purple-600');
                tabSectores.classList.remove('border-purple-600', 'text-purple-600');
            });
        }
        
        function resetFormularios() {
            sectorEditandoId = null;
            danioEditandoId = null;
            if (inputNuevoSector) inputNuevoSector.value = '';
            if (btnAgregarSector) btnAgregarSector.innerText = 'Agregar';
            if (inputNuevoDanio) inputNuevoDanio.value = '';
            if (inputDescDanio) inputDescDanio.value = '';
            if (btnAgregarDanio) btnAgregarDanio.innerText = 'Agregar Tipo de Daño';
        }

        async function cargarSectores() {
            try {
                if (!listaSectores) return;
                const token = localStorage.getItem('token'); 

                const res = await fetch(`${API_BASE}/configuracion/sectores`, {
                    method: 'GET',
                    headers: { 
                        'Authorization': token, 
                        'Accept': 'application/json'
                    }
                });
                const sectores = await res.json();
                
                listaSectores.innerHTML = '';
                
                sectores.forEach(s => {
                    const li = document.createElement('li');
                    li.className = 'flex justify-between items-center p-3 text-sm border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30';
                    li.innerHTML = `
                        <span class="font-medium text-slate-200">${s.nombre}</span>
                        <div class="flex gap-3">
                            <button class="text-blue-400 hover:text-blue-300 font-bold text-xs cursor-pointer" data-id="${s.id}" data-nombre="${s.nombre}" action="editar-sector">Editar</button>
                            <button class="text-red-400 hover:text-red-300 font-bold text-xs cursor-pointer" data-id="${s.id}" action="eliminar-sector">Eliminar</button>
                        </div>
                    `;
                    listaSectores.appendChild(li);
                });
            } catch (err) { console.error("Error cargando sectores:", err); }
        }

        if (btnAgregarSector) {

    btnAgregarSector.addEventListener('click', async (e) => { 
        e.preventDefault(); 

        if (btnAgregarSector.disabled) return; 
        btnAgregarSector.disabled = true; 

        const nombre = inputNuevoSector.value.trim();
        if (!nombre) {
            btnAgregarSector.disabled = false; 
            Swal.fire({ ...swalConfig, icon: 'warning', title: 'Oops...', text: 'El nombre del sector es requerido.' });
            return;
        }

        const payload = { nombre };
        if (sectorEditandoId) payload.id = sectorEditandoId;

        try {
            const res = await fetch(`${API_BASE}/admin/configuracion/sectores`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token 
                },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();

        if (data.success) { 
            Swal.fire({ 
                icon: 'success', 
                title: '¡Hecho!', 
                text: data.message || 'Sector guardado correctamente.', 
                timer: 1500, 
                showConfirmButton: false,
                background: '#0f172a', 
                color: '#f8fafc'      
            });
            
            resetFormularios(); 
            cargarSectores(); 
            cargarSectoresEnSelect('repoSector');
            cargarSectoresEnSelect('sectorFilterSelect');

        } else { 

            Swal.fire({
                icon: 'error',
                title: 'No se pudo guardar',
                text: data.message || 'Hubo un inconveniente al registrar el sector.',
                confirmButtonColor: '#3b82f6', 
                background: '#0f172a',
                color: '#f8fafc'
            });
        }
        } catch (err) {
            console.error("Error en petición de sector:", err);
        } finally {

            btnAgregarSector.disabled = false;
        }
    });
}

        if (listaSectores) {
            listaSectores.addEventListener('click', async (e) => {
                const target = e.target;
                const id = target.getAttribute('data-id');
                const action = target.getAttribute('action');

                if (action === 'editar-sector') {
                    sectorEditandoId = id;
                    inputNuevoSector.value = target.getAttribute('data-nombre');
                    btnAgregarSector.innerText = 'Actualizar Sector';
                    inputNuevoSector.focus();
                } else if (action === 'eliminar-sector') {
                    const resultado = await Swal.fire({
                        ...swalConfig,
                        title: '¿Estás seguro?',
                        text: "¡Esta acción eliminará el sector de los registros!",
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Sí, eliminar',
                        cancelButtonText: 'Cancelar'
                    });

                    if (resultado.isConfirmed) {
                        const res = await fetch(`${API_BASE}/admin/configuracion/sectores/${id}`, { 
                            method: 'DELETE',
                            headers: { 'Authorization': token }
                        });
                        const data = await res.json();
                        if (data.success) {
                            Swal.fire({ ...swalConfig, icon: 'success', title: 'Eliminado', text: 'El sector fue removido.', timer: 1500, showConfirmButton: false });
                            cargarSectores(); 
                            cargarSectoresEnSelect('repoSector');
                            cargarSectoresEnSelect('sectorFilterSelect');
                        } else { 
                            Swal.fire({ ...swalConfig, icon: 'error', title: 'Error', text: data.error });
                        }
                    }
                }
            });
        }

        async function cargarTiposDanio() {
            try {
                if (!listaDanios) return;
                const token = localStorage.getItem('token'); 

                const res = await fetch(`${API_BASE}/configuracion/tipos-danio`, {
                    method: 'GET',
                    headers: { 
                        'Authorization': token,
                        'Accept': 'application/json'
                    }
                });
                const danios = await res.json();
                listaDanios.innerHTML = '';
                
                danios.forEach(d => {
                    const li = document.createElement('li');
                    li.className = 'p-3 text-sm flex justify-between items-start border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30';
                    li.innerHTML = `
                        <div>
                            <p class="font-bold text-slate-200">${d.nombre}</p>
                            <p class="text-xs text-slate-400">${d.descripcion || 'Sin descripción'}</p>
                        </div>
                        <div class="flex gap-3 ml-4">
                            <button class="text-blue-400 hover:text-blue-300 font-bold text-xs cursor-pointer" data-id="${d.id}" data-nombre="${d.nombre}" data-desc="${d.descripcion || ''}" action="editar-danio">Editar</button>
                            <button class="text-red-400 hover:text-red-300 font-bold text-xs cursor-pointer" data-id="${d.id}" action="eliminar-danio">Eliminar</button>
                        </div>
                    `;
                    listaDanios.appendChild(li);
                });
            } catch (err) { console.error("Error cargando daños:", err); }
        }

        if (btnAgregarDanio) {
    btnAgregarDanio.addEventListener('click', async (e) => {
        e.preventDefault(); 

        if (btnAgregarDanio.disabled) return; 
        btnAgregarDanio.disabled = true; 

        const nombre = inputNuevoDanio.value.trim();
        const descripcion = inputDescDanio.value.trim();
        
        if (!nombre) {
            btnAgregarDanio.disabled = false; 
            return Swal.fire({ ...swalConfig, icon: 'warning', title: 'Oops...', text: 'El nombre es requerido.' });
        }

        const payload = { nombre, descripcion };
        if (danioEditandoId) payload.id = danioEditandoId;

        try {
            const res = await fetch(`${API_BASE}/admin/configuracion/tipos-danio`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token 
                },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (data.success) { 
                Swal.fire({ ...swalConfig, icon: 'success', title: '¡Hecho!', text: 'Daño procesado de forma exitosa.', timer: 1500, showConfirmButton: false });
                resetFormularios(); 
                cargarTiposDanio(); 
                cargarDaniosEnSelect('repoDanio');
                cargarDaniosEnSelect('searchFilterInput'); 
            } else { 
                Swal.fire({ ...swalConfig, icon: 'error', title: 'Error', text: data.error || 'Error en la operación.' });
            }
        } catch (err) {
            console.error(err);
        } finally {
            btnAgregarDanio.disabled = false;
        }
    });
}

        if (listaDanios) {
            listaDanios.addEventListener('click', async (e) => {
                const target = e.target;
                const id = target.getAttribute('data-id');
                if (target.getAttribute('action') === 'editar-danio') {
                    danioEditandoId = id;
                    inputNuevoDanio.value = target.getAttribute('data-nombre');
                    inputDescDanio.value = target.getAttribute('data-desc');
                    btnAgregarDanio.innerText = 'Actualizar Tipo';
                    inputNuevoDanio.focus();
                } else if (target.getAttribute('action') === 'eliminar-danio') {
                    
                    const resultado = await Swal.fire({
                        ...swalConfig,
                        title: '¿Deseas eliminar este tipo de daño?',
                        text: "¡No podrás revertir este cambio!",
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Sí, borrar',
                        cancelButtonText: 'Cancelar'
                    });

                    if (resultado.isConfirmed) {
                        const res = await fetch(`${API_BASE}/admin/configuracion/tipos-danio/${id}`, { 
                            method: 'DELETE',
                            headers: { 'Authorization': token }
                        });
                        const data = await res.json();
                        if (data.success) {
                            Swal.fire({ ...swalConfig, icon: 'success', title: 'Eliminado', text: 'El registro fue borrado.', timer: 1500, showConfirmButton: false });
                            cargarTiposDanio(); 
                            cargarDaniosEnSelect('repoDanio');
                            cargarDaniosEnSelect('searchFilterInput'); 
                        } else { 
                            Swal.fire({ ...swalConfig, icon: 'error', title: 'Error', text: data.error }); 
                        }
                    }
                }
            });
        }

        console.log("2. initConfigSistemaModal() se configuró por completo sin romperse.");

    } catch (error) {
        console.error("ERROR CRÍTICO dentro de initConfigSistemaModal():", error);
    }
}

/**
 * Ejecuta de forma asíncrona la carga en paralelo o secuencial de las configuraciones del sistema.
 * * Verifica la existencia de los contenedores objetivo en el DOM para despachar peticiones HTTP GET
 * hacia los endpoints correspondientes de sectores y tipos de daño. Al recibir las respuestas,
 * procesa las colecciones en formato JSON, construye plantillas de cadenas (template literals) 
 * para mapear cada registro a un nodo de lista HTML y las inyecta directamente limpiando el estado previo.
 * * @async
 * @returns {Promise<void>} No retorna ningún valor de manera directa.
 * @throws {Error} Si ocurren fallas en la resolución de las promesas de fetch o en el parseo del JSON.
 */
async function ejecutarCargasConfig() {
    try {
        const listaSectores = document.getElementById('listaSectores');
        const listaDanios = document.getElementById('listaDanios');

        if (listaSectores) {
            const res = await fetch('/api/admin/configuracion/sectores');
            const sectores = await res.json();
            listaSectores.innerHTML = sectores.map(s => `
                <li class="flex justify-between items-center p-3 text-sm border-b hover:bg-gray-50">
                    <span class="font-medium text-gray-800">${s.nombre}</span>
                </li>
            `).join('');
        }

        if (listaDanios) {
            const res = await fetch('/api/admin/configuracion/tipos-danio');
            const danios = await res.json();
            listaDanios.innerHTML = danios.map(d => `
                <li class="p-3 text-sm border-b hover:bg-gray-50">
                    <p class="font-bold text-gray-800">${d.nombre}</p>
                    <p class="text-xs text-gray-500">${d.descripcion || 'Sin descripción'}</p>
                </li>
            `).join('');
        }
    } catch (err) {
        console.error("Falló el fetch de carga:", err);
    }
}

/**
 * Ejecuta de forma asíncrona la carga en paralelo o secuencial de las configuraciones del sistema.
 * * Verifica la existencia de los contenedores objetivo en el DOM para despachar peticiones HTTP GET
 * hacia los endpoints correspondientes de sectores y tipos de daño. Al recibir las respuestas,
 * procesa las colecciones en formato JSON, construye plantillas de cadenas (template literals) 
 * para mapear cada registro a un nodo de lista HTML y las inyecta directamente limpiando el estado previo.
 * * @async
 * @returns {Promise<void>} No retorna ningún valor de manera directa.
 * @throws {Error} Si ocurren fallas en la resolución de las promesas de fetch o en el parseo del JSON.
 */
async function ejecutarCargasConfig() {
    try {
        const listaSectores = document.getElementById('listaSectores');
        const listaDanios = document.getElementById('listaDanios');

        if (listaSectores) {
            const res = await fetch('/api/admin/configuracion/sectores');
            const sectores = await res.json();
            listaSectores.innerHTML = sectores.map(s => `
                <li class="flex justify-between items-center p-3 text-sm border-b hover:bg-gray-50">
                    <span class="font-medium text-gray-800">${s.nombre}</span>
                </li>
            `).join('');
        }

        if (listaDanios) {
            const res = await fetch('/api/admin/configuracion/tipos-danio');
            const danios = await res.json();
            listaDanios.innerHTML = danios.map(d => `
                <li class="p-3 text-sm border-b hover:bg-gray-50">
                    <p class="font-bold text-gray-800">${d.nombre}</p>
                    <p class="text-xs text-gray-500">${d.descripcion || 'Sin descripción'}</p>
                </li>
            `).join('');
        }
    } catch (err) {
        console.error("Falló el fetch de carga:", err);
    }
}

/**
 * Restablece el estado de los formularios de configuración y revierte los componentes de la interfaz a su estado inicial.
 * * Realiza la limpieza de las variables de control de edición (asignando null a los identificadores de sectores y daños)
 * y vacía de forma directa el contenido de los campos de texto del DOM (`inputNuevoSector`, `inputNuevoDanio` e `inputDescDanio`).
 * Asimismo, restaura las etiquetas textuales originales de los botones de confirmación (`btnAgregarSector` y `btnAgregarDanio`)
 * para transicionar el formulario desde un modo de actualización de registros hacia un modo de inserción limpia.
 * * @global {number|null} sectorEditandoId - Identificador del sector que se encuentra en proceso de edición.
 * @global {number|null} danioEditandoId - Identificador del tipo de daño que se encuentra en proceso de edición.
 * @global {HTMLInputElement} inputNuevoSector - Campo de entrada de texto para el nombre del nuevo sector.
 * @global {HTMLButtonElement} btnAgregarSector - Botón de acción para registrar o actualizar sectores.
 * @global {HTMLInputElement} inputNuevoDanio - Campo de entrada de texto para el nombre del nuevo tipo de daño.
 * @global {HTMLInputElement} inputDescDanio - Campo de entrada de texto para la descripción del tipo de daño.
 * @global {HTMLButtonElement} btnAgregarDanio - Botón de acción para registrar o actualizar tipos de daño.
 * * @returns {void} No retorna ningún valor.
 */
function resetFormularios() {
        sectorEditandoId = null;
        danioEditandoId = null;
        inputNuevoSector.value = '';
        btnAgregarSector.innerText = 'Agregar';
        inputNuevoDanio.value = '';
        inputDescDanio.value = '';
        btnAgregarDanio.innerText = 'Agregar Tipo de Daño';
}

/**
 * Consulta asíncronamente la lista de sectores desde el servidor mediante una petición HTTP GET.
 * * Verifica la existencia previa del contenedor de la lista en el DOM y recupera el token de autenticación.
 * Envía la solicitud incluyendo cabeceras de autorización y formato aceptado. Si el servidor responde 
 * con un estado de error HTTP (no OK), intercepta la respuesta en formato de texto plano para volcar 
 * el detalle técnico en la consola de depuración y aborta el flujo. En caso de éxito, procesa y 
 * deserializa la colección de datos en formato JSON.
 * * @global {string} API_BASE - URL base global de los endpoints del backend.
 * @global {HTMLElement|null} listaSectores - Contenedor del DOM donde se inyecta o gestiona la lista de sectores.
 * * @async
 * @returns {Promise<void>} No retorna ningún valor de manera directa.
 * @throws {Error} Si ocurre un fallo crítico de red o de conectividad durante el ciclo de vida de la petición.
 */
async function cargarSectores() {
    try {
        if (!listaSectores) return;

        const token = localStorage.getItem('token'); 

        const res = await fetch(`${API_BASE}/configuracion/sectores`, {
            method: 'GET',
            headers: { 
                'Authorization': token, 
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            const textoError = await res.text();
            console.error(`Error del servidor (${res.status}):`, textoError);
            return;
        }

        const sectores = await res.json();
        

    } catch (err) { 
        console.error("Error en la petición de sectores:", err); 
    }
}

/**
 * Delegado de eventos global asíncrono para interceptar la apertura del modal de configuración del sistema.
 * * Escucha de forma centralizada todos los clics realizados en el documento y utiliza la técnica de 
 * delegación de eventos (`closest`) para identificar si el origen proviene del botón de configuración. 
 * Si es detectado, previene el comportamiento por defecto, expone visualmente el modal removiendo su 
 * clase de ocultamiento y evalúa de forma dinámica la disponibilidad de los scripts del ciclo de vida:
 * 1. Si `initConfigSistemaModal` está definido, inicializa la lógica completa y los listeners del panel.
 * 2. Si no está definido, actúa bajo una estrategia de respaldo (fallback) invocando directamente 
 * la función secundaria `ejecutarCargasConfig` para garantizar la actualización de los datos.
 * * @global {Function} [initConfigSistemaModal] - Función encargada de inicializar los controladores y flujos del modal.
 * @global {Function} [ejecutarCargasConfig] - Función encargada de despachar las peticiones AJAX para poblar las listas.
 * * @async
 * @param {MouseEvent} e - Objeto del evento nativo de clic interceptado en el árbol del DOM.
 * @returns {Promise<void>} No retorna ningún valor de manera directa. Termina prematuramente si el nodo del modal no se encuentra en el HTML.
 */
document.addEventListener('click', async (e) => {

    const btn = e.target.closest('#btnAbrirConfigSistema');
    if (btn) {
        e.preventDefault();
        
        const modal = document.getElementById('modalConfig');
        if (!modal) {
            console.error("El #modalConfig no existe en el HTML.");
            return;
        }
        
        modal.classList.remove('hidden');

        if (typeof initConfigSistemaModal === 'function') {
            initConfigSistemaModal();
        } else {
            console.warn("initConfigSistemaModal no se ejecutó automáticamente, forzando cargas...");

            if (typeof ejecutarCargasConfig === 'function') ejecutarCargasConfig();
        }
    }
});




