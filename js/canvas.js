/* ===========================================================
   UCBAM · canvas.js
   Lienzo principal del collage: dibujo de capas, selección,
   mover / redimensionar / rotar, zoom y exportación.
   =========================================================== */

(function (TC) {
  'use strict';

  const lienzo = document.getElementById('lienzo');
  const ctx = lienzo.getContext('2d');
  const envoltura = document.getElementById('lienzo-envoltura');
  const zona = document.getElementById('lienzo-zona');

  /* Vista: escala = píxeles CSS por píxel del lienzo */
  TC.vista = { escala: 1, ajustar: true, dpr: Math.min(window.devicePixelRatio || 1, 2) };

  const MAX_BACKING = 2800;   // lado máximo del canvas real, para no gastar memoria de más
  const MIN_LADO = 24;        // tamaño mínimo de una capa, en px de lienzo

  /* Mangos de redimensión en espacio unitario (-1, 0, 1) */
  const MANGOS = [
    { ux: -1, uy: -1 }, { ux: 0, uy: -1 }, { ux: 1, uy: -1 },
    { ux: -1, uy:  0 },                     { ux: 1, uy:  0 },
    { ux: -1, uy:  1 }, { ux: 0, uy:  1 }, { ux: 1, uy:  1 }
  ];

  let interaccion = null;   // gesto en curso sobre una capa
  let rapido = false;       // durante un gesto se dibuja en modo rápido
  const punteros = new Map();
  let pinza = null;         // zoom de dos dedos
  let arrastreVista = null; // paneo con un dedo sobre el fondo

  /* =======================================================
     Escalado de las fuentes (calidad)
     ======================================================= */

  /**
   * Devuelve el canvas a usar para dibujar la capa a un ancho dado
   * en píxeles reales. Si hay que reducir mucho, genera una versión
   * reducida por pasos (mejor calidad y más rápido de dibujar).
   */
  function fuenteEscalada (capa, anchoDestPx, guardarCache) {
    const f = capa.fuente;
    if (!f) return null;
    if (anchoDestPx >= f.width * 0.85) return f;          // se ve a tamaño casi original
    const w = Math.min(f.width, Math.max(32, Math.ceil(anchoDestPx / 32) * 32));
    if (w >= f.width) return f;
    if (guardarCache && capa._cache && capa._cache.width === w) return capa._cache;
    const h = Math.max(1, Math.round(f.height * (w / f.width)));
    const reducida = TC.util.reducir(f, w, h);
    if (guardarCache) capa._cache = reducida;
    return reducida;
  }

  /** Path2D del contorno del recorte, en coordenadas locales de la capa. */
  function pathBorde (capa) {
    if (!capa.contorno || capa.contorno.length < 3) return null;
    const clave = capa.ancho.toFixed(2) + 'x' + capa.alto.toFixed(2);
    if (capa._path && capa._path.clave === clave) return capa._path.path;
    const sx = capa.ancho / capa.anchoFuente;
    const sy = capa.alto / capa.altoFuente;
    const pts = capa.contorno.map(p => [p[0] * sx - capa.ancho / 2, p[1] * sy - capa.alto / 2]);
    const path = new Path2D();
    TC.util.trazarSuave(path, pts, true);
    capa._path = { clave: clave, path: path };
    return path;
  }

  /* =======================================================
     Dibujo de la escena
     ======================================================= */

  function pintarFondo (c, opciones) {
    const { ancho, alto } = TC.estado.lienzo;
    const fondo = TC.estado.fondo;

    if (fondo.tipo === 'transparente') {
      if (opciones.tablero) {
        const paso = 22;
        c.fillStyle = '#233245';
        c.fillRect(0, 0, ancho, alto);
        c.fillStyle = '#2a3a4c';
        for (let y = 0; y < alto; y += paso) {
          for (let x = 0; x < ancho; x += paso) {
            if (((x / paso) + (y / paso)) % 2 === 0) c.fillRect(x, y, paso, paso);
          }
        }
      } else if (opciones.opaco) {
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, ancho, alto);
      }
      return;
    }

    c.fillStyle = fondo.color || '#ffffff';
    c.fillRect(0, 0, ancho, alto);

    if (fondo.tipo === 'imagen' && fondo.imagen) {
      const img = fondo.imagen;
      const k = Math.max(ancho / img.width, alto / img.height);   // cubrir
      const w = img.width * k, h = img.height * k;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = opciones.rapido ? 'medium' : 'high';
      c.drawImage(img, (ancho - w) / 2, (alto - h) / 2, w, h);
    }
  }

  function pintarCapa (c, capa, opciones) {
    if (!capa.visible) return;

    /* capas vectoriales: cada módulo sabe pintarse */
    if (capa.tipo === 'dibujo') { if (TC.dibujo) TC.dibujo.pintar(c, capa); return; }
    if (capa.tipo === 'texto') { if (TC.texto) TC.texto.pintar(c, capa); return; }

    if (!capa.fuente) return;
    const escalaPix = opciones.escalaPix || 1;
    const dibujo = opciones.rapido
      ? capa.fuente
      : fuenteEscalada(capa, capa.ancho * escalaPix, opciones.cache !== false);

    c.save();
    c.translate(capa.x, capa.y);
    c.rotate(capa.rot);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = opciones.rapido ? 'medium' : 'high';
    c.drawImage(dibujo, -capa.ancho / 2, -capa.alto / 2, capa.ancho, capa.alto);

    if (capa.borde && capa.borde.activo) {
      const path = pathBorde(capa);
      if (path) {
        c.lineWidth = capa.borde.grosor;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.strokeStyle = capa.borde.color;
        c.stroke(path);
      }
    }
    c.restore();
  }

  /**
   * Pinta la escena completa. El contexto ya debe estar transformado
   * para que 1 unidad = 1 píxel del lienzo.
   */
  function pintarEscena (c, opciones) {
    opciones = opciones || {};
    pintarFondo(c, opciones);
    const capas = TC.estado.capas;
    for (let i = 0; i < capas.length; i++) pintarCapa(c, capas[i], opciones);
  }
  TC.canvas = TC.canvas || {};
  TC.canvas.pintarEscena = pintarEscena;

  /* ------------------- interfaz de selección ------------------- */

  function esquinasCapa (capa) {
    const hw = capa.ancho / 2, hh = capa.alto / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (p) {
      const r = TC.util.rotarPunto(p[0], p[1], capa.rot);
      return { x: capa.x + r.x, y: capa.y + r.y };
    });
  }

  function puntoMango (capa, m) {
    const r = TC.util.rotarPunto(m.ux * capa.ancho / 2, m.uy * capa.alto / 2, capa.rot);
    return { x: capa.x + r.x, y: capa.y + r.y };
  }

  function puntoRotador (capa) {
    const d = 26 / TC.vista.escala;
    const r = TC.util.rotarPunto(0, -capa.alto / 2 - d, capa.rot);
    return { x: capa.x + r.x, y: capa.y + r.y };
  }

  function pintarSeleccion (c) {
    const capa = TC.capaActiva();
    if (!capa || !capa.visible) return;
    const u = 1 / TC.vista.escala;              // 1 px de pantalla en unidades de lienzo
    const esquinas = esquinasCapa(capa);

    c.save();
    c.lineWidth = 1.4 * u;
    c.strokeStyle = '#7ba3c9';
    c.setLineDash([]);
    c.beginPath();
    esquinas.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
    c.closePath();
    c.stroke();

    /* palito del rotador */
    const rot = puntoRotador(capa);
    const arriba = { x: (esquinas[0].x + esquinas[1].x) / 2, y: (esquinas[0].y + esquinas[1].y) / 2 };
    c.beginPath();
    c.moveTo(arriba.x, arriba.y);
    c.lineTo(rot.x, rot.y);
    c.stroke();

    const lado = 9 * u;
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#4a7aa7';
    c.lineWidth = 1.4 * u;
    MANGOS.forEach(function (m) {
      const p = puntoMango(capa, m);
      c.beginPath();
      c.rect(p.x - lado / 2, p.y - lado / 2, lado, lado);
      c.fill(); c.stroke();
    });
    c.beginPath();
    c.arc(rot.x, rot.y, lado / 1.7, 0, Math.PI * 2);
    c.fill(); c.stroke();
    c.restore();
  }

  /* =======================================================
     Render en pantalla
     ======================================================= */

  function render () {
    const { ancho, alto } = TC.estado.lienzo;
    const escala = TC.vista.escala;
    const anchoCSS = Math.max(1, Math.round(ancho * escala));
    const altoCSS = Math.max(1, Math.round(alto * escala));

    let factor = TC.vista.dpr;
    const mayor = Math.max(anchoCSS, altoCSS) * factor;
    if (mayor > MAX_BACKING) factor *= MAX_BACKING / mayor;

    const anchoReal = Math.max(1, Math.round(anchoCSS * factor));
    const altoReal = Math.max(1, Math.round(altoCSS * factor));

    if (lienzo.width !== anchoReal || lienzo.height !== altoReal) {
      lienzo.width = anchoReal;
      lienzo.height = altoReal;
    }
    lienzo.style.width = anchoCSS + 'px';
    lienzo.style.height = altoCSS + 'px';
    envoltura.style.width = anchoCSS + 'px';
    envoltura.style.height = altoCSS + 'px';

    const escalaPix = anchoReal / ancho;
    ctx.setTransform(escalaPix, 0, 0, altoReal / alto, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    pintarEscena(ctx, { rapido: rapido, escalaPix: escalaPix, tablero: true });
    if (!TC.recorte || !TC.recorte.activo()) pintarSeleccion(ctx);

    document.getElementById('vacio').classList.toggle(
      'oculto', TC.estado.capas.length > 0 || (TC.recorte && TC.recorte.activo())
    );
  }
  TC.canvas.render = render;

  /* =======================================================
     Zoom
     ======================================================= */

  function escalaAjuste () {
    const r = zona.getBoundingClientRect();
    const { ancho, alto } = TC.estado.lienzo;
    const k = Math.min((r.width - 44) / ancho, (r.height - 44) / alto);
    return TC.util.limitar(k, 0.02, 1);
  }

  TC.canvas.ajustarVista = function () {
    TC.vista.ajustar = true;
    TC.vista.escala = escalaAjuste();
    render();
    TC.emitir('vista');
  };

  /** Acerca o aleja dejando quieto el punto (cx, cy) de la pantalla. */
  function zoomAnclado (nuevaEscala, cx, cy) {
    const antes = lienzo.getBoundingClientRect();
    const fx = (cx - antes.left) / TC.vista.escala;
    const fy = (cy - antes.top) / TC.vista.escala;
    TC.vista.ajustar = false;
    TC.vista.escala = TC.util.limitar(nuevaEscala, 0.02, 6);
    render();
    const despues = lienzo.getBoundingClientRect();
    zona.scrollLeft += (despues.left + fx * TC.vista.escala) - cx;
    zona.scrollTop += (despues.top + fy * TC.vista.escala) - cy;
    TC.emitir('vista');
  }

  TC.canvas.zoom = function (delta) {
    const r = zona.getBoundingClientRect();
    zoomAnclado(TC.vista.escala * delta, r.left + r.width / 2, r.top + r.height / 2);
  };

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (TC.vista.ajustar) TC.vista.escala = escalaAjuste();
      render();
      TC.emitir('vista');
      if (TC.recorte) TC.recorte.ajustarLienzo();
    }).observe(zona);
  } else {
    window.addEventListener('resize', function () {
      if (TC.vista.ajustar) TC.vista.escala = escalaAjuste();
      render();
      TC.emitir('vista');
    });
  }

  /* =======================================================
     Alta de capas
     ======================================================= */

  /**
   * Crea una capa a partir de un canvas ya recortado.
   * @param {HTMLCanvasElement} fuenteCanvas recorte a resolución original
   * @param {Array} contorno puntos del trazo en coordenadas del canvas recortado
   */
  TC.canvas.agregarCapa = function (fuenteCanvas, contorno, nombre, borde) {
    const est = TC.estado;
    const lim = 0.62;
    const k = Math.min(
      1,
      (est.lienzo.ancho * lim) / fuenteCanvas.width,
      (est.lienzo.alto * lim) / fuenteCanvas.height
    );
    const ancho = fuenteCanvas.width * k;
    const alto = fuenteCanvas.height * k;
    const desfase = (est.capas.length % 6) * (Math.min(est.lienzo.ancho, est.lienzo.alto) * 0.035);

    const capa = {
      id: TC.nuevoId('capa'),
      nombre: nombre || 'Recorte ' + String(est.capas.length + 1).padStart(2, '0'),
      tipo: 'recorte',
      fuente: fuenteCanvas,
      anchoFuente: fuenteCanvas.width,
      altoFuente: fuenteCanvas.height,
      contorno: contorno || null,
      x: est.lienzo.ancho / 2 + desfase - 20,
      y: est.lienzo.alto / 2 + desfase - 20,
      ancho: ancho,
      alto: alto,
      anchoNatural: ancho,
      altoNatural: alto,
      rot: 0,
      visible: true,
      borde: Object.assign({ activo: false, color: '#ffffff', grosor: 8 }, borde || {}),
      miniatura: TC.util.miniatura(fuenteCanvas, 64)
    };

    est.capas.push(capa);
    est.seleccion = capa.id;
    TC.registrar('agregar recorte');
    TC.actualizar();
    return capa;
  };

  /** Agrega una capa ya armada (dibujo, texto, lo que sea). */
  TC.canvas.agregarCapaLista = function (capa, etiqueta) {
    TC.estado.capas.push(capa);
    TC.estado.seleccion = capa.id;
    TC.registrar(etiqueta || 'agregar capa');
    TC.actualizar();
    return capa;
  };

  /** Miniatura para el panel, sirve para cualquier tipo de capa. */
  TC.canvas.miniaturaDeCapa = function (capa) {
    const lado = 64;
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const g = c.getContext('2d');
    const k = Math.min(lado / Math.max(capa.ancho, 1), lado / Math.max(capa.alto, 1)) * 0.92;
    g.translate(lado / 2, lado / 2);
    g.scale(k, k);
    g.translate(-capa.x, -capa.y);
    pintarCapa(g, capa, { rapido: true, escalaPix: 1 });
    return c.toDataURL('image/png');
  };

  TC.canvas.duplicarCapa = function (id) {
    const capa = TC.capaPorId(id);
    if (!capa) return;
    const copia = Object.assign({}, capa);
    copia.id = TC.nuevoId('capa');
    copia.nombre = capa.nombre + ' copia';
    copia.borde = Object.assign({}, capa.borde);
    if (capa.trazos) copia.trazos = capa.trazos.map(t => Object.assign({}, t));
    copia.x += Math.min(TC.estado.lienzo.ancho, TC.estado.lienzo.alto) * 0.04;
    copia.y += Math.min(TC.estado.lienzo.ancho, TC.estado.lienzo.alto) * 0.04;
    delete copia._cache; delete copia._path;
    TC.estado.capas.push(copia);
    TC.estado.seleccion = copia.id;
    TC.registrar('duplicar capa');
    TC.actualizar();
  };

  TC.canvas.eliminarCapa = function (id) {
    const i = TC.estado.capas.findIndex(c => c.id === id);
    if (i < 0) return;
    TC.estado.capas.splice(i, 1);
    if (TC.estado.seleccion === id) TC.estado.seleccion = null;
    TC.registrar('eliminar capa');
    TC.actualizar();
  };

  TC.canvas.moverEnZ = function (id, destino) {
    const capas = TC.estado.capas;
    const i = capas.findIndex(c => c.id === id);
    if (i < 0) return;
    let j = i;
    if (destino === 'frente') j = capas.length - 1;
    else if (destino === 'fondo') j = 0;
    else if (destino === 'subir') j = Math.min(capas.length - 1, i + 1);
    else if (destino === 'bajar') j = Math.max(0, i - 1);
    if (j === i) return;
    capas.splice(j, 0, capas.splice(i, 1)[0]);
    TC.registrar('reordenar capas');
    TC.actualizar();
  };

  /** Cambia el formato del lienzo reubicando las capas proporcionalmente. */
  TC.canvas.cambiarFormato = function (ancho, alto, nombre) {
    const est = TC.estado;
    const kx = ancho / est.lienzo.ancho;
    const ky = alto / est.lienzo.alto;
    const k = Math.min(kx, ky);
    est.capas.forEach(function (c) {
      c.x *= kx; c.y *= ky;
      c.ancho *= k; c.alto *= k;
      c.anchoNatural *= k; c.altoNatural *= k;
      c.borde.grosor = Math.max(1, c.borde.grosor * k);
      delete c._cache; delete c._path;
    });
    est.lienzo = { ancho: ancho, alto: alto, nombre: nombre || (ancho + ' × ' + alto) };
    TC.registrar('cambiar formato');
    if (TC.vista.ajustar) TC.vista.escala = escalaAjuste();
    TC.actualizar();
    TC.emitir('vista');
  };

  /* =======================================================
     Detección de clics
     ======================================================= */

  function puntoLocal (capa, x, y) {
    return TC.util.rotarPunto(x - capa.x, y - capa.y, -capa.rot);
  }

  function dentroDeCapa (capa, x, y) {
    const p = puntoLocal(capa, x, y);
    const hw = capa.ancho / 2, hh = capa.alto / 2;
    if (Math.abs(p.x) > hw || Math.abs(p.y) > hh) return false;

    /* dibujos y textos: alcanza con el rectángulo */
    if (capa.tipo !== 'recorte' || !capa.fuente) return true;

    /* prueba de transparencia: si el pixel del recorte es transparente,
       el clic pasa a la capa de abajo */
    try {
      const u = Math.floor(((p.x + hw) / capa.ancho) * capa.anchoFuente);
      const v = Math.floor(((p.y + hh) / capa.alto) * capa.altoFuente);
      const c = capa.fuente.getContext('2d');
      const d = c.getImageData(
        TC.util.limitar(u, 0, capa.anchoFuente - 1),
        TC.util.limitar(v, 0, capa.altoFuente - 1), 1, 1
      ).data;
      const margen = capa.borde && capa.borde.activo ? 4 : 12;
      return d[3] > margen;
    } catch (e) {
      return true;   // si no se puede leer, se acepta el rectángulo
    }
  }

  function capaEnPunto (x, y) {
    const capas = TC.estado.capas;
    for (let i = capas.length - 1; i >= 0; i--) {
      if (capas[i].visible && dentroDeCapa(capas[i], x, y)) return capas[i];
    }
    return null;
  }

  /* con dedo los mangos necesitan más área que con mouse */
  const TACTIL = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  function mangoEnPunto (x, y) {
    const capa = TC.capaActiva();
    if (!capa || !capa.visible) return null;
    const tol = (TACTIL ? 22 : 12) / TC.vista.escala;

    const r = puntoRotador(capa);
    if (Math.hypot(x - r.x, y - r.y) <= tol) return { tipo: 'rotar' };

    for (const m of MANGOS) {
      const p = puntoMango(capa, m);
      if (Math.abs(x - p.x) <= tol && Math.abs(y - p.y) <= tol) {
        return { tipo: 'escalar', mango: m };
      }
    }
    return null;
  }

  const CURSORES = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];
  function cursorMango (capa, m) {
    const ang = Math.atan2(m.uy, m.ux) + capa.rot;
    let i = Math.round(((ang * 180 / Math.PI) + 360) % 180 / 45) % 4;
    return CURSORES[(i + 3) % 4];
  }

  /* =======================================================
     Gestos
     ======================================================= */

  function coords (e) {
    const r = lienzo.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / TC.vista.escala,
      y: (e.clientY - r.top) / TC.vista.escala
    };
  }
  TC.canvas.coords = coords;

  function centroPunteros () {
    const p = Array.from(punteros.values());
    return {
      x: (p[0].x + p[1].x) / 2,
      y: (p[0].y + p[1].y) / 2,
      d: Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y))
    };
  }

  /** Deshace lo que el gesto en curso venía moviendo y lo cancela. */
  function cancelarInteraccion () {
    if (!interaccion) return;
    const c = interaccion.capa, i = interaccion.inicio;
    c.x = i.x; c.y = i.y; c.ancho = i.ancho; c.alto = i.alto; c.rot = i.rot;
    delete c._path;
    interaccion = null;
    rapido = false;
    render();
    TC.emitir('capa-en-vivo');
  }

  lienzo.addEventListener('pointerdown', function (e) {
    if (TC.recorte && TC.recorte.activo()) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });

    /* dos dedos: pinza para acercar. Lo que el primer dedo haya movido
       se revierte, así el collage no se desarma al hacer zoom. */
    if (punteros.size >= 2) {
      cancelarInteraccion();
      if (TC.dibujo && TC.dibujo.dibujando()) TC.dibujo.cancelarTrazo();
      arrastreVista = null;
      const c = centroPunteros();
      pinza = { d: c.d, escala: TC.vista.escala, x: c.x, y: c.y };
      e.preventDefault();
      return;
    }

    const p = coords(e);
    const herramienta = TC.estado.herramienta;

    /* herramientas que no tocan capas existentes */
    if (herramienta === 'pincel' && TC.dibujo) {
      try { lienzo.setPointerCapture(e.pointerId); } catch (err) { /* sintético */ }
      TC.dibujo.abajo(p);
      e.preventDefault();
      return;
    }
    if (herramienta === 'texto' && TC.texto) {
      TC.texto.clic(p);
      e.preventDefault();
      return;
    }

    let gesto = null;
    const mango = mangoEnPunto(p.x, p.y);

    if (mango && herramienta !== 'rotar') {
      gesto = mango.tipo === 'rotar'
        ? { tipo: 'rotar' }
        : { tipo: 'escalar', mango: mango.mango };
    } else {
      const capa = capaEnPunto(p.x, p.y);
      if (capa) {
        if (TC.estado.seleccion !== capa.id) {
          TC.estado.seleccion = capa.id;
          TC.emitir('seleccion');
        }
        gesto = { tipo: herramienta === 'rotar' ? 'rotar' : 'mover' };
      } else if (herramienta === 'rotar' && TC.capaActiva()) {
        gesto = { tipo: 'rotar' };
      } else {
        /* fondo vacío: arrastrar mueve la vista; un toque simple deselecciona */
        arrastreVista = {
          x: e.clientX, y: e.clientY,
          sl: zona.scrollLeft, st: zona.scrollTop, movio: false
        };
        try { lienzo.setPointerCapture(e.pointerId); } catch (err) { /* sintético */ }
        return;
      }
    }

    const capa = TC.capaActiva();
    if (!capa) { render(); return; }

    const inicio = {
      x: capa.x, y: capa.y, ancho: capa.ancho, alto: capa.alto, rot: capa.rot
    };
    interaccion = {
      gesto: gesto,
      capa: capa,
      inicio: inicio,
      puntero: p,
      angInicial: Math.atan2(p.y - capa.y, p.x - capa.x),
      movio: false,
      proporcional: !gesto.mango || (gesto.mango.ux !== 0 && gesto.mango.uy !== 0)
    };

    if (gesto.tipo === 'escalar') {
      const m = gesto.mango;
      const a = TC.util.rotarPunto(-m.ux * capa.ancho / 2, -m.uy * capa.alto / 2, capa.rot);
      interaccion.ancla = { x: capa.x + a.x, y: capa.y + a.y };
    }

    rapido = true;
    try { lienzo.setPointerCapture(e.pointerId); } catch (err) { /* puntero sintético */ }
    render();
    TC.emitir('seleccion');
    e.preventDefault();
  });

  lienzo.addEventListener('pointermove', function (e) {
    if (punteros.has(e.pointerId)) punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinza && punteros.size >= 2) {
      const c = centroPunteros();
      zona.scrollLeft -= c.x - pinza.x;
      zona.scrollTop -= c.y - pinza.y;
      pinza.x = c.x; pinza.y = c.y;
      zoomAnclado(pinza.escala * (c.d / pinza.d), c.x, c.y);
      e.preventDefault();
      return;
    }

    if (arrastreVista) {
      const dx = e.clientX - arrastreVista.x, dy = e.clientY - arrastreVista.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) arrastreVista.movio = true;
      zona.scrollLeft = arrastreVista.sl - dx;
      zona.scrollTop = arrastreVista.st - dy;
      lienzo.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    if (TC.estado.herramienta === 'pincel' && TC.dibujo && TC.dibujo.dibujando()) {
      TC.dibujo.mover(coords(e));
      e.preventDefault();
      return;
    }

    const p = coords(e);

    if (!interaccion) {
      /* cursor según lo que hay debajo */
      const capa = TC.capaActiva();
      const m = mangoEnPunto(p.x, p.y);
      if (TC.recorte && TC.recorte.activo()) return;
      if (TC.estado.herramienta === 'rotar') lienzo.style.cursor = 'grab';
      else if (m && m.tipo === 'rotar') lienzo.style.cursor = 'grab';
      else if (m) lienzo.style.cursor = cursorMango(capa, m.mango);
      else lienzo.style.cursor = capaEnPunto(p.x, p.y) ? 'move' : 'default';
      return;
    }

    const capa = interaccion.capa;
    const ini = interaccion.inicio;

    if (interaccion.gesto.tipo === 'mover') {
      capa.x = ini.x + (p.x - interaccion.puntero.x);
      capa.y = ini.y + (p.y - interaccion.puntero.y);
    } else if (interaccion.gesto.tipo === 'rotar') {
      const ang = Math.atan2(p.y - capa.y, p.x - capa.x);
      let nueva = ini.rot + (ang - interaccion.angInicial);
      if (e.shiftKey) nueva = Math.round(nueva / (Math.PI / 12)) * (Math.PI / 12);
      capa.rot = nueva;
    } else if (interaccion.gesto.tipo === 'escalar') {
      const m = interaccion.gesto.mango;
      const a = interaccion.ancla;
      const v = TC.util.rotarPunto(p.x - a.x, p.y - a.y, -ini.rot);
      let w = m.ux !== 0 ? Math.abs(v.x) : ini.ancho;
      let h = m.uy !== 0 ? Math.abs(v.y) : ini.alto;

      const proporcional = interaccion.proporcional !== e.shiftKey;  // Shift invierte
      if (proporcional && m.ux !== 0 && m.uy !== 0) {
        const k = Math.max(w / ini.ancho, h / ini.alto);
        w = ini.ancho * k; h = ini.alto * k;
      } else if (proporcional) {
        const k = m.ux !== 0 ? w / ini.ancho : h / ini.alto;
        w = ini.ancho * k; h = ini.alto * k;
      }
      w = Math.max(MIN_LADO, w); h = Math.max(MIN_LADO, h);

      const centro = TC.util.rotarPunto(m.ux * w / 2, m.uy * h / 2, ini.rot);
      capa.ancho = w; capa.alto = h;
      capa.x = a.x + centro.x;
      capa.y = a.y + centro.y;
      delete capa._path;
    }

    interaccion.movio = true;
    render();
    TC.emitir('capa-en-vivo');
    e.preventDefault();
  });

  function terminarGesto () {
    if (!interaccion) return;
    const movio = interaccion.movio;
    const tipo = interaccion.gesto.tipo;
    interaccion = null;
    rapido = false;
    if (movio) {
      TC.registrar(tipo === 'mover' ? 'mover capa' : tipo === 'rotar' ? 'rotar capa' : 'escalar capa');
      TC.actualizar();
    } else {
      render();
    }
  }

  function soltarPuntero (e) {
    punteros.delete(e.pointerId);
    if (punteros.size < 2) pinza = null;

    if (TC.dibujo && TC.dibujo.dibujando()) { TC.dibujo.arriba(); return; }

    if (arrastreVista) {
      const toque = !arrastreVista.movio;
      arrastreVista = null;
      lienzo.style.cursor = 'default';
      if (toque && TC.estado.seleccion !== null) {
        TC.estado.seleccion = null;
        TC.emitir('seleccion');
        render();
      }
      return;
    }
    terminarGesto();
  }

  lienzo.addEventListener('pointerup', soltarPuntero);
  lienzo.addEventListener('pointercancel', soltarPuntero);

  /* doble clic sobre un texto: lo manda a editar */
  lienzo.addEventListener('dblclick', function (e) {
    const p = coords(e);
    const capa = capaEnPunto(p.x, p.y);
    if (capa && capa.tipo === 'texto' && TC.texto) {
      TC.estado.seleccion = capa.id;
      TC.emitir('seleccion');
      TC.texto.editar();
    }
  });

  /* rueda: Ctrl + rueda hace zoom sobre el cursor */
  zona.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomAnclado(TC.vista.escala * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
  }, { passive: false });

  /* =======================================================
     Exportar
     ======================================================= */

  TC.canvas.exportar = function (tipo) {
    const { ancho, alto } = TC.estado.lienzo;
    const salida = document.createElement('canvas');
    salida.width = ancho;
    salida.height = alto;
    const c = salida.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    pintarEscena(c, {
      rapido: false,
      escalaPix: 1,
      cache: false,
      tablero: false,
      opaco: tipo === 'jpg'
    });

    const mime = tipo === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = tipo === 'jpg' ? 'jpg' : 'png';
    const nombre = 'ucbam-' + ancho + 'x' + alto + '.' + ext;

    function bajar (url, revocar) {
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (revocar) setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    if (salida.toBlob) {
      salida.toBlob(function (blob) {
        if (blob) bajar(URL.createObjectURL(blob), true);
        else bajar(salida.toDataURL(mime, 0.92), false);
      }, mime, 0.92);
    } else {
      bajar(salida.toDataURL(mime, 0.92), false);
    }
    return nombre;
  };

  TC.on('cambio', render);

})(window.TC);
