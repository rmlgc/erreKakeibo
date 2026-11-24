// Widgets de UI reutilizables: toasts y modales.
'use strict';

const Widgets = (() => {
  function toast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function openModal(innerHtml, { wide = false, onMount } = {}) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'active-modal-backdrop';
    backdrop.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${innerHtml}</div>`;
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeModal(); });
    document.body.appendChild(backdrop);
    if (onMount) onMount(backdrop.querySelector('.modal'));
    return backdrop;
  }

  function closeModal() {
    const existing = document.getElementById('active-modal-backdrop');
    if (existing) existing.remove();
  }

  function confirmDialog(message, onConfirm, { confirmLabel = 'Confirmar', danger = true } = {}) {
    openModal(`
      <h2>Confirmar</h2>
      <p>${message}</p>
      <div class="row" style="justify-content:flex-end; margin-top:16px;">
        <button class="btn ghost" id="confirm-cancel">Cancelar</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" id="confirm-ok">${confirmLabel}</button>
      </div>
    `, {
      onMount: (modal) => {
        modal.querySelector('#confirm-cancel').onclick = closeModal;
        modal.querySelector('#confirm-ok').onclick = () => { closeModal(); onConfirm(); };
      },
    });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Icono (?) con una explicación corta de 1-2 frases para conceptos que un usuario
  // nuevo puede no conocer. Funciona con hover (title nativo) y con clic/toque
  // (despliega la explicación en línea, para que funcione igual en móvil).
  function helpIcon(text) {
    return `<span class="help-icon" tabindex="0" title="${escapeHtml(text)}" data-help="${escapeHtml(text)}">?</span>`;
  }

  // Delegación global de clics sobre .help-icon: alterna una burbuja con el texto
  // justo debajo del icono. Se llama una sola vez desde App.init().
  function wireHelpIcons(root) {
    // Fase de CAPTURA (3er argumento true): el icono puede vivir dentro de un <button>
    // o de un <label> (p.ej. "Dividir compra (?)" o una casilla con ayuda). Un listener
    // en fase de burbuja en un ancestro se ejecuta DESPUÉS del onclick propio del botón
    // objetivo, así que ya sería tarde para evitar que se active. En fase de captura,
    // en cambio, se ejecuta antes de llegar al objetivo, así que stopPropagation() sí
    // impide que el clic llegue al botón o a la casilla.
    root.addEventListener('click', (e) => {
      const icon = e.target.closest('.help-icon');
      if (!icon) return;
      e.preventDefault();
      e.stopPropagation();
      const existing = icon.querySelector('.help-popover');
      document.querySelectorAll('.help-popover').forEach((p) => { if (p !== existing) p.remove(); });
      if (existing) { existing.remove(); return; }
      const bubble = document.createElement('span');
      bubble.className = 'help-popover';
      bubble.textContent = icon.dataset.help;
      icon.appendChild(bubble);
    }, true);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.help-icon')) {
        document.querySelectorAll('.help-popover').forEach((p) => p.remove());
      }
    });
  }

  // <datalist> de autocompletado (lista desplegable de sugerencias que no impide
  // escribir un valor nuevo): se referencia desde un <input list="...">.
  function datalist(id, options) {
    return `<datalist id="${id}">${options.map((o) => `<option value="${escapeHtml(o)}">`).join('')}</datalist>`;
  }

  return { toast, openModal, closeModal, confirmDialog, escapeHtml, helpIcon, wireHelpIcons, datalist };
})();
