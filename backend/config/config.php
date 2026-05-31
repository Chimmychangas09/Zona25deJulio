<?php

/**
 * Sistema de Gestión de Incidencias Urbanas - Zona 25 de Julio
 * Archivo de Configuración Centralizada
 */

// Detectar el entorno (puedes cambiarlo a 'production' al desplegar)
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
            'max_size' => 5242880 // 5MB en bytes
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
            'max_size' => 3145728 // 3MB en bytes
        ]
    ]
];

return $config[APP_ENV];