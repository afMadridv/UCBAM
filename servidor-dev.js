/* Servidor estático mínimo, sólo para probar UCBAM en el navegador.
   No forma parte de la app: index.html también funciona con doble clic.
   Uso:  node servidor-dev.js   ->   http://localhost:5177 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = 5177;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

http.createServer(function (req, res) {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';
  const archivo = path.join(__dirname, path.normalize(ruta).replace(/^([\\/])+/, ''));
  if (!archivo.startsWith(__dirname)) { res.writeHead(403).end('403'); return; }
  fs.readFile(archivo, function (err, datos) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
    res.end(datos);
  });
}).listen(PUERTO, () => console.log('UCBAM en http://localhost:' + PUERTO));
