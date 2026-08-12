param(
    [string]$Ubicacion = ""
)

$ErrorActionPreference = "Stop"

function Get-CampoSeguro {
    param($Objeto, [string[]]$Ruta, $Defecto = "N/D")
    $actual = $Objeto
    foreach ($paso in $Ruta) {
        if ($null -eq $actual) { return $Defecto }
        if ($paso -match '^\d+$') {
            $idx = [int]$paso
            if ($actual -is [array] -and $actual.Length -gt $idx) {
                $actual = $actual[$idx]
            } else {
                return $Defecto
            }
        } else {
            $actual = $actual.$paso
            if ($null -eq $actual) { return $Defecto }
        }
    }
    if ($null -eq $actual) { return $Defecto }
    return $actual
}

try {
    $ubicacionCodificada = [System.Uri]::EscapeDataString($Ubicacion)
    $url = "https://wttr.in/${ubicacionCodificada}?format=j1&lang=es"

    $respuesta = Invoke-RestMethod -Uri $url -UserAgent "curl/8.0" -TimeoutSec 15 -ErrorAction Stop
}
catch {
    Write-Output "No se pudo obtener el clima: $($_.Exception.Message)"
    exit 1
}

if ($null -eq $respuesta) {
    Write-Output "No se pudo obtener el clima: respuesta vacia del servicio."
    exit 1
}

$area = Get-CampoSeguro $respuesta @("nearest_area", "0", "areaName", "0", "value") "Ubicacion desconocida"
$region = Get-CampoSeguro $respuesta @("nearest_area", "0", "region", "0", "value") ""
$pais = Get-CampoSeguro $respuesta @("nearest_area", "0", "country", "0", "value") ""

$partesLugar = @($area, $region, $pais) | Where-Object { $_ -and $_.Trim() -ne "" }
$lugar = ($partesLugar -join ", ")

$actual = Get-CampoSeguro $respuesta @("current_condition", "0") $null

if ($null -eq $actual) {
    Write-Output "No se pudo obtener el clima: datos actuales no disponibles en la respuesta."
    exit 1
}

$tempC = Get-CampoSeguro $actual @("temp_C") "?"
$sensacion = Get-CampoSeguro $actual @("FeelsLikeC") "?"
$descripcion = Get-CampoSeguro $actual @("lang_es", "0", "value") $null
if ($null -eq $descripcion) {
    $descripcion = Get-CampoSeguro $actual @("weatherDesc", "0", "value") "Sin descripcion"
}
$humedad = Get-CampoSeguro $actual @("humidity") "?"
$vientoVel = Get-CampoSeguro $actual @("windspeedKmph") "?"
$vientoDir = Get-CampoSeguro $actual @("winddir16Point") ""
$precip = Get-CampoSeguro $actual @("precipMM") "?"
$uv = Get-CampoSeguro $actual @("uvIndex") "?"

Write-Output "Ubicacion: $lugar"
Write-Output "Ahora: $tempC C (sensacion $sensacion C) - $descripcion"
Write-Output "  Humedad $humedad% | Viento $vientoVel km/h $vientoDir | Precip. $precip mm | UV $uv"
Write-Output "Pronostico:"

$dias = Get-CampoSeguro $respuesta @("weather") @()
$diasLimitados = $dias | Select-Object -First 3

foreach ($dia in $diasLimitados) {
    $fecha = Get-CampoSeguro $dia @("date") "?"
    $maxTemp = Get-CampoSeguro $dia @("maxtempC") "?"
    $minTemp = Get-CampoSeguro $dia @("mintempC") "?"
    $salida = Get-CampoSeguro $dia @("astronomy", "0", "sunrise") "?"
    $puesta = Get-CampoSeguro $dia @("astronomy", "0", "sunset") "?"

    $horas = Get-CampoSeguro $dia @("hourly") @()
    $horaMedio = $horas | Where-Object { $_.time -eq "1200" } | Select-Object -First 1
    if ($null -eq $horaMedio) {
        $horaMedio = $horas | Select-Object -First 1
    }

    $condMedio = "N/D"
    if ($null -ne $horaMedio) {
        $condMedio = Get-CampoSeguro $horaMedio @("lang_es", "0", "value") $null
        if ($null -eq $condMedio) {
            $condMedio = Get-CampoSeguro $horaMedio @("weatherDesc", "0", "value") "N/D"
        }
    }

    $probLluvia = 0
    foreach ($h in $horas) {
        $chance = Get-CampoSeguro $h @("chanceofrain") "0"
        $chanceInt = 0
        [void][int]::TryParse($chance, [ref]$chanceInt)
        if ($chanceInt -gt $probLluvia) { $probLluvia = $chanceInt }
    }

    Write-Output "  $fecha  max $maxTemp C / min $minTemp C  lluvia $probLluvia%  $condMedio  (sale $salida, pone $puesta)"
}
