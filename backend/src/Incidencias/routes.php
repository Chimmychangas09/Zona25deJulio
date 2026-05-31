<?php

/**
 * Rutas del Módulo de Gestión de Incidencias Urbanas
 * MODIFICADO: Integración del Bloque 5 (Upgrade)
 */

use Slim\Routing\RouteCollectorProxy;
use App\Incidencias\IncidenciasController;
use App\Auth\AuthMiddleware;

// 1. Grupo nativo de Incidencias con control de accesos
$app->group('/api/incidencias', function (RouteCollectorProxy $group) {
    
    // Lista pública universal de incidencias
    $group->get('', IncidenciasController::class . ':listarTodos');

    // Crear incidencia: Permitido tanto a Administradores como a Ciudadanos
    $group->post('', IncidenciasController::class . ':crear')
          ->add(new AuthMiddleware(['Administrador', 'Ciudadano']));

    // Actualizar estado e inyectar log: Exclusivo para Administradores de la junta vecinal
    $group->put('/{id}/estado', IncidenciasController::class . ':actualizarEstado')
          ->add(new AuthMiddleware(['Administrador']));
});

// 🚀 RUTA DEL BLOQUE UPGRADE: Excluye logs analíticos para el Dashboard del Administrador
// Protegida para que solo el rol Administrador pueda consumir la bitácora transaccional
$app->get('/api/admin/auditoria', IncidenciasController::class . ':obtenerAuditoria')
    ->add(new AuthMiddleware(['Administrador']));

$app->get('/api/admin/exportar', [IncidenciasController::class, 'exportarReporteExcel']);

$app->post('/api/admin/usuarios', [IncidenciasController::class, 'registrarAdministrador'])
    ->add(new AuthMiddleware(['Administrador']));

$app->get('/api/admin/usuarios-lista', [IncidenciasController::class, 'listarUsuariosAdmin'])
    ->add(new AuthMiddleware(['Administrador']));

$app->put('/api/admin/usuarios/{id}', [IncidenciasController::class, 'actualizarUsuarioAdmin'])
    ->add(new AuthMiddleware(['Administrador']));

$app->delete('/api/admin/usuarios/{id}', [IncidenciasController::class, 'eliminarUsuarioAdmin'])
    ->add(new AuthMiddleware(['Administrador']));

// Ruta para reactivar un usuario dado de baja lógicamente
$app->post('/api/admin/usuarios/{id}/reactivar', [IncidenciasController::class, 'reactivarUsuarioAdmin'])
    ->add(new AuthMiddleware(['Administrador']));

$app->post('/api/incidencias/{id}/resolver', [IncidenciasController::class, 'resolverIncidencia'])
    ->add(new AuthMiddleware(['Administrador']));

$app->post('/api/incidencias/{id}/actualizar-solucion', [IncidenciasController::class, 'actualizarSolucion'])
    ->add(new AuthMiddleware(['Administrador']));