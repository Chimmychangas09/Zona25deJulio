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

let objetoMapa = null; // Control global del mapa

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

// UBICACION PARA AMBOS 
function capturarUbicacion(config) {
    const box = document.getElementById(config.boxId);
    const title = document.getElementById(config.titleId);
    const coordsSpan = document.getElementById(config.coordsId);
    const btnSubmit = document.getElementById(config.btnSubmitId);
    const inputLat = document.getElementById(config.latInputId);
    const inputLng = document.getElementById(config.lngInputId);

    if (!box) return;

    if (!navigator.geolocation) {
        box.className = 'bg-red-50 border border-dashed border-red-300 rounded-lg p-4 mb-6';
        if (title) title.innerText = 'Sensor Incompatible';
        if (coordsSpan) coordsSpan.innerText = 'Tu navegador no soporta la API de Geolocalización.';
        return;
    }

    // Estado de carga
    box.className = 'bg-amber-50 border border-dashed border-amber-300 rounded-lg p-4 mb-6';
    if (title) title.innerText = 'Adquiriendo Coordenadas GPS...';
    if (coordsSpan) coordsSpan.innerText = 'Buscando satélites de posicionamiento...';
    if (btnSubmit) btnSubmit.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Asignar a los inputs ocultos si existen
            if (inputLat) inputLat.value = lat;
            if (inputLng) inputLng.value = lng;

            box.className = 'bg-green-50 border border-dashed border-green-300 rounded-lg p-4 mb-6';
            if (title) title.innerText = 'Ubicación Satelital Fijada';
            if (coordsSpan) coordsSpan.innerText = `Lat: ${lat.toFixed(6)} | Lng: ${lng.toFixed(6)} (Precisión: ${position.coords.accuracy.toFixed(1)}m)`;
            if (btnSubmit) btnSubmit.disabled = false;
        },
        (error) => {
            box.className = 'bg-red-50 border border-dashed border-red-300 rounded-lg p-4 mb-6';
            if (title) title.innerText = 'Fallo del Sensor GPS';
            if (btnSubmit) btnSubmit.disabled = true;
            if (coordsSpan) coordsSpan.innerText = error.code === error.PERMISSION_DENIED 
                ? "Acceso denegado. Activa los permisos de ubicación."
                : "No se logró capturar la ubicación física actual.";
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

// 1. Función auxiliar para definir colores según urgencia
function obtenerColorUrgencia(urgencia) {
    switch (urgencia?.toLowerCase().trim()) {
        case 'alta':
        case 'critica':
        case 'crítica':
            return '#ef4444'; // Rojo (Tailwind red-500)
        case 'media':
            return '#f59e0b'; // Ámbar (Tailwind amber-500)
        case 'baja':
            return '#10b981'; // Esmeralda (Tailwind emerald-500)
        default:
            return '#3b82f6'; // Azul por defecto (Tailwind blue-500)
    }
}

// 2. Función principal del mapa
function inicializarMapaCalor(incidencias) {
    // 🛑 PROTECCIÓN 1: Obtener el contenedor real y verificar que esté visible en la pantalla
    const mapaContenedor = document.getElementById('mapaIncidencias');
    if (!mapaContenedor) return;

    if (mapaContenedor.offsetWidth === 0 || mapaContenedor.offsetHeight === 0) {
        console.warn("El contenedor del mapa no tiene dimensiones aún. Reintentando en el próximo ciclo...");
        return;
    }

    // Limpieza del mapa anterior
    if (objetoMapa !== null) {
        objetoMapa.remove();
        objetoMapa = null;
    }

    if (!incidencias || incidencias.length === 0) return;

    // 📍 AJUSTE: Centrado en la Zona 25 de Julio / Distrito de El Alto
    objetoMapa = L.map('mapaIncidencias').setView([-16.5120, -68.1980], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(objetoMapa);

    const puntosCalor = [];

    // 3. Recorrer incidencias para crear el Heatmap Y los Pines de colores
    incidencias.forEach(inc => {
        if (!inc.latitud || !inc.longitud) return;

        const lat = parseFloat(inc.latitud);
        const lng = parseFloat(inc.longitud);

        puntosCalor.push([lat, lng, 0.4]); 

        const colorPin = obtenerColorUrgencia(inc.urgencia);

        const marker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: colorPin,
            color: '#ffffff', 
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        }).addTo(objetoMapa);

        // 📸 CONTROL DE LA URL DE LA FOTO (Reutilizamos tu respaldo)
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

        // 🪓 Escapamos los textos para guardarlos de manera segura en los atributos "data-" del botón
        const tituloEscapado = inc.titulo ? inc.titulo.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'Incidencia';
        const descEscapada = inc.descripcion ? inc.descripcion.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
        const sectorEscapado = inc.sector ? inc.sector.replace(/'/g, "\\'").replace(/"/g, '&quot;') : 'General';

        // 4. Diseñamos la ventanita pasando la data limpia mediante atributos personalizados data-*
        // 4. Diseñamos la ventanita (Popup) con un ancho mínimo controlado para Leaflet
        const popupContent = `
            <div class="text-slate-900 font-sans p-1" style="width: 230px; min-width: 230px;">
                <h4 class="font-bold text-xs text-slate-800 mb-1 uppercase truncate">${tituloEscapado}</h4>
                <p class="text-[11px] text-slate-600 mb-3 line-clamp-2">${descEscapada || 'Sin descripción detallada.'}</p>
                
                <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 w-full">
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold text-white shrink-0" style="background-color: ${colorPin}">
                        ${inc.urgencia || 'Media'}
                    </span>
                    
                    <button class="btn-ver-detalle text-[11px] text-blue-600 font-bold hover:underline cursor-pointer focus:outline-none whitespace-nowrap bg-transparent border-none p-0 pr-1"
                            data-id="${inc.id}"
                            data-titulo="${tituloEscapado}"
                            data-descripcion="${descEscapada}"
                            data-foto="${urlFoto}"
                            data-estado="${inc.estado}"
                            data-sector="${sectorEscapado}"
                            data-urgencia="${inc.urgencia || 'Media'}"
                            data-latitud="${inc.latitud}"
                            data-longitud="${inc.longitud}">
                        Ver detalle →
                    </button>
                </div>
            </div>
        `;
        marker.bindPopup(popupContent);
    });

    // Dibujar el mapa de calor debajo de los pines
    if (puntosCalor.length > 0) {
        L.heatLayer(puntosCalor, {
            radius: 30,
            blur: 18,
            maxZoom: 15
        }).addTo(objetoMapa);
    }

    // 💥 NUEVA SECCIÓN MÁGICA: Escuchador global de popups para detonar el modal de utils.js
    objetoMapa.on('popupopen', function(e) {
        // Buscamos el botón que se acaba de renderizar físicamente en el mapa
        const botonPopup = e.popup._contentNode.querySelector('.btn-ver-detalle');
        
        if (botonPopup) {
            botonPopup.addEventListener('click', function() {
                // Extraemos la data limpia almacenada en el dataset del botón
                const id = this.getAttribute('data-id');
                const titulo = this.getAttribute('data-titulo');
                const descripcion = this.getAttribute('data-descripcion');
                const foto = this.getAttribute('data-foto');
                const estado = this.getAttribute('data-estado');
                const sector = this.getAttribute('data-sector');
                const urgencia = this.getAttribute('data-urgencia');
                const latitud = this.getAttribute('data-latitud');
                const longitud = this.getAttribute('data-longitud');

                // Disparamos la hermosa función compartida de utils.js
                if (typeof window.abrirModalDetalleIncidencia === 'function') {
                    window.abrirModalDetalleIncidencia(id, titulo, descripcion, foto, estado, sector, urgencia, latitud, longitud);
                }
            });
        }
    });

    // ⚡ PROTECCIÓN 2: Ajuste de viewport
    objetoMapa.invalidateSize();
}

document.addEventListener('click', function (evento) {
    if (evento.target && evento.target.classList.contains('btn-ver-detalle')) {
        evento.preventDefault();
        
        const rawId = evento.target.getAttribute('data-id');
        if (!rawId) return;
        
        const incidenciaId = rawId.toString().trim();
        const tarjeta = document.getElementById(`incidencia-row-${incidenciaId}`);
        
        if (tarjeta) {
            console.log("¡Tarjeta encontrada! Forzando Scroll Alternativo...");

            // 🔥 ALTERNATIVA DE CONTROL: 
            // Usamos setTimeout para romper el bloqueo de foco que hace Leaflet
            setTimeout(() => {
                // Método A: Scroll nativo al centro
                tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Método B: Por si el contenedor tiene overflow interno, forzamos el foco manual
                tarjeta.focus({ preventScroll: true }); 
            }, 100);
            
            // Efecto visual de iluminación (Subimos la escala para que notes si parpadea)
            tarjeta.classList.add('bg-slate-700/80', 'border-l-blue-500', 'ring-2', 'ring-blue-500/50', 'scale-[1.02]');
            
            setTimeout(() => {
                tarjeta.classList.remove('bg-slate-700/80', 'border-l-blue-500', 'ring-2', 'ring-blue-500/50', 'scale-[1.02]');
            }, 2500);
        }
    }
});

// 5. 👇 NUEVA FUNCIÓN GLOBAL: Te lleva físicamente a la incidencia en tu panel
window.irAIncidenciaEnLista = (id) => {
    // Busca el elemento en tu HTML (asegúrate de que las filas de tu tabla o tus tarjetas tengan un id similar)
    const elemento = document.getElementById(`incidencia-row-${id}`) || document.getElementById(`incidencia-${id}`);
    
    if (elemento) {
        // Hace un scroll suave y centra el elemento en la pantalla del administrador
        elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Destello visual temporal para que el admin sepa exactamente cuál está viendo
        elemento.classList.add('bg-slate-700/50', 'border-blue-500');
        setTimeout(() => {
            elemento.classList.remove('bg-slate-700/50', 'border-blue-500');
        }, 2000);
    } else {
        console.warn(`No se encontró el elemento HTML para la incidencia ID: ${id}`);
    }
};

// Exponer la función al objeto global window para que se use desde cualquier vista
window.abrirModalDetalleIncidencia = function(id, titulo, descripcion, fotoUrl, estado, sector, urgencia, latitud, longitud) {

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
                    <button onclick="cerrarModalDetalleGlobal()" class="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer">
                        <i class="ti ti-x text-lg">✖</i>
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
                            <span class="text-slate-500 block text-[9px] uppercase font-bold mb-0.5">⚠️ Nivel de Urgencia</span>
                            <span id="mdG-urgencia" class="text-slate-300 font-medium capitalize"></span>
                        </div>
                    </div>

                    <div id="mdG-contenedor-ruta" class="pt-2">
                        </div>
                </div>
                
                <div class="p-3.5 bg-slate-950/40 border-t border-slate-800 flex justify-between items-center px-5">
                    <div class="flex items-center gap-1.5">
                        <span class="text-[9px] uppercase font-bold text-slate-500">Estado:</span>
                        <span id="mdG-estado" class="px-2 py-0.5 rounded-full text-[10px] font-bold border"></span>
                    </div>
                    <button onclick="cerrarModalDetalleGlobal()" class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-all cursor-pointer">
                        Cerrar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // 2. Inyectar los datos dinámicos básicos
    document.getElementById('mdG-titulo').innerText = titulo || 'Detalle de Incidencia';
    document.getElementById('mdG-descripcion').innerText = descripcion || 'Sin descripción disponible.';
    document.getElementById('mdG-imagen').src = fotoUrl || 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=150';
    document.getElementById('mdG-sector').innerHTML = `<i class="ti ti-map-pin text-blue-400"></i> ${sector || 'Desconocido'}`;
    document.getElementById('mdG-urgencia').innerText = urgencia || 'Media';
    
    // 3. 💥 CONSTRUIR LA RUTA DE GOOGLE MAPS
    const contenedorRuta = document.getElementById('mdG-contenedor-ruta');
    if (latitud && longitud) {
        // La URL mágica de Google Maps ("dir" significa direction, origin se deja vacío para que use el GPS actual del usuario)
        const urlGoogleMaps = `https://www.google.com/maps/dir/?api=1&destination=${latitud},${longitud}&travelmode=driving`;
        
        contenedorRuta.innerHTML = `
            <a href="${urlGoogleMaps}" target="_blank" rel="noopener noreferrer" 
               class="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-950/50 cursor-pointer">
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

    // Configurar etiqueta de estado
    const badgeEstado = document.getElementById('mdG-estado');
    badgeEstado.innerText = estado || 'Pendiente';
    badgeEstado.className = "px-2 py-0.5 rounded-full text-[10px] font-bold border ";
    if (estado === 'En Proceso') {
        badgeEstado.classList.add('bg-amber-500/10', 'text-amber-400', 'border-amber-500/20');
    } else if (estado === 'Resuelta' || estado === 'Resuelto') {
        badgeEstado.classList.add('bg-green-500/10', 'text-green-400', 'border-green-500/20');
    } else if (estado === 'Rechazada') {
        badgeEstado.classList.add('bg-slate-500/10', 'text-slate-400', 'border-slate-700');
    } else {
        badgeEstado.classList.add('bg-red-500/10', 'text-red-400', 'border-red-500/20');
    }

    // Mostrar el modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95');
        modal.querySelector('.transform').classList.add('scale-100');
    }, 10);
};

// Función global auxiliar para cerrar el modal de forma limpia
window.cerrarModalDetalleGlobal = function() {
    const modal = document.getElementById('modalDetalleGlobal');
    if (modal) {
        modal.querySelector('.transform').classList.remove('scale-100');
        modal.querySelector('.transform').classList.add('scale-95');
        setTimeout(() => {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }, 150); // Tiempo para que termine la transición visual
    }
};