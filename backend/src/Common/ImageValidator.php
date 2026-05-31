<?php

namespace App\Common;

use RuntimeException;

class ImageValidator
{
    /**
     * Valida de forma estricta un archivo de imagen subido mediante Triple Filtro.
     * 1. Tamaño | 2. Extensión y MIME tipo | 3. Firmas binarias (Magic Numbers)
     */
    public static function validateUploadedImage(array $fileStream, int $maxBytes): string
    {
        // Filtro 0: Verificar errores nativos de PHP en la subida
        if ($fileStream['error'] !== UPLOAD_ERR_OK) {
            throw new RuntimeException("Error en la transferencia física del archivo.", 400);
        }

        // Filtro 1: Control estricto de peso volumétrico
        if ($fileStream['size'] > $maxBytes) {
            $maxMb = round($maxBytes / 1024 / 1024, 2);
            throw new RuntimeException("La evidencia excede el límite permitido de {$maxMb}MB.", 400);
        }

        $tmpPath = $fileStream['tmp_name'];
        $originalName = $fileStream['name'];
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

        // Filtro 2: Mapeo estricto de extensiones permitidas
        $allowedExtensions = ['jpg', 'jpeg', 'png'];
        if (!in_array($extension, $allowedExtensions)) {
            throw new RuntimeException("Extensión corporativa inválida. Solo se admite JPG, JPEG o PNG.", 400);
        }

        // Filtro 3: Validación por Magic Numbers mediante lectura de cabecera binaria
        $handle = fopen($tmpPath, 'rb');
        if (!$handle) {
            throw new RuntimeException("No se pudo procesar el flujo binario de la imagen.", 500);
        }
        $bytes = fread($handle, 4);
        fclose($handle);

        if ($bytes === false) {
            throw new RuntimeException("Archivo ilegible o corrupto.", 400);
        }

        // Convertir cabecera a representación hexadecimal para matching exacto
        $hex = bin2hex($bytes);

        $isJpg = (strpos($hex, 'ffd8ff') === 0);
        $isPng = (strpos($hex, '89504e47') === 0);

        if (!$isJpg && !$isPng) {
            throw new RuntimeException("Fraude de identidad de archivo detectado. El contenido binario no es una imagen válida.", 422);
        }

        // Sanitización y generación de un nombre determinista único e impredecible
        return bin2hex(random_bytes(16)) . '.' . $extension;
    }
}