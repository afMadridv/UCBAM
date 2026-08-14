/* ===========================================================
   UCBAM · texto.js
   Capas de texto: fuente, tamaño, color, negrita, cursiva,
   alineación y contorno. Se dibujan con fillText, así que
   escalan sin perder nitidez.
   =========================================================== */

(function (TC) {
  'use strict';

  /* Familias que existen en cualquier equipo, sin descargar nada */
  TC.FUENTES = [
    { id: 'sans',    nombre: 'Sans',        css: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
    { id: 'serif',   nombre: 'Serif',       css: 'Georgia, "Times New Roman", serif' },
    { id: 'mono',    nombre: 'Monoespacio', css: '"Consolas", "Courier New", monospace' },
    { id: 'titular', nombre: 'Titular',     css: 'Impact, "Arial Black", sans-serif' },
    { id: 'redonda', nombre: 'Redonda',     css: '"Trebuchet MS", Verdana, sans-serif' },
    { id: 'manu',    nombre: 'Manuscrita',  css: '"Segoe Script", "Comic Sans MS", cursive' },
    { id: 'estrecha',nombre: 'Estrecha',    css: '"Arial Narrow", "Haettenschweiler", sans-serif' },
    { id: 'clasica', nombre: 'Clásica',     css: 'Palatino, "Book Antiqua", Garamond, serif' }
  ];

  TC.texto = TC.texto || {};

  /* Estilo con el que nace el próximo texto */
  TC.texto.opciones = {
    familia: 'sans', tamano: 92, color: '#ffffff',
    negrita: true, cursiva: false, alineacion: 'centro'
  };

  const medidor = document.createElement('canvas').getContext('2d');

  function cssFuente (capa, tamano) {
    const f = TC.FUENTES.find(x => x.id === capa.familia) || TC.FUENTES[0];
    return (capa.cursiva ? 'italic ' : '') + (capa.negrita ? '700 ' : '400 ') +
      tamano + 'px ' + f.css;
  }

  /** Mide el bloque de texto al tamaño base. */
  function medir (capa) {
    medidor.font = cssFuente(capa, capa.tamano);
    const lineas = String(capa.texto || ' ').split('\n');
    let ancho = 0;
    lineas.forEach(function (l) {
      ancho = Math.max(ancho, medidor.measureText(l.length ? l : ' ').width);
    });
    return {
      lineas: lineas,
      ancho: Math.max(12, ancho),
      alto: Math.max(capa.tamano, lineas.length * capa.tamano * capa.interlineado)
    };
  }

  /** Recalcula la caja conservando la escala que el usuario le dio. */
  TC.texto.remedir = function (capa) {
    const escala = capa.anchoBase ? capa.ancho / capa.anchoBase : 1;
    const m = medir(capa);
    capa.anchoBase = m.ancho;
    capa.altoBase = m.alto;
    capa.ancho = m.ancho * escala;
    capa.alto = m.alto * escala;
    capa.anchoNatural = capa.ancho;
    capa.altoNatural = capa.alto;
    return m;
  };

  /* -------------------------------------------------------
     Pintado
     ------------------------------------------------------- */

  TC.texto.pintar = function (c, capa) {
    const m = medir(capa);
    const ex = capa.ancho / (capa.anchoBase || m.ancho);
    const ey = capa.alto / (capa.altoBase || m.alto);

    c.save();
    c.translate(capa.x, capa.y);
    c.rotate(capa.rot);
    c.scale(ex, ey);
    c.translate(-(capa.anchoBase || m.ancho) / 2, -(capa.altoBase || m.alto) / 2);

    c.font = cssFuente(capa, capa.tamano);
    c.textBaseline = 'top';
    c.textAlign = capa.alineacion === 'izquierda' ? 'left'
      : capa.alineacion === 'derecha' ? 'right' : 'center';
    const x = capa.alineacion === 'izquierda' ? 0
      : capa.alineacion === 'derecha' ? (capa.anchoBase || m.ancho)
      : (capa.anchoBase || m.ancho) / 2;

    m.lineas.forEach(function (linea, i) {
      const y = i * capa.tamano * capa.interlineado;
      if (capa.borde && capa.borde.activo) {
        c.lineWidth = capa.borde.grosor;
        c.lineJoin = 'round';
        c.strokeStyle = capa.borde.color;
        c.strokeText(linea, x, y);
      }
      c.fillStyle = capa.color;
      c.fillText(linea, x, y);
    });

    c.restore();
  };

  /* -------------------------------------------------------
     Crear y editar
     ------------------------------------------------------- */

  TC.texto.crear = function (x, y, texto) {
    const o = TC.texto.opciones;
    const est = TC.estado;
    const capa = {
      id: TC.nuevoId('capa'),
      nombre: 'Texto ' + String(est.capas.length + 1).padStart(2, '0'),
      tipo: 'texto',
      texto: texto || 'Escribí acá',
      familia: o.familia,
      tamano: o.tamano,
      color: o.color,
      negrita: o.negrita,
      cursiva: o.cursiva,
      alineacion: o.alineacion,
      interlineado: 1.22,
      x: x != null ? x : est.lienzo.ancho / 2,
      y: y != null ? y : est.lienzo.alto / 2,
      ancho: 100, alto: 100, anchoBase: 100, altoBase: 100,
      anchoNatural: 100, altoNatural: 100,
      rot: 0,
      visible: true,
      borde: { activo: false, color: '#101820', grosor: 6 }
    };
    TC.texto.remedir(capa);
    capa.miniatura = TC.canvas.miniaturaDeCapa(capa);
    TC.canvas.agregarCapaLista(capa, 'agregar texto');
    TC.texto.editar();
    return capa;
  };

  TC.texto.clic = function (p) {
    TC.texto.crear(p.x, p.y);
    TC.estado.herramienta = 'mover';
    TC.emitir('herramienta');
  };

  /** Manda el foco al cuadro de escritura del panel. */
  TC.texto.editar = function () {
    const caja = document.getElementById('texto-contenido');
    if (!caja) return;
    caja.focus();
    caja.select();
  };

  /** Aplica un cambio de estilo y refresca la capa. */
  TC.texto.cambiar = function (props, etiqueta) {
    const capa = TC.capaActiva();
    if (!capa || capa.tipo !== 'texto') return;
    Object.assign(capa, props);
    Object.assign(TC.texto.opciones, {
      familia: capa.familia, tamano: capa.tamano, color: capa.color,
      negrita: capa.negrita, cursiva: capa.cursiva, alineacion: capa.alineacion
    });
    TC.texto.remedir(capa);
    capa.miniatura = TC.canvas.miniaturaDeCapa(capa);
    if (etiqueta) TC.registrar(etiqueta);
    TC.actualizar();
  };

})(window.TC);
