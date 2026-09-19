// OH I SEE — Searchable dropdown (enhances native <select>)
(function (root) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  function destroyWrap(selectEl) {
    const wrap = selectEl.closest('.ps-search-select');
    if (wrap && wrap.parentNode) {
      wrap.parentNode.insertBefore(selectEl, wrap);
      wrap.remove();
    }
    selectEl.classList.remove('ps-native-select-hidden');
    delete selectEl.dataset.psSearchableBound;
  }

  function enhance(selectEl, { placeholder = 'Search or select…' } = {}) {
    if (!selectEl || selectEl.dataset.psSearchableBound) return;
    destroyWrap(selectEl);

    selectEl.classList.add('ps-native-select-hidden');
    selectEl.dataset.psSearchableBound = '1';

    const wrap = document.createElement('div');
    wrap.className = 'ps-search-select';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ps-search-select-input';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.value = selectEl.options[selectEl.selectedIndex]?.text || '';

    const list = document.createElement('ul');
    list.className = 'ps-search-select-list';
    list.hidden = true;

    function renderList(filter = '') {
      const q = filter.toLowerCase().trim();
      list.innerHTML = '';
      let count = 0;
      Array.from(selectEl.options).forEach((opt) => {
        if (q && !opt.text.toLowerCase().includes(q)) return;
        count += 1;
        const li = document.createElement('li');
        li.textContent = opt.text;
        li.dataset.value = opt.value;
        if (opt.value === selectEl.value) li.classList.add('selected');
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectEl.value = opt.value;
          input.value = opt.text;
          list.hidden = true;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        });
        list.appendChild(li);
      });
      if (!count) {
        const empty = document.createElement('li');
        empty.className = 'ps-search-select-empty';
        empty.textContent = 'No matches';
        list.appendChild(empty);
      }
    }

    input.addEventListener('focus', () => {
      renderList('');
      try { input.select(); } catch { /* ignore */ }
      list.hidden = false;
    });
    input.addEventListener('click', () => {
      renderList('');
      list.hidden = false;
    });
    input.addEventListener('input', () => {
      renderList(input.value);
      list.hidden = false;
    });
    input.addEventListener('blur', () => {
      setTimeout(() => { list.hidden = true; }, 180);
      const match = Array.from(selectEl.options).find((o) => o.text.toLowerCase() === input.value.trim().toLowerCase());
      if (match) selectEl.value = match.value;
      else input.value = selectEl.options[selectEl.selectedIndex]?.text || '';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { list.hidden = true; input.blur(); }
    });

    selectEl.addEventListener('change', () => {
      input.value = selectEl.options[selectEl.selectedIndex]?.text || '';
    });

    const parent = selectEl.parentNode;
    parent.insertBefore(wrap, selectEl);
    wrap.appendChild(input);
    wrap.appendChild(list);
    wrap.appendChild(selectEl);
  }

  function enhanceAll(container, selector = 'select[data-ps-searchable]') {
    (container || document).querySelectorAll(selector).forEach((el) => enhance(el));
  }

  function refresh(selectEl) {
    const wrap = selectEl?.closest('.ps-search-select');
    const input = wrap?.querySelector('.ps-search-select-input');
    if (input) input.value = selectEl.options[selectEl.selectedIndex]?.text || '';
  }

  root.SearchableSelect = { enhance, enhanceAll, refresh, destroyWrap };
})(typeof window !== 'undefined' ? window : global);
