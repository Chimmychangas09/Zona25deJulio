<?php
/**
 * Componente de validación y seguridad para el procesamiento de archivos de imagen cargados en el sistema.
 * Verifica la correcta transferencia física del flujo de datos y restringe el tamaño del archivo según los
 * bytes máximos permitidos. Implementa un doble filtro de seguridad que evalúa tanto la extensión nominal
 * del archivo (JPG, JPEG, PNG) como la integridad de su contenido real mediante la lectura y contrastación
 * de los números mágicos (magic bytes) en formato hexadecimal, mitigando ataques de enmascaramiento de archivos.
 * Finalmente, genera y retorna un nombre único aleatorio y seguro para su almacenamiento en el servidor.
 */
namespace App\Common;

use RuntimeException;

class ImageValidator
{
    public static function validateUploadedImage(array $fileStream, int $maxBytes): string
    {
        if ($fileStream['error'] !== UPLOAD_ERR_OK) {
            throw new RuntimeException("Error en la transferencia física del archivo.", 400);
        }

        if ($fileStream['size'] > $maxBytes) {
            $maxMb = round($maxBytes / 1024 / 1024, 2);
            throw new RuntimeException("La evidencia excede el límite permitido de {$maxMb}MB.", 400);
        }

        $tmpPath = $fileStream['tmp_name'];
        $originalName = $fileStream['name'];
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

        $allowedExtensions = ['jpg', 'jpeg', 'png'];
        if (!in_array($extension, $allowedExtensions)) {
            throw new RuntimeException("Extensión corporativa inválida. Solo se admite JPG, JPEG o PNG.", 400);
        }

        $handle = fopen($tmpPath, 'rb');
        if (!$handle) {
            throw new RuntimeException("No se pudo procesar el flujo binario de la imagen.", 500);
        }
        $bytes = fread($handle, 4);
        fclose($handle);

        if ($bytes === false) {
            throw new RuntimeException("Archivo ilegible o corrupto.", 400);
        }

        $hex = bin2hex($bytes);

        $isJpg = (strpos($hex, 'ffd8ff') === 0);
        $isPng = (strpos($hex, '89504e47') === 0);

        if (!$isJpg && !$isPng) {
            throw new RuntimeException("Fraude de identidad de archivo detectado. El contenido binario no es una imagen válida.", 422);
        }

        return bin2hex(random_bytes(16)) . '.' . $extension;
    }
}