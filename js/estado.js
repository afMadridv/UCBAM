/* ===========================================================
   UCBAM · estado.js
   Estado central, formatos de lienzo, historial (deshacer/rehacer)
   y utilidades compartidas. Todo vive en memoria: al cerrar la
   pestaña no queda nada guardado.
   =========================================================== */

window.TC = window.TC || {};

(function (TC) {
  'use strict';

  /* -------------------------------------------------------
     Formatos de lienzo
     ------------------------------------------------------- */
  TC.FORMATOS = [
    {
      grupo: 'Redes sociales',
      items: [
        { id: 'ig-post',    nombre: 'Instagram · Publicación', ancho: 1080, alto: 1080 },
        { id: 'ig-retrato', nombre: 'Instagram · Retrato',     ancho: 1080, alto: 1350 },
        { id: 'ig-historia',nombre: 'Instagram · Historia',    ancho: 1080, alto: 1920 },
        { id: 'fb',         nombre: 'Facebook · Publicación',  ancho: 1200, alto: 630  },
        { id: 'x',          nombre: 'X · Publicación',         ancho: 1600, alto: 900  },
        { id: 'pinterest',  nombre: 'Pinterest · Pin',         ancho: 1000, alto: 1500 },
        { id: 'youtube',    nombre: 'YouTube · Miniatura',     ancho: 1280, alto: 720  },
        { id: 'wsp',        nombre: 'WhatsApp · Estado',       ancho: 1080, alto: 1920 }
      ]
    },
    {
      grupo: 'Fondo de pantalla',
      items: [
        { id: 'fhd',      nombre: 'Escritorio · Full HD',   ancho: 1920, alto: 1080 },
        { id: 'qhd',      nombre: 'Escritorio · 2K QHD',    ancho: 2560, alto: 1440 },
        { id: 'uhd',      nombre: 'Escritorio · 4K UHD',    ancho: 3840, alto: 2160 },
        { id: 'ultra',    nombre: 'Escritorio · Ultrawide', ancho: 3440, alto: 1440 },
        { id: 'movil',    nombre: 'Móvil · Full HD+',       ancho: 1080, alto: 2340 },
        { id: 'movil2k',  nombre: 'Móvil · 2K',             ancho: 1440, alto: 3120 },
        { id: 'tablet',   nombre: 'Tablet · 4:3',           ancho: 2048, alto: 1536 }
      ]
    },
    {
      grupo: 'Impresión y otros',
      items: [
        { id: 'a4v',   nombre: 'A4 vertical · 300 ppp',   ancho: 2480, alto: 3508 },
        { id: 'a4h',   nombre: 'A4 horizontal · 300 ppp', ancho: 3508, alto: 2480 },
        { id: 'foto',  nombre: 'Foto 15 × 10 · 300 ppp',  ancho: 1800, alto: 1200 },
        { id: 'cuad2k',nombre: 'Cuadrado grande',         ancho: 2048, alto: 2048 }
      ]
    }
  ];

  TC.buscarFormato = function (ancho, alto) {
    for (const g of TC.FORMATOS) {
      for (const f of g.items) if (f.ancho === ancho && f.alto === alto) return f;
    }
    return null;
  };

  /* -------------------------------------------------------
     Estado
     ------------------------------------------------------- */
  TC.estado = {
    lienzo: { ancho: 1080, alto: 1080, nombre: 'Instagram · Publicación' },
    fondo:  { tipo: 'color', color: '#1d2b3a', imagen: null },
    fotos:  [],            // { id, nombre, img, ancho, alto, miniatura }
    capas:  [],            // orden ascendente: el último del array se dibuja arriba
    seleccion: null,       // id de la capa seleccionada
    herramienta: 'mover',  // mover | recorte | rotar
    fotoActiva: null       // id de la foto en la mesa de recorte
  };

  /* Preferencias de borde para el próximo recorte */
  TC.bordePorDefecto = { activo: false, color: '#ffffff', grosor: 8 };

  let contador = 0;
  TC.nuevoId = function (prefijo) {
    contador += 1;
    return prefijo + '-' + contador.toString(36) + Date.now().toString(36).slice(-3);
  };

  TC.capaPorId = function (id) {
    return TC.estado.capas.find(c => c.id === id) || null;
  };
  TC.capaActiva = function () {
    return TC.estado.seleccion ? TC.capaPorId(TC.estado.seleccion) : null;
  };
  TC.fotoPorId = function (id) {
    return TC.estado.fotos.find(f => f.id === id) || null;
  };

  /* -------------------------------------------------------
     Eventos internos muy simples
     ------------------------------------------------------- */
  const oyentes = {};
  TC.on = function (evento, fn) {
    (oyentes[evento] = oyentes[evento] || []).push(fn);
  };
  TC.emitir = function (evento, datos) {
    (oyentes[evento] || []).forEach(fn => fn(datos));
  };
  /* Redibuja lienzo + panel */
  TC.actualizar = function () { TC.emitir('cambio'); };

  /* -------------------------------------------------------
     Historial · deshacer / rehacer
     Guarda fotos de la estructura de capas (metadatos), nunca
     los píxeles: el canvas recortado se comparte por referencia.
     Cada registro = un movimiento. Deshacer vuelve UN paso.
     ------------------------------------------------------- */
  TC.historial = { pila: [], indice: -1, limite: 80 };

  function copiarCapa (c) {
    const copia = Object.assign({}, c);
    copia.borde = Object.assign({}, c.borde);
    delete copia._cache;      // el cache de escalado se regenera solo
    delete copia._path;
    return copia;
  }

  function instantanea () {
    const e = TC.estado;
    return {
      capas: e.capas.map(copiarCapa),
      lienzo: Object.assign({}, e.lienzo),
      fondo: Object.assign({}, e.fondo),
      seleccion: e.seleccion
    };
  }

  function aplicar (snap) {
    const e = TC.estado;
    e.capas = snap.capas.map(copiarCapa);
    e.lienzo = Object.assign({}, snap.lienzo);
    e.fondo = Object.assign({}, snap.fondo);
    e.seleccion = snap.seleccion && snap.capas.some(c => c.id === snap.seleccion)
      ? snap.seleccion : null;
  }

  /** Registra el estado actual como un paso del historial. */
  TC.registrar = function (etiqueta) {
    const h = TC.historial;
    h.pila = h.pila.slice(0, h.indice + 1);
    h.pila.push({ etiqueta: etiqueta || 'cambio', datos: instantanea() });
    if (h.pila.length > h.limite) h.pila.shift();
    h.indice = h.pila.length - 1;
    TC.emitir('historial');
  };

  TC.puedeDeshacer = function () { return TC.historial.indice > 0; };
  TC.puedeRehacer  = function () { return TC.historial.indice < TC.historial.pila.length - 1; };

  /** Deshace únicamente el último movimiento. */
  TC.deshacer = function () {
    if (!TC.puedeDeshacer()) return false;
    TC.historial.indice -= 1;
    aplicar(TC.historial.pila[TC.historial.indice].datos);
    TC.emitir('historial');
    TC.actualizar();
    return true;
  };

  TC.rehacer = function () {
    if (!TC.puedeRehacer()) return false;
    TC.historial.indice += 1;
    aplicar(TC.historial.pila[TC.historial.indice].datos);
    TC.emitir('historial');
    TC.actualizar();
    return true;
  };

  TC.etiquetaDeshacer = function () {
    const h = TC.historial;
    return h.indice > 0 ? h.pila[h.indice].etiqueta : null;
  };

  TC.reiniciarHistorial = function () {
    TC.historial.pila = [];
    TC.historial.indice = -1;
    TC.registrar('inicio');
  };

  /* -------------------------------------------------------
     Utilidades
     ------------------------------------------------------- */
  TC.util = {};

  TC.util.limitar = function (v, min, max) { return Math.min(max, Math.max(min, v)); };

  TC.util.rotarPunto = function (x, y, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return { x: x * c - y * s, y: x * s + y * c };
  };

  /**
   * Traza una curva suave que pasa por los puntos usando curvas
   * cuadráticas entre puntos medios. Evita el borde dentado que
   * deja el trazo a pulso.
   * @param {CanvasRenderingContext2D|Path2D} destino
   * @param {Array<[number,number]>} pts
   * @param {boolean} cerrado
   */
  TC.util.trazarSuave = function (destino, pts, cerrado) {
    const n = pts.length;
    if (n === 0) return;
    if (n < 3) {
      destino.moveTo(pts[0][0], pts[0][1]);
      if (n === 2) destino.lineTo(pts[1][0], pts[1][1]);
      if (cerrado) destino.closePath();
      return;
    }
    const medio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

    if (cerrado) {
      const m0 = medio(pts[n - 1], pts[0]);
      destino.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) {
        const p = pts[i], sig = pts[(i + 1) % n], m = medio(p, sig);
        destino.quadraticCurveTo(p[0], p[1], m[0], m[1]);
      }
      destino.closePath();
    } else {
      destino.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) {
        const m = medio(pts[i], pts[i + 1]);
        destino.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
      }
      destino.lineTo(pts[n - 1][0], pts[n - 1][1]);
    }
  };

  /**
   * Reduce una imagen/canvas por mitades sucesivas hasta el tamaño
   * pedido. Da mucha mejor calidad que un solo drawImage cuando la
   * reducción es grande (que es justo lo que pasa al meter una foto
   * de 4000 px en una capa de 400 px).
   */
  TC.util.reducir = function (fuente, anchoDest, altoDest) {
    anchoDest = Math.max(1, Math.round(anchoDest));
    altoDest = Math.max(1, Math.round(altoDest));
    let origen = fuente;
    let w = fuente.width, h = fuente.height;

    while (w / 2 > anchoDest && h / 2 > altoDest) {
      w = Math.max(anchoDest, Math.floor(w / 2));
      h = Math.max(altoDest, Math.floor(h / 2));
      const paso = document.createElement('canvas');
      paso.width = w; paso.height = h;
      const c = paso.getContext('2d');
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(origen, 0, 0, w, h);
      origen = paso;
    }

    const salida = document.createElement('canvas');
    salida.width = anchoDest; salida.height = altoDest;
    const ctx = salida.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(origen, 0, 0, anchoDest, altoDest);
    return salida;
  };

  /** Miniatura cuadrada para el panel. */
  TC.util.miniatura = function (fuente, lado) {
    lado = lado || 64;
    const k = Math.min(lado / fuente.width, lado / fuente.height);
    const w = Math.max(1, Math.round(fuente.width * k));
    const h = Math.max(1, Math.round(fuente.height * k));
    const chico = TC.util.reducir(fuente, w, h);
    const salida = document.createElement('canvas');
    salida.width = lado; salida.height = lado;
    const ctx = salida.getContext('2d');
    ctx.drawImage(chico, (lado - w) / 2, (lado - h) / 2);
    return salida.toDataURL('image/png');
  };

  /* Lado máximo al que se guardan las fotos subidas. Suficiente para
     un lienzo 4K y evita reventar la memoria con 30 fotos abiertas. */
  TC.LADO_MAXIMO_FOTO = 4600;

  /** Carga un File como foto del proyecto. Devuelve una promesa. */
  TC.cargarArchivo = function (archivo) {
    return new Promise(function (resolver, rechazar) {
      if (!archivo || !/^image\//.test(archivo.type)) {
        rechazar(new Error('El archivo no es una imagen')); return;
      }
      const lector = new FileReader();
      lector.onerror = () => rechazar(new Error('No se pudo leer el archivo'));
      lector.onload = function () {
        const img = new Image();
        img.onerror = () => rechazar(new Error('No se pudo abrir la imagen'));
        img.onload = function () {
          let fuente = img;
          const lado = Math.max(img.naturalWidth, img.naturalHeight);
          if (lado > TC.LADO_MAXIMO_FOTO) {
            const k = TC.LADO_MAXIMO_FOTO / lado;
            fuente = TC.util.reducir(img, img.naturalWidth * k, img.naturalHeight * k);
          }
          resolver({
            id: TC.nuevoId('foto'),
            nombre: archivo.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Foto',
            img: fuente,
            ancho: fuente.width,
            alto: fuente.height,
            miniatura: TC.util.miniatura(fuente, 96)
          });
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  };

})(window.TC);
