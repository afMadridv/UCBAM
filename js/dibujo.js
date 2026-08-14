/* ===========================================================
   UCBAM · dibujo.js
   Pincel libre sobre el collage. Los trazos se guardan como
   vectores (puntos + color + grosor), no como píxeles: la capa
   se puede agrandar todo lo que quieras sin que se pixele.
   =========================================================== */

(function (TC) {
  'use strict';

  /* Puntas disponibles. Cada una es un preset de opacidad y remate. */
  TC.PUNTAS = [
    { id: 'pincel',   nombre: 'Pincel',   alfa: 1,   remate: 'round',  factor: 1 },
    { id: 'marcador', nombre: 'Marcador', alfa: 0.42, remate: 'round', factor: 2.1 },
    { id: 'lapiz',    nombre: 'Lápiz',    alfa: 0.9, remate: 'round',  factor: 0.45 },
    { id: 'neon',     nombre: 'Neón',     alfa: 1,   remate: 'round',  factor: 1, brillo: true }
  ];

  TC.dibujo = TC.dibujo || {};

  /* Opciones activas del pincel */
  TC.dibujo.opciones = { punta: 'pincel', color: '#e8c25b', grosor: 14 };

  let capaActual = null;    // capa de la sesión en curso
  let trazo = null;         // trazo que se está dibujando

  function puntaPorId (id) {
    return TC.PUNTAS.find(p => p.id === id) || TC.PUNTAS[0];
  }

  /* -------------------------------------------------------
     Pintado
     ------------------------------------------------------- */

  TC.dibujo.pintar = function (c, capa) {
    if (!capa.trazos || !capa.trazos.length) return;
    const ex = capa.ancho / capa.papelAncho;
    const ey = capa.alto / capa.papelAlto;

    c.save();
    c.translate(capa.x, capa.y);
    c.rotate(capa.rot);
    c.scale(ex, ey);
    c.translate(-capa.papelAncho / 2, -capa.papelAlto / 2);
    c.lineJoin = 'round';

    capa.trazos.forEach(function (t) {
      const punta = puntaPorId(t.punta);
      const path = new Path2D();
      if (t.puntos.length === 1) {
        const p = t.puntos[0];
        path.arc(p[0], p[1], Math.max(0.4, t.grosor / 2), 0, Math.PI * 2);
        c.fillStyle = t.color;
        c.globalAlpha = punta.alfa;
        c.fill(path);
        return;
      }
      TC.util.trazarSuave(path, t.puntos, false);
      c.globalAlpha = punta.alfa;
      c.strokeStyle = t.color;
      c.lineCap = punta.remate;
      if (punta.brillo) {
        c.shadowColor = t.color;
        c.shadowBlur = t.grosor * 1.4;
      } else {
        c.shadowBlur = 0;
      }
      c.lineWidth = t.grosor;
      c.stroke(path);
      if (punta.brillo) {
        c.shadowBlur = 0;
        c.globalAlpha = 1;
        c.lineWidth = Math.max(1, t.grosor * 0.35);
        c.strokeStyle = '#ffffff';
        c.stroke(path);
      }
    });

    c.globalAlpha = 1;
    c.shadowBlur = 0;
    c.restore();
  };

  /* -------------------------------------------------------
     Sesión de dibujo
     ------------------------------------------------------- */

  TC.dibujo.dibujando = function () { return trazo !== null; };

  /** Corta la sesión: el próximo trazo abre una capa nueva. */
  TC.dibujo.cerrarSesion = function () {
    capaActual = null;
    trazo = null;
  };

  function nuevaCapa () {
    const est = TC.estado;
    const capa = {
      id: TC.nuevoId('capa'),
      nombre: 'Dibujo ' + String(est.capas.length + 1).padStart(2, '0'),
      tipo: 'dibujo',
      trazos: [],
      papelAncho: est.lienzo.ancho,
      papelAlto: est.lienzo.alto,
      x: est.lienzo.ancho / 2,
      y: est.lienzo.alto / 2,
      ancho: est.lienzo.ancho,
      alto: est.lienzo.alto,
      anchoNatural: est.lienzo.ancho,
      altoNatural: est.lienzo.alto,
      rot: 0,
      visible: true,
      borde: { activo: false, color: '#ffffff', grosor: 8 },
      miniatura: null
    };
    est.capas.push(capa);
    est.seleccion = capa.id;
    return capa;
  }

  /** Recalcula el rectángulo de la capa a partir de sus trazos. */
  function ajustarCaja (capa) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    capa.trazos.forEach(function (t) {
      const m = t.grosor / 2 + (puntaPorId(t.punta).brillo ? t.grosor : 2);
      t.puntos.forEach(function (p) {
        if (p[0] - m < minX) minX = p[0] - m;
        if (p[0] + m > maxX) maxX = p[0] + m;
        if (p[1] - m < minY) minY = p[1] - m;
        if (p[1] + m > maxY) maxY = p[1] + m;
      });
    });
    if (minX === Infinity) return;

    /* los puntos se reubican para que el origen del papel sea la caja */
    capa.trazos.forEach(function (t) {
      t.puntos = t.puntos.map(p => [p[0] - minX, p[1] - minY]);
    });
    capa.papelAncho = Math.max(1, maxX - minX);
    capa.papelAlto = Math.max(1, maxY - minY);
    capa.ancho = capa.papelAncho;
    capa.alto = capa.papelAlto;
    capa.anchoNatural = capa.ancho;
    capa.altoNatural = capa.alto;
    capa.x = minX + capa.papelAncho / 2;
    capa.y = minY + capa.papelAlto / 2;
  }

  /* Mientras se dibuja, los puntos van en coordenadas del lienzo.
     Al soltar se pasan a coordenadas del papel de la capa. */
  function aPapel (capa, p) {
    return [p.x - (capa.x - capa.papelAncho / 2), p.y - (capa.y - capa.papelAlto / 2)];
  }

  TC.dibujo.abajo = function (p) {
    if (!capaActual || !TC.capaPorId(capaActual.id)) capaActual = nuevaCapa();
    const o = TC.dibujo.opciones;
    const punta = puntaPorId(o.punta);
    trazo = {
      punta: o.punta,
      color: o.color,
      grosor: Math.max(0.5, o.grosor * punta.factor),
      puntos: [aPapel(capaActual, p)]
    };
    capaActual.trazos.push(trazo);
    TC.canvas.render();
  };

  /** Descarta el trazo a medias (por ejemplo al entrar el segundo dedo). */
  TC.dibujo.cancelarTrazo = function () {
    if (!trazo || !capaActual) return;
    const i = capaActual.trazos.indexOf(trazo);
    if (i >= 0) capaActual.trazos.splice(i, 1);
    trazo = null;
    if (!capaActual.trazos.length) {
      const j = TC.estado.capas.indexOf(capaActual);
      if (j >= 0) TC.estado.capas.splice(j, 1);
      capaActual = null;
    }
    TC.canvas.render();
  };

  TC.dibujo.mover = function (p) {
    if (!trazo) return;
    const q = aPapel(capaActual, p);
    const ultimo = trazo.puntos[trazo.puntos.length - 1];
    if (Math.hypot(q[0] - ultimo[0], q[1] - ultimo[1]) * TC.vista.escala < 2) return;
    trazo.puntos.push(q);
    TC.canvas.render();
  };

  TC.dibujo.arriba = function () {
    if (!trazo) return;
    trazo = null;
    ajustarCaja(capaActual);
    capaActual.miniatura = TC.canvas.miniaturaDeCapa(capaActual);
    TC.registrar('trazo de pincel');
    TC.actualizar();
  };

  /** Borra el último trazo de la capa seleccionada. */
  TC.dibujo.borrarUltimoTrazo = function () {
    const capa = TC.capaActiva();
    if (!capa || capa.tipo !== 'dibujo' || !capa.trazos.length) return;
    capa.trazos.pop();
    if (!capa.trazos.length) {
      TC.canvas.eliminarCapa(capa.id);
      capaActual = null;
      return;
    }
    ajustarCaja(capa);
    capa.miniatura = TC.canvas.miniaturaDeCapa(capa);
    TC.registrar('borrar trazo');
    TC.actualizar();
  };

  TC.on('herramienta', function () {
    if (TC.estado.herramienta !== 'pincel') TC.dibujo.cerrarSesion();
  });

})(window.TC);
