/* ===========================================================
   UCBAM · app.js
   Arranque, menús, herramientas, atajos, modales y exportación.
   =========================================================== */

(function (TC) {
  'use strict';

  const $ = id => document.getElementById(id);

  /* =======================================================
     Menús del encabezado
     ======================================================= */

  const menus = $('menus');

  menus.addEventListener('click', function (e) {
    const boton = e.target.closest('.menu-boton');
    if (boton) {
      const menu = boton.parentElement;
      const abierto = menu.classList.contains('abierto');
      cerrarMenus();
      if (!abierto) { menu.classList.add('abierto'); refrescarMenus(); }
      return;
    }
    const accion = e.target.closest('[data-accion]');
    if (accion) {
      cerrarMenus();
      ejecutar(accion.dataset.accion);
    }
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.menu')) cerrarMenus();
  });

  function cerrarMenus () {
    menus.querySelectorAll('.menu').forEach(m => m.classList.remove('abierto'));
  }

  function refrescarMenus () {
    const hayCapa = !!TC.capaActiva();
    const estados = {
      deshacer: TC.puedeDeshacer(),
      rehacer: TC.puedeRehacer(),
      duplicar: hayCapa, eliminar: hayCapa, frente: hayCapa, fondo: hayCapa
    };
    Object.keys(estados).forEach(function (k) {
      const b = menus.querySelector('[data-accion="' + k + '"]');
      if (b) b.disabled = !estados[k];
    });
  }

  function ejecutar (accion) {
    const sel = TC.estado.seleccion;
    switch (accion) {
      case 'nuevo': nuevoCollage(); break;
      case 'formato': abrirFormatos(); break;
      case 'subir': TC.panel.abrirSelector(); break;
      case 'png': descargar('png'); break;
      case 'jpg': descargar('jpg'); break;
      case 'deshacer': TC.deshacer(); break;
      case 'rehacer': TC.rehacer(); break;
      case 'duplicar': if (sel) TC.canvas.duplicarCapa(sel); break;
      case 'eliminar': if (sel) TC.canvas.eliminarCapa(sel); break;
      case 'frente': if (sel) TC.canvas.moverEnZ(sel, 'frente'); break;
      case 'fondo': if (sel) TC.canvas.moverEnZ(sel, 'fondo'); break;
      case 'comoUsar': abrirAyuda('uso'); break;
      case 'atajos': abrirAyuda('atajos'); break;
    }
  }

  /* =======================================================
     Herramientas de la izquierda
     ======================================================= */

  const herramientas = $('herramientas');

  herramientas.addEventListener('click', function (e) {
    const b = e.target.closest('.herramienta');
    if (!b) return;
    const h = b.dataset.herramienta;

    if (h === 'borrar') {
      if (TC.estado.seleccion) TC.canvas.eliminarCapa(TC.estado.seleccion);
      return;
    }
    if (h === 'ajustar') { TC.canvas.ajustarVista(); return; }

    if (h === 'recorte') {
      TC.panel.recortarFotoActiva();
      return;
    }
    if (TC.recorte.activo()) TC.recorte.cerrar();
    TC.estado.herramienta = h;
    TC.emitir('herramienta');
  });

  TC.on('herramienta', function () {
    herramientas.querySelectorAll('.herramienta').forEach(function (b) {
      b.classList.toggle('activa', b.dataset.herramienta === TC.estado.herramienta);
    });
    $('barra-pincel').classList.toggle('oculto', TC.estado.herramienta !== 'pincel');
    refrescarEstado();
  });

  /* =======================================================
     Barra del pincel
     ======================================================= */

  const contenedorPuntas = $('puntas');

  TC.PUNTAS.forEach(function (p) {
    const b = document.createElement('button');
    b.className = 'punta' + (p.id === TC.dibujo.opciones.punta ? ' activa' : '');
    b.dataset.punta = p.id;
    b.textContent = p.nombre;
    contenedorPuntas.appendChild(b);
  });

  contenedorPuntas.addEventListener('click', function (e) {
    const b = e.target.closest('.punta');
    if (!b) return;
    TC.dibujo.opciones.punta = b.dataset.punta;
    contenedorPuntas.querySelectorAll('.punta').forEach(function (x) {
      x.classList.toggle('activa', x === b);
    });
  });

  function tintaPincel (color) {
    TC.dibujo.opciones.color = color;
    $('muestras-pincel').querySelectorAll('.muestra').forEach(function (m) {
      m.classList.toggle('activa', m.dataset.tinta === color);
    });
  }

  $('muestras-pincel').addEventListener('click', function (e) {
    const b = e.target.closest('.muestra[data-tinta]');
    if (b) tintaPincel(b.dataset.tinta);
  });
  $('pincel-color-libre').addEventListener('input', function () { tintaPincel(this.value); });
  $('pincel-grosor').addEventListener('input', function () {
    TC.dibujo.opciones.grosor = parseFloat(this.value);
    $('pincel-grosor-valor').textContent = this.value;
  });
  $('pincel-deshacer').addEventListener('click', () => TC.dibujo.borrarUltimoTrazo());
  $('pincel-listo').addEventListener('click', function () {
    TC.estado.herramienta = 'mover';
    TC.emitir('herramienta');
  });

  /* =======================================================
     Deshacer / rehacer / descargar
     ======================================================= */

  $('btn-deshacer').addEventListener('click', () => TC.deshacer());
  $('btn-rehacer').addEventListener('click', () => TC.rehacer());
  $('btn-descargar').addEventListener('click', () => descargar('png'));

  function descargar (tipo) {
    if (TC.recorte.activo()) TC.recorte.cerrar();
    if (!TC.estado.capas.length &&
        !confirm('El collage está vacío. ¿Descargar igual?')) return;
    const antes = TC.estado.seleccion;
    TC.estado.seleccion = null;             // la selección no se exporta
    const nombre = TC.canvas.exportar(tipo);
    TC.estado.seleccion = antes;
    TC.canvas.render();
    mensajeEstado('Descargando ' + nombre);
  }

  TC.on('historial', function () {
    const puede = TC.puedeDeshacer();
    $('btn-deshacer').disabled = !puede;
    $('btn-rehacer').disabled = !TC.puedeRehacer();
    const etiqueta = TC.etiquetaDeshacer();
    $('btn-deshacer').title = puede
      ? 'Deshacer: ' + etiqueta + ' (Ctrl+Z)'
      : 'No hay nada para deshacer';
  });

  /* =======================================================
     Barra de estado
     ======================================================= */

  let mensajeTemporal = null;

  function mensajeEstado (texto) {
    mensajeTemporal = texto;
    refrescarEstado();
    setTimeout(function () { mensajeTemporal = null; refrescarEstado(); }, 2600);
  }

  function refrescarEstado () {
    const izq = $('estado-izquierda');
    if (mensajeTemporal) { izq.textContent = mensajeTemporal; return; }

    if (TC.recorte.activo()) {
      const info = TC.recorte.info();
      const poli = info.modo === 'puntos';
      $('recorte-zoom').textContent = Math.round(info.zoom * 100) + ' %';
      $('recorte-quitar-punto').classList.toggle('oculto', !poli || !info.puntos);
      $('recorte-cerrar-figura').classList.toggle('oculto', !poli || info.puntos < 3 || info.cerrado);

      if (poli) {
        izq.textContent = info.puntos === 0
          ? 'Un clic por vértice; volvé al primer punto para cerrar'
          : (info.cerrado ? 'Figura cerrada' : 'Figura abierta') + ' · ' + info.puntos +
            (info.puntos === 1 ? ' punto' : ' puntos');
      } else {
        izq.textContent = info.puntos
          ? (info.cerrado ? 'Trazo cerrado' : 'Trazo abierto') + ' · ' + info.puntos + ' puntos'
          : (info.sobreCapa ? 'Recortando la capa: dibujá lo que querés conservar'
                            : 'Dibujá el contorno · pellizcá o rueda para acercar');
      }
      return;
    }
    if (TC.estado.herramienta === 'pincel') {
      izq.textContent = 'Pincel: dibujá sobre el collage';
      return;
    }
    if (TC.estado.herramienta === 'texto') {
      izq.textContent = 'Tocá el lienzo donde va el texto';
      return;
    }
    const capas = TC.estado.capas.length;
    const capa = TC.capaActiva();
    izq.textContent = capas === 0
      ? 'Sin capas'
      : capas + (capas === 1 ? ' capa' : ' capas') + (capa ? ' · ' + capa.nombre : '');
  }

  function refrescarVista () {
    $('estado-zoom').textContent = Math.round(TC.vista.escala * 100) + ' %';
    const l = TC.estado.lienzo;
    $('chip-formato').textContent = 'Lienzo ' + l.ancho + ' × ' + l.alto;
    $('chip-formato').title = l.nombre + ' · clic para cambiar el formato';
  }

  $('zoom-mas').addEventListener('click', () => TC.canvas.zoom(1.15));
  $('zoom-menos').addEventListener('click', () => TC.canvas.zoom(1 / 1.15));
  $('zoom-ajustar').addEventListener('click', () => TC.canvas.ajustarVista());
  $('chip-formato').addEventListener('click', abrirFormatos);

  TC.on('cambio', refrescarEstado);
  TC.on('seleccion', refrescarEstado);
  TC.on('recorte', refrescarEstado);
  TC.on('estado-texto', refrescarEstado);
  TC.on('vista', refrescarVista);

  /* =======================================================
     Borde del recorte (barra flotante)
     ======================================================= */

  const muestrasBorde = $('muestras-borde');

  function fijarBordeRecorte (valor) {
    if (valor === 'ninguno') TC.recorte.borde.activo = false;
    else { TC.recorte.borde.activo = true; TC.recorte.borde.color = valor; }
    muestrasBorde.querySelectorAll('.muestra').forEach(function (m) {
      m.classList.toggle('activa', m.dataset.borde === valor);
    });
    TC.emitir('recorte');
  }

  muestrasBorde.addEventListener('click', function (e) {
    const b = e.target.closest('.muestra[data-borde]');
    if (b) fijarBordeRecorte(b.dataset.borde);
  });
  $('borde-color-libre').addEventListener('input', function () {
    fijarBordeRecorte(this.value);
  });
  const modosRecorte = $('modos-recorte');

  modosRecorte.addEventListener('click', function (e) {
    const b = e.target.closest('.punta[data-modo]');
    if (!b) return;
    TC.recorte.fijarModo(b.dataset.modo);
    modosRecorte.querySelectorAll('.punta').forEach(function (x) {
      x.classList.toggle('activa', x === b);
    });
  });

  $('recorte-quitar-punto').addEventListener('click', () => TC.recorte.quitarPunto());
  $('recorte-cerrar-figura').addEventListener('click', () => TC.recorte.cerrarFigura());

  $('recorte-mas').addEventListener('click', () => TC.recorte.zoom(1.25));
  $('recorte-menos').addEventListener('click', () => TC.recorte.zoom(1 / 1.25));
  $('recorte-ajustar').addEventListener('click', () => TC.recorte.ajustarVista());

  $('borde-grosor').addEventListener('input', function () {
    TC.recorte.borde.grosor = parseFloat(this.value);
    $('borde-grosor-valor').textContent = this.value;
    if (!TC.recorte.borde.activo) fijarBordeRecorte(TC.recorte.borde.color);
    TC.emitir('recorte');
  });

  /* =======================================================
     Arrastrar fotos a la ventana
     ======================================================= */

  const zona = $('lienzo-zona');
  let contadorArrastre = 0;

  ['dragenter', 'dragover'].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') < 0) return;
      e.preventDefault();
      if (evt === 'dragenter') contadorArrastre++;
      zona.classList.add('soltando');
    });
  });
  document.addEventListener('dragleave', function () {
    contadorArrastre = Math.max(0, contadorArrastre - 1);
    if (!contadorArrastre) zona.classList.remove('soltando');
  });
  document.addEventListener('drop', function (e) {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    contadorArrastre = 0;
    zona.classList.remove('soltando');
    TC.panel.agregarArchivos(e.dataTransfer.files).then(function (fotos) {
      if (fotos.length) mensajeEstado(fotos.length + ' foto(s) listas para recortar');
    });
  });

  /* =======================================================
     Modal de formatos
     ======================================================= */

  const modalFormato = $('modal-formato');
  const listaFormatos = $('lista-formatos');
  let primeraVez = true;

  function tarjetaFormato (f) {
    const b = document.createElement('button');
    b.className = 'tarjeta-formato';
    const actual = TC.estado.lienzo;
    if (actual.ancho === f.ancho && actual.alto === f.alto) b.classList.add('activa');

    const marco = document.createElement('div');
    marco.className = 'previa-marco';
    const mini = document.createElement('div');
    mini.className = 'mini-lienzo';
    const k = 46 / Math.max(f.ancho, f.alto);
    mini.style.width = Math.max(6, Math.round(f.ancho * k)) + 'px';
    mini.style.height = Math.max(6, Math.round(f.alto * k)) + 'px';
    marco.appendChild(mini);

    const nombre = document.createElement('span');
    nombre.className = 'tarjeta-nombre';
    nombre.textContent = f.nombre;

    const px = document.createElement('span');
    px.className = 'tarjeta-px';
    px.textContent = f.ancho + ' × ' + f.alto + ' px';

    b.appendChild(marco);
    b.appendChild(nombre);
    b.appendChild(px);
    b.addEventListener('click', function () {
      TC.canvas.cambiarFormato(f.ancho, f.alto, f.nombre);
      cerrarFormatos();
      mensajeEstado('Lienzo ' + f.ancho + ' × ' + f.alto + ' · ' + f.nombre);
    });
    return b;
  }

  function construirFormatos () {
    listaFormatos.innerHTML = '';
    TC.FORMATOS.forEach(function (grupo) {
      const cont = document.createElement('div');
      cont.className = 'grupo-formato';
      const t = document.createElement('h3');
      t.className = 'grupo-titulo';
      t.textContent = grupo.grupo;
      const rej = document.createElement('div');
      rej.className = 'rejilla-formatos';
      grupo.items.forEach(f => rej.appendChild(tarjetaFormato(f)));
      cont.appendChild(t);
      cont.appendChild(rej);
      listaFormatos.appendChild(cont);
    });
  }

  function abrirFormatos () {
    construirFormatos();
    $('fmt-ancho').value = TC.estado.lienzo.ancho;
    $('fmt-alto').value = TC.estado.lienzo.alto;
    $('modal-formato-titulo').textContent = primeraVez
      ? 'Elegí el formato del collage' : 'Cambiar el formato del lienzo';
    $('fmt-aviso').textContent = TC.estado.capas.length
      ? 'Las capas se reubican y reescalan solas al cambiar el tamaño.'
      : 'Podés cambiar el formato en cualquier momento desde acá abajo.';
    $('cerrar-formato').classList.toggle('oculto', false);
    modalFormato.classList.remove('oculto');
  }

  function cerrarFormatos () {
    primeraVez = false;
    modalFormato.classList.add('oculto');
  }

  $('cerrar-formato').addEventListener('click', cerrarFormatos);
  modalFormato.addEventListener('click', function (e) {
    if (e.target === modalFormato) cerrarFormatos();
  });

  $('fmt-usar').addEventListener('click', function () {
    const a = TC.util.limitar(parseInt($('fmt-ancho').value, 10) || 1080, 64, 8000);
    const b = TC.util.limitar(parseInt($('fmt-alto').value, 10) || 1080, 64, 8000);
    const conocido = TC.buscarFormato(a, b);
    TC.canvas.cambiarFormato(a, b, conocido ? conocido.nombre : 'Personalizado');
    cerrarFormatos();
    mensajeEstado('Lienzo ' + a + ' × ' + b + ' px');
  });

  /* =======================================================
     Modal de ayuda
     ======================================================= */

  const modalAyuda = $('modal-ayuda');

  const TEXTO_USO = `
    <ol class="ayuda-lista">
      <li><b>Elegí el formato.</b> Publicación de Instagram, fondo de pantalla 4K, A4… el lienzo toma el tamaño exacto en píxeles.</li>
      <li><b>Subí fotos</b> con el botón del panel o arrastrándolas a la ventana. No hay límite de fotos ni de capas.</li>
      <li><b>Mandá una foto a la mesa de recorte</b> (abajo del panel) y tocá <b>Recortar esta foto</b>.</li>
      <li><b>Dibujá el contorno</b> con el mouse o el dedo y volvé al punto de inicio: el trazo se cierra solo y se recorta esa silueta.</li>
      <li><b>¿Preferís precisión?</b> Cambiá a <b>Por puntos</b>: cada clic pone un vértice y los une con líneas rectas. Volvé al primero (o <b>Enter</b>) para cerrar; <b>Retroceso</b> quita el último punto.</li>
      <li><b>Antes de confirmar</b> podés elegir si el recorte lleva <b>borde de color</b> o queda tal cual lo cortaste.</li>
      <li><b>Acomodá la capa</b>: arrastrala, usá los mangos para escalar y el círculo de arriba para rotar. El recorte guarda su resolución original, así que se mantiene nítido.</li>
      <li><b>Dibujá encima</b> con el pincel (<b>B</b>): pincel, marcador, lápiz o neón, con color y grosor a elección. Cada sesión de dibujo entra como una capa más.</li>
      <li><b>Sumá textos</b> con la herramienta <b>T</b>: elegís fuente, tamaño, color, negrita, cursiva y alineación. Doble clic sobre un texto para editarlo.</li>
      <li><b>¿Te equivocaste?</b> Las flechas de arriba deshacen <b>solo el último movimiento</b>, paso a paso.</li>
      <li><b>Descargá</b> el collage en PNG cuando esté listo.</li>
    </ol>
    <p class="modal-aviso">Todo pasa dentro del navegador: nada se sube a ningún servidor y nada queda guardado al cerrar la pestaña.</p>
  `;

  const TEXTO_ATAJOS = `
    <table class="tabla-atajos">
      <tr><td><kbd>V</kbd></td><td>Mover y transformar</td></tr>
      <tr><td><kbd>R</kbd></td><td>Recortar la foto de la mesa</td></tr>
      <tr><td><kbd>B</kbd></td><td>Pincel</td></tr>
      <tr><td><kbd>T</kbd></td><td>Texto</td></tr>
      <tr><td><kbd>E</kbd></td><td>Rotar arrastrando</td></tr>
      <tr><td><kbd>Ctrl</kbd> + <kbd>Z</kbd></td><td>Deshacer el último movimiento</td></tr>
      <tr><td><kbd>Ctrl</kbd> + <kbd>Y</kbd></td><td>Rehacer</td></tr>
      <tr><td><kbd>Ctrl</kbd> + <kbd>D</kbd></td><td>Duplicar la capa</td></tr>
      <tr><td><kbd>Supr</kbd></td><td>Eliminar la capa</td></tr>
      <tr><td><kbd>[</kbd> / <kbd>]</kbd></td><td>Enviar al fondo / traer al frente</td></tr>
      <tr><td><kbd>Flechas</kbd></td><td>Mover la capa (con <kbd>Shift</kbd>, de a 10 px)</td></tr>
      <tr><td><kbd>Shift</kbd> al escalar</td><td>Invierte el bloqueo de proporción</td></tr>
      <tr><td><kbd>Shift</kbd> al rotar</td><td>Ángulos de 15°</td></tr>
      <tr><td><kbd>Ctrl</kbd> + rueda</td><td>Zoom</td></tr>
      <tr><td><kbd>0</kbd></td><td>Ajustar la vista</td></tr>
      <tr><td><kbd>F</kbd></td><td>Formato del lienzo</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Cancelar el recorte o soltar la selección</td></tr>
      <tr><td><kbd>Ctrl</kbd> + <kbd>S</kbd></td><td>Descargar PNG</td></tr>
    </table>
  `;

  function abrirAyuda (cual) {
    $('ayuda-titulo').textContent = cual === 'atajos' ? 'Atajos de teclado' : 'Cómo usar UCBAM';
    $('ayuda-cuerpo').innerHTML = cual === 'atajos' ? TEXTO_ATAJOS : TEXTO_USO;
    modalAyuda.classList.remove('oculto');
  }
  $('cerrar-ayuda').addEventListener('click', () => modalAyuda.classList.add('oculto'));
  modalAyuda.addEventListener('click', function (e) {
    if (e.target === modalAyuda) modalAyuda.classList.add('oculto');
  });

  /* =======================================================
     Nuevo collage
     ======================================================= */

  function nuevoCollage () {
    if (TC.estado.capas.length && !confirm('Se van a borrar todas las capas del collage. ¿Seguir?')) return;
    if (TC.recorte.activo()) TC.recorte.cerrar();
    TC.estado.capas = [];
    TC.estado.seleccion = null;
    TC.estado.fondo = { tipo: 'color', color: '#1d2b3a', imagen: null };
    TC.reiniciarHistorial();
    TC.panel.refrescar();
    TC.actualizar();
    abrirFormatos();
  }

  /* =======================================================
     Atajos de teclado
     ======================================================= */

  /* agrupa los empujones con flechas en un solo paso de historial */
  const nudge = { temporizador: null };

  document.addEventListener('keydown', function (e) {
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;

    const ctrl = e.ctrlKey || e.metaKey;
    const capa = TC.capaActiva();

    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? TC.rehacer() : TC.deshacer();
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); TC.rehacer(); return; }
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); descargar('png'); return; }
    if (ctrl && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (capa) TC.canvas.duplicarCapa(capa.id);
      return;
    }
    if (ctrl) return;

    /* durante el recorte por puntos el teclado maneja la figura */
    if (TC.recorte.activo() && TC.recorte.modo === 'puntos') {
      if (e.key === 'Enter') { e.preventDefault(); TC.recorte.cerrarFigura(); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault(); TC.recorte.quitarPunto(); return;
      }
    }

    switch (e.key) {
      case 'Escape':
        if (TC.recorte.activo()) TC.recorte.cerrar();
        else if (TC.estado.herramienta !== 'mover') {
          TC.estado.herramienta = 'mover'; TC.emitir('herramienta');
        }
        else if (!modalFormato.classList.contains('oculto')) cerrarFormatos();
        else if (!modalAyuda.classList.contains('oculto')) modalAyuda.classList.add('oculto');
        else if (TC.estado.seleccion) { TC.estado.seleccion = null; TC.emitir('seleccion'); TC.canvas.render(); }
        return;
      case 'Delete': case 'Backspace':
        if (capa) { e.preventDefault(); TC.canvas.eliminarCapa(capa.id); }
        return;
      case 'v': case 'V':
        if (TC.recorte.activo()) TC.recorte.cerrar();
        TC.estado.herramienta = 'mover'; TC.emitir('herramienta'); return;
      case 'e': case 'E':
        if (TC.recorte.activo()) TC.recorte.cerrar();
        TC.estado.herramienta = 'rotar'; TC.emitir('herramienta'); return;
      case 'r': case 'R':
        TC.panel.recortarFotoActiva(); return;
      case 'b': case 'B':
        if (TC.recorte.activo()) TC.recorte.cerrar();
        TC.estado.herramienta = 'pincel'; TC.emitir('herramienta'); return;
      case 't': case 'T':
        if (TC.recorte.activo()) TC.recorte.cerrar();
        TC.estado.herramienta = 'texto'; TC.emitir('herramienta'); return;
      case 'f': case 'F':
        abrirFormatos(); return;
      case '0':
        TC.canvas.ajustarVista(); return;
      case '+': case '=':
        TC.canvas.zoom(1.15); return;
      case '-': case '_':
        TC.canvas.zoom(1 / 1.15); return;
      case '[':
        if (capa) TC.canvas.moverEnZ(capa.id, 'fondo'); return;
      case ']':
        if (capa) TC.canvas.moverEnZ(capa.id, 'frente'); return;
    }

    if (capa && /^Arrow/.test(e.key)) {
      e.preventDefault();
      const paso = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') capa.x -= paso;
      if (e.key === 'ArrowRight') capa.x += paso;
      if (e.key === 'ArrowUp') capa.y -= paso;
      if (e.key === 'ArrowDown') capa.y += paso;
      TC.canvas.render();
      clearTimeout(nudge.temporizador);
      nudge.temporizador = setTimeout(() => TC.registrar('mover capa'), 420);
    }
  });

  /* =======================================================
     Arranque
     ======================================================= */

  TC.on('historial', refrescarMenus);
  TC.on('seleccion', refrescarMenus);

  TC.panel.refrescar();
  TC.canvas.ajustarVista();
  TC.reiniciarHistorial();
  refrescarEstado();
  refrescarVista();
  abrirFormatos();

})(window.TC);
