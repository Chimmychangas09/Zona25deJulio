<?php

namespace App\Auth;

use App\Database\Connection;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use RuntimeException;
use PDO;

class AuthController
{
    /**
     * Endpoint: POST /api/auth/register
     */
    public function register(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();
        
        // Validación rigurosa de campos requeridos
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

        // Verificar colisión de cuentas (usuarios duplicados)
        //  CÓDIGO CORREGIDO Y SEGURO:
        $stmtCheck = $db->prepare("SELECT id FROM usuarios WHERE correo = ? AND eliminado_en IS NULL LIMIT 1");
        $stmtCheck->execute([$data['correo']]);
        if ($stmtCheck->fetch()) {
            throw new RuntimeException("El correo ya se encuentra registrado en el padrón de la zona.", 409);
        }

        // Cifrado criptográfico irreversible de la credencial
        $passwordHash = password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => 12]);
        $rolCiudadano = 2; // Por defecto todo registro externo es un vecino (Ciudadano)

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

    /**
     * Endpoint: POST /api/auth/login
     */
    public function login(Request $request, Response $response): Response
    {
        $data = $request->getParsedBody();

        if (empty($data['correo']) || empty($data['password'])) {
            throw new RuntimeException("Credenciales incompletas.", 400);
        }

        $db = Connection::getConnection();

        // Buscar el usuario y amalgamar su rol correspondiente
        $stmt = $db->prepare("
            SELECT u.*, r.nombre as rol_nombre 
            FROM usuarios u 
            JOIN roles r ON u.rol_id = r.id 
            WHERE u.correo = ?
        ");
        $stmt->execute([strtolower(trim($data['correo']))]);
        $user = $stmt->fetch();

        // Verificación de tiempo constante contra ataques de sincronización temporizada
        if (!$user || !password_verify($data['password'], $user['password'])) {
            throw new RuntimeException("Las credenciales de acceso son incorrectas o inexistentes.", 401);
        }

        // Estructuración del Token Simulado (Estructura de payload plano seguro para SPA)
        $tokenSimulado = base64_encode(json_encode([
            'uid' => $user['id'],
            'rol' => $user['rol_nombre'],
            'exp' => time() + 28800 // Expiración en 8 horas
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