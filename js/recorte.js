/* ===========================================================
   UCBAM · recorte.js
   Herramienta de lápiz a mano alzada. El usuario dibuja un trazo
   punto por punto sobre la foto; al cerrarlo, esa silueta se
   recorta con Path2D + clip() y se convierte en una capa nueva.
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

  const DIST_MIN = 2.2;        // separación mínima entre puntos, en px de pantalla
  const RADIO_CIERRE = 16;     // qué tan cerca del inicio hay que volver para cerrar
  const PUNTOS_MIN_CIERRE = 24;
  const LADO_MAXIMO_RECORTE = 4200;

  let foto = null;             // foto en edición
  let rect = null;             // {x, y, ancho, alto, k} de la foto en pantalla
  let puntos = [];
  let cerrado = false;
  let dibujando = false;
  let animacion = null;
  let desfase = 0;

  TC.recorte = TC.recorte || {};
  TC.recorte.activo = function () { return foto !== null; };
  TC.recorte.borde = { activo: false, color: '#ffffff', grosor: 8 };

  /* -------------------------------------------------------
     Abrir / cerrar el modo recorte
     ------------------------------------------------------- */

  TC.recorte.abrir = function (nuevaFoto) {
    if (!nuevaFoto) return;
    foto = nuevaFoto;
    puntos = [];
    cerrado = false;
    dibujando = false;

    zona.scrollTop = 0; zona.scrollLeft = 0;
    zona.style.overflow = 'hidden';
    capa.classList.remove('oculto');
    barra.classList.remove('oculto');
    document.getElementById('vacio').classList.add('oculto');

    calcularRect();
    pintar();
    if (!animacion) animacion = requestAnimationFrame(bucle);
    TC.emitir('recorte');
    TC.canvas.render();
  };

  TC.recorte.cerrar = function () {
    foto = null;
    puntos = [];
    cerrado = false;
    dibujando = false;
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
    return { activo: !!foto, puntos: puntos.length, cerrado: cerrado };
  };

  /* -------------------------------------------------------
     Geometría de la foto en pantalla
     ------------------------------------------------------- */

  function calcularRect () {
    if (!foto) return;
    const r = zona.getBoundingClientRect();
    const anchoDisp = Math.max(80, r.width - 60);
    const altoDisp = Math.max(80, r.height - 120);   // deja aire para la barra
    const k = Math.min(anchoDisp / foto.ancho, altoDisp / foto.alto, 1.6);
    const w = foto.ancho * k, h = foto.alto * k;
    rect = { x: (r.width - w) / 2, y: (r.height - h) / 2 - 14, ancho: w, alto: h, k: k };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    capa.width = Math.round(r.width * dpr);
    capa.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  TC.recorte.ajustarLienzo = function () {
    if (!foto) return;
    /* al cambiar el tamaño de la ventana el trazo se reescala con la foto */
    const anterior = rect;
    calcularRect();
    if (anterior && puntos.length) {
      puntos = puntos.map(function (p) {
        const u = (p[0] - anterior.x) / anterior.ancho;
        const v = (p[1] - anterior.y) / anterior.alto;
        return [rect.x + u * rect.ancho, rect.y + v * rect.alto];
      });
    }
    pintar();
  };

  /* -------------------------------------------------------
     Dibujo del overlay
     ------------------------------------------------------- */

  function pintar () {
    if (!foto || !rect) return;
    const anchoCSS = capa.clientWidth, altoCSS = capa.clientHeight;

    ctx.clearRect(0, 0, anchoCSS, altoCSS);
    ctx.fillStyle = 'rgba(14,22,32,.82)';
    ctx.fillRect(0, 0, anchoCSS, altoCSS);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(foto.img, rect.x, rect.y, rect.ancho, rect.alto);

    if (puntos.length > 1) {
      const trazo = new Path2D();
      TC.util.trazarSuave(trazo, puntos, cerrado);

      if (cerrado) {
        /* oscurece todo lo que queda fuera de la silueta */
        const mascara = new Path2D();
        mascara.rect(0, 0, anchoCSS, altoCSS);
        mascara.addPath(trazo);
        ctx.save();
        ctx.fillStyle = 'rgba(14,22,32,.62)';
        ctx.fill(mascara, 'evenodd');
        ctx.restore();

        if (TC.recorte.borde.activo) {
          ctx.save();
          ctx.lineWidth = Math.max(1, TC.recorte.borde.grosor * rect.k * escalaBordeVista());
          ctx.lineJoin = ctx.lineCap = 'round';
          ctx.strokeStyle = TC.recorte.borde.color;
          ctx.stroke(trazo);
          ctx.restore();
        }
      }

      ctx.save();
      ctx.lineWidth = 2;
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(20,28,38,.85)';
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -desfase;
      ctx.stroke(trazo);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -desfase + 0.5;
      ctx.stroke(trazo);
      ctx.restore();

      /* punto de inicio: marca dónde hay que volver para cerrar */
      if (!cerrado) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(puntos[0][0], puntos[0][1], RADIO_CIERRE / 2.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.fill();
        ctx.strokeStyle = '#4a7aa7';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    } else if (!dibujando) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '13px "Segoe UI", Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Dibujá alrededor de lo que querés recortar y volvé al punto de inicio',
        anchoCSS / 2, rect.y + rect.alto + 26);
      ctx.restore();
    }
  }

  /* Cuánto medirá el borde en pantalla: el grosor está en px de lienzo,
     y la capa entra al lienzo reducida. Aproximación para la vista previa. */
  function escalaBordeVista () {
    const lim = 0.62;
    const est = TC.estado;
    const k = Math.min(1,
      (est.lienzo.ancho * lim) / (foto.ancho),
      (est.lienzo.alto * lim) / (foto.alto));
    return 1 / Math.max(k, 0.05) * 0.35 + 0.65;
  }

  function bucle () {
    desfase = (desfase + 0.45) % 16;
    if (puntos.length > 1) pintar();
    animacion = foto ? requestAnimationFrame(bucle) : null;
  }

  /* -------------------------------------------------------
     Trazo a pulso
     ------------------------------------------------------- */

  function punto (e) {
    const r = capa.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  capa.addEventListener('pointerdown', function (e) {
    if (!foto) return;
    try { capa.setPointerCapture(e.pointerId); } catch (err) { /* puntero sintético */ }
    dibujando = true;
    cerrado = false;
    puntos = [punto(e)];
    pintar();
    TC.emitir('recorte');
    e.preventDefault();
  });

  capa.addEventListener('pointermove', function (e) {
    if (!dibujando) return;
    const p = punto(e);
    const ultimo = puntos[puntos.length - 1];
    if (Math.hypot(p[0] - ultimo[0], p[1] - ultimo[1]) < DIST_MIN) return;
    puntos.push(p);

    /* ¿volvió al punto de inicio? entonces el trazo se cierra solo */
    if (puntos.length > PUNTOS_MIN_CIERRE) {
      const d = Math.hypot(p[0] - puntos[0][0], p[1] - puntos[0][1]);
      if (d < RADIO_CIERRE) { finalizarTrazo(); return; }
    }
    pintar();
    TC.emitir('recorte');
    e.preventDefault();
  });

  function finalizarTrazo () {
    dibujando = false;
    if (puntos.length >= 6) cerrado = true;
    else { puntos = []; cerrado = false; }
    btnAplicar.disabled = !cerrado;
    pintar();
    TC.emitir('recorte');
  }

  capa.addEventListener('pointerup', finalizarTrazo);
  capa.addEventListener('pointercancel', finalizarTrazo);

  /* -------------------------------------------------------
     Aplicar el recorte
     ------------------------------------------------------- */

  TC.recorte.aplicar = function () {
    if (!foto || !cerrado || puntos.length < 6) return;

    /* pantalla -> píxeles reales de la foto */
    const enFoto = puntos.map(function (p) {
      return [
        TC.util.limitar((p[0] - rect.x) / rect.k, 0, foto.ancho),
        TC.util.limitar((p[1] - rect.y) / rect.k, 0, foto.alto)
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

    let anchoRec = Math.max(2, maxX - minX);
    let altoRec = Math.max(2, maxY - minY);

    /* si el recorte es enorme se limita, manteniendo la proporción */
    let escala = 1;
    const mayor = Math.max(anchoRec, altoRec);
    if (mayor > LADO_MAXIMO_RECORTE) escala = LADO_MAXIMO_RECORTE / mayor;

    const salida = document.createElement('canvas');
    salida.width = Math.max(2, Math.round(anchoRec * escala));
    salida.height = Math.max(2, Math.round(altoRec * escala));
    const c = salida.getContext('2d');

    const contorno = enFoto.map(p => [(p[0] - minX) * escala, (p[1] - minY) * escala]);
    const forma = new Path2D();
    TC.util.trazarSuave(forma, contorno, true);

    c.save();
    c.clip(forma);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(
      foto.img,
      minX, minY, anchoRec, altoRec,
      0, 0, salida.width, salida.height
    );
    c.restore();

    const borde = {
      activo: TC.recorte.borde.activo,
      color: TC.recorte.borde.color,
      grosor: TC.recorte.borde.grosor
    };

    const nombre = foto.nombre.slice(0, 18) + ' ' +
      String(TC.estado.capas.length + 1).padStart(2, '0');
    TC.canvas.agregarCapa(salida, contorno, nombre, borde);

    TC.estado.herramienta = 'mover';
    TC.emitir('herramienta');
    TC.recorte.cerrar();
  };

  btnAplicar.addEventListener('click', TC.recorte.aplicar);
  btnRehacer.addEventListener('click', TC.recorte.rehacerTrazo);
  btnCancelar.addEventListener('click', TC.recorte.cerrar);

  TC.on('recorte', function () {
    btnAplicar.disabled = !cerrado;
  });

})(window.TC);
