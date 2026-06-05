<?php
/**
 * Clase encargada de la gestión y provisión de la conexión a la base de datos utilizando el patrón Singleton.
 * Centraliza la creación de una única instancia de PDO compartida a lo largo de la ejecución de la aplicación.
 * Carga dinámicamente los parámetros de configuración para inicializar el motor de persistencia activo,
 * soportando la creación automatizada de directorios para entornos SQLite o estructurando el DSN para conexiones
 * MySQL. Asimismo, establece de forma estricta las directivas de manejo de excepciones, modos de obtención de
 * datos asertivos, desactivación de emulación de consultas preparadas y la activación explícita de restricciones
 * de clave foránea cuando el controlador subyacente corresponda a SQLite.
 */
namespace App\Database;

use PDO;
use PDOException;
use RuntimeException;

class Connection
{
    private static ?PDO $instance = null;

    public static function getConnection(): PDO
    {
        if (self::$instance === null) {
            $config = require __DIR__ . '/../../config/config.php';
            $dbConfig = $config['db'];

            try {
                if ($dbConfig['driver'] === 'sqlite') {

                    $dir = dirname($dbConfig['database']);
                    if (!is_dir($dir)) {
                        mkdir($dir, 0755, true);
                    }
                    
                    self::$instance = new PDO("sqlite:" . $dbConfig['database']);
                } else {
                    $dsn = "mysql:host={$dbConfig['host']};dbname={$dbConfig['database']};charset={$dbConfig['charset']}";
                    self::$instance = new PDO($dsn, $dbConfig['username'], $dbConfig['password']);
                }

                self::$instance->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                self::$instance->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                self::$instance->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

                if ($dbConfig['driver'] === 'sqlite') {
                    self::$instance->exec("PRAGMA foreign_keys = ON;");
                }

            } catch (PDOException $e) {

                error_log("Fallo crítico de conexión BD: " . $e->getMessage());
                throw new RuntimeException("Error interno del servidor al establecer conexión con persistencia.");
            }
        }

        return self::$instance;
    }
}