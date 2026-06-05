<?php
/**
 * Controlador encargado de la autenticación y gestión de accesos de usuarios dentro de la API.
 * Provee la lógica de negocio para el registro seguro de ciudadanos mediante la validación estructural,
 * saneamiento de datos y encriptación de contraseñas con BCRYPT, previniendo duplicidades en el sistema.
 * Asimismo, administra el inicio de sesión verificando las credenciales contra la base de datos y
 * generando un token de sesión simulado (codificado en Base64 con datos de identidad, rol y expiración)
 * para el control de autorización en solicitudes subsecuentes de la plataforma.
 */
namespace App\Auth;

use App\Database\Connection;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use RuntimeException;
use PDO;

class AuthController
{
    public function register(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();
        
        if (empty($data['nombre']) || empty($data['correo']) || empty($data['password'])) {
            throw new RuntimeException("Todos los campos estructurales (nombre, correo, password) son obligatorios.", 400);
        }

        if (!filter_var($data['correo'], FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException("El formato del correo electrónico proporcionado es totalmente inválido.", 400);
        }

        if (strlen($data['password']) < 6) {
            throw new RuntimeException("La contraseña es vulnerable. Debe contener al menos 6 caracteres.", 400);
        }

        $db = Connection::getConnection();

        $stmtCheck = $db->prepare("SELECT id FROM usuarios WHERE correo = ? AND eliminado_en IS NULL LIMIT 1");
        $stmtCheck->execute([$data['correo']]);
        if ($stmtCheck->fetch()) {
            throw new RuntimeException("El correo ya se encuentra registrado en el padrón de la zona.", 409);
        }

        $passwordHash = password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => 12]);
        $rolCiudadano = 2; 

        $stmtInsert = $db->prepare("INSERT INTO usuarios (nombre, correo, password, rol_id) VALUES (?, ?, ?, ?)");
        $stmtInsert->execute([
            strip_tags($data['nombre']),
            strtolower(trim($data['correo'])),
            $passwordHash,
            $rolCiudadano
        ]);

        $payload = [
            'status' => 'success',
            'message' => 'Usuario registrado exitosamente en el sistema de la Zona 25 de Julio.'
        ];

        $response->getBody()->write(json_encode($payload));
        return $response->withStatus(201);
    }

    public function login(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();

        if (empty($data['correo']) || empty($data['password'])) {
            throw new RuntimeException("Credenciales incompletas.", 400);
        }

        $db = Connection::getConnection();

        $stmt = $db->prepare("
            SELECT u.*, r.nombre as rol_nombre 
            FROM usuarios u 
            JOIN roles r ON u.rol_id = r.id 
            WHERE u.correo = ? AND u.eliminado_en IS NULL
        ");
        $stmt->execute([strtolower(trim($data['correo']))]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($data['password'], $user['password'])) {
            throw new RuntimeException("Las credenciales de acceso son incorrectas o inexistentes.", 401);
        }

        $tokenSimulado = base64_encode(json_encode([
            'uid' => $user['id'],
            'rol' => $user['rol_nombre'],
            'exp' => time() + 28800 
        ]));

        $payload = [
            'status' => 'success',
            'message' => 'Autenticación concedida.',
            'data' => [
                'token' => 'Bearer_' . $tokenSimulado,
                'user' => [
                    'id' => (int)$user['id'],
                    'nombre' => $user['nombre'],
                    'correo' => $user['correo'],
                    'rol' => $user['rol_nombre']
                ]
            ]
        ];

        $response->getBody()->write(json_encode($payload));
        return $response->withStatus(200);
    }
}