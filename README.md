# UCBAM

App web para armar collages recortando fotos **a mano alzada**. HTML, CSS y JavaScript vanilla:
sin framework, sin backend, sin base de datos. Todo corre en el navegador y vive en memoria
mientras dura la sesión.

## Cómo abrirlo

Doble clic en `index.html`. No hay build ni dependencias (los scripts son clásicos, las fotos se
leen con `FileReader`, así que no hace falta servidor).

Si preferís servirlo por HTTP:

```bash
node servidor-dev.js
```

y entrás a `http://localhost:5177`. Escucha sólo en `127.0.0.1`, así que no queda expuesto al
resto de la red. `servidor-dev.js` es sólo para probar cómodo, no forma parte de la app.

## Privacidad

- No hay pedidos de red: ni `fetch`, ni `XMLHttpRequest`, ni CDN, ni fuentes o scripts externos.
  Todo el CSS y el JS son archivos propios.
- No se usa `localStorage`, `sessionStorage`, cookies ni `IndexedDB`. El estado vive en memoria y
  muere al cerrar la pestaña.
- Las fotos se leen con `FileReader` y quedan en el canvas: nunca salen de la máquina. El nombre
  del archivo no se escribe en consola.
- El PNG/JPG exportado se genera desde el canvas, así que sale sin EXIF (ni GPS, ni cámara, ni
  fecha original de la foto).
- Inspeccionar la página sólo muestra el código de la app y las imágenes que vos cargaste en esa
  sesión.

## Flujo de uso

1. **Formato del collage.** Al abrir aparece el selector: publicación de Instagram, historia,
   miniatura de YouTube, **fondo de pantalla** (Full HD, 2K, 4K, ultrawide, móvil, tablet), A4 a
   300 ppp o un tamaño personalizado en px. Se puede cambiar después desde el chip
   `Lienzo 1920 × 1080` de la barra inferior o con `F`; las capas se reubican y reescalan solas.
2. **Subir fotos.** Botón del panel, cámara del celular o arrastrando archivos a la ventana.
   No hay límite de fotos ni de capas.
3. **Mesa de recorte.** Elegís una foto de la tira y baja a la mesa (el bloque del final del
   panel). Botón *Recortar esta foto* → la foto se abre sobre el lienzo.
4. **Trazo a pulso.** Dibujás el contorno con el mouse o el dedo, punto por punto. Al volver al
   punto de inicio el trazo **se cierra solo** y se ve la silueta viva con el resto atenuado.
   Antes de confirmar elegís si el recorte lleva **borde de color** (y su grosor) o queda tal cual.
5. **Armar el collage.** Cada recorte entra como capa: se arrastra, se escala con los mangos, se
   rota con el círculo de arriba. En el panel podés poner ancho/alto exactos, escala y rotación.
6. **Descargar** en PNG (o JPG desde el menú Archivo) al tamaño exacto del formato elegido.

## Calidad al escalar

El recorte se guarda **a la resolución original de la foto**, no al tamaño con el que entró al
lienzo. Al dibujar en pantalla se usa una copia reducida por pasos (mejor que un solo
`drawImage`) y al exportar se vuelve a la fuente completa. El panel de la capa avisa cuánto de la
resolución original estás usando y marca en amarillo si la estás ampliando por encima del 100 %.

## Deshacer

Las flechas del encabezado (`Ctrl+Z` / `Ctrl+Y`) deshacen **un movimiento por vez**: mover,
escalar, rotar, cambiar el borde, reordenar, agregar o borrar una capa. Nunca borran el collage
entero. El historial guarda hasta 80 pasos y el tooltip del botón dice qué se va a deshacer.

## Estructura

```
index.html
style.css
js/estado.js    estado central, formatos de lienzo, historial, utilidades (curva suave, reducción por pasos)
js/canvas.js    lienzo principal: dibujo de capas, selección, mover/escalar/rotar, zoom, exportar
js/recorte.js   herramienta de lápiz: trazo, cierre automático, Path2D + clip(), borde
js/panel.js     panel lateral: fotos, capas con miniaturas, propiedades de capa, fondo, mesa de recorte
js/app.js       menús, herramientas, atajos, modales y arranque
```

## Atajos

| Tecla | Acción |
|---|---|
| `V` / `R` / `E` | Mover · Recortar · Rotar |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer |
| `Ctrl+D` / `Supr` | Duplicar / eliminar capa |
| `[` / `]` | Enviar al fondo / traer al frente |
| Flechas | Mover la capa (con `Shift`, de a 10 px) |
| `Shift` al escalar | Invierte el bloqueo de proporción |
| `Shift` al rotar | Ángulos de 15° |
| `Ctrl` + rueda / `0` | Zoom / ajustar vista |
| `F` / `Ctrl+S` | Formato / descargar PNG |

## Notas

- No hay banner de publicidad: ese espacio del panel es la **mesa de recorte**.
- Nada se sube a ningún servidor y nada queda guardado al cerrar la pestaña.
