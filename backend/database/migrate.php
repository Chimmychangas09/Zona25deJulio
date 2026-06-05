<?php
/**
 * Script de automatización para la migración de base de datos e inyección de datos semilla (seeders).
 * Carga el cargador automático de clases, establece la conexión con la base de datos y ejecuta la
 * estructura del esquema definida en el archivo SQL externo. Adicionalmente, inicializa de forma
 * segura los roles por defecto del sistema y verifica la existencia de un usuario administrador;
 * en caso de no encontrarse registros previos, genera una cuenta de administración inicial con
 * credenciales por defecto y contraseña debidamente cifrada mediante el algoritmo BCRYPT.
 */
use App\Database\Connection;

require __DIR__ . '/../vendor/autoload.php';

try {
    echo "=== Iniciando Proceso de Migración e Inyección de Semillas ===\n";
    
    $db = Connection::getConnection();
    
    $sqlSchema = file_get_contents(__DIR__ . '/schema.sql');
    if ($sqlSchema === false) {
        throw new Exception("No se pudo leer el archivo schema.sql");
    }
    
    $db->exec($sqlSchema);
    echo "[✔] Estructura de tablas y esquemas generada con éxito.\n";
    
    $stmtRole = $db->prepare("INSERT OR IGNORE INTO roles (id, nombre) VALUES (?, ?)");
    $stmtRole->execute([1, 'Administrador']);
    $stmtRole->execute([2, 'Ciudadano']);
    echo "[✔] Roles base ('Administrador', 'Ciudadano') inicializados.\n";

    $checkAdmin = $db->query("SELECT COUNT(*) FROM usuarios WHERE rol_id = 1")->fetchColumn();
    
    if ($checkAdmin == 0) {

        $nombreAdmin = "Gestor Vecinal 25 de Julio";
        $correoAdmin = "admin@zona25julio.com";
        $passwordPlana = "GestionUrbana2026!";
        $passwordCifrada = password_hash($passwordPlana, PASSWORD_BCRYPT, ['cost' => 12]);
        
        $stmtUser = $db->prepare("INSERT INTO usuarios (nombre, correo, password, rol_id) VALUES (?, ?, ?, 1)");
        $stmtUser->execute([$nombreAdmin, $correoAdmin, $passwordCifrada]);
        
        echo "\n========================================================\n";
        echo "   USUARIO ADMINISTRADOR SEMILLA CREADO EXITOSAMENTE   \n";
        echo "========================================================\n";
        echo " Correo:   {$correoAdmin}\n";
        echo " Clave:    {$passwordPlana}\n";
        echo " NOTA: Cambie esta contraseña inmediatamente en producción.\n";
        echo "========================================================\n\n";
    } else {
        echo "[i] El usuario administrador semilla ya existe. Omitiendo inyección.\n";
    }
    
    echo "=== Proceso finalizado correctamente sin errores ===\n";

} catch (Exception $e) {
    echo "\n[✘] ERROR CRÍTICO DURANTE LA MIGRACIÓN:\n";
    echo $e->getMessage() . "\n";
    exit(1);
}