// "Limpiar navegador" (modo ordenador compartido / privacidad): borra todo rastro
// de la contabilidad guardado en este navegador, con copia de seguridad previa y
// doble confirmación. Se usa tanto desde el botón de la barra lateral (modal) como
// desde Ajustes > Privacidad y datos locales (en la propia página).
'use strict';

const UIPrivacy = (() => {
  function summary() {
    const state = DB.get();
    return {
      transactions: state.transactions.length,
      accounts: state.accounts.length,
      rules: state.rules.length,
      dirty: DB.isDirty(),
    };
  }

  function contentHtml() {
    const s = summary();
    return `
      <p class="muted">Borra por completo lo que este navegador tiene guardado de tu contabilidad (localStorage e IndexedDB), por si estás usando un ordenador que no es tuyo. Tu archivo JSON en disco no se toca para nada.</p>
      <div class="card" style="background:var(--paper);margin-bottom:12px;">
        <strong>Esto es lo que hay guardado ahora mismo en este navegador:</strong>
        <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;">
          <li><strong>${s.transactions}</strong> movimiento${s.transactions === 1 ? '' : 's'}</li>
          <li><strong>${s.accounts}</strong> cuenta${s.accounts === 1 ? '' : 's'}</li>
          <li><strong>${s.rules}</strong> regla${s.rules === 1 ? '' : 's'}</li>
        </ul>
        ${s.dirty
          ? '<p style="color:var(--accent-orange);font-weight:600;margin-top:8px;">⚠ Tienes cambios sin guardar desde tu última copia.</p>'
          : '<p class="muted" style="margin-top:8px;">No hay cambios sin guardar pendientes.</p>'}
      </div>
      <div class="card" style="margin-bottom:12px;">
        <strong>Paso 1 — Copia de seguridad preventiva</strong>
        <p class="muted" style="font-size:13px;">Descarga ahora tu archivo antes de borrar nada, por si no tenías ya una copia reciente en tu disco externo.</p>
        <button class="btn primary" id="btn-download-backup">Descargar copia de seguridad (.json)</button>
        <p id="backup-confirm" class="muted" style="color:var(--success);display:none;margin-top:6px;">✓ Copia de seguridad descargada</p>
      </div>
      <div class="card" style="border-color:var(--danger);">
        <strong>Paso 2 — Confirmar borrado</strong>
        <label class="row" style="gap:6px;margin-top:8px;align-items:flex-start;">
          <input type="checkbox" id="chk-confirm-wipe" style="width:auto;margin-top:3px;">
          <span>Confirmo que tengo mi copia guardada y quiero borrar todos los datos de este navegador.</span>
        </label>
        <button class="btn danger" id="btn-wipe-now" style="margin-top:10px;" disabled>Borrar datos del navegador ahora</button>
      </div>
    `;
  }

  function wire(root, onWiped) {
    const state = DB.get();
    root.querySelector('#btn-download-backup').onclick = () => {
      const json = JSON.stringify(state, null, 2);
      Utils.downloadText(DB.getFileName() || 'contabilidad_kakeibo.json', json, 'application/json');
      root.querySelector('#backup-confirm').style.display = '';
    };
    const chk = root.querySelector('#chk-confirm-wipe');
    const wipeBtn = root.querySelector('#btn-wipe-now');
    chk.onchange = () => { wipeBtn.disabled = !chk.checked; };
    wipeBtn.onclick = async () => {
      wipeBtn.disabled = true;
      await App.wipeBrowserData();
      if (onWiped) onWiped();
    };
  }

  function openModal() {
    Widgets.openModal(`
      <h2>🧹 Limpiar navegador</h2>
      ${contentHtml()}
      <div class="row" style="justify-content:flex-end;margin-top:14px;">
        <button class="btn ghost" id="close-wipe-modal">Cerrar</button>
      </div>
    `, {
      wide: true,
      onMount: (modal) => {
        wire(modal, () => Widgets.closeModal());
        modal.querySelector('#close-wipe-modal').onclick = Widgets.closeModal;
      },
    });
  }

  function renderInline(container) {
    container.innerHTML = `
      <h2>Privacidad y datos locales ${Widgets.helpIcon('Pensado para cuando abres la app en un ordenador compartido o que no es tuyo: borra todo lo que ese navegador recuerde, sin tocar tu archivo JSON.')}</h2>
      ${contentHtml()}
    `;
    wire(container, () => renderInline(container));
  }

  return { openModal, renderInline };
})();
