<?php
/**
 * Definición del grupo de rutas para el módulo de autenticación de la API.
 * Agrupa los endpoints bajo el prefijo común '/api/auth' utilizando el enrutador de Slim
 * y mapea las peticiones HTTP de tipo POST para los procesos de registro ('/register')
 * e inicio de sesión ('/login') con sus respectivos métodos en la clase AuthController.
 */
use Slim\Routing\RouteCollectorProxy;
use App\Auth\AuthController;

$app->group('/api/auth', function (RouteCollectorProxy $group) {
    $group->post('/register', AuthController::class . ':register');
    $group->post('/login', AuthController::class . ':login');
});