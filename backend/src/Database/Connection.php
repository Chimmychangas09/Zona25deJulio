<?php

namespace App\Database;

use PDO;
use PDOException;
use RuntimeException;

class Connection
{
    private static ?PDO $instance = null;

    /**
     * Obtiene la conexión única a la Base de Datos
     */
    public static function getConnection(): PDO
    {
        if (self::$instance === null) {
            $config = require __DIR__ . '/../../config/config.php';
            $dbConfig = $config['db'];

            try {
                if ($dbConfig['driver'] === 'sqlite') {
                    // Verificar y crear el directorio de la BD si no existe
                    $dir = dirname($dbConfig['database']);
                    if (!is_dir($dir)) {
                        mkdir($dir, 0755, true);
                    }
                    
                    self::$instance = new PDO("sqlite:" . $dbConfig['database']);
                } else {
                    $dsn = "mysql:host={$dbConfig['host']};dbname={$dbConfig['database']};charset={$dbConfig['charset']}";
                    self::$instance = new PDO($dsn, $dbConfig['username'], $dbConfig['password']);
                }

                // Configuración estricta de manejo de errores y tipado seguro
                self::$instance->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                self::$instance->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                self::$instance->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

                // Forzar llaves foráneas activas si se usa SQLite
                if ($dbConfig['driver'] === 'sqlite') {
                    self::$instance->exec("PRAGMA foreign_keys = ON;");
                }

            } catch (PDOException $e) {
                // Registro interno del error real y abstracción segura para el cliente
                error_log("Fallo crítico de conexión BD: " . $e->getMessage());
                throw new RuntimeException("Error interno del servidor al establecer conexión con persistencia.");
            }
        }

        return self::$instance;
    }
}