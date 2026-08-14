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
5. **Dos formas de cortar.** En la barra elegís *A mano* (trazo continuo, curvas suavizadas) o
   **Por puntos**: cada clic clava un vértice y lo une al anterior con una línea recta, hasta que
   volvés al primero y la figura se cierra. `Enter` cierra, `Retroceso` quita el último punto,
   doble clic también cierra. Arrastrar en este modo mueve la foto en vez de poner un punto.
6. **Acercar para afinar.** Dentro del recorte hay zoom propio: botones `− + Ajustar` en la barra,
   rueda del mouse sobre el cursor, o pellizco de dos dedos. Para mover la foto: dos dedos, botón
   central del mouse, o `Espacio` + arrastrar. Los puntos del trazo se guardan en coordenadas de
   la foto, así que acercar o mover **no deforma** lo que ya dibujaste.
7. **Armar el collage.** Cada recorte entra como capa: se arrastra, se escala con los mangos, se
   rota con el círculo de arriba. En el panel podés poner ancho/alto exactos, escala y rotación.
8. **Recortar más.** Con una capa seleccionada, *Recortar más esta capa* la vuelve a abrir en el
   lápiz para afinar el contorno. Lo que queda no se mueve de su lugar en el collage, y es un paso
   de historial más, así que se deshace.
9. **Dibujar y escribir.** Ver abajo.
10. **Descargar** en PNG (o JPG desde el menú Archivo) al tamaño exacto del formato elegido.

## Dibujo y texto

Además de los recortes hay dos tipos de capa más, ambas **vectoriales**: se guardan como curvas y
letras, no como píxeles, así que se agrandan todo lo que quieras sin pixelarse.

- **Pincel** (`B`). Cuatro puntas: *pincel* (opaco), *marcador* (translúcido y más ancho), *lápiz*
  (fino) y *neón* (con resplandor y núcleo claro). Color de la paleta o libre, y grosor de 1 a 120.
  Cada sesión de dibujo arma una capa; *Borrar trazo* saca el último y `Ctrl+Z` también, uno por vez.
- **Texto** (`T`). Tocás el lienzo donde va y escribís en el panel. Elegís **fuente**, **tamaño**,
  **color**, negrita, cursiva y alineación. El selector trae ~30 familias agrupadas en *Sin serifa*,
  *Con serifa*, *Titulares*, *Manuscritas* y *Monoespacio*, todas del sistema: no se descarga nada.
  Al arrancar se mide cuáles existen de verdad en el equipo y las que faltan no se listan (en este
  Windows quedan 25). Doble clic sobre el texto en el lienzo lo manda a editar. El contorno de color del
  bloque *Capa seleccionada* también funciona en textos, para que se lean sobre fondos claros.

Las dos se mueven, escalan y rotan como cualquier capa, y entran en el PNG final.

## En el móvil

- **Pellizco de dos dedos** para acercar, tanto en el collage como en el recorte. Si estabas
  moviendo una capa y aparece el segundo dedo, ese movimiento se revierte solo: el collage no se
  desarma al hacer zoom.
- **Un dedo sobre el fondo** panea la vista; un toque simple deselecciona.
- Los mangos de las capas tienen área de toque ampliada.
- La barra del recorte se reacomoda en filas y **nunca queda encima de la foto**: el alto libre se
  calcula descontando la barra.

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
js/recorte.js   herramienta de lápiz: trazo, cierre automático, Path2D + clip(), zoom y borde
js/dibujo.js    pincel libre: trazos vectoriales, puntas, color y grosor
js/texto.js     capas de texto: fuente, tamaño, color, estilo y contorno
js/panel.js     panel lateral: fotos, capas con miniaturas, propiedades de capa, fondo, mesa de recorte
js/app.js       menús, herramientas, atajos, modales y arranque
```

## Atajos

| Tecla | Acción |
|---|---|
| `V` / `R` / `E` | Mover · Recortar · Rotar |
| `B` / `T` | Pincel · Texto |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer |
| `Ctrl+D` / `Supr` | Duplicar / eliminar capa |
| `[` / `]` | Enviar al fondo / traer al frente |
| Flechas | Mover la capa (con `Shift`, de a 10 px) |
| `Shift` al escalar | Invierte el bloqueo de proporción |
| `Shift` al rotar | Ángulos de 15° |
| `Ctrl` + rueda / `0` | Zoom / ajustar vista |
| Rueda (en recorte) | Zoom sobre el cursor |
| `Espacio` + arrastrar | Mover la foto mientras recortás |
| `Enter` (por puntos) | Cerrar la figura |
| `Retroceso` (por puntos) | Quitar el último vértice |
| `F` / `Ctrl+S` | Formato / descargar PNG |

## Notas

- No hay banner de publicidad: ese espacio del panel es la **mesa de recorte**.
- Nada se sube a ningún servidor y nada queda guardado al cerrar la pestaña.
