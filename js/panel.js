/* ===========================================================
   UCBAM · panel.js
   Panel lateral: subir fotos, tira de fotos, lista de capas,
   propiedades de la capa seleccionada, fondo y mesa de recorte.
   =========================================================== */

(function (TC) {
  'use strict';

  const $ = id => document.getElementById(id);

  const entradaFotos = $('entrada-fotos');
  const entradaCamara = $('entrada-camara');
  const entradaFondo = $('entrada-fondo');
  const tira = $('tira-fotos');
  const listaCapas = $('lista-capas');
  const bloqueCapa = $('bloque-capa');
  const mesa = $('mesa');

  TC.panel = TC.panel || {};

  /* =======================================================
     Subir fotos
     ======================================================= */

  TC.panel.abrirSelector = function () { entradaFotos.click(); };

  TC.panel.agregarArchivos = function (archivos) {
    const lista = Array.prototype.slice.call(archivos)
      .filter(f => /^image\//.test(f.type));
    if (!lista.length) return Promise.resolve([]);

    return Promise.all(lista.map(function (f) {
      /* el nombre del archivo no se registra en consola: es dato del usuario */
      return TC.cargarArchivo(f).catch(function (err) {
        console.warn('UCBAM: no se pudo abrir una de las imágenes (' + err.message + ')');
        return null;
      });
    })).then(function (fotos) {
      const buenas = fotos.filter(Boolean);
      TC.estado.fotos = TC.estado.fotos.concat(buenas);
      if (buenas.length) TC.estado.fotoActiva = buenas[0].id;
      refrescarFotos();
      refrescarMesa();
      TC.emitir('estado-texto');
      return buenas;
    });
  };

  $('btn-subir').addEventListener('click', TC.panel.abrirSelector);
  $('btn-vacio-subir').addEventListener('click', TC.panel.abrirSelector);
  $('btn-camara').addEventListener('click', () => entradaCamara.click());

  entradaFotos.addEventListener('change', function () {
    TC.panel.agregarArchivos(this.files);
    this.value = '';
  });
  entradaCamara.addEventListener('change', function () {
    TC.panel.agregarArchivos(this.files);
    this.value = '';
  });

  /* =======================================================
     Tira de fotos
     ======================================================= */

  function refrescarFotos () {
    const fotos = TC.estado.fotos;
    $('contador-fotos').textContent = fotos.length;
    tira.innerHTML = '';

    if (!fotos.length) {
      tira.innerHTML = '<p class="bloque-vacio">Todavía no subiste fotos.</p>';
      return;
    }

    fotos.forEach(function (foto) {
      const chip = document.createElement('button');
      chip.className = 'foto-chip' + (TC.estado.fotoActiva === foto.id ? ' activa' : '');
      chip.title = foto.nombre + ' · ' + foto.ancho + ' × ' + foto.alto + ' px\nClic para llevarla a la mesa de recorte';

      const img = document.createElement('img');
      img.src = foto.miniatura;
      img.alt = foto.nombre;
      chip.appendChild(img);

      const quitar = document.createElement('button');
      quitar.className = 'quitar';
      quitar.textContent = '×';
      quitar.title = 'Quitar esta foto';
      quitar.addEventListener('click', function (e) {
        e.stopPropagation();
        TC.estado.fotos = TC.estado.fotos.filter(f => f.id !== foto.id);
        if (TC.estado.fotoActiva === foto.id) {
          TC.estado.fotoActiva = TC.estado.fotos.length ? TC.estado.fotos[0].id : null;
          if (TC.recorte.activo()) TC.recorte.cerrar();
        }
        refrescarFotos();
        refrescarMesa();
      });
      chip.appendChild(quitar);

      chip.addEventListener('click', function () {
        TC.estado.fotoActiva = foto.id;
        refrescarFotos();
        refrescarMesa();
      });
      chip.addEventListener('dblclick', function () {
        TC.estado.fotoActiva = foto.id;
        TC.panel.recortarFotoActiva();
      });

      tira.appendChild(chip);
    });
  }

  /* =======================================================
     Mesa de recorte (el bloque que antes era el banner)
     ======================================================= */

  TC.panel.recortarFotoActiva = function () {
    const foto = TC.fotoPorId(TC.estado.fotoActiva);
    if (!foto) { TC.panel.abrirSelector(); return; }
    TC.estado.herramienta = 'recorte';
    TC.emitir('herramienta');
    TC.recorte.abrir(foto);
  };

  function refrescarMesa () {
    const foto = TC.fotoPorId(TC.estado.fotoActiva);
    mesa.innerHTML = '';

    if (!foto) {
      mesa.innerHTML = '<p class="bloque-vacio">Subí una foto y elegila arriba para recortarla a mano alzada.</p>';
      return;
    }

    const img = document.createElement('img');
    img.className = 'mesa-previa';
    img.src = foto.miniatura;
    img.alt = foto.nombre;

    const nombre = document.createElement('p');
    nombre.className = 'mesa-nombre';
    nombre.textContent = foto.nombre + ' · ' + foto.ancho + ' × ' + foto.alto + ' px';

    const boton = document.createElement('button');
    boton.className = 'boton primario';
    boton.textContent = TC.recorte.activo() ? 'Recortando…' : 'Recortar esta foto';
    boton.disabled = TC.recorte.activo();
    boton.addEventListener('click', TC.panel.recortarFotoActiva);

    mesa.appendChild(img);
    mesa.appendChild(nombre);
    mesa.appendChild(boton);
  }

  /* =======================================================
     Lista de capas
     ======================================================= */

  function icono (d) {
    return '<svg viewBox="0 0 24 24" class="ico">' + d + '</svg>';
  }
  const OJO_ABIERTO = icono('<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.6"/>');
  const OJO_CERRADO = icono('<path d="M4 5l16 14"/><path d="M2 12s3.6-6 10-6c1.6 0 3 .4 4.2 1M22 12s-3.6 6-10 6c-1.7 0-3.2-.4-4.4-1"/>');
  const FLECHA_ARRIBA = icono('<path d="M12 19V6m0 0-5 5m5-5 5 5"/>');
  const FLECHA_ABAJO = icono('<path d="M12 5v13m0 0 5-5m-5 5-5-5"/>');
  const CRUZ = icono('<path d="M6 6l12 12M18 6 6 18"/>');

  function refrescarCapas () {
    const capas = TC.estado.capas;
    $('contador-capas').textContent = capas.length;
    listaCapas.innerHTML = '';

    /* de arriba hacia abajo, como se ven en el lienzo */
    for (let i = capas.length - 1; i >= 0; i--) {
      listaCapas.appendChild(filaCapa(capas[i]));
    }
    listaCapas.appendChild(filaFondo());
  }

  function filaCapa (capa) {
    const fila = document.createElement('div');
    fila.className = 'capa-fila' + (TC.estado.seleccion === capa.id ? ' activa' : '');
    fila.dataset.id = capa.id;

    const mango = document.createElement('span');
    mango.className = 'capa-mango';
    mango.textContent = '≡';
    mango.title = 'Arrastrá para reordenar';
    mango.addEventListener('pointerdown', e => iniciarArrastre(e, fila));

    const mini = document.createElement('span');
    mini.className = 'capa-mini tablero';
    if (capa.miniatura) mini.style.backgroundImage = 'url(' + capa.miniatura + ')';

    const nombre = document.createElement('span');
    nombre.className = 'capa-nombre';
    nombre.textContent = capa.nombre;
    nombre.title = 'Doble clic para renombrar';
    nombre.addEventListener('dblclick', function () {
      nombre.contentEditable = 'true';
      nombre.focus();
      document.execCommand && document.execCommand('selectAll', false, null);
    });
    nombre.addEventListener('blur', function () {
      if (nombre.contentEditable !== 'true') return;
      nombre.contentEditable = 'false';
      const texto = nombre.textContent.trim().slice(0, 40) || capa.nombre;
      if (texto !== capa.nombre) { capa.nombre = texto; TC.registrar('renombrar capa'); }
      nombre.textContent = capa.nombre;
    });
    nombre.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); nombre.blur(); }
      if (e.key === 'Escape') { nombre.textContent = capa.nombre; nombre.blur(); }
      e.stopPropagation();
    });

    const tipo = document.createElement('span');
    tipo.className = 'capa-tipo';
    tipo.textContent = capa.tipo || 'recorte';

    const botones = document.createElement('span');
    botones.className = 'capa-botones';
    botones.appendChild(botonIcono(FLECHA_ARRIBA, 'Subir una posición', function (e) {
      e.stopPropagation(); TC.canvas.moverEnZ(capa.id, 'subir');
    }));
    botones.appendChild(botonIcono(FLECHA_ABAJO, 'Bajar una posición', function (e) {
      e.stopPropagation(); TC.canvas.moverEnZ(capa.id, 'bajar');
    }));
    botones.appendChild(botonIcono(CRUZ, 'Eliminar capa', function (e) {
      e.stopPropagation(); TC.canvas.eliminarCapa(capa.id);
    }));

    const ojo = botonIcono(capa.visible ? OJO_ABIERTO : OJO_CERRADO,
      capa.visible ? 'Ocultar capa' : 'Mostrar capa', function (e) {
        e.stopPropagation();
        capa.visible = !capa.visible;
        TC.registrar(capa.visible ? 'mostrar capa' : 'ocultar capa');
        TC.actualizar();
      });
    if (!capa.visible) ojo.classList.add('apagado');

    fila.appendChild(mango);
    fila.appendChild(mini);
    fila.appendChild(nombre);
    fila.appendChild(tipo);
    fila.appendChild(botones);
    fila.appendChild(ojo);

    fila.addEventListener('click', function () {
      TC.estado.seleccion = capa.id;
      TC.emitir('seleccion');
      TC.canvas.render();
      refrescarCapas();
      refrescarCapaSeleccionada();
    });

    return fila;
  }

  function filaFondo () {
    const fila = document.createElement('div');
    fila.className = 'capa-fila capa-fondo';

    const mango = document.createElement('span');
    mango.className = 'capa-mango';
    mango.textContent = '≡';

    const mini = document.createElement('span');
    mini.className = 'capa-mini';
    const f = TC.estado.fondo;
    if (f.tipo === 'imagen' && f.imagenMini) {
      mini.style.backgroundImage = 'url(' + f.imagenMini + ')';
    } else if (f.tipo === 'transparente') {
      mini.classList.add('tablero');
    } else {
      mini.style.background = f.color;
    }

    const nombre = document.createElement('span');
    nombre.className = 'capa-nombre';
    nombre.textContent = 'Fondo';

    const tipo = document.createElement('span');
    tipo.className = 'capa-tipo';
    tipo.textContent = f.tipo === 'imagen' ? 'imagen' : f.tipo === 'transparente' ? 'sin fondo' : 'color';

    fila.appendChild(mango);
    fila.appendChild(mini);
    fila.appendChild(nombre);
    fila.appendChild(tipo);
    return fila;
  }

  function botonIcono (svg, titulo, fn) {
    const b = document.createElement('button');
    b.className = 'capa-icono';
    b.innerHTML = svg;
    b.title = titulo;
    b.addEventListener('click', fn);
    return b;
  }

  /* ----------------- reordenar arrastrando ----------------- */

  let arrastre = null;

  function iniciarArrastre (e, fila) {
    e.preventDefault();
    e.stopPropagation();
    arrastre = { fila: fila, movio: false };
    fila.classList.add('arrastrando');
    fila.setPointerCapture && fila.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', moverArrastre);
    window.addEventListener('pointerup', soltarArrastre, { once: true });
  }

  function moverArrastre (e) {
    if (!arrastre) return;
    const filas = Array.from(listaCapas.querySelectorAll('.capa-fila:not(.capa-fondo)'));
    for (const otra of filas) {
      if (otra === arrastre.fila) continue;
      const r = otra.getBoundingClientRect();
      if (e.clientY > r.top && e.clientY < r.bottom) {
        const medio = r.top + r.height / 2;
        listaCapas.insertBefore(arrastre.fila, e.clientY < medio ? otra : otra.nextSibling);
        arrastre.movio = true;
        break;
      }
    }
  }

  function soltarArrastre () {
    window.removeEventListener('pointermove', moverArrastre);
    if (!arrastre) return;
    arrastre.fila.classList.remove('arrastrando');
    if (arrastre.movio) {
      const ids = Array.from(listaCapas.querySelectorAll('.capa-fila:not(.capa-fondo)'))
        .map(f => f.dataset.id).reverse();          // la lista se muestra al revés
      const nuevas = ids.map(id => TC.capaPorId(id)).filter(Boolean);
      if (nuevas.length === TC.estado.capas.length) {
        TC.estado.capas = nuevas;
        TC.registrar('reordenar capas');
        TC.actualizar();
      }
    }
    arrastre = null;
  }

  /* =======================================================
     Propiedades de la capa seleccionada
     ======================================================= */

  const capaAncho = $('capa-ancho');
  const capaAlto = $('capa-alto');
  const capaCadena = $('capa-cadena');
  const capaEscala = $('capa-escala');
  const capaRot = $('capa-rot');
  let proporcional = true;

  function refrescarCapaSeleccionada () {
    const capa = TC.capaActiva();
    bloqueCapa.classList.toggle('oculto', !capa);
    if (!capa) return;

    capaAncho.value = Math.round(capa.ancho);
    capaAlto.value = Math.round(capa.alto);

    const pct = Math.round((capa.ancho / capa.anchoNatural) * 100);
    capaEscala.value = TC.util.limitar(pct, 5, 300);
    $('capa-escala-valor').textContent = pct + ' %';

    const grados = Math.round(capa.rot * 180 / Math.PI);
    capaRot.value = TC.util.limitar(((grados + 180) % 360 + 360) % 360 - 180, -180, 180);
    $('capa-rot-valor').textContent = grados + '°';

    /* aviso de calidad: cuánto de la resolución original se está usando */
    const uso = Math.round((capa.ancho / capa.anchoFuente) * 100);
    const caja = $('capa-calidad');
    if (uso > 100) {
      caja.className = 'calidad aviso';
      caja.textContent = 'Original ' + capa.anchoFuente + ' × ' + capa.altoFuente +
        ' px. La estás ampliando al ' + uso + ' %: puede verse blanda. Achicala un poco para conservar el detalle.';
    } else {
      caja.className = 'calidad';
      caja.textContent = 'Original ' + capa.anchoFuente + ' × ' + capa.altoFuente +
        ' px · usando el ' + uso + ' %. El recorte guarda su resolución completa, así que podés escalarlo sin perder calidad.';
    }

    $('capa-borde-grosor').value = capa.borde.grosor;
    $('capa-borde-grosor-valor').textContent = Math.round(capa.borde.grosor);
    marcarMuestras($('muestras-borde-capa'),
      capa.borde.activo ? capa.borde.color : 'ninguno');
  }

  function aplicarTamano (ancho, alto, quien) {
    const capa = TC.capaActiva();
    if (!capa) return;
    const razon = capa.anchoNatural / capa.altoNatural;
    if (proporcional) {
      if (quien === 'ancho') alto = ancho / razon;
      else ancho = alto * razon;
    }
    capa.ancho = Math.max(24, ancho);
    capa.alto = Math.max(24, alto);
    delete capa._path;
    TC.canvas.render();
    refrescarCapaSeleccionada();
  }

  capaAncho.addEventListener('input', function () {
    aplicarTamano(parseFloat(this.value) || 24, TC.capaActiva() ? TC.capaActiva().alto : 24, 'ancho');
  });
  capaAlto.addEventListener('input', function () {
    aplicarTamano(TC.capaActiva() ? TC.capaActiva().ancho : 24, parseFloat(this.value) || 24, 'alto');
  });
  capaAncho.addEventListener('change', () => TC.registrar('cambiar tamaño'));
  capaAlto.addEventListener('change', () => TC.registrar('cambiar tamaño'));

  capaCadena.addEventListener('click', function () {
    proporcional = !proporcional;
    capaCadena.classList.toggle('activa', proporcional);
    capaCadena.title = proporcional ? 'Mantener la proporción' : 'Ancho y alto libres';
  });

  capaEscala.addEventListener('input', function () {
    const capa = TC.capaActiva();
    if (!capa) return;
    const k = parseFloat(this.value) / 100;
    capa.ancho = Math.max(24, capa.anchoNatural * k);
    capa.alto = Math.max(24, capa.altoNatural * k);
    delete capa._path;
    TC.canvas.render();
    refrescarCapaSeleccionada();
  });
  capaEscala.addEventListener('change', () => TC.registrar('escalar capa'));

  capaRot.addEventListener('input', function () {
    const capa = TC.capaActiva();
    if (!capa) return;
    capa.rot = parseFloat(this.value) * Math.PI / 180;
    TC.canvas.render();
    $('capa-rot-valor').textContent = Math.round(parseFloat(this.value)) + '°';
  });
  capaRot.addEventListener('change', () => TC.registrar('rotar capa'));

  $('capa-duplicar').addEventListener('click', () => TC.canvas.duplicarCapa(TC.estado.seleccion));
  $('capa-frente').addEventListener('click', () => TC.canvas.moverEnZ(TC.estado.seleccion, 'frente'));
  $('capa-atras').addEventListener('click', () => TC.canvas.moverEnZ(TC.estado.seleccion, 'fondo'));
  $('capa-eliminar').addEventListener('click', () => TC.canvas.eliminarCapa(TC.estado.seleccion));

  /* ----------------- borde de la capa ----------------- */

  function marcarMuestras (contenedor, valor) {
    contenedor.querySelectorAll('.muestra').forEach(function (m) {
      m.classList.toggle('activa', m.dataset.borde === valor || m.dataset.fondo === valor);
    });
  }

  function bordeDeCapa (valor) {
    const capa = TC.capaActiva();
    if (!capa) return;
    if (valor === 'ninguno') capa.borde.activo = false;
    else { capa.borde.activo = true; capa.borde.color = valor; }
    TC.registrar('cambiar borde');
    capa.miniatura = miniaturaDeCapa(capa);
    TC.actualizar();
  }

  $('muestras-borde-capa').addEventListener('click', function (e) {
    const b = e.target.closest('.muestra[data-borde]');
    if (b) bordeDeCapa(b.dataset.borde);
  });
  $('capa-borde-libre').addEventListener('input', function () {
    bordeDeCapa(this.value);
  });
  $('capa-borde-grosor').addEventListener('input', function () {
    const capa = TC.capaActiva();
    if (!capa) return;
    capa.borde.grosor = parseFloat(this.value);
    if (!capa.borde.activo) { capa.borde.activo = true; }
    $('capa-borde-grosor-valor').textContent = this.value;
    TC.canvas.render();
  });
  $('capa-borde-grosor').addEventListener('change', function () {
    const capa = TC.capaActiva();
    if (!capa) return;
    capa.miniatura = miniaturaDeCapa(capa);
    TC.registrar('grosor del borde');
    TC.actualizar();
  });

  /** Miniatura que incluye el borde elegido. */
  function miniaturaDeCapa (capa) {
    if (!capa.borde.activo) return TC.util.miniatura(capa.fuente, 64);
    const lado = 64;
    const k = Math.min(lado / capa.anchoFuente, lado / capa.altoFuente);
    const w = Math.max(1, Math.round(capa.anchoFuente * k));
    const h = Math.max(1, Math.round(capa.altoFuente * k));
    const c = document.createElement('canvas');
    c.width = lado; c.height = lado;
    const g = c.getContext('2d');
    g.drawImage(TC.util.reducir(capa.fuente, w, h), (lado - w) / 2, (lado - h) / 2);
    if (capa.contorno) {
      const p = new Path2D();
      TC.util.trazarSuave(p, capa.contorno.map(pt => [
        pt[0] * (w / capa.anchoFuente) + (lado - w) / 2,
        pt[1] * (h / capa.altoFuente) + (lado - h) / 2
      ]), true);
      g.lineWidth = Math.max(1, capa.borde.grosor * (w / capa.ancho) * (capa.ancho / capa.anchoFuente) * 2);
      g.lineJoin = g.lineCap = 'round';
      g.strokeStyle = capa.borde.color;
      g.stroke(p);
    }
    return c.toDataURL('image/png');
  }

  /* =======================================================
     Fondo
     ======================================================= */

  function aplicarFondo (valor) {
    const f = TC.estado.fondo;
    if (valor === 'transparente') { f.tipo = 'transparente'; }
    else { f.tipo = 'color'; f.color = valor; }
    marcarMuestras($('muestras-fondo'), valor);
    $('btn-fondo-quitar').classList.add('oculto');
    TC.registrar('cambiar fondo');
    TC.actualizar();
  }

  $('muestras-fondo').addEventListener('click', function (e) {
    const b = e.target.closest('.muestra[data-fondo]');
    if (b) aplicarFondo(b.dataset.fondo);
  });
  $('fondo-color-libre').addEventListener('input', function () {
    aplicarFondo(this.value);
  });

  $('btn-fondo-imagen').addEventListener('click', () => entradaFondo.click());
  entradaFondo.addEventListener('change', function () {
    const archivo = this.files && this.files[0];
    this.value = '';
    if (!archivo) return;
    TC.cargarArchivo(archivo).then(function (foto) {
      const f = TC.estado.fondo;
      f.tipo = 'imagen';
      f.imagen = foto.img;
      f.imagenMini = foto.miniatura;
      $('btn-fondo-quitar').classList.remove('oculto');
      marcarMuestras($('muestras-fondo'), '');
      TC.registrar('fondo con imagen');
      TC.actualizar();
    }).catch(err => alert('No se pudo usar esa imagen de fondo: ' + err.message));
  });

  $('btn-fondo-quitar').addEventListener('click', function () {
    const f = TC.estado.fondo;
    f.tipo = 'color';
    f.imagen = null;
    f.imagenMini = null;
    $('btn-fondo-quitar').classList.add('oculto');
    marcarMuestras($('muestras-fondo'), f.color);
    TC.registrar('quitar fondo');
    TC.actualizar();
  });

  /* =======================================================
     Refresco general
     ======================================================= */

  TC.panel.refrescar = function () {
    refrescarFotos();
    refrescarCapas();
    refrescarCapaSeleccionada();
    refrescarMesa();
    const f = TC.estado.fondo;
    marcarMuestras($('muestras-fondo'), f.tipo === 'transparente' ? 'transparente'
      : f.tipo === 'color' ? f.color : '');
    $('btn-fondo-quitar').classList.toggle('oculto', f.tipo !== 'imagen');
  };

  TC.on('cambio', function () {
    refrescarCapas();
    refrescarCapaSeleccionada();
  });
  TC.on('seleccion', function () {
    refrescarCapas();
    refrescarCapaSeleccionada();
  });
  TC.on('capa-en-vivo', function () {
    const capa = TC.capaActiva();
    if (!capa) return;
    capaAncho.value = Math.round(capa.ancho);
    capaAlto.value = Math.round(capa.alto);
    const pct = Math.round((capa.ancho / capa.anchoNatural) * 100);
    $('capa-escala-valor').textContent = pct + ' %';
    capaEscala.value = TC.util.limitar(pct, 5, 300);
    const grados = Math.round(capa.rot * 180 / Math.PI);
    $('capa-rot-valor').textContent = grados + '°';
  });
  TC.on('recorte', refrescarMesa);

})(window.TC);
