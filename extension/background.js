// Chrome (service worker) memuat config.js lewat importScripts.
// Firefox (background scripts) sudah memuatnya dari manifest sebelum file ini.
if (typeof AIBOT_CONFIG === 'undefined' && typeof importScripts === 'function') {
  importScripts('config.js');
}

// Cross-browser shim: Firefox exposes `browser`, Chrome exposes `chrome`
var api = (typeof browser !== 'undefined') ? browser : chrome;

var API_URL = AIBOT_CONFIG.apiBaseUrl + '/ask';
var API_IMAGE_URL = AIBOT_CONFIG.apiBaseUrl + '/ask-image';
var API_KEY = AIBOT_CONFIG.apiKey;

// Server menahan lock maksimal 30 detik; beri sedikit jeda untuk jaringan.
var REQUEST_TIMEOUT_MS = 35000;
var BUSY_MESSAGE = 'masih memproses soal sebelumnya, tunggu sampai selesai';

// ── Lock: hanya satu request ke server dalam satu waktu (semua tab) ──
//
// Lock diambil SEBELUM request dikirim dan dilepas saat respons datang, dibatalkan,
// atau waktu habis. Klik/shortcut tambahan selama lock dipegang ditolak, bukan diantrekan,
// supaya satu aksi = satu panggilan API.

var lease = null; // { id, tabId, controller, timer, timedOut, kind }
var leaseSeq = 0;

function acquire(tabId, kind) {
  if (lease) return null;
  var l = { id: ++leaseSeq, tabId: tabId, controller: new AbortController(), timedOut: false, kind: kind };
  l.timer = setTimeout(function () {
    l.timedOut = true;
    l.controller.abort();
    release(l);
  }, REQUEST_TIMEOUT_MS);
  lease = l;
  return l;
}

function release(l) {
  if (lease !== l) return; // lease lama yang sudah diganti, abaikan
  clearTimeout(l.timer);
  lease = null;
}

// ── Screenshot ───────────────────────────────────────────────

api.commands.onCommand.addListener(function (command) {
  if (command !== 'capture-screenshot') return;

  api.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || !tabs[0]) return;
    var tab = tabs[0];

    // Ambil lock sekarang, sebelum capture, agar shortcut yang ditekan berulang diabaikan
    var l = acquire(tab.id, 'screenshot');
    if (!l) {
      console.info('aibot: shortcut diabaikan,', BUSY_MESSAGE);
      return;
    }

    api.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, function (dataUrl) {
      if (api.runtime.lastError || !dataUrl) {
        console.error('aibot: capture failed', api.runtime.lastError);
        release(l);
        return;
      }
      compressAndSend(l, tab.id, dataUrl);
    });
  });
});

function compressAndSend(l, tabId, dataUrl) {
  fetch(dataUrl)
    .then(function (res) { return res.blob(); })
    .then(function (blob) { return createImageBitmap(blob); })
    .then(function (bitmap) {
      var maxW = 1280;
      var scale = bitmap.width > maxW ? maxW / bitmap.width : 1;
      var canvas = new OffscreenCanvas(
        Math.round(bitmap.width * scale),
        Math.round(bitmap.height * scale)
      );
      var ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 });
    })
    .then(function (blob) {
      var reader = new FileReader();
      reader.onload = function () { sendOrInject(l, tabId, reader.result); };
      reader.readAsDataURL(blob);
    })
    .catch(function (err) {
      console.error('aibot: compress failed', err);
      release(l);
    });
}

function sendOrInject(l, tabId, dataUrl) {
  api.tabs.sendMessage(tabId, { type: 'AIBOT_SCREENSHOT', dataUrl: dataUrl }, function () {
    if (!api.runtime.lastError) return;

    // Content script belum jalan di tab ini — inject dulu lalu retry
    Promise.all([
      api.scripting.executeScript({ target: { tabId: tabId }, files: ['content.js'] }),
      api.scripting.insertCSS({ target: { tabId: tabId }, files: ['style.css'] }),
    ]).then(function () {
      setTimeout(function () {
        api.tabs.sendMessage(tabId, { type: 'AIBOT_SCREENSHOT', dataUrl: dataUrl });
      }, 150);
    }).catch(function (err) {
      console.error('aibot: inject failed', err);
      release(l);
    });
  });
}

// ── API relay: fetch dari background agar tidak diblok CSP halaman ──

api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  var tabId = sender.tab && sender.tab.id;

  if (msg.type === 'AIBOT_ASK') {
    var textLease = acquire(tabId, 'text');
    if (!textLease) {
      sendResponse({ error: BUSY_MESSAGE });
      return true;
    }
    doFetch(textLease, API_URL, { question: msg.question }, sendResponse);
    return true;
  }

  if (msg.type === 'AIBOT_ASK_IMAGE') {
    // Pakai lock yang sudah diambil saat shortcut ditekan
    var imageLease = (lease && lease.kind === 'screenshot' && lease.tabId === tabId) ? lease : acquire(tabId, 'image');
    if (!imageLease) {
      sendResponse({ error: BUSY_MESSAGE });
      return true;
    }
    imageLease.kind = 'image';
    doFetch(imageLease, API_IMAGE_URL, { image: msg.dataUrl }, sendResponse);
    return true;
  }

  if (msg.type === 'AIBOT_CANCEL') {
    // Hanya tab pemilik request yang boleh membatalkannya
    if (lease && lease.tabId === tabId) {
      var l = lease;
      l.controller.abort();
      release(l);
    }
    return false;
  }
});

function doFetch(l, url, body, sendResponse) {
  var didRespond = false;
  function respond(r) {
    release(l);
    if (didRespond) return;
    didRespond = true;
    sendResponse(r);
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify(body),
    signal: l.controller.signal,
  })
    .then(function (res) {
      // Server mengirim error sebagai JSON { "error": "..." }
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
        return data;
      });
    })
    .then(function (data) {
      respond({ answer: data.answer, mode: data.mode });
    })
    .catch(function (err) {
      if (err.name === 'AbortError') {
        respond(l.timedOut ? { timeout: true } : { cancelled: true });
      } else {
        respond({ error: err.message || 'gagal terhubung ke server' });
      }
    });
}
