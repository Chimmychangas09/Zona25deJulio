/**
 * Definición del esquema relacional y optimización de índices para el sistema de gestión de incidencias.
 * Establece la estructura de datos para la administración de usuarios, roles, sectores geográficos
 * y tipos de daños, mapeando sus relaciones mediante restricciones de clave foránea. Incluye el ciclo
 * de vida de los reportes con soporte para geolocalización, evidencias multimedia y resoluciones, así
 * como tablas dedicadas al registro de auditoría de cambios de estado y control de acciones sobre usuarios.
 * Además, implementa índices compuestos y específicos para optimizar consultas frecuentes basadas en
 * coordenadas, estados de incidencias y registros históricos de auditoría.
 */

CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    rol_id INTEGER NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS incidencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_danio_id INTEGER NOT NULL,        
    descripcion TEXT NOT NULL,
    foto_url VARCHAR(255) NOT NULL,         
    latitud REAL NOT NULL,
    longitud REAL NOT NULL,
    sector_id INTEGER NOT NULL,              
    estado VARCHAR(20) DEFAULT 'Pendiente', 
    usuario_id INTEGER NOT NULL,             
    
    foto_cierre VARCHAR(255) DEFAULT NULL, 
    nota_cierre TEXT DEFAULT NULL,          
    
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (tipo_danio_id) REFERENCES tipos_danio(id),
    FOREIGN KEY (sector_id) REFERENCES sectores(id)
);

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

CREATE TABLE IF NOT EXISTS auditoria_usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    administrador_id INTEGER NOT NULL,   
    usuario_afectado_id INTEGER NOT NULL, 
    accion VARCHAR(50) NOT NULL,         
    fecha_accion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (administrador_id) REFERENCES usuarios(id),
    FOREIGN KEY (usuario_afectado_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS sectores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tipos_danio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incidencias_coordenadas ON incidencias(latitud, longitud);
CREATE INDEX IF NOT EXISTS idx_incidencias_estado ON incidencias(estado);
CREATE INDEX IF NOT EXISTS idx_auditoria_incidencia ON auditoria_estados(incidencia_id);

