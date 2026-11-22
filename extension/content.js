(function () {
  'use strict';

  // Guard against double-injection (manifest + scripting.executeScript retry).
  // Without this, each injection registers another onMessage listener and
  // every subsequent screenshot triggers N parallel API calls.
  if (window.__aibotContentLoaded) return;
  window.__aibotContentLoaded = true;

  var askBtn = null;
  var popup = null;
  var isDragging = false;
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var onDocMousedown = null;
  // Nomor request terakhir: respons dari request lama (sudah ditutup/diganti) diabaikan
  var activeRequestId = 0;
  // true selama tab ini menunggu jawaban
  var pending = false;

  // ── Ask button ──────────────────────────────────────────────

  function showAskButton(x, y) {
    removeAskButton();
    askBtn = document.createElement('button');
    askBtn.id = 'aibot-ask-btn';
    askBtn.textContent = 'What is this?';
    askBtn.style.left = x + 'px';
    askBtn.style.top = (y + window.scrollY + 6) + 'px';
    askBtn.addEventListener('click', onAskClick);
    document.body.appendChild(askBtn);
  }

  function removeAskButton() {
    if (askBtn) { askBtn.remove(); askBtn = null; }
  }

  function onAskClick() {
    var text = window.getSelection().toString().trim();
    removeAskButton();
    if (text.length < 10) return;
    // Jangan kirim request baru (dan jangan timpa popup) selama jawaban sebelumnya belum datang
    if (pending) return;
    showPopup(text);
  }

  // ── Popup ────────────────────────────────────────────────────

  function showPopup(question, dataUrl) {
    if (onDocMousedown) {
      document.removeEventListener('mousedown', onDocMousedown, true);
      onDocMousedown = null;
    }
    if (popup) popup.remove();

    popup = document.createElement('div');
    popup.id = 'aibot-popup';
    popup.style.cssText = 'pointer-events:all!important;';
    popup.innerHTML = [
      '<div id="aibot-header" style="cursor:move!important;pointer-events:all!important;user-select:none!important;">',
      '  <span>aibot</span>',
      '  <div>',
      '    <button id="aibot-copy-btn" title="Salin jawaban" style="pointer-events:all!important;cursor:pointer!important;">(c)</button>',
      '    <button id="aibot-close-btn" title="Tutup" style="pointer-events:all!important;cursor:pointer!important;">&times;</button>',
      '  </div>',
      '</div>',
      '<div id="aibot-body">',
      '  <div id="aibot-spinner"></div>',
      '</div>',
    ].join('');

    document.body.appendChild(popup);

    var closeBtn = popup.querySelector('#aibot-close-btn');
    var copyBtn = popup.querySelector('#aibot-copy-btn');
    var hdr = popup.querySelector('#aibot-header');

    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (pending) {
        activeRequestId++;
        pending = false;
        sendToBackground({ type: 'AIBOT_CANCEL' }, function () {});
      }
      if (onDocMousedown) {
        document.removeEventListener('mousedown', onDocMousedown, true);
        onDocMousedown = null;
      }
      if (popup) { popup.remove(); popup = null; }
    }, true);

    copyBtn.addEventListener('click', copyAnswer, true);

    // Document-level capture mousedown agar drag tidak diblok halaman manapun
    onDocMousedown = function (e) {
      if (!popup || !hdr) {
        document.removeEventListener('mousedown', onDocMousedown, true);
        onDocMousedown = null;
        return;
      }
      if (hdr.contains(e.target) && !closeBtn.contains(e.target) && !copyBtn.contains(e.target)) {
        startDrag(e);
      }
    };
    document.addEventListener('mousedown', onDocMousedown, true);

    if (dataUrl) {
      fetchAnswerFromImage(dataUrl);
    } else {
      fetchAnswer(question);
    }
  }

  function setBodyContent(html) {
    var body = popup && popup.querySelector('#aibot-body');
    if (body) body.innerHTML = html;
  }

  function copyAnswer() {
    var body = popup && popup.querySelector('#aibot-body');
    if (!body) return;
    var text = body.innerText.trim();
    navigator.clipboard.writeText(text).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
  }

  // ── API call via background (bypass CSP halaman) ─────────────

  function sendToBackground(msg, callback) {
    if (typeof browser !== 'undefined') {
      browser.runtime.sendMessage(msg).then(callback).catch(function () { callback(null); });
    } else {
      chrome.runtime.sendMessage(msg, function (response) {
        if (chrome.runtime.lastError) { callback(null); return; }
        callback(response);
      });
    }
  }

  function fetchAnswer(question) {
    request({ type: 'AIBOT_ASK', question: question });
  }

  function fetchAnswerFromImage(dataUrl) {
    request({ type: 'AIBOT_ASK_IMAGE', dataUrl: dataUrl });
  }

  // Satu fungsi untuk teks & gambar: kirim ke background, tampilkan hasil di popup
  function request(msg) {
    var requestId = ++activeRequestId;
    pending = true;

    sendToBackground(msg, function (response) {
      // Respons milik request lama (popup sudah ditutup/diganti) → abaikan
      if (requestId !== activeRequestId) return;
      pending = false;

      if (!response) {
        setBodyContent('<span class="aibot-error">Gagal: tidak dapat terhubung ke server.</span>');
        return;
      }
      if (response.cancelled) return;
      if (response.timeout) {
        setBodyContent('<span class="aibot-error">Timeout: server tidak merespons, silakan coba lagi.</span>');
        return;
      }
      if (response.error) {
        setBodyContent('<span class="aibot-error">Gagal: ' + escapeHtml(response.error) + '</span>');
        return;
      }
      var escaped = escapeHtml(response.answer || '(tidak ada jawaban)');
      var modeTag = response.mode ? '<span class="aibot-mode-tag">' + escapeHtml(response.mode) + '</span>' : '';
      setBodyContent(modeTag + '<pre>' + escaped + '</pre>');
    });
  }

  // ── Drag ─────────────────────────────────────────────────────

  function onDragMove(e) {
    if (!isDragging || !popup) return;
    popup.style.left = (e.clientX - dragOffsetX) + 'px';
    popup.style.top = (e.clientY - dragOffsetY) + 'px';
    popup.style.right = 'auto';
    popup.style.bottom = 'auto';
  }

  function onDragEnd() {
    isDragging = false;
    document.removeEventListener('mousemove', onDragMove, true);
    document.removeEventListener('mouseup', onDragEnd, true);
  }

  function startDrag(e) {
    if (!popup) return;
    isDragging = true;
    var rect = popup.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    e.preventDefault();
    e.stopPropagation();
    document.addEventListener('mousemove', onDragMove, true);
    document.addEventListener('mouseup', onDragEnd, true);
  }

  // ── Selection listener ────────────────────────────────────────

  document.addEventListener('mouseup', function (e) {
    if (popup && popup.contains(e.target)) return;
    if (askBtn && askBtn.contains(e.target)) return;

    setTimeout(function () {
      var sel = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      if (text.length >= 10) {
        var range = sel.getRangeAt(0).getBoundingClientRect();
        showAskButton(range.right, range.bottom);
      } else {
        removeAskButton();
      }
    }, 10);
  });

  document.addEventListener('mousedown', function (e) {
    if (askBtn && !askBtn.contains(e.target)) removeAskButton();
  });

  // ── Screenshot listener ───────────────────────────────────────

  var runtimeAPI = (typeof browser !== 'undefined' ? browser : chrome).runtime;
  runtimeAPI.onMessage.addListener(function (msg) {
    if (msg.type === 'AIBOT_SCREENSHOT' && msg.dataUrl) {
      showPopup(null, msg.dataUrl);
    }
  });

  // ── Util ──────────────────────────────────────────────────────

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
