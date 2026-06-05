<?php
/**
 * Script de inicialización y configuración del núcleo de la aplicación API REST utilizando el framework Slim.
 */

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

$app = AppFactory::create();

$app->addBodyParsingMiddleware();

// 1. MIDDLEWARE PARA CORS DINÁMICO
$app->add(function (Request $request, $handler) {
    // Detecta automáticamente de dónde viene la petición (Localhost o Netlify)
    $origin = $request->getHeaderLine('Origin') ?: '*';

    if ($request->getMethod() === 'OPTIONS') {
        $response = AppFactory::determineResponseFactory()->createResponse();
        return $response
            ->withHeader('Access-Control-Allow-Origin', $origin) 
            ->withHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Origin, Authorization')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
            ->withHeader('Access-Control-Allow-Credentials', 'true')
            ->withStatus(200);
    }

    $response = $handler->handle($request);
    
    return $response
        ->withHeader('Access-Control-Allow-Origin', $origin)
        ->withHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Origin, Authorization')
        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
        ->withHeader('Access-Control-Allow-Credentials', 'true')
        ->withHeader('Content-Type', 'application/json');
});

$config = require __DIR__ . '/../config/config.php';
$errorMiddleware = $app->addErrorMiddleware(
    $config['display_errors'], 
    $config['log_errors'], 
    true
);

// 2. MANEJADOR CENTRALIZADO DE ERRORES CON CORS DINÁMICO
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

    // Volvemos a detectar el origen aquí por si la API falla estrepitosamente
    $origin = $request->getHeaderLine('Origin') ?: '*';

    $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    
    return $response
        ->withStatus($statusCode)
        ->withHeader('Access-Control-Allow-Origin', $origin)
        ->withHeader('Content-Type', 'application/json');
});

require __DIR__ . '/../src/Auth/routes.php';
require __DIR__ . '/../src/Incidencias/routes.php';

$app->run();