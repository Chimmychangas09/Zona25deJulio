<?php
/**
 * Configuración general del sistema según el entorno de ejecución.
 * * Define de forma predeterminada el entorno de desarrollo si no ha sido establecido previamente.
 * Retorna un arreglo multidimensional que especifica las directivas de depuración, la gestión
 * de errores, las credenciales y parámetros de conexión a la base de datos (SQLite para desarrollo
 * y MySQL para producción), así como los límites y rutas para la carga de archivos del entorno activo.
 */
if (!defined('APP_ENV')) { define('APP_ENV', 'development'); }

$config = [
    'development' => [
        'display_errors' => true,
        'log_errors' => true,
        'db' => [
            'driver' => 'sqlite', 
            'database' => __DIR__ . '/../database/incidencias.db',
            'host' => 'localhost',
            'username' => 'root',
            'password' => '',
            'charset' => 'utf8mb4'
        ],
        'upload' => [
            'directory' => __DIR__ . '/../public/uploads/',
            'max_size' => 5242880 
        ]
    ],
    'production' => [
        'display_errors' => false,
        'log_errors' => true,
        'db' => [
            'driver' => 'mysql',
            'host' => '127.0.0.1',
            'database' => 'prod_incidencias_25jul',
            'username' => 'user_admin_25j',
            'password' => 'S3cur3_P4ssW0rd_2026!',
            'charset' => 'utf8mb4'
        ],
        'upload' => [
            'directory' => __DIR__ . '/../public/uploads/',
            'max_size' => 3145728 
        ]
    ]
];

return $config[APP_ENV];