// ==========================================
// 📌 ESTADO GLOBAL Y CACHÉ
// ==========================================
let BACKEND_INCIDENCIAS_CACHE = [];
let NOTI_ALERTAS = [
    { id: 1, icono: '🔴', titulo: 'Nuevo Reporte', desc: 'Bache crítico registrado en Sector Norte.', tiempo: 'Hace 5 min' },
    { id: 2, icono: '🟡', titulo: 'Cambio de Estado', desc: 'Incidencia #3 pasó a "En Proceso".', tiempo: 'Hace 20 min' }
];
let cacheLogsAuditoria = []; 
// Variables globales de control en admin.js
let cacheUsuariosMaster = [];
let vistaUsuariosActual = 'activos'; // Puede ser 'activos' o 'eliminados'

// ==========================================
// 🚀 INICIALIZACIÓN DEL SISTEMA (DOM)
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    // Control de acceso primario
    if (!checkAuth('Administrador')) return; 

    // Vincular botón de salida si existe en el HTML
    const btnLogout = document.getElementById('navBtnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }
    
    // Inicializar todos los módulos del Dashboard
    initNotificationBell();
    initFilterSystem();
    loadAdminDashboard();
    initRegistroAdminModal();
    loadAuditLogs(); // 🔥 CORREGIDO: Ahora sí se ejecuta al cargar la página
    initReporteAdminModal();
    loadUsuariosMaster();
});

// ==========================================
// 📊 ADQUISICIÓN Y RENDERIZADO DE DATOS
// ==========================================
async function loadAdminDashboard() {
    try {
        const token = localStorage.getItem('token'); 
        
        // 1. Capturamos los inputs de fecha directamente de la pantalla
        const inputDesde = document.getElementById('filtroFechaInicio');
        const inputHasta = document.getElementById('filtroFechaFin');
        
        const desde = inputDesde ? inputDesde.value : '';
        const hasta = inputHasta ? inputHasta.value : '';

        // 2. Construimos la URL base
        let url = API_BASE + '/incidencias';

        // 3. Si el administrador seleccionó un rango, se lo pegamos a la URL
        if (desde && hasta) {
            url += `?desde=${desde}&hasta=${hasta}`;
        }

        // 4. Hacemos el fetch (ahora irá con o sin fechas según corresponda)
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': token }
        });
        const result = await response.json();
        
        if (response.ok) {
            BACKEND_INCIDENCIAS_CACHE = result.data || [];
            
            // 🚀 EL CAMBIO CLAVE: En vez de renderizar directo, inicializamos el sistema de filtros.
            // Como pusimos 'filtrarCache()' al final de initFilterSystem, esta leerá el "ACTIVAS" 
            // del HTML y filtrará la lista al instante, encargándose también de llamar a renderMetricsAndIncidencias.
            initFilterSystem();
            
            // Este se mantiene porque dibuja los sectores críticos de forma independiente
            renderSectoresCriticos(BACKEND_INCIDENCIAS_CACHE);
            
            // 🗺️ Corrección de llaves: Validamos e inicializamos el mapa de calor dentro del flujo correcto
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

// 1. FUNCIÓN PRINCIPAL: Controla métricas y el contenedor general
function renderMetricsAndIncidencias(todasLasIncidencias, incidenciasParaMostrar) {
    const listContainer = document.getElementById('adminIncidenciasList');
    if (!listContainer) return;

    // 📊 1. LAS MÉTRICAS DEBEN USAR TODO EL ARREGLO HISTÓRICO
    // De esta manera, los contadores de arriba reflejan el universo total real.
    actualizarContadoresMetricas(todasLasIncidencias);

    // 📋 2. VALIDAR SI LA LISTA A MOSTRAR VIENE VACÍA
    // Esto ocurre si el filtro aplicado no encuentra ninguna coincidencia abajo.
    if (!incidenciasParaMostrar || incidenciasParaMostrar.length === 0) {
        listContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No se encontraron incidencias para este filtro.</p>`;
        return;
    }

    // 🖨️ 3. RENDERIZAR SOLO LO FILTRADO
    // Mapeo limpio llamando a la constructora de tarjetas individuales.
    listContainer.innerHTML = incidenciasParaMostrar.map(inc => crearTarjetaIncidenciaHtml(inc)).join('');
}

// 2. SUB-FUNCIÓN: Se encarga exclusivamente de calcular los contadores numéricos
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
        // 🔥 Aquí queda totalmente blindado contra 'Resuelta', 'Resuelto', 'resuelto', 'RESUELTA', etc.
        counts.Resueltas.innerText = incidencias.filter(i => {
            const est = (i.estado || '').toLowerCase();
            return est === 'resuelta' || est === 'resuelto';
        }).length;
    }
    if (counts.Rechazadas) {
        counts.Rechazadas.innerText = incidencias.filter(i => (i.estado || '').toLowerCase() === 'rechazada').length;
    }
}

// 3. SUB-FUNCIÓN: Contiene toda la plantilla HTML y lógica de estilos por tarjeta
function crearTarjetaIncidenciaHtml(inc) {
    // Definir estilos visuales según el estado
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

    // Formatear la URL de la imagen de evidencia
    const fotoQueja = inc.foto_url;
    let urlFoto = 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=150'; // Respaldo

    if (fotoQueja && fotoQueja !== 'null' && fotoQueja !== 'undefined' && fotoQueja.trim() !== '') {
        if (fotoQueja.startsWith('http')) {
            urlFoto = fotoQueja;
        } else if (fotoQueja.startsWith('uploads/')) {
            urlFoto = FILE_SERVER + fotoQueja; 
        } else {
            urlFoto = FILE_SERVER + 'uploads/' + fotoQueja;
        }
    }

    // Generar bloque de acciones/controles dinámicos
    let controlAccionHtml = '';
    if (esCasoCerrado) {
        let botonEditarSolucion = '';
        if (inc.estado === 'Resuelta' || inc.estado === 'Resuelto') {
            const notaEscapada = inc.nota_cierre ? inc.nota_cierre.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
            botonEditarSolucion = `
                <button type="button" onclick="abrirModalEditarSolucion('${inc.id}', '${inc.foto_cierre}', '${notaEscapada}')" 
                        class="p-1 px-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded text-[9px] font-bold flex items-center gap-1 transition-all border border-emerald-500/30"
                        title="Ver o editar la evidencia de cierre">
                    <i class="ti ti-edit"></i> Ver/Editar Solución
                </button>
            `;
        }

        controlAccionHtml = `
            <div class="flex gap-1">
                ${botonEditarSolucion}
                <button type="button" onclick="updateStatus('${inc.id}', 'En Proceso')" 
                        class="p-1 px-2 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded text-[9px] font-bold flex items-center gap-1 transition-all border border-amber-500/30"
                        title="Devolver incidencia a estado En Proceso">
                    <i class="ti ti-arrow-back-up"></i> Reabrir Caso
                </button>
            </div>
        `;
    } else {
        // Los elementos <select> no sufren de este problema nativo, están perfectos
        controlAccionHtml = `
            <select onchange="event.preventDefault(); event.stopPropagation(); updateStatus('${inc.id}', this.value, this); return false;" 
                    class="p-1 text-[10px] bg-slate-900 border border-slate-700 text-slate-300 rounded cursor-pointer outline-none font-medium focus:border-blue-500">
                <option value="Pendiente" ${inc.estado === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                <option value="En Proceso" ${inc.estado === 'En Proceso' ? 'selected' : ''}>⚙️ En Proceso</option>
                <option value="Resuelta" ${(inc.estado === 'Resuelta' || inc.estado === 'Resuelto') ? 'selected' : ''}>✅ Resuelta</option>
                <option value="Rechazada" ${inc.estado === 'Rechazada' ? 'selected' : ''}>❌ Rechazada</option>
            </select>
        `;
    }

    // Escapamos los textos de la incidencia para poder pasarlos de forma segura dentro del onclick del botón
    const tituloEscapado = inc.titulo ? inc.titulo.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Incidencia';
    const descEscapada = inc.descripcion ? inc.descripcion.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
    const sectorEscapado = inc.sector ? inc.sector.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Desconocido';

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
                        
                        <button onclick="abrirModalDetalleIncidencia('${inc.id}', '${tituloEscapado}', '${descEscapada}', '${urlFoto}', '${inc.estado}', '${sectorEscapado}', '${inc.urgencia || 'Media'}', '${inc.latitud}', '${inc.longitud}')" 
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


async function updateStatus(id, nuevoEstado, selectElement = null) {
    if (nuevoEstado === 'Resuelta' || nuevoEstado === 'Resuelto') {
        document.getElementById('cierreIncidenciaId').value = id;
        document.getElementById('cierreNuevoEstado').value = nuevoEstado;
        
        // Guardamos el select en una variable global temporal por si cancelan el modal
        window.selectStatusActual = selectElement;
        
        document.getElementById('modalCierreIncidencia').classList.remove('hidden');
        return false; // Evita cualquier acción nativa colateral o burbujeo
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
        
        if (nuevoEstado === 'En Proceso') {
            displayAlert(`🔄 Caso #${id} reabierto y enviado a revisión en el tablero.`);
        } else {
            displayAlert(`Incidencia #${id} modificada con éxito a: ${nuevoEstado}`);
        }
        
        // Mutamos la caché local de la SPA
        const index = BACKEND_INCIDENCIAS_CACHE.findIndex(inc => String(inc.id) === String(id));
        if (index !== -1) {
            BACKEND_INCIDENCIAS_CACHE[index].estado = nuevoEstado;
            
            console.log("Actualizando renderizado respetando filtros activos...");
            
            // 🔥 REEMPLAZADO: Llamamos a tu sistema maestro de filtros expuesto globalmente
            if (typeof window.ejecutarFiltradoActual === 'function') {
                window.ejecutarFiltradoActual();
            } else {
                // Respaldo de seguridad por si acaso
                renderMetricsAndIncidencias(BACKEND_INCIDENCIAS_CACHE, BACKEND_INCIDENCIAS_CACHE);
            }

            if (typeof renderSectoresCriticos === 'function') {
                renderSectoresCriticos(BACKEND_INCIDENCIAS_CACHE);
            }
        }
    } catch (err) {
        displayAlert(err.message, 'error');
        
        // Si el servidor falla, regresamos el select de la tarjeta a su estado original
        if (selectElement && index !== -1) {
            selectElement.value = BACKEND_INCIDENCIAS_CACHE[index].estado;
        }
    }
}

function renderSectoresCriticos(incidencias) {
    const container = document.getElementById('sectorsDensityList');
    if (!container) return;
    
    const conteoSectores = {};
    incidencias.forEach(i => {
        if (i.sector) conteoSectores[i.sector] = (conteoSectores[i.sector] || 0) + 1;
    });
    
    container.innerHTML = Object.keys(conteoSectores).map(sector => `
        <li class="flex justify-between py-2 text-slate-600">
            <span>Sector ${sector}</span>
            <span class="bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-700 text-[10px]">${conteoSectores[sector]} Reportes</span>
        </li>
    `).join('');
}

function clearDashboard() {
    BACKEND_INCIDENCIAS_CACHE = [];
    renderMetricsAndIncidencias([]);
}

// ==========================================
// 🔍 SISTEMA FILTROS & ALARMAS (MÓDULO ADMIN)
// ==========================================
function initFilterSystem() {
    const searchInput = document.getElementById('searchFilterInput');
    const sectorSelect = document.getElementById('sectorFilterSelect');
    const estadoSelect = document.getElementById('estadoFilterSelect');

    if (!searchInput || !sectorSelect || !estadoSelect) return;

    const filtrarCache = () => {
        const query = searchInput.value.toLowerCase().trim();
        const sectorSelected = sectorSelect.value;
        const estadoSelected = estadoSelect.value;
        const listaAFiltrar = BACKEND_INCIDENCIAS_CACHE || [];

        const resultadoFiltrado = listaAFiltrar.filter(inc => {
            const descripcion = (inc.descripcion || '').toLowerCase();
            const tipoDanio = (inc.tipo_danio || '').toLowerCase();

            // Guardamos el estado del registro actual en minúsculas para comparar fácil
            const estadoIncidencia = (inc.estado || '').toLowerCase();

            // 1. Filtro de búsqueda por texto
            const matchesSearch = descripcion.includes(query) || tipoDanio.includes(query);
            
            // 2. Filtro de sector
            const matchesSector = sectorSelected === 'TODOS' || inc.sector === sectorSelected;
            
            // 3. 🛠️ FILTRO DE ESTADO ADAPTATIVO (CORREGIDO PARA ADMITIR AMBOS GÉNEROS)
            let matchesEstado = false;
            
            if (estadoSelected === 'ACTIVAS') {
                // Si está en ACTIVAS, entran las que NO están cerradas (en ninguna de sus variantes)
                matchesEstado = estadoIncidencia !== 'resuelta' && 
                                estadoIncidencia !== 'resuelto' && 
                                estadoIncidencia !== 'rechazada' && 
                                estadoIncidencia !== 'cancelada';
            } else if (estadoSelected === 'TODOS') {
                matchesEstado = true;
            } else {
                // Convertimos lo que viene del select a minúsculas
                const opcionElegida = estadoSelected.toLowerCase();

                // 🔥 SI ELIGEN "RESUELTO" O "RESUELTA", DEJAMOS PASAR AMBOS CASOS
                if (opcionElegida === 'resuelto' || opcionElegida === 'resuelta') {
                    matchesEstado = (estadoIncidencia === 'resuelto' || estadoIncidencia === 'resuelta');
                } else {
                    // Para los demás estados (Pendiente, En Proceso, etc.), comparación normal en minúsculas
                    matchesEstado = estadoIncidencia === opcionElegida;
                }
            }
            
            return matchesSearch && matchesSector && matchesEstado;
        });

        // 4. Enviamos ambos arreglos a la función de renderizado
        renderMetricsAndIncidencias(listaAFiltrar, resultadoFiltrado);
    };

    // Escuchadores de eventos para reaccionar en tiempo real
    searchInput.addEventListener('input', filtrarCache);
    sectorSelect.addEventListener('change', filtrarCache);
    estadoSelect.addEventListener('change', filtrarCache);

    window.ejecutarFiltradoActual = filtrarCache;
    
    filtrarCache();
}

function initNotificationBell() {
    const bellBtn = document.getElementById('notiBellBtn');
    const dropdown = document.getElementById('notiDropdown');
    const listContainer = document.getElementById('notiListContainer');
    const badge = document.getElementById('notiCountBadge');
    const clearBtn = document.getElementById('clearNotis');

    if (!bellBtn || !dropdown) return;

    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => dropdown.classList.add('hidden'));
    dropdown.addEventListener('click', (e) => e.stopPropagation());

    const renderAlerts = () => {
        if (NOTI_ALERTAS.length === 0) {
            if (badge) badge.classList.add('hidden');
            if (listContainer) listContainer.innerHTML = `<p class="p-4 text-center text-slate-400">Sin alertas nuevas</p>`;
            return;
        }
        if (badge) {
            badge.classList.remove('hidden');
            badge.innerText = NOTI_ALERTAS.length;
        }

        if (listContainer) {
            listContainer.innerHTML = NOTI_ALERTAS.map(alerta => `
                <div class="p-3 hover:bg-slate-50 transition-colors">
                    <div class="flex gap-2">
                        <span>${alerta.icono}</span>
                        <div class="flex-1">
                            <div class="flex justify-between font-semibold text-slate-800">
                                <span>${alerta.titulo}</span>
                                <span class="text-[10px] text-slate-400 font-normal">${alerta.tiempo}</span>
                            </div>
                            <p class="text-slate-500 mt-0.5 leading-tight text-[11px]">${alerta.desc}</p>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    };

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            NOTI_ALERTAS = [];
            renderAlerts();
        });
    }

    renderAlerts();
}

// ==========================================================
// 🔐 MÓDULO: GESTIÓN Y AUDITORÍA DE NUEVOS ADMINISTRADORES
// ==========================================================
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
        const userRaw = localStorage.getItem('user'); // 🛡️ UNIFICADO

        if (userRaw) {
            try {
                const userObj = JSON.parse(userRaw);
                adminOperadorId = userObj.id;
            } catch (e) {
                console.error("Error al procesar el usuario de la sesión:", e);
            }
        }

        if (!adminOperadorId) {
            alert('❌ Error de sesión: No se pudo identificar tu ID de administrador.');
            return;
        }

        const bodyData = {
            nombre: nombre,
            correo: correo,
            password: password,
            admin_operador_id: parseInt(adminOperadorId)
        };

        try {
            const token = localStorage.getItem('token'); // 🛡️ UNIFICADO

            if (!token) {
                alert('❌ Error de seguridad: No se encontró un token de sesión válido.');
                return;
            }

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

            alert(`🎉 ${result.message}`);
            form.reset(); 
            modal.classList.add('hidden');

        } catch (error) {
            alert(`❌ Error: ${error.message}`);
        }
    });
}

async function loadAuditLogs() {
    const timeline = document.getElementById('auditTimeline');
    if (!timeline) return;

    try {
        const token = localStorage.getItem('token'); // 🛡️ UNIFICADO
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
        console.error("💥 Error en loadAuditLogs:", error);
        timeline.innerHTML = `<div class="text-center p-3 text-[11px] text-rose-500 font-medium">❌ No se pudo cargar la auditoría: ${error.message}</div>`;
    }
}

function renderizarTimelineAuditoria(logs) {
    const timeline = document.getElementById('auditTimeline');
    if (!timeline) return;
    
    timeline.innerHTML = ''; 

    if (!logs || logs.length === 0) {
        timeline.innerHTML = `<div class="text-center p-6 text-slate-400 italic text-[11px]">No hay registros que coincidan con los filtros.</div>`;
        return;
    }

    

    logs.forEach(log => {
    
        const item = document.createElement('div');
        // Conservamos exactamente tus clases de diseño originales
        item.className = "p-2.5 bg-slate-50 border border-slate-100 rounded-lg flex flex-col gap-1 hover:border-slate-200 transition-colors text-xs";
        
        // En tu admin.js, dentro de renderizarTimelineAuditoria:
        const nombreAdmin = log.administrador_nombre || 'Sistema (Revisa el SELECT del PHP)';
        
        // 🕒 2. Formateador de fecha seguro utilizando tu columna 'fecha_cambio' o tus respaldos
        const campoFecha = log.fecha_cambio || log.creado_en || 'Reciente';
        let fechaFormateada = campoFecha;
        
        if (campoFecha && campoFecha !== 'Reciente') {
            const fecha = new Date(campoFecha);
            fechaFormateada = fecha.toLocaleDateString('es-ES', { 
                day: '2-digit', 
                month: 'short', 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
        }

        // 🆔 3. Mantenemos tus identificadores de referencia originales
        const idAfectado = log.incidencia_id || log.usuario_afectado_id || 'N/A';
        
        // 🪄 4. TRADUCTOR OPERATIVO (Combinación de tus reglas viejas y las nuevas)
        const accion = log.accion ? log.accion.toUpperCase() : '';
        const ant = log.estado_anterior;
        const nvo = log.estado_nuevo;
        
        let tagAccion = '';
        let detalleTexto = '';

        // --- BLOQUE PRESERVADO: Reglas originales tuyas para auditoría de usuarios ---
        if (accion === 'CREAR_ADMIN' || accion === 'ALTA_ADMIN') {
            tagAccion = `<span class="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[10px] font-bold uppercase">ALTA ADMIN</span>`;
            detalleTexto = `Registró un nuevo perfil administrativo en el sistema.`;
        } 
        else if (accion === 'BAJA_USUARIO' || accion === 'ELIMINAR_USUARIO') {
            tagAccion = `<span class="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[10px] font-bold uppercase">BAJA VECINO</span>`;
            detalleTexto = `Removió las credenciales de acceso de un usuario.`;
        }
        // --- BLOQUE NUEVO: Deducción inteligente basada en tu tabla auditoria_estados ---
        else if ((ant === 'Resuelta' || ant === 'Resuelto' || ant === 'Rechazada') && nvo === 'En Proceso') {
            tagAccion = `<span class="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-[10px] font-bold uppercase">REAPERTURA</span>`;
            detalleTexto = `Reabrió el caso de <strong>${log.tipo_danio || 'Incidencia'}</strong> para reevaluación.`;
        } 
        else if (nvo === 'Resuelta' || nvo === 'Resuelto') {
            tagAccion = `<span class="px-1.5 py-0.5 bg-green-50 text-green-600 rounded text-[10px] font-bold uppercase">RESOLUCIÓN</span>`;
            detalleTexto = `Solucionó exitosamente el reporte de <strong>${log.tipo_danio || 'Incidencia'}</strong>.`;
        } 
        else if (nvo === 'Rechazada') {
            tagAccion = `<span class="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-bold uppercase">RECHAZADA</span>`;
            detalleTexto = `Desestimó el reporte de <strong>${log.tipo_danio || 'Incidencia'}</strong>.`;
        } 
        // Tu respaldo original por si no entra en ninguna categoría anterior
        else {
            const textoAccion = log.accion || nvo || 'ACCION';
            tagAccion = `<span class="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold uppercase">${textoAccion}</span>`;
            detalleTexto = ant && nvo 
                ? `Cambió el estado del caso de '${ant}' a '${nvo}'.`
                : `Realizó una actualización general en el registro del sistema.`;
        }

        // 🖨️ 5. Armado final respetando milimétricamente tu estructura HTML original de nodos
        item.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-slate-800">${nombreAdmin}</span>
                <span class="text-[10px] text-slate-400 font-mono">${fechaFormateada}</span>
            </div>
            <div class="text-slate-600 text-[11px] flex flex-col gap-0.5 mt-0.5">
                <p class="text-slate-500 italic mb-0.5">${detalleTexto}</p>
                <div class="flex items-center gap-2 flex-wrap">
                    ${tagAccion}
                    <span>Ref: <strong class="font-mono text-slate-700">#${idAfectado}</strong></span>
                </div>
            </div>
        `;
        timeline.appendChild(item);
    });
}

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
            renderizarTimelineAuditoria(cacheLogsAuditoria);
        };
    }
}

function ejecutarFiltradoAuditoria() {
    const busquedaAdmin = document.getElementById('filterAuditAdmin').value.toLowerCase().trim();
    const busquedaFecha = document.getElementById('filterAuditFecha').value; 

    const logsFiltrados = cacheLogsAuditoria.filter(log => {
        const nombreAdmin = (log.administrador_nombre || log.nombre_admin || log.nombre || '').toLowerCase();
        const coincideAdmin = nombreAdmin.includes(busquedaAdmin);

        const fechaLog = log.creado_en ? log.creado_en.split(' ')[0] : '';
        const coincideFecha = !busquedaFecha || (fechaLog === busquedaFecha);

        return coincideAdmin && coincideFecha;
    });

    renderizarTimelineAuditoria(logsFiltrados);
}

function initReporteAdminModal() {
    const modal = document.getElementById('modalReporteAdmin');
    const btnAbrir = document.getElementById('btnAbrirReporteAdmin');
    const btnCerrar = document.getElementById('btnCerrarReporteAdmin');
    const btnCancelar = document.getElementById('btnCancelarReporteAdmin');
    const form = document.getElementById('formReporteAdmin');
    
    // 👇 NUEVO: Declaramos el botón de Excel al inicio junto con los demás
    const btnExportarExcel = document.getElementById('btnExportarExcel');
    const btnLimpiar = document.getElementById('btnLimpiarFiltros');
    const inputDesde = document.getElementById('filtroFechaInicio');
    const inputHasta = document.getElementById('filtroFechaFin');


    if (inputDesde && inputHasta) {
    inputDesde.onchange = () => loadAdminDashboard();
    inputHasta.onchange = () => loadAdminDashboard();
    }



    const formatearFecha = (date) => date.toISOString().split('T')[0];
    
    // Botón Hoy
    document.getElementById('btnFiltroHoy').onclick = () => {
        const hoy = formatearFecha(new Date());
        inputDesde.value = hoy;
        inputHasta.value = hoy;
        loadAdminDashboard();
    };

    // Botón Este Mes (Mayo 2026 en este ejemplo dinámico)
    document.getElementById('btnFiltroMes').onclick = () => {
        const ahora = new Date();
        const primero = formatearFecha(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
        const ultimo = formatearFecha(new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0));
        inputDesde.value = primero;
        inputHasta.value = ultimo;
        loadAdminDashboard();
    };

    // Botón Este Año (2026)
    document.getElementById('btnFiltroAno').onclick = () => {
        const ano = new Date().getFullYear();
        inputDesde.value = `${ano}-01-01`;
        inputHasta.value = `${ano}-12-31`;
        loadAdminDashboard();
    };

    // ⚠️ ATENCIÓN AQUÍ: Modifiqué el "if" de abajo para que no rompa si el botón de Excel no existe
    if (!modal || !btnAbrir || !form) return;

    if (btnLimpiar && inputDesde && inputHasta) {
        btnLimpiar.onclick = () => {
            inputDesde.value = ''; // Vacía el calendario de inicio
            inputHasta.value = ''; // Vacía el calendario de fin
            
            // Opcional: Si quieres que al limpiar vuelva a cargar la tabla completa automáticamente
            if (typeof loadAdminDashboard === 'function') loadAdminDashboard();
        loadAdminDashboard();
        };
    }

            // AHORA QUEDARÁ ASÍ(geolocalizacion):
        btnAbrir.onclick = () => {
            // 1. Abre el modal
            modal.classList.remove('hidden');
            
            // 2. Activa el GPS inyectando los IDs que usarás en el HTML del Admin
            capturarUbicacion({
                boxId: 'adminGeoStatusBox',
                titleId: 'adminGeoTitle',
                coordsId: 'adminGeoCoords',
                btnSubmitId: 'btnReportarAdminSubmit', // <-- Cambia esto por el ID real de tu botón
                latInputId: 'adminIncLatitud',
                lngInputId: 'adminIncLongitud'
            });
        };
    
    const cerrarModal = () => {
        form.reset();
        modal.classList.add('hidden');
    };

    btnCerrar.onclick = cerrarModal;
    btnCancelar.onclick = cerrarModal;

    // 👇 NUEVO: Le asignamos el evento de clic a nuestro botón de Excel
    if (btnExportarExcel) {
        btnExportarExcel.onclick = exportarReporte;
    }

    form.onsubmit = async (e) => {
        e.preventDefault();

        // 1. Extraer el ID del Administrador desde el almacenamiento consistente
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
            alert("❌ Error de sesión: No se pudo verificar tu credencial.");
            return;
        }

        // 2. Mapeo instantáneo: Hereda de forma exacta todos los 'name' del HTML
        const formData = new FormData(form);
        
        // Inyectamos el ID recolectado del administrador en sesión
        formData.append('usuario_id', parseInt(usuarioId)); 

        try {
            const token = localStorage.getItem('token');

            // 3. Disparo al endpoint unificado
            const response = await fetch(`${API_BASE}/incidencias`, {
                method: 'POST',
                headers: { 
                    'Authorization': token 
                },
                body: formData
            });

            const result = await response.json();

            if (!response.ok) throw new Error(result.message || 'Error en el procesamiento del servidor.');

            alert('🎉 ¡Perfecto! Incidencia subida bajo tu rol con éxito.');
            cerrarModal();

            // Sincronizar el Dashboard del administrador inmediatamente
            if (typeof loadAdminDashboard === 'function') {
                loadAdminDashboard();
            } else if (typeof loadIncidencias === 'function') {
                loadIncidencias();
            }

        } catch (error) {
            alert(`❌ Error en el envío: ${error.message}`);
        }
    };
}

// 👇 NUEVO: La función que hace la magia de descargar el Excel (déjala afuera, abajito)
async function exportarReporte() {
    try {
        const token = localStorage.getItem('token');
        const urlServidor = `${API_BASE}/admin/exportar`; 

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
        a.download = 'Reporte_Incidencias.xlsx';
        document.body.appendChild(a);
        a.click();
        
        a.remove();
        window.URL.revokeObjectURL(urlDescarga);

    } catch (error) {
        console.error('Hubo un problema:', error);
        alert(`❌ No se pudo exportar: ${error.message}`);
    }
}

// 1. READ (Mejorado): Carga activos o eliminados según se le pida
async function loadUsuariosMaster(tipo = 'activos') {
    const tbody = document.getElementById('tablaUsuariosMasterBody');
    if (!tbody) return;

    // Guardamos el estado global para usarlo en el renderizador
    vistaUsuariosActual = tipo; 

    try {
        const token = localStorage.getItem('token');
        
        // 🔥 Agregamos el query parameter (?tipo=...) que configuramos en el backend
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
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-rose-500">❌ Error al cargar listado: ${error.message}</td></tr>`;
    }
}

// 2. RENDER (Mejorado): Cambia los botones dinámicamente según la vista activa
function renderizarTablaUsuarios(usuarios) {
    const tbody = document.getElementById('tablaUsuariosMasterBody');
    tbody.innerHTML = '';

    if (usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-slate-400 italic">No hay usuarios en esta categoría.</td></tr>`;
        return;
    }

    usuarios.forEach(user => {
        const fila = document.createElement('tr');
        fila.className = "border-b border-slate-100 hover:bg-slate-50/50 transition-colors text-xs text-slate-600";

        const tagRol = user.rol_id == 1 
            ? `<span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-bold text-[10px]">ADMIN</span>`
            : `<span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-bold text-[10px]">VECINO</span>`;

        // 🪄 LA MAGIA: Si estamos viendo la papelera, cambiamos el botón de borrar por el de reactivar
        let botonesAccion = '';
        
        if (vistaUsuariosActual === 'activos') {
            // Botones normales: Editar y Dar de baja lógicamente
            botonesAccion = `
                <button onclick="abrirModalEditarUsuario('${user.id}')" class="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Editar Cuenta">
                    <i class="ti ti-edit text-base"></i>
                </button>
                <button onclick="eliminarUsuarioId('${user.id}')" class="p-1 text-rose-600 hover:bg-rose-50 rounded transition-colors" title="Dar de Baja">
                    <i class="ti ti-trash text-base"></i>
                </button>
            `;
        } else {
            // Botón de amnistía: Reactivar usuario
            botonesAccion = `
                <button onclick="reactivarUsuarioId('${user.id}')" class="p-1 px-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-md font-bold text-[10px] flex items-center gap-1 transition-colors" title="Reactivar Cuenta">
                    <i class="ti ti-refresh text-xs"></i> Reactivar
                </button>
            `;
        }

        fila.innerHTML = `
            <td class="p-3 font-mono font-bold text-slate-400">#${user.id}</td>
            <td class="p-3 font-semibold text-slate-800">${user.nombre}</td>
            <td class="p-3 font-mono">${user.correo}</td>
            <td class="p-3">${tagRol}</td>
            <td class="p-3 flex items-center justify-center gap-2">${botonesAccion}</td>
        `;
        tbody.appendChild(fila);
    });
}

// 3. ACCIÓN NUEVA: Consumir el endpoint de reactivación (POST)
async function reactivarUsuarioId(id) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/admin/usuarios/${id}/reactivar`, {
            method: 'POST',
            headers: { 'Authorization': token }
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        alert(`🎉 ${result.message}`);
        
        // Volvemos a cargar la papelera para verificar que ya no esté ahí
        loadUsuariosMaster('eliminados'); 

    } catch (error) {
        alert(`❌ Error al reactivar: ${error.message}`);
    }
}

// 3. UPDATE (Paso A): Abrir el modal cargando los datos desde la memoria caché
function abrirModalEditarUsuario(id) {
    const usuario = cacheUsuariosMaster.find(u => u.id == id);
    if (!usuario) return;

    document.getElementById('editUserId').value = usuario.id;
    document.getElementById('editUserNombre').value = usuario.nombre;
    document.getElementById('editUserCorreo').value = usuario.correo;
    document.getElementById('editUserRol').value = usuario.rol_id;

    document.getElementById('modalEditarUsuario').classList.remove('hidden');
}

function cerrarModalEditarUsuario() {
    document.getElementById('formEditarUsuario').reset();
    document.getElementById('modalEditarUsuario').classList.add('hidden');
}

// 3. UPDATE (Paso B): Capturar el submit y mandar la actualización al Servidor (PUT)
document.getElementById('formEditarUsuario').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;

    const bodyData = {
        nombre: document.getElementById('editUserNombre').value.trim(),
        correo: document.getElementById('editUserCorreo').value.trim(),
        rol_id: document.getElementById('editUserRol').value
    };

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

        alert(`🎉 ${result.message}`);
        cerrarModalEditarUsuario();
        loadUsuariosMaster(); // Recargar tabla instantáneamente

    } catch (error) {
        alert(`❌ Error al actualizar: ${error.message}`);
    }
};

// 4. DELETE: Lanzar petición de borrado definitivo (DELETE) con confirmación nativa
async function eliminarUsuarioId(id) {
    // Evitar auto-eliminación analizando el ID en sesión
    const miId = JSON.parse(localStorage.getItem('user'))?.id;
    if (id == miId) {
        alert("🔒 Operación denegada: No puedes eliminar tu propia cuenta de administrador en uso.");
        return;
    }

    if (!confirm(`⚠️ ¿Estás completamente seguro de eliminar permanentemente al usuario #${id}? Esta acción es irreversible.`)) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/admin/usuarios/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': token }
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        alert(`🗑️ ${result.message}`);
        loadUsuariosMaster(); // Refrescar la vista de inmediato

    } catch (error) {
        alert(`❌ Error al eliminar: ${error.message}`);
    }
}

function cerrarModalCierre() {
    document.getElementById('formCierreIncidencia').reset();
    document.getElementById('modalCierreIncidencia').classList.add('hidden');
    
    // Si guardamos el select original, lo regresamos a su estado real en la caché
    if (window.selectStatusActual) {
        const id = document.getElementById('cierreIncidenciaId').value;
        const caso = BACKEND_INCIDENCIAS_CACHE.find(inc => String(inc.id) === String(id));
        if (caso) {
            window.selectStatusActual.value = caso.estado;
        }
        window.selectStatusActual = null;
    }
}

document.getElementById('formCierreIncidencia').onsubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // Corta el burbujeo de eventos en seco

    const id = document.getElementById('cierreIncidenciaId').value;
    const nuevoEstado = document.getElementById('cierreNuevoEstado').value;
    const form = document.getElementById('formCierreIncidencia');

    const formData = new FormData(form);
    formData.append('estado', nuevoEstado); 

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/incidencias/${id}/resolver`, {
            method: 'POST',
            headers: { 'Authorization': token },
            body: formData
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Error al resolver la incidencia.');

        // 1. Modificamos la caché primero
        const index = BACKEND_INCIDENCIAS_CACHE.findIndex(inc => String(inc.id) === String(id));
        if (index !== -1) {
            BACKEND_INCIDENCIAS_CACHE[index].estado = nuevoEstado;
            BACKEND_INCIDENCIAS_CACHE[index].foto_cierre = result.foto_cierre;
            BACKEND_INCIDENCIAS_CACHE[index].nota_cierre = document.getElementById('cierreNota').value.trim();
        }

        // 2. Limpiamos y cerramos la interfaz de inmediato
        window.selectStatusActual = null;
        cerrarModalCierre();
        displayAlert(`✅ Caso #${id} cerrado oficialmente con evidencia guardada.`);

        // 3. Forzamos renderizado manual limpio sin disparar eventos del DOM
        renderMetricsAndIncidencias(BACKEND_INCIDENCIAS_CACHE, BACKEND_INCIDENCIAS_CACHE);

        if (typeof renderSectoresCriticos === 'function') {
            renderSectoresCriticos(BACKEND_INCIDENCIAS_CACHE);
        }

    } catch (err) {
        displayAlert(err.message, 'error');
    }

    return false; // Candado final absoluto anti-refresco
};

window.abrirModalDetalleIncidencia = function(id, titulo, descripcion, fotoUrl, estado, sector, urgencia, latitud, longitud) {

    // 1. Cierre preventivo del popup de Leaflet para limpiar el mapa
    if (typeof objetoMapa !== 'undefined' && objetoMapa !== null) {
        objetoMapa.closePopup(); 
    }
    
    // 2. Buscamos el modal que ya vive fijo en el HTML
    const modal = document.getElementById('modalDetalleGlobal');
    if (!modal) return; // Control de seguridad por si acaso

    // 3. Inyectar los datos dinámicos básicos
    document.getElementById('mdG-titulo').innerText = titulo || 'Detalle de Incidencia';
    document.getElementById('mdG-descripcion').innerText = descripcion || 'Sin descripción disponible.';
    document.getElementById('mdG-imagen').src = fotoUrl || 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=150';
    document.getElementById('mdG-sector').innerHTML = `<i class="ti ti-map-pin text-blue-400"></i> ${sector || 'Desconocido'}`;
    document.getElementById('mdG-urgencia').innerText = urgencia || 'Media';
    
    // 4. 💥 CONSTRUIR LA RUTA DE GOOGLE MAPS PREMIUM (Arreglando la inyección de variables)
    const contenedorRuta = document.getElementById('mdG-contenedor-ruta');
    if (latitud && longitud && latitud !== 'undefined' && longitud !== 'undefined') {
        const urlGoogleMaps = `https://www.google.com/maps/dir/?api=1&destination=${latitud},${longitud}&travelmode=driving`;
        
        contenedorRuta.innerHTML = `
            <a href="${urlGoogleMaps}" target="_blank" rel="noopener noreferrer" 
               class="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-950/50 cursor-pointer text-center block">
                <i class="ti ti-map-2 text-sm">🧭</i> ¡Trazar ruta GPS en Google Maps!
            </a>
        `;
    } else {
        contenedorRuta.innerHTML = `
            <p class="text-[10px] text-slate-500 text-center italic bg-slate-950/30 py-2 rounded border border-slate-800/40">
                Coordenadas no disponibles para este reporte.
            </p>
        `;
    }

    // 5. Configurar los estilos de la etiqueta de estado
    const badgeEstado = document.getElementById('mdG-estado');
    badgeEstado.innerText = estado || 'Pendiente';
    badgeEstado.className = "px-2 py-0.5 rounded-full text-[10px] font-bold border";
    
    if (estado === 'En Proceso') {
        badgeEstado.classList.add('bg-amber-500/10', 'text-amber-400', 'border-amber-500/20');
    } else if (estado === 'Resuelta' || estado === 'Resuelto') {
        badgeEstado.classList.add('bg-green-500/10', 'text-green-400', 'border-green-500/20');
    } else if (estado === 'Rechazada') {
        badgeEstado.classList.add('bg-slate-500/10', 'text-slate-400', 'border-slate-700');
    } else {
        badgeEstado.classList.add('bg-red-500/10', 'text-red-400', 'border-red-500/20');
    }

    // 6. Mostrar el modal con su respectiva transición suave
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

// 🚪 Función para destruir el modal
function cerrarModalEditarSolucion() {
    const modal = document.getElementById('modalEditarSolucionAdmin');
    if (modal) modal.remove();
}

function cerrarModalEditarSolucion() {
    const modal = document.getElementById('modalEditarSolucionAdmin');
    if (modal) modal.remove();
}

// 👇 NUEVO: La función que hace la magia de descargar el Excel (déjala afuera, abajito)
async function exportarReporte() {
    try {
        const token = localStorage.getItem('token');
        
        // 1. Capturamos los inputs de fecha de la pantalla
        const inputDesde = document.getElementById('filtroFechaInicio');
        const inputHasta = document.getElementById('filtroFechaFin');
        
        const desde = inputDesde ? inputDesde.value : '';
        const hasta = inputHasta ? inputHasta.value : '';

        // 2. Construimos la URL base
        let urlServidor = `${API_BASE}/admin/exportar`; 

        // 3. 💥 EL AJUSTE CLAVE: Si hay fechas, se las pegamos a la URL
        if (desde && hasta) {
            urlServidor += `?desde=${desde}&hasta=${hasta}`;
        }

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
        
        // Dinamizamos el nombre del archivo según lo que se exporta
        a.download = (desde && hasta) 
            ? `Reporte_Filtrado_${desde}_a_${hasta}.xls` 
            : 'Reporte_Anual_2026.xls';

        document.body.appendChild(a);
        a.click();
        
        a.remove();
        window.URL.revokeObjectURL(urlDescarga);

    } catch (error) {
        console.error('Hubo un problema:', error);
        alert(`❌ No se pudo exportar: ${error.message}`);
    }
}