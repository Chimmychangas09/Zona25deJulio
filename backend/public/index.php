<?php

/**
 * Sistema de Gestión de Incidencias Urbanas - Zona 25 de Julio
 * Punto de Entrada Único (Front Controller) - Edición Blindada CORS
 */

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

$app = AppFactory::create();

// 1. Parsear cuerpos de peticiones JSON obligatoriamente
$app->addBodyParsingMiddleware();

// 2. MIDDLEWARE DE CORS DETERMINISTA (Debe ejecutarse antes que todo el ruteo)
$app->add(function (Request $request, $handler) {
    // Si es una petición OPTIONS (Preflight), respondemos directamente sin pasar al ruteo
    if ($request->getMethod() === 'OPTIONS') {
        $response = AppFactory::determineResponseFactory()->createResponse();
        return $response
            ->withHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5500') // Tu origen exacto del Frontend
            ->withHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Origin, Authorization')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
            ->withHeader('Access-Control-Allow-Credentials', 'true')
            ->withStatus(200);
    }

    // Para peticiones normales (POST, GET, etc.), procesamos y añadimos las cabeceras a la salida
    $response = $handler->handle($request);
    
    return $response
        ->withHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5500')
        ->withHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Origin, Authorization')
        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
        ->withHeader('Access-Control-Allow-Credentials', 'true')
        ->withHeader('Content-Type', 'application/json');
});

// 3. Manejador de Errores Globales adaptado para no romper CORS
$config = require __DIR__ . '/../config/config.php';
$errorMiddleware = $app->addErrorMiddleware(
    $config['display_errors'], 
    $config['log_errors'], 
    true
);

$errorMiddleware->setDefaultErrorHandler(function (Request $request, Throwable $exception) use ($config) {
    $response = AppFactory::determineResponseFactory()->createResponse();
    $statusCode = 500;
    
    if ($exception->getCode() >= 400 && $exception->getCode() <= 599) {
        $statusCode = $exception->getCode();
    }

    $payload = [
        'status' => 'error',
        'code' => $statusCode,
        'message' => $exception->getMessage()
    ];

    if ($config['display_errors']) {
        $payload['debug'] = [
            'file' => $exception->getFile(),
            'line' => $exception->getLine()
        ];
    }

    $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    
    // Crucial: Los errores también deben llevar cabeceras CORS, si no, el navegador los bloquea y no ves el mensaje real
    return $response
        ->withStatus($statusCode)
        ->withHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5500')
        ->withHeader('Content-Type', 'application/json');
});

// 4. Inclusión de las Rutas Modulares
require __DIR__ . '/../src/Auth/routes.php';
require __DIR__ . '/../src/Incidencias/routes.php';

// 5. Ejecutar la Aplicación
$app->run();