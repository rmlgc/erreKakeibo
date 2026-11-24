# ErreKakeibo

Contabilidad personal basada en el método Kakeibo, pensada para correr 100% offline desde un disco duro externo o un pendrive. Sin servidor, sin cuenta, sin instalación: abres `index.html` y ya está.

Toda tu información vive en un único archivo `contabilidad_kakeibo.json` que guardas tú, donde quieras. Nada se envía a ningún sitio porque no hay a dónde enviarlo.

## Uso

1. Copia la carpeta entera a donde quieras (disco externo, pendrive, escritorio).
2. Abre `index.html` con el navegador.
3. Sube tus extractos bancarios o empieza a anotar a mano.

Recomendado usar Chrome o Edge: permiten guardar directamente sobre el JSON sin pasar por la carpeta de Descargas. Firefox y Safari funcionan igual, pero con descarga/subida manual del archivo.

## Qué hace

- Importa extractos CSV (imagin/CaixaBank y Revolut se detectan solos; cualquier otro banco con un mapeo genérico de columnas) y evita duplicados al reimportar.
- Clasifica los gastos con reglas automáticas por palabra clave, con un diccionario en español ya incluido, y sugiere clasificación por historial cuando no hay regla.
- Presupuesto por bloques (50/25/25 y otras plantillas) con topes por categoría.
- Resumen con gráficos, comparativas mensuales y detección de gastos recurrentes/hormiga.
- Cuentas múltiples, efectivo, traspasos internos, división de compras y devoluciones.

Para el detalle completo de cada función, ver [LEEME.txt](LEEME.txt).

## Estructura

```
index.html
assets/
  css/        estilos
  icon/       iconos
  vendor/     Chart.js y PapaParse (sin CDN)
  js/
    adapters/ lectura de extractos por banco
    ui/       una pestaña por archivo
    app.js    arranque y navegación
```

Vanilla JS, sin build, sin dependencias externas por CDN.

## Privacidad

No hay ninguna llamada de red en el código. Todo corre en tu navegador. Si usas la app en un equipo que no es tuyo, usa "Limpiar navegador" (barra lateral) antes de irte — hace una copia de seguridad y borra lo que el navegador recordaba, sin tocar tu JSON.
