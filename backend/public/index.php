<?php
/**
 * Script de inicialización y configuración del núcleo de la aplicación API REST utilizando el framework Slim.
 * Carga las dependencias del proyecto y configura de forma global el middleware para el procesamiento de datos
 * en peticiones HTTP. Implementa un middleware personalizado para el control de acceso de origen cruzado (CORS),
 * interceptando solicitudes de tipo OPTIONS y homogeneizando las cabeceras de respuesta y credenciales permitidas.
 * Asimismo, define un manejador centralizado de errores que captura excepciones y retorna respuestas en formato JSON,
 * adaptando el nivel de detalle de depuración según el entorno configurado, para finalmente integrar las rutas de
 * autenticación y de gestión de incidencias antes de la ejecución del servidor.
 */
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

$app = AppFactory::create();

$app->addBodyParsingMiddleware();

$app->add(function (Request $request, $handler) {

    if ($request->getMethod() === 'OPTIONS') {
        $response = AppFactory::determineResponseFactory()->createResponse();
        return $response
            ->withHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5500') 
            ->withHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Origin, Authorization')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
            ->withHeader('Access-Control-Allow-Credentials', 'true')
            ->withStatus(200);
    }

    $response = $handler->handle($request);
    
    return $response
        ->withHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5500')
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
    
    return $response
        ->withStatus($statusCode)
        ->withHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5500')
        ->withHeader('Content-Type', 'application/json');
});

require __DIR__ . '/../src/Auth/routes.php';
require __DIR__ . '/../src/Incidencias/routes.php';

$app->run();