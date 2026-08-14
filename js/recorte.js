/* ===========================================================
   UCBAM · recorte.js
   Herramienta de lápiz a mano alzada. El usuario dibuja un trazo
   punto por punto sobre la foto; al cerrarlo, esa silueta se
   recorta con Path2D + clip() y se convierte en una capa nueva.

   La vista tiene zoom y paneo propios: los puntos del trazo se
   guardan en coordenadas de la foto, así acercar, alejar o mover
   nunca deforma lo dibujado.
   =========================================================== */

(function (TC) {
  'use strict';

  const zona = document.getElementById('lienzo-zona');
  const capa = document.getElementById('lienzo-recorte');
  const ctx = capa.getContext('2d');
  const barra = document.getElementById('barra-recorte');
  const btnAplicar = document.getElementById('btn-recorte-aplicar');
  const btnRehacer = document.getElementById('btn-recorte-rehacer');
  const btnCancelar = document.getElementById('btn-recorte-cancelar');

  const DIST_MIN = 2.2;          // separación mínima entre puntos, en px de pantalla
  const RADIO_CIERRE = 18;       // qué tan cerca del inicio hay que volver para cerrar
  const PUNTOS_MIN_CIERRE = 24;
  const LADO_MAXIMO_RECORTE = 4200;
  const MARGEN = 26;             // aire alrededor de la foto

  let foto = null;               // { img, ancho, alto, nombre }
  let objetivo = null;           // { tipo: 'foto' | 'capa', id }
  let vista = { k: 1, x: 0, y: 0 };   // k = px de pantalla por px de foto
  let kAjuste = 1;
  let sinTocar = true;           // todavía no cambió el zoom a mano
  let puntos = [];               // EN COORDENADAS DE LA FOTO
  let cerrado = false;
  let animacion = null;
  let desfase = 0;

  const punteros = new Map();
  let modo = null;               // 'dibujar' | 'pan' | 'pinza'
  let gesto = null;
  let espacio = false;

  let vistaPrevia = null;        // punto bajo el cursor, para la línea elástica

  TC.recorte = TC.recorte || {};
  TC.recorte.activo = function () { return foto !== null; };
  TC.recorte.borde = { activo: false, color: '#ffffff', grosor: 8 };
  /* 'libre' = trazo a pulso · 'puntos' = figura de clic en clic */
  TC.recorte.modo = 'libre';

  TC.recorte.fijarModo = function (m) {
    TC.recorte.modo = m === 'puntos' ? 'puntos' : 'libre';
    puntos = [];
    cerrado = false;
    vistaPrevia = null;
    if (foto) pintar();
    TC.emitir('recorte');
  };

  function esPoli () { return TC.recorte.modo === 'puntos'; }
  function suave () { return !esPoli(); }

  /* -------------------------------------------------------
     Abrir / cerrar
     ------------------------------------------------------- */

  function abrirCon (fuente, obj) {
    foto = fuente;
    objetivo = obj;
    puntos = [];
    cerrado = false;
    modo = null;
    gesto = null;
    sinTocar = true;
    punteros.clear();

    zona.scrollTop = 0; zona.scrollLeft = 0;
    zona.style.overflow = 'hidden';
    capa.classList.remove('oculto');
    barra.classList.remove('oculto');
    document.getElementById('vacio').classList.add('oculto');

    medirLienzo();
    ajustarVista();
    if (!animacion) animacion = requestAnimationFrame(bucle);
    TC.emitir('recorte');
    TC.canvas.render();
  }

  /** Recorta una foto de la mesa y crea una capa nueva. */
  TC.recorte.abrir = function (nuevaFoto) {
    if (!nuevaFoto) return;
    abrirCon({
      img: nuevaFoto.img, ancho: nuevaFoto.ancho, alto: nuevaFoto.alto, nombre: nuevaFoto.nombre
    }, { tipo: 'foto', id: nuevaFoto.id });
  };

  /** Vuelve a recortar una capa ya cortada, para afinarla. */
  TC.recorte.abrirCapa = function (capaObj) {
    if (!capaObj || !capaObj.fuente) return;
    abrirCon({
      img: capaObj.fuente,
      ancho: capaObj.anchoFuente,
      alto: capaObj.altoFuente,
      nombre: capaObj.nombre
    }, { tipo: 'capa', id: capaObj.id });
  };

  TC.recorte.cerrar = function () {
    foto = null;
    objetivo = null;
    puntos = [];
    cerrado = false;
    modo = null;
    punteros.clear();
    zona.style.overflow = 'auto';
    capa.classList.add('oculto');
    barra.classList.add('oculto');
    if (animacion) { cancelAnimationFrame(animacion); animacion = null; }
    TC.emitir('recorte');
    TC.canvas.render();
  };

  TC.recorte.rehacerTrazo = function () {
    puntos = [];
    cerrado = false;
    pintar();
    TC.emitir('recorte');
  };

  TC.recorte.info = function () {
    return {
      activo: !!foto,
      puntos: puntos.length,
      cerrado: cerrado,
      zoom: vista.k / (kAjuste || 1),
      modo: TC.recorte.modo,
      sobreCapa: !!objetivo && objetivo.tipo === 'capa',
      caja: foto
        ? { x: vista.x, y: vista.y, ancho: foto.ancho * vista.k, alto: foto.alto * vista.k }
        : null,
      altoUtil: foto ? altoUtil() : 0
    };
  };

  /* -------------------------------------------------------
     Vista: ajuste, zoom y paneo
     ------------------------------------------------------- */

  function medirLienzo () {
    const r = zona.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    capa.width = Math.max(1, Math.round(r.width * dpr));
    capa.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Alto libre: descuenta la barra flotante para que no tape la foto. */
  function altoUtil () {
    const alto = capa.clientHeight;
    const b = barra.classList.contains('oculto') ? 0 : barra.offsetHeight + 22;
    return Math.max(120, alto - b);
  }

  function ajustarVista () {
    if (!foto) return;
    const ancho = capa.clientWidth;
    const alto = altoUtil();
    kAjuste = Math.min(
      (ancho - MARGEN * 2) / foto.ancho,
      (alto - MARGEN * 2) / foto.alto
    );
    kAjuste = TC.util.limitar(kAjuste, 0.02, 2);
    vista.k = kAjuste;
    vista.x = (ancho - foto.ancho * vista.k) / 2;
    vista.y = (alto - foto.alto * vista.k) / 2;
    sinTocar = true;
    pintar();
    TC.emitir('recorte');
  }
  TC.recorte.ajustarVista = ajustarVista;

  function limitarVista () {
    const ancho = capa.clientWidth, alto = altoUtil();
    const w = foto.ancho * vista.k, h = foto.alto * vista.k;
    vista.x = w <= ancho
      ? TC.util.limitar(vista.x, 0, ancho - w)
      : TC.util.limitar(vista.x, ancho - w, 0);
    vista.y = h <= alto
      ? TC.util.limitar(vista.y, 0, alto - h)
      : TC.util.limitar(vista.y, alto - h, 0);
  }

  /** Acerca o aleja manteniendo quieto el punto (ax, ay) de la pantalla. */
  function zoomEn (nuevaK, ax, ay) {
    if (!foto) return;
    const min = kAjuste * 0.6;
    const max = Math.max(kAjuste * 10, 6);
    nuevaK = TC.util.limitar(nuevaK, min, max);
    if (nuevaK === vista.k) return;
    const fx = (ax - vista.x) / vista.k;
    const fy = (ay - vista.y) / vista.k;
    vista.k = nuevaK;
    vista.x = ax - fx * vista.k;
    vista.y = ay - fy * vista.k;
    sinTocar = false;
    limitarVista();
    pintar();
    TC.emitir('recorte');
  }

  TC.recorte.zoom = function (factor) {
    if (!foto) return;
    zoomEn(vista.k * factor, capa.clientWidth / 2, altoUtil() / 2);
  };

  /** Al cambiar el tamaño de la ventana: reajusta o reencuadra. */
  TC.recorte.ajustarLienzo = function () {
    if (!foto) return;
    medirLienzo();
    if (sinTocar) { ajustarVista(); return; }
    limitarVista();
    pintar();
  };

  /* pantalla <-> foto */
  function aFoto (sx, sy) {
    return [(sx - vista.x) / vista.k, (sy - vista.y) / vista.k];
  }
  function aPantalla (p) {
    return [p[0] * vista.k + vista.x, p[1] * vista.k + vista.y];
  }

  /* -------------------------------------------------------
     Dibujo del overlay
     ------------------------------------------------------- */

  /* Grosor del borde en pantalla: está en px de lienzo y la capa
     entra al lienzo reducida. Aproximación para la vista previa. */
  function grosorBordePantalla () {
    let escalaCapa;
    if (objetivo && objetivo.tipo === 'capa') {
      const c = TC.capaPorId(objetivo.id);
      escalaCapa = c ? c.ancho / c.anchoFuente : 1;
    } else {
      const est = TC.estado, lim = 0.62;
      escalaCapa = Math.min(1,
        (est.lienzo.ancho * lim) / foto.ancho,
        (est.lienzo.alto * lim) / foto.alto);
    }
    return Math.max(1, TC.recorte.borde.grosor * vista.k / Math.max(escalaCapa, 0.05));
  }

  function pintar () {
    if (!foto) return;
    const ancho = capa.clientWidth, alto = capa.clientHeight;

    ctx.clearRect(0, 0, ancho, alto);
    ctx.fillStyle = 'rgba(14,22,32,.82)';
    ctx.fillRect(0, 0, ancho, alto);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(foto.img, vista.x, vista.y, foto.ancho * vista.k, foto.alto * vista.k);

    if (puntos.length > 1) {
      const enPantalla = puntos.map(aPantalla);
      if (esPoli() && !cerrado && vistaPrevia) enPantalla.push(vistaPrevia.slice());
      const trazo = new Path2D();
      TC.util.trazarForma(trazo, enPantalla, cerrado, suave());

      if (cerrado) {
        const mascara = new Path2D();
        mascara.rect(0, 0, ancho, alto);
        mascara.addPath(trazo);
        ctx.save();
        ctx.fillStyle = 'rgba(14,22,32,.62)';
        ctx.fill(mascara, 'evenodd');
        ctx.restore();

        if (TC.recorte.borde.activo) {
          ctx.save();
          ctx.lineWidth = grosorBordePantalla();
          ctx.lineJoin = ctx.lineCap = 'round';
          ctx.strokeStyle = TC.recorte.borde.color;
          ctx.stroke(trazo);
          ctx.restore();
        }
      }

      ctx.save();
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.setLineDash([9, 7]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(20,28,38,.85)';
      ctx.lineDashOffset = -desfase;
      ctx.stroke(trazo);
      ctx.strokeStyle = '#ffffff';
      ctx.lineDashOffset = -desfase + 0.5;
      ctx.stroke(trazo);
      ctx.restore();

      if (!cerrado) marcarInicio();
    } else if (puntos.length === 1) {
      if (esPoli() && vistaPrevia) {
        const a = aPantalla(puntos[0]);
        ctx.save();
        ctx.setLineDash([9, 7]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(vistaPrevia[0], vistaPrevia[1]);
        ctx.stroke();
        ctx.restore();
      }
      marcarInicio();
    }

    /* vértices de la figura por puntos */
    if (esPoli() && puntos.length) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1d2b3a';
      ctx.lineWidth = 1.5;
      puntos.forEach(function (p, i) {
        if (i === 0) return;   // el primero ya lleva su marca
        const s = aPantalla(p);
        ctx.beginPath();
        ctx.rect(s[0] - 3.5, s[1] - 3.5, 7, 7);
        ctx.fill(); ctx.stroke();
      });
      ctx.restore();
    }
  }

  /** Marca el primer punto: ahí hay que volver para cerrar. */
  function marcarInicio () {
    const inicio = aPantalla(puntos[0]);
    ctx.save();
    ctx.beginPath();
    ctx.arc(inicio[0], inicio[1], RADIO_CIERRE / 2.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fill();
    ctx.strokeStyle = '#4a7aa7';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function bucle () {
    desfase = (desfase + 0.45) % 16;
    if (puntos.length > 1) pintar();
    animacion = foto ? requestAnimationFrame(bucle) : null;
  }

  /* -------------------------------------------------------
     Punteros: dibujar, panear y pinza de dos dedos
     ------------------------------------------------------- */

  function pantalla (e) {
    const r = capa.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function centroYdistancia () {
    const p = Array.from(punteros.values());
    return {
      x: (p[0].x + p[1].x) / 2,
      y: (p[0].y + p[1].y) / 2,
      d: Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y))
    };
  }

  capa.addEventListener('pointerdown', function (e) {
    if (!foto) return;
    try { capa.setPointerCapture(e.pointerId); } catch (err) { /* puntero sintético */ }
    const p = pantalla(e);
    punteros.set(e.pointerId, { x: p[0], y: p[1] });

    if (punteros.size >= 2) {
      /* segundo dedo: se descarta el trazo a medias y se pasa a la pinza */
      if (modo === 'dibujar') { puntos = []; cerrado = false; }
      modo = 'pinza';
      const c = centroYdistancia();
      gesto = { d: c.d, k: vista.k, x: c.x, y: c.y };
      pintar();
      TC.emitir('recorte');
      e.preventDefault();
      return;
    }

    if (e.button === 1 || espacio) {
      modo = 'pan';
      gesto = { x: p[0], y: p[1], vx: vista.x, vy: vista.y };
    } else if (esPoli()) {
      /* clic corto = vértice; arrastrar = mover la foto */
      modo = 'toque';
      gesto = { x: p[0], y: p[1], vx: vista.x, vy: vista.y, movio: false };
    } else {
      modo = 'dibujar';
      cerrado = false;
      puntos = [aFoto(p[0], p[1])];
      pintar();
      TC.emitir('recorte');
    }
    e.preventDefault();
  });

  /* -------------------------------------------------------
     Figura por puntos
     ------------------------------------------------------- */

  function agregarPunto (sx, sy) {
    if (cerrado) { puntos = []; cerrado = false; }
    if (puntos.length >= 3) {
      const ini = aPantalla(puntos[0]);
      if (Math.hypot(sx - ini[0], sy - ini[1]) < RADIO_CIERRE) { cerrarFigura(); return; }
    }
    puntos.push(aFoto(sx, sy));
    pintar();
    TC.emitir('recorte');
  }

  function cerrarFigura () {
    if (puntos.length < 3) return;
    cerrado = true;
    vistaPrevia = null;
    pintar();
    TC.emitir('recorte');
  }

  function quitarPunto () {
    if (!puntos.length) return;
    puntos.pop();
    cerrado = false;
    pintar();
    TC.emitir('recorte');
  }

  TC.recorte.cerrarFigura = cerrarFigura;
  TC.recorte.quitarPunto = quitarPunto;

  /* doble clic: cierra la figura (descarta el vértice repetido) */
  capa.addEventListener('dblclick', function (e) {
    if (!foto || !esPoli() || puntos.length < 3) return;
    const a = puntos[puntos.length - 1], b = puntos[puntos.length - 2];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) * vista.k < 6) puntos.pop();
    cerrarFigura();
    e.preventDefault();
  });

  capa.addEventListener('pointermove', function (e) {
    if (!foto) return;

    /* línea elástica: sigue al cursor mientras se arma la figura */
    if (!punteros.size) {
      if (esPoli() && puntos.length && !cerrado) {
        vistaPrevia = pantalla(e);
        pintar();
      }
      return;
    }
    if (!punteros.has(e.pointerId)) return;
    const p = pantalla(e);
    punteros.set(e.pointerId, { x: p[0], y: p[1] });

    if (modo === 'pinza' && punteros.size >= 2) {
      const c = centroYdistancia();
      const nuevaK = gesto.k * (c.d / gesto.d);
      vista.x += c.x - gesto.x;
      vista.y += c.y - gesto.y;
      gesto.x = c.x; gesto.y = c.y;
      zoomEn(nuevaK, c.x, c.y);
      e.preventDefault();
      return;
    }

    if (modo === 'pan' || modo === 'toque') {
      const dx = p[0] - gesto.x, dy = p[1] - gesto.y;
      if (modo === 'toque') {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;   // sigue siendo un clic
        gesto.movio = true;
      }
      vista.x = gesto.vx + dx;
      vista.y = gesto.vy + dy;
      sinTocar = false;
      limitarVista();
      pintar();
      e.preventDefault();
      return;
    }

    if (modo !== 'dibujar') return;

    const f = aFoto(p[0], p[1]);
    const ultimo = puntos[puntos.length - 1];
    const dPantalla = Math.hypot(f[0] - ultimo[0], f[1] - ultimo[1]) * vista.k;
    if (dPantalla < DIST_MIN) return;
    puntos.push(f);

    /* ¿volvió al punto de inicio? el trazo se cierra solo */
    if (puntos.length > PUNTOS_MIN_CIERRE) {
      const ini = aPantalla(puntos[0]);
      if (Math.hypot(p[0] - ini[0], p[1] - ini[1]) < RADIO_CIERRE) {
        finalizarTrazo();
        return;
      }
    }
    pintar();
    TC.emitir('recorte');
    e.preventDefault();
  });

  function puedeAplicar () {
    return esPoli() ? puntos.length >= 3 : cerrado;
  }

  function finalizarTrazo () {
    if (modo === 'dibujar') {
      if (puntos.length >= 6) cerrado = true;
      else { puntos = []; cerrado = false; }
    }
    modo = null;
    gesto = null;
    btnAplicar.disabled = !puedeAplicar();
    pintar();
    TC.emitir('recorte');
  }

  function soltar (e) {
    if (!foto) return;
    punteros.delete(e.pointerId);

    if (modo === 'toque') {
      const clic = !gesto.movio;
      const p = pantalla(e);
      modo = null; gesto = null;
      if (clic) agregarPunto(p[0], p[1]);
      btnAplicar.disabled = !puedeAplicar();
      return;
    }

    if (modo === 'pinza' || modo === 'pan') {
      /* al levantar un dedo no se reanuda el dibujo: evita rayones */
      if (punteros.size < 2) { modo = punteros.size ? 'pan' : null; }
      if (!punteros.size) { modo = null; gesto = null; }
      else if (modo === 'pan') {
        const p = Array.from(punteros.values())[0];
        gesto = { x: p.x, y: p.y, vx: vista.x, vy: vista.y };
      }
      TC.emitir('recorte');
      return;
    }
    finalizarTrazo();
  }

  capa.addEventListener('pointerup', soltar);
  capa.addEventListener('pointercancel', soltar);

  /* rueda del mouse: zoom sobre el cursor */
  capa.addEventListener('wheel', function (e) {
    if (!foto) return;
    e.preventDefault();
    const p = pantalla(e);
    zoomEn(vista.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p[0], p[1]);
  }, { passive: false });

  /* barra espaciadora: paneo temporal en la computadora */
  document.addEventListener('keydown', function (e) {
    if (!foto || e.code !== 'Space') return;
    const t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    espacio = true;
    capa.style.cursor = 'grab';
    e.preventDefault();
  });
  document.addEventListener('keyup', function (e) {
    if (e.code !== 'Space') return;
    espacio = false;
    capa.style.cursor = 'crosshair';
  });

  /* -------------------------------------------------------
     Aplicar el recorte
     ------------------------------------------------------- */

  TC.recorte.aplicar = function () {
    if (!foto) return;
    if (esPoli()) {
      if (puntos.length < 3) return;
      cerrado = true;
    } else if (!cerrado || puntos.length < 6) return;

    const enFoto = puntos.map(function (p) {
      return [
        TC.util.limitar(p[0], 0, foto.ancho),
        TC.util.limitar(p[1], 0, foto.alto)
      ];
    });

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    enFoto.forEach(function (p) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    });

    const pad = 2;
    minX = Math.max(0, Math.floor(minX - pad));
    minY = Math.max(0, Math.floor(minY - pad));
    maxX = Math.min(foto.ancho, Math.ceil(maxX + pad));
    maxY = Math.min(foto.alto, Math.ceil(maxY + pad));

    const anchoRec = Math.max(2, maxX - minX);
    const altoRec = Math.max(2, maxY - minY);

    let escala = 1;
    const mayor = Math.max(anchoRec, altoRec);
    if (mayor > LADO_MAXIMO_RECORTE) escala = LADO_MAXIMO_RECORTE / mayor;

    const salida = document.createElement('canvas');
    salida.width = Math.max(2, Math.round(anchoRec * escala));
    salida.height = Math.max(2, Math.round(altoRec * escala));
    const c = salida.getContext('2d');

    const contorno = enFoto.map(p => [(p[0] - minX) * escala, (p[1] - minY) * escala]);
    const forma = new Path2D();
    TC.util.trazarForma(forma, contorno, true, suave());

    c.save();
    c.clip(forma);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(foto.img, minX, minY, anchoRec, altoRec, 0, 0, salida.width, salida.height);
    c.restore();

    const borde = {
      activo: TC.recorte.borde.activo,
      color: TC.recorte.borde.color,
      grosor: TC.recorte.borde.grosor
    };

    if (objetivo && objetivo.tipo === 'capa') {
      recortarSobreCapa(TC.capaPorId(objetivo.id), salida, contorno, {
        minX: minX, minY: minY, ancho: anchoRec, alto: altoRec
      });
    } else {
      const nombre = foto.nombre.slice(0, 18) + ' ' +
        String(TC.estado.capas.length + 1).padStart(2, '0');
      TC.canvas.agregarCapa(salida, contorno, nombre, borde, suave());
    }

    TC.estado.herramienta = 'mover';
    TC.emitir('herramienta');
    TC.recorte.cerrar();
  };

  /**
   * Reemplaza el contenido de una capa por un recorte más ajustado.
   * Lo que queda no se mueve del lugar donde estaba en el lienzo.
   */
  function recortarSobreCapa (capaObj, salida, contorno, caja) {
    if (!capaObj) return;
    const escalaX = capaObj.ancho / capaObj.anchoFuente;   // px de lienzo por px de fuente
    const escalaY = capaObj.alto / capaObj.altoFuente;

    const dx = (caja.minX + caja.ancho / 2) - capaObj.anchoFuente / 2;
    const dy = (caja.minY + caja.alto / 2) - capaObj.altoFuente / 2;
    const d = TC.util.rotarPunto(dx * escalaX, dy * escalaY, capaObj.rot);

    capaObj.x += d.x;
    capaObj.y += d.y;
    capaObj.ancho = caja.ancho * escalaX;
    capaObj.alto = caja.alto * escalaY;
    capaObj.anchoNatural = capaObj.ancho;
    capaObj.altoNatural = capaObj.alto;
    capaObj.fuente = salida;
    capaObj.anchoFuente = salida.width;
    capaObj.altoFuente = salida.height;
    capaObj.contorno = contorno;
    capaObj.contornoSuave = suave();
    capaObj.borde.activo = TC.recorte.borde.activo;
    capaObj.borde.color = TC.recorte.borde.color;
    capaObj.borde.grosor = TC.recorte.borde.grosor;
    delete capaObj._cache;
    delete capaObj._path;
    capaObj.miniatura = TC.util.miniatura(salida, 64);

    TC.estado.seleccion = capaObj.id;
    TC.registrar('recortar de nuevo');
    TC.actualizar();
  }

  btnAplicar.addEventListener('click', TC.recorte.aplicar);
  btnRehacer.addEventListener('click', TC.recorte.rehacerTrazo);
  btnCancelar.addEventListener('click', TC.recorte.cerrar);

  TC.on('recorte', function () {
    btnAplicar.disabled = !puedeAplicar();
  });

})(window.TC);
