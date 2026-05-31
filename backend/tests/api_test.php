<?php

/**
 * Suite de Pruebas Automatizadas de Integración
 * Equivalente Operativo a Pytest para la API Zona 25 de Julio
 */

require __DIR__ . '/../vendor/autoload.php';

// Configuración de objetivos de red
const TEST_API_URL = 'http://localhost:8000/api';
const FOTO_REAL_TEST = __DIR__ . '/test_evidencia.jpg';
const TEXTO_FALSO_TEST = __DIR__ . '/test_falso.jpg';

// Crear archivos temporales físicos necesarios para las pruebas de filtros binarios
file_put_contents(FOTO_REAL_TEST, hex2bin("ffd8ffe000104a46494600010101006000600000ffdb004300")); // Cabecera JPG Real (Magic Number)
file_put_contents(TEXTO_FALSO_TEST, "<?php echo 'script malicioso'; ?>"); // Texto plano disfrazado de JPG

// Helper para ejecutar peticiones HTTP mediante cURL
function request(string $method, string $endpoint, $payload = null, string $token = null, bool $isMultipart = false) {
    $ch = curl_init(TEST_API_URL . $endpoint);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    
    $headers = [];
    if ($token) {
        $headers[] = "Authorization: $token";
    }

    if ($isMultipart) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    } else if ($payload) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        $headers[] = 'Content-Type: application/json';
    }
    
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return ['code' => $httpCode, 'data' => json_decode($response, true)];
}

// Helper de aserciones estilizado tipo Pytest
function assert_test($name, $condition, $message = "") {
    if ($condition) {
        echo "[\033[32mPASSED\033[0m] $name\n";
    } else {
        echo "[\033[31mFAILED\033[0m] $name -> $message\n";
        exit(1);
    }
}

echo "=== INICIANDO PRUEBAS AUTOMATIZADAS DE INTEGRACIÓN (ZONA 25 DE JULIO) ===\n\n";

// --- TEST 1: LOGIN EXITOSO DEL ADMINISTRADOR (Camino Feliz) ---
$loginAdmin = request('POST', '/auth/login', [
    'correo' => 'admin@zona25julio.com',
    'password' => 'GestionUrbana2026!'
]);
assert_test("Test 1: Autenticación exitosa del Administrador", $loginAdmin['code'] === 200);
$tokenAdmin = $loginAdmin['data']['data']['token'] ?? null;


// --- TEST 2: CONTROL DE COLISIONES / DUPLICADOS (Código 409) ---
// Intentamos registrar un correo que ya sabemos que existe (el del admin semilla)
$registerConflict = request('POST', '/auth/register', [
    'nombre' => 'Intruso',
    'correo' => 'admin@zona25julio.com',
    'password' => '123456'
]);
assert_test("Test 2: Control de duplicación de correos (HTTP 409)", $registerConflict['code'] === 409);


// --- TEST 3: REGISTRO DINÁMICO DE UN CIUDADANO NUEVO ---
$correoNuevo = 'vecino_' . time() . '@gmail.com'; // Correo determinista único por segundo
$registerVecino = request('POST', '/auth/register', [
    'nombre' => 'Vecino Automatizado',
    'correo' => $correoNuevo,
    'password' => 'VecinoSeguro2026!'
]);
assert_test("Test 3: Registro exitoso de nueva cuenta de Ciudadano (HTTP 201)", $registerVecino['code'] === 201);


// --- TEST 4: LOGIN DEL CIUDADANO REGISTRADO ---
$loginVecino = request('POST', '/auth/login', [
    'correo' => $correoNuevo,
    'password' => 'VecinoSeguro2026!'
]);
assert_test("Test 4: Autenticación exitosa del nuevo Ciudadano", $loginVecino['code'] === 200);
$tokenVecino = $loginVecino['data']['data']['token'] ?? null;


// --- TEST 5: FILTRO ANTIHACKERS BINARIO (Código 422) ---
// Intentamos subir el archivo de texto falso camuflado
$payloadHacker = [
    'tipo_danio' => 'Bache Estructural',
    'descripcion' => 'Ataque de inyección',
    'latitud' => '-16.5165',
    'longitud' => '-68.1885',
    'foto' => new CURLFile(TEXTO_FALSO_TEST, 'image/jpeg', 'test_falso.jpg')
];
$subidaHacker = request('POST', '/incidencias', $payloadHacker, $tokenVecino, true);
assert_test("Test 5: Bloqueo de fraude de identidad binaria de imagen (HTTP 422)", $subidaHacker['code'] === 422);


// --- TEST 6: CREACIÓN EXITOSA DE INCIDENCIA (Zonificación GPS Automática) ---
$payloadIncidencia = [
    'tipo_danio' => 'Alumbrado Defectuoso',
    'descripcion' => 'Poste apagado frente a la plaza principal',
    'latitud' => '-16.5180', // Coordenada del Sector Central
    'longitud' => '-68.1900',
    'foto' => new CURLFile(FOTO_REAL_TEST, 'image/jpeg', 'test_evidencia.jpg')
];
$subidaIncidencia = request('POST', '/incidencias', $payloadIncidencia, $tokenVecino, true);
assert_test("Test 6: Reporte de incidencia con foto real y GPS (HTTP 201)", $subidaIncidencia['code'] === 201);
assert_test("      ↳ Sub-test: Clasificación correcta al Sector Central", $subidaIncidencia['data']['data']['sector'] === "Sector Central - Plaza 25 de Julio");


// --- TEST 7: RESTRICCIÓN DE ROLES / VECINO NO PUEDE CAMBIAR ESTADOS (Código 403) ---
$cambioEstadoVecino = request('PUT', '/incidencias/1/estado', ['estado' => 'En Proceso'], $tokenVecino);
assert_test("Test 7: Muro de contención RBAC: Vecino no puede mutar estados (HTTP 403)", $cambioEstadoVecino['code'] === 403);


// --- TEST 8: ADMINISTRADOR AUTORIZADO CAMBIA ESTADO ---
$cambioEstadoAdmin = request('PUT', '/incidencias/1/estado', ['estado' => 'En Proceso'], $tokenAdmin);
assert_test("Test 8: Autorización RBAC: Admin actualiza estado (HTTP 200)", $cambioEstadoAdmin['code'] === 200);


// Limpieza física de archivos temporales creados para el test
@unlink(FOTO_REAL_TEST);
@unlink(TEXTO_FALSO_TEST);

echo "\n\033[32m=== ¡TODAS LAS PRUEBAS PASARON CON ÉXITO, CARAJO! EL SISTEMA ES INDESTRUCTIBLE ===\033[0m\n";