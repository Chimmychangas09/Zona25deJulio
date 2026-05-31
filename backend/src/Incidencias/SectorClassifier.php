<?php

namespace App\Incidencias;

class SectorClassifier
{
    /**
     * Determina el sector político-urbano de la Zona 25 de Julio según coordenadas GPS.
     * Mapea polígonos/cuadrantes aproximados para El Alto.
     */
    public static function classify(float $lat, float $lng): string
    {
        // Cuadrante Sector Norte (Ejemplo de rangos de coordenadas para pruebas locales)
        if ($lat >= -16.5150 && $lat <= -16.5100 && $lng >= -68.1900 && $lng <= -68.1800) {
            return "Sector Norte - Av. Alfonso Ugarte";
        }

        // Cuadrante Sector Central / Plaza Principal
        if ($lat >= -16.5200 && $lat < -16.5150 && $lng >= -68.1950 && $lng <= -68.1850) {
            return "Sector Central - Plaza 25 de Julio";
        }

        // Cuadrante Sector Sur
        if ($lat >= -16.5250 && $lat < -16.5200 && $lng >= -68.2000 && $lng <= -68.1900) {
            return "Sector Sur - Límite Distrito 4";
        }

        // Si se sale de los rangos definidos o está en los márgenes de la zona
        return "Sector Periférico / Área de Expansión";
    }
}