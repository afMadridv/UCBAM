/* ===========================================================
   UCBAM · texto.js
   Capas de texto: fuente, tamaño, color, negrita, cursiva,
   alineación y contorno. Se dibujan con fillText, así que
   escalan sin perder nitidez.
   =========================================================== */

(function (TC) {
  'use strict';

  /* Familias del sistema, sin descargar nada. Agrupadas para el selector.
     Cada pila termina en una genérica, así siempre hay con qué dibujar. */
  TC.FUENTES = [
    /* --- de palo seco --- */
    { id: 'sans',     grupo: 'Sin serifa', nombre: 'Sans',          css: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
    { id: 'arial',    grupo: 'Sin serifa', nombre: 'Arial',         css: 'Arial, Helvetica, sans-serif' },
    { id: 'verdana',  grupo: 'Sin serifa', nombre: 'Verdana',       css: 'Verdana, Geneva, sans-serif' },
    { id: 'tahoma',   grupo: 'Sin serifa', nombre: 'Tahoma',        css: 'Tahoma, Geneva, sans-serif' },
    { id: 'redonda',  grupo: 'Sin serifa', nombre: 'Trebuchet',     css: '"Trebuchet MS", Verdana, sans-serif' },
    { id: 'calibri',  grupo: 'Sin serifa', nombre: 'Calibri',       css: 'Calibri, Candara, sans-serif' },
    { id: 'candara',  grupo: 'Sin serifa', nombre: 'Candara',       css: 'Candara, Corbel, sans-serif' },
    { id: 'corbel',   grupo: 'Sin serifa', nombre: 'Corbel',        css: 'Corbel, Candara, sans-serif' },
    { id: 'century',  grupo: 'Sin serifa', nombre: 'Century Gothic',css: '"Century Gothic", "Apple Gothic", sans-serif' },
    { id: 'estrecha', grupo: 'Sin serifa', nombre: 'Estrecha',      css: '"Arial Narrow", "Liberation Sans Narrow", sans-serif' },
    { id: 'franklin', grupo: 'Sin serifa', nombre: 'Franklin',      css: '"Franklin Gothic Medium", "Arial Bold", sans-serif' },
    { id: 'optima',   grupo: 'Sin serifa', nombre: 'Optima',        css: 'Optima, Futura, "Gill Sans", sans-serif' },

    /* --- con serifa --- */
    { id: 'serif',    grupo: 'Con serifa', nombre: 'Georgia',       css: 'Georgia, "Times New Roman", serif' },
    { id: 'times',    grupo: 'Con serifa', nombre: 'Times',         css: '"Times New Roman", Times, serif' },
    { id: 'garamond', grupo: 'Con serifa', nombre: 'Garamond',      css: 'Garamond, "Apple Garamond", serif' },
    { id: 'clasica',  grupo: 'Con serifa', nombre: 'Palatino',      css: 'Palatino, "Book Antiqua", "Palatino Linotype", serif' },
    { id: 'cambria',  grupo: 'Con serifa', nombre: 'Cambria',       css: 'Cambria, Constantia, serif' },
    { id: 'bookman',  grupo: 'Con serifa', nombre: 'Bookman',       css: '"Bookman Old Style", "Bookman", serif' },
    { id: 'rockwell', grupo: 'Con serifa', nombre: 'Rockwell',      css: 'Rockwell, "Courier Bold", serif' },
    { id: 'baskerv',  grupo: 'Con serifa', nombre: 'Baskerville',   css: 'Baskerville, "Baskerville Old Face", serif' },

    /* --- para titulares --- */
    { id: 'titular',  grupo: 'Titulares',  nombre: 'Impact',        css: 'Impact, "Anton", sans-serif' },
    { id: 'black',    grupo: 'Titulares',  nombre: 'Arial Black',   css: '"Arial Black", "Arial Bold", sans-serif' },
    { id: 'haetten',  grupo: 'Titulares',  nombre: 'Condensada',    css: 'Haettenschweiler, "Impact", sans-serif' },
    { id: 'copper',   grupo: 'Titulares',  nombre: 'Copperplate',   css: 'Copperplate, "Copperplate Gothic Light", serif' },
    { id: 'stencil',  grupo: 'Titulares',  nombre: 'Stencil',       css: 'Stencil, "Showcard Gothic", sans-serif' },

    /* --- manuscritas --- */
    { id: 'manu',     grupo: 'Manuscritas',nombre: 'Manuscrita',    css: '"Segoe Script", "Bradley Hand", cursive' },
    { id: 'comic',    grupo: 'Manuscritas',nombre: 'Comic',         css: '"Comic Sans MS", "Chalkboard", cursive' },
    { id: 'brush',    grupo: 'Manuscritas',nombre: 'Pincelada',     css: '"Brush Script MT", "Segoe Script", cursive' },
    { id: 'print',    grupo: 'Manuscritas',nombre: 'Imprenta',      css: '"Segoe Print", "Bradley Hand", cursive' },
    { id: 'ink',      grupo: 'Manuscritas',nombre: 'Tinta',         css: '"Ink Free", "Segoe Script", cursive' },

    /* --- de máquina --- */
    { id: 'mono',     grupo: 'Monoespacio',nombre: 'Consolas',      css: 'Consolas, "Courier New", monospace' },
    { id: 'courier',  grupo: 'Monoespacio',nombre: 'Courier',       css: '"Courier New", Courier, monospace' },
    { id: 'lucida',   grupo: 'Monoespacio',nombre: 'Lucida',        css: '"Lucida Console", "Lucida Sans Typewriter", monospace' }
  ];

  TC.texto = TC.texto || {};

  /* Estilo con el que nace el próximo texto */
  TC.texto.opciones = {
    familia: 'sans', tamano: 92, color: '#ffffff',
    negrita: true, cursiva: false, alineacion: 'centro'
  };

  const medidor = document.createElement('canvas').getContext('2d');

  /* Se queda con las familias que el equipo tiene de verdad. Una fuente existe
     si, puesta delante de una genérica, cambia el ancho del texto respecto de
     esa genérica sola. Se prueba contra dos bases para no fallar con las
     monoespaciadas. */
  (function filtrarDisponibles () {
    const MUESTRA = 'MWmwil@1AVgQ§%';
    const GENERICAS = /^(sans-serif|serif|monospace|cursive|fantasy|system-ui)$/;

    function ancho (css) {
      medidor.font = '72px ' + css;
      return medidor.measureText(MUESTRA).width;
    }
    function existe (nombre) {
      return ['monospace', 'serif'].some(function (base) {
        return Math.abs(ancho('"' + nombre + '",' + base) - ancho(base)) > 0.5;
      });
    }

    const vistos = {};
    TC.FUENTES = TC.FUENTES.filter(function (f) {
      const primeraDelGrupo = !vistos[f.grupo];
      vistos[f.grupo] = true;
      if (primeraDelGrupo) return true;
      return f.css.split(',')
        .map(n => n.trim().replace(/^["']|["']$/g, ''))
        .filter(n => n && !GENERICAS.test(n))
        .some(existe);
    });
  })();

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
