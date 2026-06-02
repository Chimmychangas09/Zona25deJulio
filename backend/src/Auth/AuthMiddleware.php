<?php

namespace App\Auth;

use App\Database\Connection;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response as SlimResponse;
use RuntimeException;
// 🔥 IMPORTANTE: Asegúrate de importar tu clase Connection si está en otro namespace, ej:
// use App\Config\Connection; 

class AuthMiddleware
{
    private array $rolesPermitidos;

    public function __construct(array $rolesPermitidos = [])
    {
        $this->rolesPermitidos = $rolesPermitidos;
    }

    public function __invoke(Request $request, Handler $handler): Response
    {
        $authHeader = $request->getHeaderLine('Authorization');

        if (empty($authHeader) || strpos($authHeader, 'Bearer_') !== 0) {
            return $this->generarRespuestaError("Acceso denegado. Token de autorización ausente o mal formado.", 401);
        }

        // Extraer y decodificar el token simulado
        $tokenRaw = str_replace('Bearer_', '', $authHeader);
        try {
            $decodedJson = base64_decode($tokenRaw, true);
            if (!$decodedJson) {
                throw new RuntimeException();
            }
            $tokenData = json_decode($decodedJson, true);
            if (!isset($tokenData['uid'], $tokenData['rol'], $tokenData['exp'])) {
                throw new RuntimeException();
            }
        } catch (\Throwable $e) {
            return $this->generarRespuestaError("Token corrupto o manipulación detectada.", 401);
        }

        // Verificar expiración del token
        if (time() > $tokenData['exp']) {
            return $this->generarRespuestaError("La sesión ha expirado. Por favor, inicie sesión nuevamente.", 401);
        }

        // 🚨 EL ESCUDO ANTI-FANTASMAS: Verificar si el usuario fue dado de baja en tiempo real
        try {
            // Usamos la misma conexión de tu Login/Register
            $db = Connection::getConnection();
            $stmt = $db->prepare("SELECT id FROM usuarios WHERE id = ? AND eliminado_en IS NULL LIMIT 1");
            $stmt->execute([$tokenData['uid']]);
            $usuarioActivo = $stmt->fetch();

            if (!$usuarioActivo) {
                return $this->generarRespuestaError("Esta cuenta ha sido dada de baja o ya no existe en el sistema.", 403);
            }
        } catch (\Throwable $e) {
            // Por seguridad, si la base de datos se cae, no dejamos pasar la petición
            return $this->generarRespuestaError("Error interno al verificar el estado de la cuenta.", 500);
        }

        // Validar control de acceso basado en Roles (RBAC) si se especificaron restricciones
        if (!empty($this->rolesPermitidos) && !in_array($tokenData['rol'], $this->rolesPermitidos)) {
            return $this->generarRespuestaError("Privilegios insuficientes para ejecutar esta operación.", 403);
        }

        // Inyectar los datos del usuario autenticado en los atributos de la petición
        $request = $request->withAttribute('usuario_id', $tokenData['uid']);
        $request = $request->withAttribute('usuario_rol', $tokenData['rol']);

        return $handler->handle($request);
    }

    private function generarRespuestaError(string $mensaje, int $codigo): Response
    {
        $response = new SlimResponse();
        $payload = [
            'status' => 'error',
            'code' => $codigo,
            'message' => $mensaje
        ];
        $response->getBody()->write(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        return $response->withStatus($codigo)->withHeader('Content-Type', 'application/json');
    }
}