<?php

/**
 * Rutas del Módulo de Autenticación y Control de Accesos
 */

use Slim\Routing\RouteCollectorProxy;
use App\Auth\AuthController;

$app->group('/api/auth', function (RouteCollectorProxy $group) {
    $group->post('/register', AuthController::class . ':register');
    $group->post('/login', AuthController::class . ':login');
});