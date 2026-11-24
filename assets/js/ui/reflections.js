// Pestaña: Reflexión mensual Kakeibo
'use strict';

const UIReflections = (() => {
  function render(container) {
    const state = DB.get();
    const months = Array.from(new Set(state.transactions.map((t) => Utils.monthKey(t.date)))).filter(Boolean).sort().reverse();
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (!months.includes(currentMonth)) months.unshift(currentMonth);

    container.innerHTML = `
      <h1>Reflexión mensual Kakeibo</h1>
      <div class="field" style="max-width:220px;"><label>Mes</label>
        <select id="sel-month">${months.map((m) => `<option value="${m}">${m}</option>`).join('')}</select>
      </div>
      <div class="card" id="reflection-form" style="margin-top:14px;"></div>
    `;
    const sel = container.querySelector('#sel-month');
    const formHost = container.querySelector('#reflection-form');
    const draw = () => renderForm(formHost, sel.value, state);
    sel.onchange = draw;
    draw();
  }

  function renderForm(host, month, state) {
    const r = state.reflections[month] || { wentWell: '', wentWrong: '', upcoming: '' };
    host.innerHTML = `
      <div class="field"><label>¿Qué salió bien este mes?</label><textarea id="r-well" rows="3">${Widgets.escapeHtml(r.wentWell)}</textarea></div>
      <div class="field"><label>¿Qué se fue de las manos?</label><textarea id="r-wrong" rows="3">${Widgets.escapeHtml(r.wentWrong)}</textarea></div>
      <div class="field"><label>¿Qué eventos/gastos especiales vienen el mes próximo?</label><textarea id="r-upcoming" rows="3">${Widgets.escapeHtml(r.upcoming)}</textarea></div>
      <button class="btn primary" id="save-reflection">Guardar reflexión</button>
    `;
    host.querySelector('#save-reflection').onclick = () => {
      state.reflections[month] = {
        wentWell: host.querySelector('#r-well').value,
        wentWrong: host.querySelector('#r-wrong').value,
        upcoming: host.querySelector('#r-upcoming').value,
      };
      DB.markDirty();
      Widgets.toast('Reflexión guardada', 'success');
    };
  }

  return { render };
})();
