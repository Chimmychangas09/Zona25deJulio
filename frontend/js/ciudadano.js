let VECINO_INCIDENCIAS_CACHE = [];

document.addEventListener("DOMContentLoaded", function() {
    if (!checkAuth('Ciudadano')) return; // Seguridad en cliente
    
    // 1. Pintar el nombre del vecino en la bienvenida
    const lblNombre = document.getElementById('lblVecinoNombre');
    if (lblNombre && AppState.user) {
        lblNombre.innerText = AppState.user.nombre;
    }

    // 2. Inicializar listeners de navegación interna
    initCiudadanoNavigation();
    initIncidentFormListener();
    loadVecinoDashboard(); //

    // Listener del botón Logout (Ya corregido sin href nativo)
    const btnLogout = document.getElementById('navBtnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }
});


// ==========================================
// 🧭 ORQUESTADOR DE VISTAS INTERNAS
// ==========================================
function initCiudadanoNavigation() {
    const btnIrAReportar = document.getElementById('btnIrAReportar');
    const btnVolver = document.getElementById('btnVolverAlDashboard');
    const viewDashboard = document.getElementById('viewCiudadanoDashboard');
    const viewReportar = document.getElementById('viewReportar');

    if (btnIrAReportar && viewDashboard && viewReportar) {
        btnIrAReportar.addEventListener('click', () => {
            // Ir al formulario
            viewDashboard.classList.add('hidden');
            viewReportar.classList.remove('hidden');
            
            // 📡 RECIÉN AQUÍ inicializamos el GPS cuando el usuario lo necesita
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
            // Regresar al dashboard
            viewReportar.classList.add('hidden');
            viewDashboard.classList.remove('hidden');
        });
    }
}

// ==========================================
// 📡 MÓDULO DE GEOLOCALIZACIÓN NATIVA
// ==========================================
// ya en utils.js


// ==========================================
// ⚙️ ENVÍO DE DATOS
// ==========================================
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
            
            // Regresar automáticamente al Dashboard del ciudadano tras un reporte exitoso
            document.getElementById('btnVolverAlDashboard').click();
        } catch (err) {
            displayAlert(err.message, 'error');
        }
    });
}

// ==========================================
// 📥 CARGA Y CLASIFICACIÓN DE REPORTES
// ==========================================
// 📦 Declaramos la variable de caché global (ponla arriba de la función si no existe)

async function loadVecinoDashboard() {
    try {
        const response = await fetch(API_BASE + '/incidencias', {
            method: 'GET',
            headers: { 'Authorization': AppState.token }
        });
        const result = await response.json();
        
        if (response.ok) {
            // 🎯 Guardamos la lista completa en nuestra caché global
            VECINO_INCIDENCIAS_CACHE = result.data || [];
            
            // 🔄 Renderizamos usando el filtro por defecto ('activas')
            filtrarIncidenciasVecino('activas');
        } else {
            marcarListasVacias();
        }
    } catch (err) {
        console.error("Error cargando el feed del ciudadano:", err);
        marcarListasVacias();
    }
}

// En ciudadano.js (Versión simplificada para un solo barrio exclusivo)
function renderListadosVecino(incidencias) {
    const contenedorMisReportes = document.getElementById('listaMisReportes');
    const contenedorSector = document.getElementById('listaReportesSector');
    
    if (!contenedorMisReportes || !contenedorSector) return;

    // 🛡️ Extraemos el ID de forma segura por si no hay sesión
    const miId = AppState.user ? AppState.user.id : null;

    // 1. Mis Reportes: Normalizamos a String para evitar fallos de tipos de datos
    const misReportes = incidencias.filter(inc => String(inc.usuario_id) === String(miId));

    // 2. Reportes de la Comunidad: Todo lo que no sea mío
    const reportesComunidad = incidencias.filter(inc => String(inc.usuario_id) !== String(miId));

    // 3. Renderizar Mis Reportes
    if (misReportes.length === 0) {
        contenedorMisReportes.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-lg border border-dashed">Aún no has enviado ningún reporte.</p>`;
    } else {
        // 🔥 Aquí se van a disparar tus logs chismosos
        contenedorMisReportes.innerHTML = misReportes.map(inc => generarTarjetaVecino(inc, true)).join('');
    }

    // 4. Renderizar Reportes de la Comunidad
    if (reportesComunidad.length === 0) {
        contenedorSector.innerHTML = `<p class="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-lg border border-dashed">No hay reportes activos de otros vecinos en el barrio.</p>`;
    } else {
        contenedorSector.innerHTML = reportesComunidad.map(inc => generarTarjetaVecino(inc, false)).join('');
    }
}

// Helper para armar tarjetas compactas y estéticas sin selectores de edición
// Helper para armar tarjetas compactas y estéticas sin selectores de edición
function generarTarjetaVecino(inc, esPropio) {

    // 🎨 1. Cambios dinámicos de color según el estado
    let bgTarjeta = 'bg-white border-slate-200';
    let badgeEstado = 'bg-red-100 text-red-700';
    
    if (inc.estado === 'En Proceso') {
        badgeEstado = 'bg-amber-100 text-amber-700';
    } else if (inc.estado === 'Resuelta' || inc.estado === 'Resuelto') {
        badgeEstado = 'bg-emerald-600 text-white shadow-sm';
        bgTarjeta = 'bg-emerald-50/40 border-emerald-100';
    }

    // 📸 2. SOLUCIÓN AL CONTROL DE RUTAS (Evita el "uploads/uploads/")
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

    // 🕒 3. Procesador de fechas
    const campoFecha = inc.creado_en || inc.fecha;
    let fechaFormateada = campoFecha ? new Date(campoFecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : 'Reciente';

    // ✅ 4. BLINDAJE ANTI-NULL PARA FOTOS DE CIERRE
    const esResuelta = inc.estado === 'Resuelta' || inc.estado === 'Resuelto';
    let botonEvidencia = '';
    
    if (esResuelta) {
        const fotoCierreSegura = (inc.foto_cierre && inc.foto_cierre !== 'null') ? inc.foto_cierre : '';
        const notaLimpia = inc.nota_cierre ? inc.nota_cierre.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '¡Reporte solucionado con éxito por la administración!';
        
        botonEvidencia = `<button onclick="verEvidenciaCierre('${fotoCierreSegura}', '${notaLimpia}')" class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md hover:bg-emerald-200 transition-colors ml-2">📸 Ver Solución</button>`;
    }

    // 🔥 5. AQUÍ ESTÁ LA CORRECCIÓN: Escapamos los textos para evitar el ReferenceError
    const tituloEscapado = inc.titulo ? inc.titulo.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Incidencia Vecinal';
    const descEscapada = inc.descripcion ? inc.descripcion.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
    const sectorEscapado = inc.sector ? inc.sector.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'General';

    // 6. Retornamos la plantilla integrada
    return `
        <div class="flex rounded-xl border shadow-sm overflow-hidden min-h-[85px] transition-all ${bgTarjeta}">
            <div class="w-20 h-auto bg-slate-100 flex-shrink-0 relative">
                <img src="${urlFoto}" alt="Evidencia" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=150'">
                ${esResuelta ? `<div class="absolute inset-0 bg-emerald-950/20 flex items-center justify-center"><i class="ti ti-circle-check text-white text-xl drop-shadow"></i></div>` : ''}
            </div>
            
            <div class="p-3 flex-1 flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-center mb-1 gap-2">
                        <span class="text-[9px] uppercase font-bold tracking-tight bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">${inc.tipo_danio || 'Urbano'}</span>
                        <span class="text-[9px] font-bold ${badgeEstado} px-2 py-0.5 rounded-full uppercase tracking-wider">${inc.estado}</span>
                    </div>
                    <p class="text-xs text-slate-600 line-clamp-1">${inc.descripcion}</p>
                </div>
                
                <div class="flex items-center justify-between text-[10px] text-slate-400 mt-1 pt-1 border-t border-slate-100 gap-1.5">
                    <div class="flex items-center gap-1.5 truncate">
                        <span class="truncate"><i class="ti ti-map-pin text-[11px]"></i> ${inc.sector || 'General'}</span>
                        <span>•</span>
                        <span>${fechaFormateada}</span>
                        ${botonEvidencia} 
                    </div>
                    
                    <div class="flex items-center gap-1.5 flex-shrink-0">
                        ${esPropio ? `<span class="text-blue-600 font-bold text-[9px] bg-blue-50 px-1.5 py-0.5 rounded">Tu reporte</span>` : ''}
                        
                        <button onclick="abrirModalDetalleIncidencia('${inc.id}', '${tituloEscapado}', '${descEscapada}', '${urlFoto}', '${inc.estado}', '${sectorEscapado}', '${inc.urgencia || 'Media'}', '${inc.latitud}', '${inc.longitud}')" 
                                class="text-[9px] bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white px-2 py-0.5 rounded font-bold transition-colors border border-slate-200 hover:border-blue-600 cursor-pointer">
                            Ver reporte
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function marcarListasVacias() {
    const vacioHtml = `<p class="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-lg border border-dashed">No se pudieron cargar los datos.</p>`;
    if(document.getElementById('listaMisReportes')) document.getElementById('listaMisReportes').innerHTML = vacioHtml;
    if(document.getElementById('listaReportesSector')) document.getElementById('listaReportesSector').innerHTML = vacioHtml;
}

function filtrarIncidenciasVecino(tipo) {
    // 🎨 Cambiar estilos visuales de las píldoras de filtro
    ['Activas', 'MisReportes', 'Resueltas'].forEach(f => {
        const btn = document.getElementById(`btnFiltro${f}`);
        if(btn) {
            btn.classList.remove('bg-slate-900', 'text-white', 'bg-slate-100', 'text-slate-600');
            if(f.toLowerCase() === tipo.replace('_', '')) {
                btn.classList.add('bg-slate-900', 'text-white');
            } else {
                btn.classList.add('bg-slate-100', 'text-slate-600');
            }
        }
    });

    // 👤 Extraemos el ID del ciudadano desde tu AppState
    const miId = AppState.user ? AppState.user.id : null;

    // 📦 Filtramos el Array global basándonos en tu caché real
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

    // 🚀 REUTILIZACIÓN: Le pasamos la lista filtrada a tu renderizador original
    if (incidenciasFiltradas.length === 0) {
        marcarListasVacias();
    } else {
        renderListadosVecino(incidenciasFiltradas);
    }
}

function verEvidenciaCierre(fotoCierre, notaCierre) {
    // 1. Validar que tengamos una foto o una nota que mostrar
    const notaMostrar = (notaCierre && notaCierre !== 'null' && notaCierre !== 'undefined') 
        ? notaCierre 
        : 'El administrador marcó este reporte como solucionado con éxito.';

    // 2. Procesar la URL de la foto de la solución
    let urlFotoCierre = 'https://images.unsplash.com/photo-1584467541268-b040f83be3fd?w=500'; // Respaldo genérico de obra terminada
    if (fotoCierre && fotoCierre !== 'null' && fotoCierre !== 'undefined') {
        urlFotoCierre = fotoCierre.startsWith('http') ? fotoCierre : FILE_SERVER + fotoCierre;
    }

    // 3. Crear el contenedor del modal flotante
    const modal = document.createElement('div');
    modal.id = 'modalEvidenciaCierre';
    modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in";
    
    // 4. Inyectar el diseño del modal (Estilo Mobile-First Premium)
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

    // 5. Insertar el modal al final del body del HTML
    document.body.appendChild(modal);
}

// 🚪 Función auxiliar para destruir el modal al cerrar
function cerrarModalEvidencia() {
    const modal = document.getElementById('modalEvidenciaCierre');
    if (modal) {
        modal.remove();
    }
}