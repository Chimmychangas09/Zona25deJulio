<?php
/**
 * Clasifica de forma automatizada un punto geográfico dentro de un sector urbano predefinido.
 * Evalúa las coordenadas de latitud y longitud suministradas contrastándolas con rangos de perímetros
 * delimitados (cajas de delimitación geográfica o Bounding Boxes) correspondientes a las zonas operativa
 * de la jurisdicción. Retorna una cadena identificativa con el nombre del sector asignado (Norte, Central, 
 * Sur) o, en su defecto, una categorización genérica en caso de que la ubicación se encuentre fuera de los
 * márgenes urbanos estrictamente mapeados.
 */
namespace App\Incidencias;

class SectorClassifier
{
    public static function classify(float $lat, float $lng): string
    {
        if ($lat >= -16.5150 && $lat <= -16.5100 && $lng >= -68.1900 && $lng <= -68.1800) {
            return "Sector Norte - Av. Alfonso Ugarte";
        }

        if ($lat >= -16.5200 && $lat < -16.5150 && $lng >= -68.1950 && $lng <= -68.1850) {
            return "Sector Central - Plaza 25 de Julio";
        }

        if ($lat >= -16.5250 && $lat < -16.5200 && $lng >= -68.2000 && $lng <= -68.1900) {
            return "Sector Sur - Límite Distrito 4";
        }

        return "Sector Periférico / Área de Expansión";
    }
}