<?php
/**
 * Define y estructura el enrutamiento global de los servicios web de la API de gestión urbana.
 * Organiza los puntos de acceso mediante el uso de grupos de rutas (`RouteCollectorProxy`) para segmentar
 * lógicamente los recursos de incidencias y las configuraciones del sistema. Delega el control de flujo
 * operativo y la lógica de negocio al controlador `IncidenciasController`. Adicionalmente, implementa de
 * forma transversal una capa de seguridad basada en políticas de acceso mediante `AuthMiddleware`, la cual
 * restringe y valida de manera selectiva las peticiones entrantes según los roles del sistema ('Administrador' 
 * y 'Ciudadano') autorizados para cada operación.
 */
use Slim\Routing\RouteCollectorProxy;
use App\Incidencias\IncidenciasController;
use App\Auth\AuthMiddleware;

$app->group('/api/incidencias', function (RouteCollectorProxy $group) {

    $group->get('', IncidenciasController::class . ':listarTodos');

    $group->post('', IncidenciasController::class . ':crear')
          ->add(new AuthMiddleware(['Administrador', 'Ciudadano']));
    $group->put('/{id}/estado', IncidenciasController::class . ':actualizarEstado')
          ->add(new AuthMiddleware(['Administrador']));
});

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

$app->post('/api/admin/usuarios/{id}/reactivar', [IncidenciasController::class, 'reactivarUsuarioAdmin'])
    ->add(new AuthMiddleware(['Administrador']));

$app->post('/api/incidencias/{id}/resolver', [IncidenciasController::class, 'resolverIncidencia'])
    ->add(new AuthMiddleware(['Administrador']));

$app->post('/api/incidencias/{id}/actualizar-solucion', [IncidenciasController::class, 'actualizarSolucion'])
    ->add(new AuthMiddleware(['Administrador']));

$app->get('/api/configuracion/sectores', IncidenciasController::class . ':listarSectores')
    ->add(new AuthMiddleware(['Administrador', 'Ciudadano']));

$app->get('/api/configuracion/tipos-danio', IncidenciasController::class . ':listarTiposDanio')
    ->add(new AuthMiddleware(['Administrador', 'Ciudadano']));

$app->group('/api/admin/configuracion', function (RouteCollectorProxy $group) {
    
    $group->post('/sectores', IncidenciasController::class . ':guardarSector');
    $group->delete('/sectores/{id}', IncidenciasController::class . ':eliminarSector');

    $group->post('/tipos-danio', IncidenciasController::class . ':guardarTipoDanio');
    $group->delete('/tipos-danio/{id}', IncidenciasController::class . ':eliminarTipoDanio');

})->add(new AuthMiddleware(['Administrador']));