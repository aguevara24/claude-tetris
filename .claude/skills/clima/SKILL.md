---
name: clima
description: Consulta el clima actual y el pronóstico de 3 días vía wttr.in (sin API key). Úsala cuando el usuario pregunte por el tiempo/clima/temperatura/lluvia/pronóstico, con o sin ciudad; sin ciudad usa geolocalización por IP.
allowed-tools: PowerShell, Bash
---

# Clima

Consulta el clima usando [wttr.in](https://wttr.in), sin necesidad de API key.

## Uso

Ejecutar desde la raíz del proyecto:

```
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/clima/scripts/clima.ps1 "<ciudad opcional>"
```

Sin argumento, wttr.in geolocaliza por la IP pública.

### Argumentos aceptados

- Nombre de ciudad: `"Madrid"`
- Ciudad y país: `"Buenos Aires,AR"`
- Código postal
- Aeropuerto IATA: `"~MAD"`
- Coordenadas: `"40.4,-3.7"`

## Fallback

Si PowerShell no está disponible o el script falla, usar curl directamente (una línea, sin JSON):

```
curl.exe -s "https://wttr.in/<ciudad>?format=%l:+%c+%t+(ST+%f)+%h+%w"
```

Nota: usar `curl.exe`, no `curl` a secas — en PowerShell 5.1 `curl` es un alias de `Invoke-WebRequest`.

## Presentación

- Mostrar la salida del script tal cual; no reformatear ni inventar datos.
- Si el usuario solo pide el clima actual, mostrar únicamente la primera parte (Ubicación + Ahora) y omitir el pronóstico.
- Nunca pedir ni volcar el JSON crudo (`format=j1`) en el contexto — el script ya lo filtra a texto compacto.
