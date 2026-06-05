<?php
/**
 * Controlador principal para la administración y operación del ciclo de vida de las incidencias reportadas.
 * Gestiona el procesamiento de solicitudes HTTP asociadas a la creación, consulta, actualización y trazabilidad
 * de reportes ciudadanos y fallos de infraestructura. Coordina la interacción con los servicios de persistencia
 * de datos, la validación y almacenamiento seguro de evidencias multimedia mediante componentes especializados,
 * y la aplicación de reglas de negocio y restricciones de acceso basadas en los privilegios del usuario emisor,
 * garantizando la consistencia transaccional y el registro de auditoría del sistema.
 */
namespace App\Incidencias;

use App\Database\Connection;
use App\Common\ImageValidator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Psr\Http\Message\ServerRequestInterface as Request;
use RuntimeException;
use PDO;
use PDOException;

class IncidenciasController
{
/**
 * Procesa el registro y almacenamiento de una nueva incidencia en la plataforma.
 * Valida la existencia de los parámetros obligatorios y normaliza los identificadores del sector y tipo de daño.
 * Gestiona la recepción de la evidencia fotográfica desde distintas fuentes de captura, delegando su validación
 * de integridad y límites de tamaño a un componente externo. Tras asegurar el almacenamiento físico del archivo
 * en el servidor con un nombre anonimizado, sanea la descripción textual e inserta el registro con estado 'Pendiente'
 * y geolocalización asociada, vinculándolo al usuario autenticado que emite la petición.
 */
    public function crear(Request $request, Response $response): Response
    {
        $directory = require __DIR__ . '/../../config/config.php';
        $uploadConfig = $directory['upload'];
        
        $data = $request->getParsedBody();
        $uploadedFiles = $request->getUploadedFiles();

        if (!isset($data['tipo_danio']) && isset($data['tipo_danio_id'])) {
            $data['tipo_danio'] = $data['tipo_danio_id'];
        }
        if (!isset($data['sector']) && isset($data['sector_id'])) {
            $data['sector'] = $data['sector_id'];
        }

        if (empty($data['tipo_danio']) || empty($data['descripcion']) || !isset($data['latitud'], $data['longitud'])) {
            throw new RuntimeException("Faltan parámetros requeridos para procesar la incidencia.", 400);
        }

        $fotoFile = null;
        if (!empty($uploadedFiles['foto_camara']) && $uploadedFiles['foto_camara']->getError() === UPLOAD_ERR_OK) {
            $fotoFile = $uploadedFiles['foto_camara'];
        } elseif (!empty($uploadedFiles['foto_archivo']) && $uploadedFiles['foto_archivo']->getError() === UPLOAD_ERR_OK) {
            $fotoFile = $uploadedFiles['foto_archivo'];
        }

        if (!$fotoFile) {
            throw new RuntimeException("Es mandatorio adjuntar una evidencia fotográfica de la incidencia.", 400);
        }

        $fileStream = [
            'name' => $fotoFile->getClientFilename(),
            'type' => $fotoFile->getClientMediaType(),
            'tmp_name' => $fotoFile->getStream()->getMetadata('uri'),
            'error' => $fotoFile->getError(),
            'size' => $fotoFile->getSize()
        ];

        $nuevoNombreFoto = ImageValidator::validateUploadedImage($fileStream, $uploadConfig['max_size']);

        if (!is_dir($uploadConfig['directory'])) {
            mkdir($uploadConfig['directory'], 0755, true);
        }

        $fotoFile->moveTo($uploadConfig['directory'] . $nuevoNombreFoto);
        $fotoUrl = 'uploads/' . $nuevoNombreFoto;

        $sectorId = isset($data['sector_id']) ? (int)$data['sector_id'] : (int)$data['sector'];
        $tipoDanioId = isset($data['tipo_danio_id']) ? (int)$data['tipo_danio_id'] : (int)$data['tipo_danio'];

        $lat = (float)$data['latitud'];
        $lng = (float)$data['longitud'];

        $db = Connection::getConnection();
        $usuarioId = (int)$request->getAttribute('usuario_id');

        $stmt = $db->prepare("
            INSERT INTO incidencias (tipo_danio_id, descripcion, foto_url, latitud, longitud, sector_id, estado, usuario_id) 
            VALUES (?, ?, ?, ?, ?, ?, 'Pendiente', ?)
        ");
        
        $stmt->execute([
            $tipoDanioId,
            strip_tags($data['descripcion']),
            $fotoUrl,
            $lat,
            $lng,
            $sectorId,
            $usuarioId
        ]);

        $payload = [
            'status' => 'success',
            'message' => 'Incidencia reportada correctamente.',
            'data' => ['sector_id' => $sectorId, 'foto' => $fotoUrl]
        ];

        $response->getBody()->write(json_encode($payload));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
    }
/**
 * Recupera y retorna el listado completo de incidencias registradas con su información asociada.
 * Construye una consulta relacional mediante uniones (LEFT JOIN) para consolidar los datos del usuario,
 * tipo de daño y sector de cada reporte. Implementa un criterio de filtrado cronológico adaptativo:
 * si se especifican los parámetros opcionales de rango de fechas ('desde' y 'hasta') en la petición,
 * restringe los resultados a dicho periodo; de lo contrario, limita la búsqueda por defecto a los registros
 * del año en curso. Finalmente, ordena los resultados de manera descendente por fecha de creación y
 * devuelve la colección estructurada en formato JSON junto con el total de registros encontrados.
 */
    public function listarTodos(Request $request, Response $response): Response
    {
    $db = Connection::getConnection();

    $queryParams = $request->getQueryParams();
    $desde = $queryParams['desde'] ?? null;
    $hasta = $queryParams['hasta'] ?? null;

    $sql = "
    SELECT 
    i.id,
    i.usuario_id,
    td.nombre AS tipo_danio,    
    i.descripcion,
    s.nombre AS sector,        
    i.latitud,
    i.longitud,
    i.estado,
    i.foto_url,        
    i.foto_cierre,     
    i.nota_cierre,     
    i.creado_en,       
    u.nombre as vecino_nombre 
    FROM incidencias i
    LEFT JOIN usuarios u ON i.usuario_id = u.id
    LEFT JOIN tipos_danio td ON i.tipo_danio_id = td.id 
    LEFT JOIN sectores s ON i.sector_id = s.id       
    ";

    $params = [];

    if (!empty($desde) && !empty($hasta)) {
    $sql .= " WHERE i.creado_en BETWEEN :desde AND :hasta ";
    $params[':desde'] = $desde . ' 00:00:00';
    $params[':hasta'] = $hasta . ' 23:59:59';
    } else {
    $anoActual = date('Y'); 
    $sql .= " WHERE strftime('%Y', i.creado_en) = :ano ";
    $params[':ano'] = $anoActual;
    }

    $sql .= " ORDER BY i.creado_en DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $incidencias = $stmt->fetchAll(PDO::FETCH_ASSOC); 

    $response->getBody()->write(json_encode([
    'status' => 'success',
    'count' => count($incidencias),
    'data' => $incidencias
    ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)); 

    return $response
    ->withHeader('Content-Type', 'application/json')
    ->withStatus(200);
    }
/**
 * Modifica el estado operativo de una incidencia específica y registra la acción en el historial de auditoría.
 * Valida que el nuevo estado pertenezca al flujo permitido y verifica la existencia del registro en la base de datos.
 * Executa de forma atómica (mediante una transacción SQL) la actualización del estado de la incidencia y la inyección
 * de la nota de cierre opcional, junto con la inserción del registro histórico que vincula al administrador responsable.
 * Finalmente, evalúa si la transición corresponde a una reapertura de caso para adaptar el mensaje de respuesta
 * que se retorna en formato JSON.
 */
    public function actualizarEstado(Request $request, Response $response, array $args): Response
    {
        $idIncidencia = $args['id'];
        $data = $request->getParsedBody();
        $adminId = $request->getAttribute('usuario_id');

        if (empty($data['estado'])) {
            throw new RuntimeException("El nuevo estado es requerido.", 400);
        }

        $nuevoEstado = trim($data['estado']);
        $estadosPermitidos = ['Pendiente', 'En Proceso', 'Resuelta', 'Rechazada'];

        if (!in_array($nuevoEstado, $estadosPermitidos)) {
            throw new RuntimeException("El estado suministrado no pertenece al flujo operativo válido.", 422);
        }

        $db = Connection::getConnection();

        $stmtCheck = $db->prepare("SELECT estado FROM incidencias WHERE id = ?");
        $stmtCheck->execute([$idIncidencia]);
        $incidencia = $stmtCheck->fetch();

        if (!$incidencia) {
            throw new RuntimeException("La incidencia solicitada no existe en los registros.", 404);
        }

        $estadoAnterior = $incidencia['estado'];

        try {

            $db->beginTransaction();

            $notaCierre = !empty($data['nota_cierre']) ? strip_tags(trim($data['nota_cierre'])) : null;

            $stmtUpdate = $db->prepare("UPDATE incidencias SET estado = ?, nota_cierre = ? WHERE id = ?");
            $stmtUpdate->execute([$nuevoEstado, $notaCierre, $idIncidencia]);

            $stmtLog = $db->prepare("
                INSERT INTO auditoria_estados (incidencia_id, estado_anterior, estado_nuevo, administrador_id) 
                VALUES (?, ?, ?, ?)
            ");
            $stmtLog->execute([$idIncidencia, $estadoAnterior, $nuevoEstado, $adminId]);

            $db->commit();
        } catch (\Exception $e) {
            $db->rollBack();
            throw new RuntimeException("Fallo en la operación atómica de actualización de estado.", 500);
        }

        $esReapertura = ($estadoAnterior === 'Resuelta' || $estadoAnterior === 'Rechazada') && 
                        ($nuevoEstado === 'Pendiente' || $nuevoEstado === 'En Proceso');

        $mensajeFinal = $esReapertura 
            ? "🔄 ¡Alerta de Reapertura! La incidencia #{$idIncidencia} ha sido reabierta con éxito y regresó al tablero activo."
            : "Estado actualizado exitosamente de '{$estadoAnterior}' a '{$nuevoEstado}' con registro de auditoría.";

        $response->getBody()->write(json_encode([
            'status' => 'success',
            'message' => $mensajeFinal
        ]));
        
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
    }
/**
 * Recupera el historial unificado de auditoría del sistema consolidando diferentes registros de control.
 * Ejecuta una consulta SQL combinada mediante el operador UNION ALL para fusionar cronológicamente las
 * trazas de cambios de estado en las incidencias con las acciones de administración sobre las cuentas de usuario.
 * Homogeiniza las estructuras de ambas tablas mediante el mapeo de alias y valores nulos correlativos,
 * integrando uniones de tipo LEFT JOIN para resolver los nombres de los administradores y afectados involucrados.
 * Finalmente, ordena el flujo consolidado de manera descendente por fecha y retorna la colección en formato JSON,
 * encapsulando de forma segura cualquier excepción ocurrida en el proceso de unificación.
 */
    public function obtenerAuditoria($request, $response, $args) {
        try {
            $db = Connection::getConnection();

            $sth = $db->prepare("
                SELECT 
                    a.id,
                    a.incidencia_id, 
                    a.estado_anterior, 
                    a.estado_nuevo,
                    u.nombre AS administrador_nombre,
                    td.nombre AS tipo_danio,
                    a.fecha_cambio 
                FROM auditoria_estados a
                LEFT JOIN usuarios u ON a.administrador_id = u.id
                LEFT JOIN incidencias i ON a.incidencia_id = i.id
                LEFT JOIN tipos_danio td ON i.tipo_danio_id = td.id
                
                UNION ALL
                
                SELECT 
                    au.id,
                    NULL AS incidencia_id,
                    'Sistema' AS estado_anterior,
                    au.accion AS estado_nuevo,
                    u_admin.nombre AS administrador_nombre,
                    ('Nuevo Admin: ' || u_afectado.nombre) AS tipo_danio, 
                    au.fecha_accion AS fecha_cambio
                FROM auditoria_usuarios au
                LEFT JOIN usuarios u_admin ON au.administrador_id = u_admin.id
                LEFT JOIN usuarios u_afectado ON au.usuario_afectado_id = u_afectado.id
                
                ORDER BY fecha_cambio DESC
            ");
            
            $sth->execute();
            $logs = $sth->fetchAll(\PDO::FETCH_ASSOC);

            $payload = json_encode([
                "status" => "success",
                "data" => $logs
            ], JSON_UNESCAPED_SLASHES);
            
            $response->getBody()->write($payload);
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);

        } catch (\Exception $e) {
            $payload = json_encode([
                "status" => "error",
                "message" => "Error en unificación de auditoría: " . $e->getMessage()
            ], JSON_UNESCAPED_SLASHES);
            
            $response->getBody()->write($payload);
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }
    }
/**
 * Genera y descarga un reporte consolidado de incidencias en formato Excel utilizando maquetación HTML/CSS.
 * Extrae los parámetros opcionales de la solicitud HTTP para estructurar dinámicamente filtros condicionales
 * basados en rango de fechas, tipo de daño, sector geográfico y estado operativo del registro. Ejecuta una
 * consulta relacional optimizada para recuperar la información unificada de los reportes y procesa los
 * resultados dentro de una plantilla estructurada con estilos visuales específicos, asignando clases de filas
 * alternas y distintivos de color (badges) según el estado actual de cada incidencia. Finalmente, altera
 * las cabeceras de la respuesta para forzar la descarga del documento como un archivo adjunto con extensión XLS.
 */
    public function exportarReporteExcel($request, $response, $args) {
        try {
            $db = Connection::getConnection();
            
            $queryParams = $request->getQueryParams();
            $desde       = $queryParams['desde'] ?? null;
            $hasta       = $queryParams['hasta'] ?? null;
            $tipoDanio   = $queryParams['tipo_danio'] ?? 'TODOS';
            $sector      = $queryParams['sector'] ?? 'TODOS';
            $estado      = $queryParams['estado'] ?? 'ACTIVAS';

            $sql = "
                SELECT 
                    i.id, 
                    td.nombre AS tipo_danio,   
                    s.nombre AS sector,       
                    i.estado, 
                    i.descripcion, 
                    i.creado_en, 
                    u.nombre AS vecino_nombre 
                FROM incidencias i
                LEFT JOIN usuarios u ON i.usuario_id = u.id
                LEFT JOIN tipos_danio td ON i.tipo_danio_id = td.id 
                LEFT JOIN sectores s ON i.sector_id = s.id           
                WHERE 1=1
            ";

            $params = [];
            $filtrosAplicadosTexto = [];

            if (!empty($desde) && !empty($hasta)) {
                $sql .= " AND i.creado_en BETWEEN :desde AND :hasta ";
                $params[':desde'] = $desde . ' 00:00:00';
                $params[':hasta'] = $hasta . ' 23:59:59';
                $filtrosAplicadosTexto[] = "Rango: [$desde al $hasta]";
            } else {
                $anoActual = date('Y'); 
                $sql .= " AND i.creado_en LIKE :ano ";
                $params[':ano'] = $anoActual . '%';
                $filtrosAplicadosTexto[] = "Año: $anoActual";
            }

            if ($tipoDanio !== 'TODOS') {
                $sql .= " AND td.nombre = :tipo_danio ";
                $params[':tipo_danio'] = $tipoDanio;
                $filtrosAplicadosTexto[] = "Daño: $tipoDanio";
            }

            if ($sector !== 'TODOS') {
                $sql .= " AND s.nombre = :sector ";
                $params[':sector'] = $sector;
                $filtrosAplicadosTexto[] = "Sector: $sector";
            }

            if ($estado !== 'TODOS') {
                if ($estado === 'ACTIVAS') {
                    $sql .= " AND i.estado IN ('Pendiente', 'En Proceso') ";
                    $filtrosAplicadosTexto[] = "Estado: Activos (Bandeja)";
                } else {
                    $sql .= " AND i.estado = :estado ";
                    $params[':estado'] = $estado;
                    $filtrosAplicadosTexto[] = "Estado: $estado";
                }
            } else {
                $filtrosAplicadosTexto[] = "Estado: Todo el Historial";
            }

            $sql .= " ORDER BY i.id DESC";

            $sth = $db->prepare($sql);
            $sth->execute($params);
            $incidencias = $sth->fetchAll(\PDO::FETCH_ASSOC);

            $subtituloFiltro = implode(' | ', $filtrosAplicadosTexto);

            $html = '
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta http-equiv="Content-type" content="text/html;charset=utf-8" />
                <style>
                    body { font-family: "Arial", sans-serif; color: #333333; }
                    .title-block { background-color: #1F4E78; color: #FFFFFF; font-size: 16pt; font-weight: bold; text-align: center; height: 40px; }
                    .subtitle-block { font-size: 10pt; font-style: italic; color: #555555; }
                    .table-header { background-color: #1F4E78; color: #FFFFFF; font-weight: bold; text-align: center; font-size: 11pt; border: 1px solid #D9D9D9; }
                    .data-row-even { background-color: #FFFFFF; font-size: 10pt; border: 1px solid #D9D9D9; }
                    .data-row-odd { background-color: #F2F5F9; font-size: 10pt; border: 1px solid #D9D9D9; }
                    .td-border { border: 1px solid #D9D9D9; padding: 6px; }
                    .text-center { text-align: center; }
                    
                    /* Badges Estéticos */
                    .badge-pendiente { background-color: #FCE4D6; color: #C65911; font-weight: bold; text-align: center; border: 1px solid #FCE4D6; }
                    .badge-proceso { background-color: #FFF2CC; color: #7F6000; font-weight: bold; text-align: center; border: 1px solid #FFF2CC; }
                    .badge-resuelto { background-color: #E2EFDA; color: #375623; font-weight: bold; text-align: center; border: 1px solid #E2EFDA; }
                    .badge-rechazada { background-color: #EAEAEA; color: #595959; font-weight: bold; text-align: center; border: 1px solid #EAEAEA; }
                </style>
            </head>
            <body>
                <table>
                    <tr><td colspan="7" class="title-block">REPORTE DE GESTIÓN URBANA</td></tr>
                    <tr><td colspan="7" class="subtitle-block">Junta Vecinal Zona 25 de Julio - El Alto | Módulo de Planificación Estratégica</td></tr>
                    <tr><td colspan="7" class="subtitle-block"><b>Filtros aplicados:</b> ' . htmlspecialchars($subtituloFiltro) . '</td></tr>
                    <tr><td colspan="7" class="subtitle-block">Generado el: ' . date('Y-m-d H:i:s') . '</td></tr>
                    <tr><td colspan="7"></td></tr> </table>

                <table border="1" style="border-collapse: collapse; border: 1px solid #D9D9D9;">
                    <thead>
                        <tr>
                            <th class="table-header" style="width: 50px;">ID</th>
                            <th class="table-header" style="width: 180px;">Tipo de Daño</th>
                            <th class="table-header" style="width: 220px;">Sector / Ubicación</th>
                            <th class="table-header" style="width: 120px;">Estado Actual</th>
                            <th class="table-header" style="width: 180px;">Vecino Reportante</th>
                            <th class="table-header" style="width: 140px;">Fecha Registro</th>
                            <th class="table-header" style="width: 280px;">Descripción Detallada</th>
                        </tr>
                    </thead>
                    <tbody>';

            foreach ($incidencias as $index => $item) {
                $claseFila = ($index % 2 === 0) ? 'data-row-even' : 'data-row-odd';
                
                $claseBadge = 'badge-pendiente';
                if ($item['estado'] === 'En Proceso') $claseBadge = 'badge-proceso';
                if ($item['estado'] === 'Resuelto')   $claseBadge = 'badge-resuelto';
                if ($item['estado'] === 'Rechazada')  $claseBadge = 'badge-rechazada';

                $html .= '<tr class="' . $claseFila . '">';
                $html .= '<td class="td-border text-center">' . $item['id'] . '</td>';
                $html .= '<td class="td-border" style="font-weight: bold;">' . htmlspecialchars($item['tipo_danio'] ?? 'No Especificado') . '</td>';
                $html .= '<td class="td-border">' . htmlspecialchars($item['sector'] ?? 'Sector General') . '</td>';
                $html .= '<td class="td-border ' . $claseBadge . '">' . htmlspecialchars($item['estado']) . '</td>';
                $html .= '<td class="td-border">' . htmlspecialchars($item['vecino_nombre'] ?? 'Vecino Anónimo') . '</td>';
                $html .= '<td class="td-border text-center">' . $item['creado_en'] . '</td>';
                $html .= '<td class="td-border" style="color: #555555;">' . htmlspecialchars($item['descripcion']) . '</td>';
                $html .= '</tr>';
            }

            $html .= '
                    </tbody>
                </table>
            </body>
            </html>';

            $response->getBody()->write($html);
            return $response
                ->withHeader('Content-Type', 'application/vnd.ms-excel; charset=UTF-8')
                ->withHeader('Content-Disposition', 'attachment; filename="Reporte_25Julio_' . date('Ymd_His') . '.xls"')
                ->withStatus(200);

        } catch (\Exception $e) {
            $payload = json_encode(["status" => "error", "message" => $e->getMessage()]);
            $response->getBody()->write($payload);
            return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
        }
    }
/**
 * Procesa el alta de un nuevo usuario con rol de administrador en la plataforma y registra la acción en el historial de control.
 * Valida la presencia de los parámetros obligatorios de identidad y la identidad del operador responsable, comprobando además
 * que el correo electrónico no esté duplicado en el sistema. Ejecuta de forma atómica (mediante una transacción SQL) la inserción 
 * del nuevo perfil con clave debidamente cifrada y saneamiento de entradas, recuperando el identificador generado para registrar
 * inmediatamente un evento de auditoría que vincula de manera transparente al operador que autorizó el procedimiento.
 */
    public function registrarAdministrador(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();

        if (empty($data['nombre']) || empty($data['correo']) || empty($data['password']) || empty($data['admin_operador_id'])) {
            throw new RuntimeException("Faltan parámetros requeridos para procesar el alta del administrador.", 400);
        }

        $db = Connection::getConnection();

        $checkStmt = $db->prepare("SELECT id FROM usuarios WHERE correo = ? LIMIT 1");
        $checkStmt->execute([trim($data['correo'])]);
        if ($checkStmt->fetch()) {
            throw new RuntimeException("El correo electrónico suministrado ya se encuentra registrado en la plataforma.", 409);
        }

        try {

            $db->beginTransaction();

            $stmtUser = $db->prepare("
                INSERT INTO usuarios (nombre, correo, password, rol_id) 
                VALUES (?, ?, ?, 1)
            ");

            $passwordHash = password_hash($data['password'], PASSWORD_BCRYPT);
            
            $stmtUser->execute([
                strip_tags(trim($data['nombre'])),
                filter_var(trim($data['correo']), FILTER_SANITIZE_EMAIL),
                $passwordHash
            ]);

            $nuevoAdminId = $db->lastInsertId();

            $stmtAudit = $db->prepare("
                INSERT INTO auditoria_usuarios (administrador_id, usuario_afectado_id, accion) 
                VALUES (?, ?, 'CREAR_ADMIN')
            ");
            $stmtAudit->execute([
                (int)$data['admin_operador_id'],
                $nuevoAdminId
            ]);

            $db->commit();

        } catch (\Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw new RuntimeException("Fallo en la operación atómica de registro y auditoría: " . $e->getMessage(), 500);
        }

        $payload = [
            'status' => 'success',
            'message' => 'Nuevo Administrador dado de alta con éxito. Acción auditada correctamente.'
        ];

        $response->getBody()->write(json_encode($payload));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
    }
/**
 * Recupera el listado de usuarios del sistema filtrado por su estado de baja (eliminación lógica).
 * Evalúa los parámetros de la consulta para determinar si se deben extraer las cuentas activas o aquellas
 * que han sido removidas. En caso de solicitar los registros eliminados, recupera los campos de identidad junto
 * con la marca de tiempo de baja ordenados de forma descendente por dicha fecha; por el contrario, si la cuenta
 * permanece activa, omite los elementos eliminados y devuelve los registros ordenados por su identificador único,
 * retornando finalmente la colección estructurada en formato JSON.
 */
    public function listarUsuariosAdmin(Request $request, Response $response): Response
    {
        $queryParams = $request->getQueryParams();
        $mostrarEliminados = isset($queryParams['tipo']) && $queryParams['tipo'] === 'eliminados';

        $db = Connection::getConnection();

        if ($mostrarEliminados) {

            $stmt = $db->query("
                SELECT id, nombre, correo, rol_id, creado_en, eliminado_en 
                FROM usuarios 
                WHERE eliminado_en IS NOT NULL
                ORDER BY eliminado_en DESC
            ");
        } else {

            $stmt = $db->query("
                SELECT id, nombre, correo, rol_id, creado_en 
                FROM usuarios 
                WHERE eliminado_en IS NULL
                ORDER BY id DESC
            ");
        }

        $usuarios = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $response->getBody()->write(json_encode(['status' => 'success', 'data' => $usuarios]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
    }
/**
 * Modifica los datos de identidad y privilegios de un usuario específico en el sistema.
 * Valida la presencia de los campos obligatorios y ejecuta una sentencia de actualización
 * sobre el registro seleccionado mediante su identificador único. Aplica filtros de saneamiento
 * para remover etiquetas HTML del nombre y normalizar el formato del correo electrónico,
 * asignando además de forma explícita el nuevo identificador de rol antes de retornar una
 * respuesta de éxito en formato JSON.
 */
    public function actualizarUsuarioAdmin(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $data = $request->getParsedBody();

        if (empty($data['nombre']) || empty($data['correo']) || empty($data['rol_id'])) {
            throw new \RuntimeException("Campos requeridos vacíos.", 400);
        }

        $db = Connection::getConnection();
        $stmt = $db->prepare("UPDATE usuarios SET nombre = ?, correo = ?, rol_id = ? WHERE id = ?");
        $stmt->execute([
            strip_tags(trim($data['nombre'])),
            filter_var(trim($data['correo']), FILTER_SANITIZE_EMAIL),
            (int)$data['rol_id'],
            $id
        ]);

        $response->getBody()->write(json_encode(['status' => 'success', 'message' => 'Usuario actualizado correctamente.']));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
    }
/**
 * Realiza la baja lógica de un usuario del sistema mediante el marcado de su registro.
 * En lugar de aplicar una eliminación física que destruya la integridad de los datos históricos,
 * actualiza la columna de control asignando la marca de tiempo correspondiente al momento exacto
 * de la operación. De este modo, se restringe el acceso futuro del usuario a la plataforma y se
 * preserva su vinculación con registros previos de auditoría o incidencias creadas, retornando
 * una confirmación estructurada en formato JSON.
 */
    public function eliminarUsuarioAdmin(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $db = Connection::getConnection();

        $fechaActual = date('Y-m-d H:i:s');
        
        $stmt = $db->prepare("
            UPDATE usuarios 
            SET eliminado_en = ? 
            WHERE id = ?
        ");
        $stmt->execute([$fechaActual, $id]);

        $response->getBody()->write(json_encode([
            'status' => 'success', 
            'message' => 'El usuario ha sido dado de baja en la plataforma. Historial preservado.'
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
    }
/**
 * Realiza la reactivación lógica de un usuario previamente dado de baja en la plataforma.
 * Revierte el estado de eliminación del registro restableciendo a nulo el campo de control
 * de marcas de tiempo correspondiente. Esto restaura de forma inmediata los permisos de acceso
 * y las facultades operativas del usuario con sus credenciales preexistentes, manteniendo intacto
 * su historial de transacciones y auditoría dentro del sistema.
 */
    public function reactivarUsuarioAdmin(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $db = Connection::getConnection();

        $stmt = $db->prepare("
            UPDATE usuarios 
            SET eliminado_en = NULL 
            WHERE id = ?
        ");
        $stmt->execute([$id]);

        $response->getBody()->write(json_encode([
            'status' => 'success', 
            'message' => 'Cuenta reactivada con éxito. El usuario ya puede volver a ingresar con sus credenciales de siempre.'
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
    }
/**
 * Procesa la resolución y cierre definitivo de una incidencia específica en el sistema.
 * Valida de forma estricta la obligatoriedad de la nota aclaratoria y el archivo multimedia de resolución,
 * gestionando el almacenamiento físico de la evidencia fotográfica final en el servidor bajo un identificador único.
 * Tras verificar la existencia previa del reporte, ejecuta una transacción SQL atómica para actualizar los campos de
 * estado, la descripción del cierre y la ruta de la imagen, inyectando simultáneamente el registro correspondiente
 * en la tabla de auditoría para asegurar la trazabilidad del administrador responsable de la resolución.
 */
    public function resolverIncidencia(Request $request, Response $response, array $args): Response
    {
        $idIncidencia = $args['id'];
        $data = $request->getParsedBody();
        $adminId = $request->getAttribute('usuario_id');
        $files = $request->getUploadedFiles();

        if (empty($data['nota_cierre']) || empty($files['foto_cierre'])) {
            throw new \RuntimeException("La nota aclaratoria y la foto de evidencia son totalmente obligatorias.", 400);
        }

        $notaCierre = strip_tags(trim($data['nota_cierre']));
        $nuevoEstado = $data['estado'] ?? 'Resuelta';

        $fotoFile = $files['foto_cierre'];
        if ($fotoFile->getError() !== UPLOAD_ERR_OK) {
            throw new \RuntimeException("Error al subir el archivo de evidencia.", 400);
        }

        $extension = pathinfo($fotoFile->getClientFilename(), PATHINFO_EXTENSION);
        $nombreFoto = "cierre_" . uniqid() . "." . $extension;
        
        $directorioSubidas = __DIR__ . '/../../public/uploads/'; 
        $fotoFile->moveTo($directorioSubidas . $nombreFoto);
        $rutaDBFoto = '/uploads/' . $nombreFoto; 

        $db = Connection::getConnection();

        $stmtCheck = $db->prepare("SELECT estado FROM incidencias WHERE id = ?");
        $stmtCheck->execute([$idIncidencia]);
        $incidencia = $stmtCheck->fetch();

        if (!$incidencia) {
            throw new \RuntimeException("La incidencia no existe.", 404);
        }
        $estadoAnterior = $incidencia['estado'];

        try {
            $db->beginTransaction();

            $stmtUpdate = $db->prepare("
                UPDATE incidencias 
                SET estado = ?, nota_cierre = ?, foto_cierre = ? 
                WHERE id = ?
            ");
            $stmtUpdate->execute([$nuevoEstado, $notaCierre, $rutaDBFoto, $idIncidencia]);

            $stmtLog = $db->prepare("
                INSERT INTO auditoria_estados (incidencia_id, estado_anterior, estado_nuevo, administrador_id) 
                VALUES (?, ?, ?, ?)
            ");
            $stmtLog->execute([$idIncidencia, $estadoAnterior, $nuevoEstado, $adminId]);

            $db->commit();
        } catch (\Exception $e) {
            $db->rollBack();
            throw new \RuntimeException("Fallo en la operación atómica de cierre: " . $e->getMessage(), 500);
        }

        $response->getBody()->write(json_encode([
            'status' => 'success',
            'foto_cierre' => $rutaDBFoto,
            'message' => "Incidencia solucionada correctamente."
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
    }
/**
 * Permite modificar o actualizar los datos de la resolución ya registrada para una incidencia.
 * Valida la obligatoriedad del texto aclaratorio y comprueba la existencia del reporte en la base de datos
 * para recuperar la ruta de la evidencia fotográfica previa. Evalúa de forma condicional si se ha adjuntado
 * un nuevo archivo multimedia de reemplazo; de ser así, procesa su carga física en el servidor asignándole
 * un identificador único y actualiza la ruta de acceso. Finalmente, ejecuta de forma transaccional la actualización
 * de los campos informativos en la persistencia y retorna la confirmación del proceso en formato JSON.
 */
    public function actualizarSolucion(Request $request, Response $response, array $args): Response
    {
        $idIncidencia = $args['id'];
        $data = $request->getParsedBody();
        $adminId = $request->getAttribute('usuario_id');
        $files = $request->getUploadedFiles();

        if (empty($data['nota_cierre'])) {
            throw new \RuntimeException("La nota aclaratoria es totalmente obligatoria.", 400);
        }

        $notaCierre = strip_tags(trim($data['nota_cierre']));
        $db = Connection::getConnection();

        $stmtCheck = $db->prepare("SELECT foto_cierre FROM incidencias WHERE id = ?");
        $stmtCheck->execute([$idIncidencia]);
        $incidencia = $stmtCheck->fetch();

        if (!$incidencia) {
            throw new \RuntimeException("La incidencia no existe.", 404);
        }

        $rutaDBFoto = $incidencia['foto_cierre'];
        $fotoFile = $files['foto_cierre'] ?? null;

        if ($fotoFile && $fotoFile->getError() === UPLOAD_ERR_OK) {
            $extension = pathinfo($fotoFile->getClientFilename(), PATHINFO_EXTENSION);
            $nombreFoto = "cierre_edit_" . uniqid() . "." . $extension;
            
            $directorioSubidas = __DIR__ . '/../../public/uploads/'; 
            $fotoFile->moveTo($directorioSubidas . $nombreFoto);
            
            $rutaDBFoto = 'uploads/' . $nombreFoto; 
        }

        try {
            $db->beginTransaction();

            $stmtUpdate = $db->prepare("
                UPDATE incidencias 
                SET nota_cierre = ?, foto_cierre = ? 
                WHERE id = ?
            ");
            $stmtUpdate->execute([$notaCierre, $rutaDBFoto, $idIncidencia]);

            $db->commit();
        } catch (\Exception $e) {
            $db->rollBack();
            throw new \RuntimeException("Error al actualizar los datos de la solución: " . $e->getMessage(), 500);
        }

        $response->getBody()->write(json_encode([
            'status' => 'success',
            'foto_cierre' => $rutaDBFoto,
            'message' => "Evidencia de solución actualizada con éxito."
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
    }
/**
 * Recupera y retorna el listado completo de los sectores geográficos registrados en el sistema.
 * Ejecuta una consulta directa sobre la base de datos para extraer los identificadores únicos
 * y los nombres de las zonas, ordenando los resultados alfabéticamente para facilitar su consumo
 * en interfaces de usuario. Finalmente, serializa la colección obtenida directamente en formato JSON
 * y define la cabecera correspondiente en la respuesta HTTP.
 */
    public function listarSectores($request, $response) {
        $db = Connection::getConnection(); 
        
        $stmt = $db->query("SELECT id, nombre FROM sectores ORDER BY nombre ASC");
        $sectores = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $response->getBody()->write(json_encode($sectores));
        return $response->withHeader('Content-Type', 'application/json');
    }
/**
 * Gestiona de forma centralizada la creación o actualización de un sector geográfico en el sistema.
 * Decodifica el cuerpo de la solicitud HTTP en formato JSON y extrae el nombre del sector tras aplicar
 * filtros de saneamiento y eliminación de etiquetas HTML. Implementa una lógica condicional (Upsert):
 * si se suministra un identificador único, ejecuta una sentencia de actualización del registro; de lo contrario,
 * procede con la inserción de una nueva entidad. Adicionalmente, captura excepciones de la base de datos
 * para identificar restricciones de duplicidad de nombres mediante el código de error correspondiente,
 * retornando el resultado de la operación en formato JSON de manera controlada.
 */
    public function guardarSector($request, $response) {
        $db = Connection::getConnection();
        $data = json_decode($request->getBody()->getContents(), true);
        
        $nombre = strip_tags(trim($data['nombre'] ?? ''));
        $id = isset($data['id']) ? (int)$data['id'] : null;

        if (empty($nombre)) {
            $response->getBody()->write(json_encode(["success" => false, "error" => "El nombre del sector es requerido."]));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }

        try {
            if ($id) {

                $stmt = $db->prepare("UPDATE sectores SET nombre = ? WHERE id = ?");
                $stmt->execute([$nombre, $id]);
            } else {

                $stmt = $db->prepare("INSERT INTO sectores (nombre) VALUES (?)");
                $stmt->execute([$nombre]);
            }

            $response->getBody()->write(json_encode(["success" => true]));
            return $response->withHeader('Content-Type', 'application/json');
            
        } catch (PDOException $e) {
            $errorMsg = ($e->getCode() == 23000) ? "Este sector ya se encuentra registrado." : "Error interno en el servidor.";
            $response->getBody()->write(json_encode(["success" => false, "error" => $errorMsg]));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }
    }
/**
 * Realiza la eliminación física de un sector geográfico del sistema garantizando la integridad de los datos.
 * Extrae el identificador único de los argumentos de la ruta y realiza una consulta de verificación previa
 * para contabilizar si existen incidencias asociadas a dicho sector. Si se detectan dependencias activas, 
 * interrumpe el flujo operativo devolviendo un error que impide la orfandad de registros (restricción lógica de clave foránea); 
 * de lo contrario, ejecuta la sentencia de supresión definitiva del registro en la base de datos y retorna una respuesta 
 * de éxito en formato JSON.
 */
    public function eliminarSector($request, $response, array $args) {
        $db = Connection::getConnection();
        $id = (int)$args['id'];

        $stmtCheck = $db->prepare("SELECT COUNT(*) FROM incidencias WHERE sector_id = ?");
        $stmtCheck->execute([$id]);
        
        if ($stmtCheck->fetchColumn() > 0) {
            $response->getBody()->write(json_encode([
                "success" => false, 
                "error" => "No se puede eliminar el sector porque ya existen incidencias reportadas en este lugar."
            ]));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }

        $stmt = $db->prepare("DELETE FROM sectores WHERE id = ?");
        $stmt->execute([$id]);

        $response->getBody()->write(json_encode(["success" => true]));
        return $response->withHeader('Content-Type', 'application/json');
    }
/**
 * Realiza la eliminación física de un sector geográfico del sistema garantizando la integridad de los datos.
 * Extrae el identificador único de los argumentos de la ruta y realiza una consulta de verificación previa
 * para contabilizar si existen incidencias asociadas a dicho sector. Si se detectan dependencias activas, 
 * interrumpe el flujo operativo devolviendo un error que impide la orfandad de registros (restricción lógica de clave foránea); 
 * de lo contrario, ejecuta la sentencia de supresión definitiva del registro en la base de datos y retorna una respuesta 
 * de éxito en formato JSON.
 */
    public function listarTiposDanio($request, $response) {
        $db = Connection::getConnection();
        
        $stmt = $db->query("SELECT id, nombre, descripcion FROM tipos_danio ORDER BY nombre ASC");
        $danios = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $response->getBody()->write(json_encode($danios));
        return $response->withHeader('Content-Type', 'application/json');
    }
/**
 * Gestiona de forma centralizada la creación o modificación de una categoría o tipo de daño en el sistema.
 * Decodifica el cuerpo de la solicitud HTTP en formato JSON, aplicando filtros de saneamiento y eliminación 
 * de etiquetas HTML tanto al nombre como a la descripción. Implementa una lógica operativa de tipo "Upsert": 
 * si se incluye un identificador único en la petición, valida la unicidad del nombre excluyendo el registro 
 * actual antes de proceder con su actualización; en caso contrario, verifica que la denominación no exista 
 * previamente en el catálogo antes de insertar la nueva entidad, retornando las confirmaciones o los errores 
 * de validación pertinentes bajo respuestas estructuradas en formato JSON.
 */
    public function guardarTipoDanio($request, $response) {
        $db = Connection::getConnection();
        $data = json_decode($request->getBody()->getContents(), true);
        
        $nombre = strip_tags(trim($data['nombre'] ?? ''));
        $descripcion = strip_tags(trim($data['descripcion'] ?? ''));
        $id = isset($data['id']) ? (int)$data['id'] : null;

        if (empty($nombre)) {
            $response->getBody()->write(json_encode(["success" => false, "error" => "El nombre del tipo de daño es requerido."]));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }

        try {
            if ($id) {

                $check = $db->prepare("SELECT id FROM tipos_danio WHERE nombre = ? AND id != ?");
                $check->execute([$nombre, $id]);
                if ($check->fetch()) {
                    $response->getBody()->write(json_encode(["success" => false, "error" => "Este tipo de daño ya se encuentra registrado en otro registro."]));
                    return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
                }

                $stmt = $db->prepare("UPDATE tipos_danio SET nombre = ?, descripcion = ? WHERE id = ?");
                $stmt->execute([$nombre, $descripcion, $id]);

            } else {

                $check = $db->prepare("SELECT id FROM tipos_danio WHERE nombre = ?");
                $check->execute([$nombre]);
                if ($check->fetch()) {
                    $response->getBody()->write(json_encode(["success" => false, "error" => "Este tipo de daño ya se encuentra registrado."]));
                    return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
                }

                $stmt = $db->prepare("INSERT INTO tipos_danio (nombre, descripcion) VALUES (?, ?)");
                $stmt->execute([$nombre, $descripcion]);
            }

            $response->getBody()->write(json_encode(["success" => true]));
            return $response->withHeader('Content-Type', 'application/json');
            
        } catch (PDOException $e) {

            $response->getBody()->write(json_encode(["success" => false, "error" => "Error interno en el servidor: " . $e->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    }
/**
 * Realiza la eliminación física de una categoría o tipo de daño del sistema garantizando la integridad referencial.
 * Extrae el identificador único de los argumentos de la ruta y realiza una consulta de verificación previa
 * para contabilizar si existen incidencias vinculadas a dicha clasificación. Si se detectan registros dependientes,
 * interrumpe el flujo operativo devolviendo un error que evita la inconsistencia de datos (restricción lógica de clave foránea);
 * de lo contrario, ejecuta la sentencia de supresión definitiva del registro en la base de datos y retorna una respuesta
 * de éxito en formato JSON.
 */
    public function eliminarTipoDanio($request, $response, array $args) {
        $db = Connection::getConnection();
        $id = (int)$args['id'];

        $stmtCheck = $db->prepare("SELECT COUNT(*) FROM incidencias WHERE tipo_danio_id = ?");
        $stmtCheck->execute([$id]);
        
        if ($stmtCheck->fetchColumn() > 0) {
            $response->getBody()->write(json_encode([
                "success" => false, 
                "error" => "No se puede eliminar este tipo de daño porque hay reportes activos que dependen de él."
            ]));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }

        $stmt = $db->prepare("DELETE FROM tipos_danio WHERE id = ?");
        $stmt->execute([$id]);

        $response->getBody()->write(json_encode(["success" => true]));
        return $response->withHeader('Content-Type', 'application/json');
    }
}

