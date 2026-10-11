import qrcode from 'qrcode-generator';
import { escapeHtml as e } from './format.js';

// Printable US Letter window sign. The QR code is generated here, in-process.
// Nothing about the customer or the business is sent to any outside service.
export function renderSign(config) {
  const qr = qrcode(0, 'M');
  qr.addData(config.business.publicUrl);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(config.business.name)} · Pásale</title>
<link rel="stylesheet" href="/sign.css">
</head>
<body>
<p class="screen-note">Print this page on US Letter paper (Ctrl/Cmd + P) and tape it in your window.</p>
<main class="sheet">
<h1>COME BY.<br>PÁSALE.</h1>
<p class="biz">${e(config.business.name)}</p>
<div class="qr" role="img" aria-label="QR code for ${e(config.business.publicUrl)}">${svg}</div>
<p class="url">${e(config.business.publicUrl)}</p>
<div class="cols">
<section lang="en"><h2>Ask for a visit</h2><ol><li>Scan the code with your phone camera.</li><li>Pick what you need and a time.</li><li>We will call or text you to confirm.</li></ol></section>
<section lang="es"><h2>Pide tu cita</h2><ol><li>Escanea el código con la cámara de tu teléfono.</li><li>Elige qué necesitas y una hora.</li><li>Te llamamos o te escribimos para confirmar.</li></ol></section>
</div>
</main>
</body>
</html>`;
}
