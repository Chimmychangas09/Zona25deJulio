<?php

namespace App\Incidencias;

use App\Database\Connection;
use App\Common\ImageValidator;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Psr\Http\Message\ServerRequestInterface as Request;
use RuntimeException;
use PDO;

class IncidenciasController
{
    /**
     * Endpoint: POST /api/incidencias (Solo Ciudadanos/Vecinos y Admins)
     */
    public function crear(Request $request, Response $response): Response
    {
        $directory = require __DIR__ . '/../../config/config.php';
        $uploadConfig = $directory['upload'];
        
        $data = $request->getParsedBody();
        $uploadedFiles = $request->getUploadedFiles();

        // 1. Validaciones de negocio obligatorias
        if (empty($data['tipo_danio']) || empty($data['descripcion']) || !isset($data['latitud'], $data['longitud'])) {
            throw new RuntimeException("Faltan parámetros requeridos para procesar la incidencia.", 400);
        }

        if (empty($uploadedFiles['foto'])) {
            throw new RuntimeException("Es mandatorio adjuntar una evidencia fotográfica de la incidencia.", 400);
        }

        $fotoFile = $uploadedFiles['foto'];
        
        // Formatear el array nativo para nuestro ImageValidator corporativo
        $fileStream = [
            'name' => $fotoFile->getClientFilename(),
            'type' => $fotoFile->getClientMediaType(),
            'tmp_name' => $fotoFile->getStream()->getMetadata('uri'),
            'error' => $fotoFile->getError(),
            'size' => $fotoFile->getSize()
        ];

        // 2. Ejecutar Triple Filtro Antihackers de Imagen
        $nuevoNombreFoto = ImageValidator::validateUploadedImage($fileStream, $uploadConfig['max_size']);

        // Asegurar la existencia física de la carpeta de uploads
        if (!is_dir($uploadConfig['directory'])) {
            mkdir($uploadConfig['directory'], 0755, true);
        }

        // Mover físicamente el archivo sanitizado
        $fotoFile->moveTo($uploadConfig['directory'] . $nuevoNombreFoto);
        $fotoUrl = 'uploads/' . $nuevoNombreFoto;

        // 3. Recuperar el sector seleccionado por el usuario en el formulario
// (Ya no ejecutamos el algoritmo matemático de clasificación por coordenadas)
$sectorAsignado = isset($data['sector']) ? trim($data['sector']) : "Vías Internas / Calles Secundarias";

// Nota: Puedes mantener las variables $lat y $lng si tu código las usa más abajo 
// para guardarlas en la base de datos (lo cual es excelente para los mapas).
$lat = (float)$data['latitud'];
$lng = (float)$data['longitud'];

        // 4. Persistir en la Base de Datos
        $db = Connection::getConnection();
        $usuarioId = $request->getAttribute('usuario_id');

        $stmt = $db->prepare("
            INSERT INTO incidencias (tipo_danio, descripcion, foto_url, latitud, longitud, sector, estado, usuario_id) 
            VALUES (?, ?, ?, ?, ?, ?, 'Pendiente', ?)
        ");
        
        $stmt->execute([
            strip_tags($data['tipo_danio']),
            strip_tags($data['descripcion']),
            $fotoUrl,
            $lat,
            $lng,
            $sectorAsignado,
            $usuarioId
        ]);

        $payload = [
            'status' => 'success',
            'message' => 'Incidencia reportada correctamente.',
            'data' => ['sector' => $sectorAsignado, 'foto' => $fotoUrl]
        ];

        $response->getBody()->write(json_encode($payload));
        return $response->withStatus(201);
    }
/**
     * Endpoint: GET /api/incidencias (Universal - Lista todo el histórico)
     */
    public function listarTodos(Request $request, Response $response): Response
    {
        $db = Connection::getConnection();
        
        // 1. CAPTURAR PARÁMETROS DE LA URL
        // En Slim Framework los queryParams se obtienen desde el objeto Request
        $queryParams = $request->getQueryParams();
        $desde = $queryParams['desde'] ?? null;
        $hasta = $queryParams['hasta'] ?? null;

        // 2. BASE DE LA CONSULTA SQL (Limpia y Explícita)
        $sql = "
            SELECT 
                i.id,
                i.usuario_id,
                i.tipo_danio,
                i.descripcion,
                i.sector,
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
        ";

        $params = [];

        // 3. LOGICA DE FILTRADO INTELIGENTE
        if (!empty($desde) && !empty($hasta)) {
            // Caso A: El usuario aplicó filtros específicos en el Frontend
            $sql .= " WHERE i.creado_en BETWEEN :desde AND :hasta ";
            $params[':desde'] = $desde . ' 00:00:00';
            $params[':hasta'] = $hasta . ' 23:59:59';
        } else {
            // Caso B: Carga inicial, auto-limitamos al año actual (2026)
            $anoActual = date('Y'); // Captura 2026 dinámicamente
            
            // 💡 CAMBIO AQUÍ: Usamos strftime para que SQLite entienda cómo extraer el año
            $sql .= " WHERE strftime('%Y', i.creado_en) = :ano ";
            
            $params[':ano'] = $anoActual;
            $subtituloFiltro = "Periodo Anual Completo: $anoActual"; // (Solo en la función de Excel)
        }

        $sql .= " ORDER BY i.creado_en DESC";

        // 4. PREPARACIÓN Y EJECUCIÓN SEGURA
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $incidencias = $stmt->fetchAll(PDO::FETCH_ASSOC); 

        // 5. RESPUESTA JSON UNIFICADA
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
     * Endpoint: PUT /api/incidencias/{id}/estado (EXCLUSIVO ADMINISTRADORES + AUDITORÍA INDELEBLE)
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
        
        // 🟢 NUEVAS REGLAS: Cambiamos 'Resuelto' por 'Resuelta' y añadimos 'Rechazada'
        $estadosPermitidos = ['Pendiente', 'En Proceso', 'Resuelta', 'Rechazada'];

        if (!in_array($nuevoEstado, $estadosPermitidos)) {
            throw new RuntimeException("El estado suministrado no pertenece al flujo operativo válido.", 422);
        }

        $db = Connection::getConnection();

        // 1. Obtener estado actual para la auditoría
        $stmtCheck = $db->prepare("SELECT estado FROM incidencias WHERE id = ?");
        $stmtCheck->execute([$idIncidencia]);
        $incidencia = $stmtCheck->fetch();

        if (!$incidencia) {
            throw new RuntimeException("La incidencia solicitada no existe en los registros.", 404);
        }

        $estadoAnterior = $incidencia['estado'];

        try {
            // Iniciar Transacción Atómica para asegurar consistencia absoluta
            $db->beginTransaction();

            // 2. Actualizar el estado de la incidencia
            $stmtUpdate = $db->prepare("UPDATE incidencias SET estado = ? WHERE id = ?");
            $stmtUpdate->execute([$nuevoEstado, $idIncidencia]);

            // 3. Escribir bitácora indeleble en tu tabla 'auditoria_estados'
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

        // 🕵️‍♂️ Personalizar el mensaje de respuesta si es una reapertura para feedback del frontend
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

   public function obtenerAuditoria($request, $response, $args) {
    try {
        $db = Connection::getConnection();

        // 🔄 Consulta corregida: Se añadieron las comas correspondientes y la columna a.accion
        $sth = $db->prepare("
            SELECT 
                a.id,
                a.incidencia_id, 
                a.estado_anterior, 
                a.estado_nuevo,
                u.nombre AS administrador_nombre,
                i.tipo_danio,          -- 👈 ¡Aquí faltaba la coma original!
                a.fecha_cambio         -- 📅 Tu columna de tiempo real
            FROM auditoria_estados a
            LEFT JOIN usuarios u ON a.administrador_id = u.id
            LEFT JOIN incidencias i ON a.incidencia_id = i.id
            ORDER BY a.id DESC
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
            "message" => "Fallo de sintaxis SQL: " . $e->getMessage()
        ], JSON_UNESCAPED_SLASHES);
        
        $response->getBody()->write($payload);
        return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
    }
}

    public function exportarReporteExcel($request, $response, $args) {
    try {
        $db = Connection::getConnection();
        
        // 1. CAPTURAR PARÁMETROS DEL FRONTEND (QueryParams)
        $queryParams = $request->getQueryParams();
        $desde = $queryParams['desde'] ?? null;
        $hasta = $queryParams['hasta'] ?? null;

        // Construcción dinámica de la consulta SQL
        $sql = "
            SELECT i.id, i.tipo_danio, i.sector, i.estado, i.descripcion, i.creado_en, u.nombre AS vecino_nombre 
            FROM incidencias i
            LEFT JOIN usuarios u ON i.usuario_id = u.id
        ";

        $params = [];

        // Evaluar las condiciones de fecha
        if (!empty($desde) && !empty($hasta)) {
            // Caso A: El usuario aplicó filtros específicos en el Frontend
            $sql .= " WHERE i.creado_en BETWEEN :desde AND :hasta ";
            $params[':desde'] = $desde . ' 00:00:00';
            $params[':hasta'] = $hasta . ' 23:59:59';
            $subtituloFiltro = "Filtrado desde: $desde hasta: $hasta";
        } else {
            // Caso B: No hay filtros activos, limitamos automáticamente al año actual (2026)
            $anoActual = date('Y'); // Capturará 2026 dinámicamente
            $sql .= " WHERE YEAR(i.creado_en) = :ano ";
            $params[':ano'] = $anoActual;
            $subtituloFiltro = "Periodo Anual Completo: $anoActual";
        }

        $sql .= " ORDER BY i.id DESC";

        // Preparar y ejecutar con seguridad contra Inyección SQL
        $sth = $db->prepare($sql);
        $sth->execute($params);
        $incidencias = $sth->fetchAll(\PDO::FETCH_ASSOC);

        // 2. Construcción de la Hoja de Estilo e Interfaz Premium en HTML para Excel
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
                
                /* Badges de Estado con Colores Premium */
                .badge-pendiente { background-color: #FCE4D6; color: #C65911; font-weight: bold; text-align: center; border: 1px solid #FCE4D6; }
                .badge-proceso { background-color: #FFF2CC; color: #7F6000; font-weight: bold; text-align: center; border: 1px solid #FFF2CC; }
                .badge-resuelto { background-color: #E2EFDA; color: #375623; font-weight: bold; text-align: center; border: 1px solid #E2EFDA; }
            </style>
        </head>
        <body>
            <table>
                <tr><td colspan="7" class="title-block">REPORTE DE GESTIÓN URBANA</td></tr>
                <tr><td colspan="7" class="subtitle-block">Junta Vecinal Zona 25 de Julio - El Alto | Módulo de Planificación Estratégica</td></tr>
                <tr><td colspan="7" class="subtitle-block"><b>Filtro aplicado:</b> ' . $subtituloFiltro . '</td></tr>
                <tr><td colspan="7" class="subtitle-block">Generado de forma síncrona el: ' . date('Y-m-d H:i:s') . '</td></tr>
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

        // 3. Renderizado iterativo de las filas con efecto cebra e insignias vivas
        foreach ($incidencias as $index => $item) {
            $claseFila = ($index % 2 === 0) ? 'data-row-even' : 'data-row-odd';
            
            $claseBadge = 'badge-pendiente';
            if ($item['estado'] === 'En Proceso') $claseBadge = 'badge-proceso';
            if ($item['estado'] === 'Resuelto')   $claseBadge = 'badge-resuelto';

            $html .= '<tr class="' . $claseFila . '">';
            $html .= '<td class="td-border text-center">' . $item['id'] . '</td>';
            $html .= '<td class="td-border" style="font-weight: bold;">' . htmlspecialchars($item['tipo_danio']) . '</td>';
            $html .= '<td class="td-border">' . htmlspecialchars($item['sector'] ?? 'Sector General') . '</td>';
            $html .= '<td class="td-border ' . $claseBadge . '">' . $item['estado'] . '</td>';
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

        // 4. Configuración de Cabeceras HTTP
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
     * Endpoint: POST /api/usuarios/administradores (EXCLUSIVO ALTA DE ADMINS + AUDITORÍA)
     */
    /**
     * Endpoint: POST /api/admin/usuarios (EXCLUSIVO ALTA DE ADMINS + AUDITORÍA)
     */
    public function registrarAdministrador(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();

        // 1. Validaciones estrictas de negocio
        if (empty($data['nombre']) || empty($data['correo']) || empty($data['password']) || empty($data['admin_operador_id'])) {
            throw new RuntimeException("Faltan parámetros requeridos para procesar el alta del administrador.", 400);
        }

        $db = Connection::getConnection();

        // 2. Verificar duplicidad de correo de forma preventiva
        $checkStmt = $db->prepare("SELECT id FROM usuarios WHERE correo = ? LIMIT 1");
        $checkStmt->execute([trim($data['correo'])]);
        if ($checkStmt->fetch()) {
            throw new RuntimeException("El correo electrónico suministrado ya se encuentra registrado en la plataforma.", 409);
        }

        try {
            // 3. Iniciar Transacción Atómica
            $db->beginTransaction();

            // 4. Registrar al nuevo usuario con rol_id = 1 (Administrador)
            // Se eliminó la columna 'rol' y 'sector' que no existen en tu tabla de usuarios
            $stmtUser = $db->prepare("
                INSERT INTO usuarios (nombre, correo, password, rol_id) 
                VALUES (?, ?, ?, 1)
            ");
            
            // Encriptación BCRYPT reglamentaria
            $passwordHash = password_hash($data['password'], PASSWORD_BCRYPT);
            
            $stmtUser->execute([
                strip_tags(trim($data['nombre'])),
                filter_var(trim($data['correo']), FILTER_SANITIZE_EMAIL),
                $passwordHash
            ]);

            // Capturar el ID generado para el nuevo administrador
            $nuevoAdminId = $db->lastInsertId();

            // 5. 📝 Registrar la huella en la tabla auditoria_usuarios
            $stmtAudit = $db->prepare("
                INSERT INTO auditoria_usuarios (administrador_id, usuario_afectado_id, accion) 
                VALUES (?, ?, 'CREAR_ADMIN')
            ");
            $stmtAudit->execute([
                (int)$data['admin_operador_id'],
                $nuevoAdminId
            ]);

            // Consolidar todos los cambios de forma segura
            $db->commit();

        } catch (\Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw new RuntimeException("Fallo en la operación atómica de registro y auditoría: " . $e->getMessage(), 500);
        }

        // 6. Retornar respuesta estructurada acorde a tu framework
        $payload = [
            'status' => 'success',
            'message' => 'Nuevo Administrador dado de alta con éxito. Acción auditada correctamente.'
        ];

        $response->getBody()->write(json_encode($payload));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
    }

    /**
     * READ: Listar todos los usuarios (Admins y Vecinos)
     */
    public function listarUsuariosAdmin(Request $request, Response $response): Response
    {
        // Detectar si el frontend pide ver los eliminados (ej: ?tipo=eliminados)
        $queryParams = $request->getQueryParams();
        $mostrarEliminados = isset($queryParams['tipo']) && $queryParams['tipo'] === 'eliminados';

        $db = Connection::getConnection();

        if ($mostrarEliminados) {
            // 🔎 TRAER SÓLO LOS DADOS DE BAJA
            $stmt = $db->query("
                SELECT id, nombre, correo, rol_id, creado_en, eliminado_en 
                FROM usuarios 
                WHERE eliminado_en IS NOT NULL
                ORDER BY eliminado_en DESC
            ");
        } else {
            // 🟢 TRAER SÓLO LOS ACTIVOS (Comportamiento por defecto)
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
     * UPDATE: Modificar datos y Rol de un usuario
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
     * DELETE: Eliminar un usuario de la base de datos
     */
    public function eliminarUsuarioAdmin(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $db = Connection::getConnection();

        // 🛡️ Marcar con la fecha y hora actual en lugar de hacer un DELETE físico
        $fechaActual = date('Y-m-d H:i:s');
        
        $stmt = $db->prepare("
            UPDATE usuarios 
            SET eliminado_en = ? 
            WHERE id = ?
        ");
        $stmt->execute([$fechaActual, $id]);

        // Opcional: Aquí podrías disparar un log a tu tabla de auditoría indicando 'BAJA_USUARIO'

        $response->getBody()->write(json_encode([
            'status' => 'success', 
            'message' => 'El usuario ha sido dado de baja en la plataforma. Historial preservado.'
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
    }

    public function reactivarUsuarioAdmin(Request $request, Response $response, array $args): Response
    {
        $id = $args['id'];
        $db = Connection::getConnection();

        // 🪄 La magia: Devolvemos el campo 'eliminado_en' a NULL
        $stmt = $db->prepare("
            UPDATE usuarios 
            SET eliminado_en = NULL 
            WHERE id = ?
        ");
        $stmt->execute([$id]);

        // Opcional: Podrías registrar en tu bitácora de auditoría la acción 'REACTIVAR_USUARIO'

        $response->getBody()->write(json_encode([
            'status' => 'success', 
            'message' => 'Cuenta reactivada con éxito. El usuario ya puede volver a ingresar con sus credenciales de siempre.'
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
    }

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

    // 1. Procesar y guardar la imagen en el servidor
    $fotoFile = $files['foto_cierre'];
    if ($fotoFile->getError() !== UPLOAD_ERR_OK) {
        throw new \RuntimeException("Error al subir el archivo de evidencia.", 400);
    }

    // Generar un nombre único para evitar sobreescritura (Ej: cierre_64a2b.jpg)
    $extension = pathinfo($fotoFile->getClientFilename(), PATHINFO_EXTENSION);
    $nombreFoto = "cierre_" . uniqid() . "." . $extension;
    
    // Mover el archivo a tu carpeta existente de subidas
    $directorioSubidas = __DIR__ . '/../../public/uploads/'; 
    $fotoFile->moveTo($directorioSubidas . $nombreFoto);
    $rutaDBFoto = '/uploads/' . $nombreFoto; // Ruta relativa para guardar en BD

    $db = Connection::getConnection();

    // 2. Obtener estado anterior para mantener tu auditoría intacta
    $stmtCheck = $db->prepare("SELECT estado FROM incidencias WHERE id = ?");
    $stmtCheck->execute([$idIncidencia]);
    $incidencia = $stmtCheck->fetch();

    if (!$incidencia) {
        throw new \RuntimeException("La incidencia no existe.", 404);
    }
    $estadoAnterior = $incidencia['estado'];

    try {
        $db->beginTransaction();

        // 3. Actualizar estado, nota de cierre y ruta de la nueva foto
        $stmtUpdate = $db->prepare("
            UPDATE incidencias 
            SET estado = ?, nota_cierre = ?, foto_cierre = ? 
            WHERE id = ?
        ");
        $stmtUpdate->execute([$nuevoEstado, $notaCierre, $rutaDBFoto, $idIncidencia]);

        // 4. Tu tabla de auditoría se llena de manera automática
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

public function actualizarSolucion(Request $request, Response $response, array $args): Response
{
    $idIncidencia = $args['id'];
    $data = $request->getParsedBody();
    $adminId = $request->getAttribute('usuario_id');
    $files = $request->getUploadedFiles();

    // 🛡️ Aquí solo la nota es obligatoria. La foto pasa a ser opcional (por si solo edita texto)
    if (empty($data['nota_cierre'])) {
        throw new \RuntimeException("La nota aclaratoria es totalmente obligatoria.", 400);
    }

    $notaCierre = strip_tags(trim($data['nota_cierre']));
    $db = Connection::getConnection();

    // Verificar si la incidencia existe y traer su foto de cierre actual
    $stmtCheck = $db->prepare("SELECT foto_cierre FROM incidencias WHERE id = ?");
    $stmtCheck->execute([$idIncidencia]);
    $incidencia = $stmtCheck->fetch();

    if (!$incidencia) {
        throw new \RuntimeException("La incidencia no existe.", 404);
    }

    $rutaDBFoto = $incidencia['foto_cierre']; // Mantenemos la foto actual por defecto
    $fotoFile = $files['foto_cierre'] ?? null;

    // 📸 Si el administrador decidió subir una NUEVA foto para corregir el caso:
    if ($fotoFile && $fotoFile->getError() === UPLOAD_ERR_OK) {
        $extension = pathinfo($fotoFile->getClientFilename(), PATHINFO_EXTENSION);
        $nombreFoto = "cierre_edit_" . uniqid() . "." . $extension;
        
        $directorioSubidas = __DIR__ . '/../../public/uploads/'; 
        $fotoFile->moveTo($directorioSubidas . $nombreFoto);
        
        // El ciudadano espera la ruta con el formato del log ("uploads/..."), así lo guardamos
        $rutaDBFoto = 'uploads/' . $nombreFoto; 
    }

    try {
        $db->beginTransaction();

        // Actualizamos los datos de cierre sin tocar el estado ni la auditoría (ya que el caso ya estaba resuelto)
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
}

