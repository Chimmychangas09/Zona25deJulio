-- Estructura de Base de Datos para el Control de Incidencias Urbanas
-- Zona 25 de Julio - El Alto 2026

-- 1. Tabla de Roles
CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(30) NOT NULL UNIQUE
);

-- 2. Tabla de Usuarios (Vecinos y Administradores)
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    rol_id INTEGER NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id)
);

-- 3. Tabla de Incidencias Urbanas
CREATE TABLE IF NOT EXISTS incidencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_danio VARCHAR(50) NOT NULL, -- 'bache', 'alumbrado', 'residuos'
    descripcion TEXT NOT NULL,
    foto_url VARCHAR(255) NOT NULL,
    latitud REAL NOT NULL,
    longitud REAL NOT NULL,
    sector VARCHAR(50) DEFAULT 'Sin Clasificar',
    estado VARCHAR(20) DEFAULT 'Pendiente', -- 'Pendiente', 'En Proceso', 'Resuelto'
    usuario_id INTEGER NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- 4. Tabla de Auditoría e Historial de Estados (Auditoría Indeleble)
CREATE TABLE IF NOT EXISTS auditoria_estados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incidencia_id INTEGER NOT NULL,
    estado_anterior VARCHAR(20) NOT NULL,
    estado_nuevo VARCHAR(20) NOT NULL,
    administrador_id INTEGER NOT NULL,
    fecha_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incidencia_id) REFERENCES incidencias(id),
    FOREIGN KEY (administrador_id) REFERENCES usuarios(id)
);

-- ==========================================================
-- 🔐 TABLA 5: AUDITORIA DE USUARIOS
-- Registra qué administrador creó a qué otro administrador
-- ==========================================================
CREATE TABLE IF NOT EXISTS auditoria_usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    administrador_id INTEGER NOT NULL,    -- El admin logueado que hace la acción
    usuario_afectado_id INTEGER NOT NULL, -- El ID del nuevo admin recién creado
    accion VARCHAR(50) NOT NULL,           -- Guardaremos "CREAR_ADMIN"
    fecha_accion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (administrador_id) REFERENCES usuarios(id),
    FOREIGN KEY (usuario_afectado_id) REFERENCES usuarios(id)
);


-- Índices estratégicos para optimizar búsquedas por geolocalización y estados
CREATE INDEX IF NOT EXISTS idx_incidencias_coordenadas ON incidencias(latitud, longitud);
CREATE INDEX IF NOT EXISTS idx_incidencias_estado ON incidencias(estado);
CREATE INDEX IF NOT EXISTS idx_auditoria_incidencia ON auditoria_estados(incidencia_id);


