/* Catálogo de produtos – frontend sem frameworks externos
 * Utiliza fetch com URLs relativas para os endpoints existentes da API.
 * Todos os dados de usuário/API são inseridos via textContent (nunca innerHTML).
 */
(function () {
  'use strict';

  // ── Estado da aplicação ──────────────────────────────────────────────
  const state = {
    page: 0,
    size: 20,
    category: '',
    minPrice: '',
    maxPrice: '',
    sort: '',
    totalPages: 0,
    totalElements: 0,
    loading: false,
    mutating: false,
  };

  // ── Seletores ────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  const filterForm     = $('filter-form');
  const filterCategory = $('filter-category');
  const filterMin      = $('filter-min-price');
  const filterMax      = $('filter-max-price');
  const filterSort     = $('filter-sort');
  const filterSize     = $('filter-size');
  const clearBtn       = $('clear-filters-btn');
  const newProductBtn  = $('new-product-btn');
  const statusBar      = $('status-bar');

  const loadingEl  = $('loading');
  const emptyEl    = $('empty-state');
  const errorEl    = $('error-state');
  const tableWrap  = $('table-wrapper');
  const tbody      = $('product-tbody');
  const pagination = $('pagination');
  const prevBtn    = $('prev-page-btn');
  const nextBtn    = $('next-page-btn');
  const pageInfo   = $('page-info');

  // Modal produto
  const productModal  = $('product-modal');
  const modalTitle    = $('modal-title');
  const modalCloseBtn = $('modal-close-btn');
  const formCancelBtn = $('form-cancel-btn');
  const productForm   = $('product-form');
  const productIdIn   = $('product-id');
  const skuIn         = $('sku');
  const nameIn        = $('name');
  const descIn        = $('description');
  const categoryIn    = $('category');
  const priceIn       = $('price');
  const formErrorEl   = $('form-error');
  const submitBtn     = $('form-submit-btn');

  // Modal confirmação
  const confirmModal   = $('confirm-modal');
  const confirmMsg     = $('confirm-message');
  const confirmCancel  = $('confirm-cancel-btn');
  const confirmDelete  = $('confirm-delete-btn');

  // ── Formatação ───────────────────────────────────────────────────────
  const fmtPrice = (v) =>
    Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // ── Utilitários de UI ────────────────────────────────────────────────
  function setStatus(msg) {
    statusBar.textContent = msg;
  }

  function showLoading() {
    loadingEl.hidden  = false;
    emptyEl.hidden    = true;
    errorEl.hidden    = true;
    tableWrap.hidden  = true;
    pagination.hidden = true;
  }

  function showError(msg) {
    loadingEl.hidden = true;
    emptyEl.hidden   = true;
    tableWrap.hidden = true;
    pagination.hidden = true;
    errorEl.hidden   = false;
    errorEl.textContent = msg;
  }

  function showEmpty() {
    loadingEl.hidden  = true;
    errorEl.hidden    = true;
    tableWrap.hidden  = true;
    pagination.hidden = true;
    emptyEl.hidden    = false;
  }

  function showTable() {
    loadingEl.hidden  = true;
    emptyEl.hidden    = true;
    errorEl.hidden    = true;
    tableWrap.hidden  = false;
    pagination.hidden = false;
  }

  // ── Construção de URL com filtros ────────────────────────────────────
  function buildUrl(overrides) {
    const s = Object.assign({}, state, overrides);
    const params = new URLSearchParams();
    params.set('page', String(s.page));
    params.set('size', String(s.size));
    if (s.category) params.set('category', s.category);
    if (s.minPrice !== '' && s.minPrice !== null) params.set('minPrice', s.minPrice);
    if (s.maxPrice !== '' && s.maxPrice !== null) params.set('maxPrice', s.maxPrice);
    if (s.sort) params.set('sort', s.sort);
    return '/api/products?' + params.toString();
  }

  // ── Carregar produtos ────────────────────────────────────────────────
  async function loadProducts(overrides) {
    if (state.loading) return;
    state.loading = true;
    showLoading();
    setStatus('Carregando produtos…');

    const url = buildUrl(overrides || {});

    let data;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const err = await tryParseJson(res);
        const msg = err && err.detail
          ? err.detail
          : 'Erro ' + res.status + ' ao buscar produtos.';
        showError(msg);
        setStatus('');
        return;
      }
      data = await res.json();
    } catch (e) {
      showError('Falha de rede ao carregar produtos. Verifique a conexão e tente novamente.');
      setStatus('');
      return;
    } finally {
      state.loading = false;
    }

    state.totalPages    = data.totalPages;
    state.totalElements = data.totalElements;

    const total = data.totalElements;
    const content = data.content || [];

    if (content.length === 0) {
      showEmpty();
      setStatus('Nenhum produto encontrado.');
      updatePaginationControls(data);
      return;
    }

    // Renderiza linhas usando textContent para segurança XSS
    tbody.textContent = '';
    content.forEach((p) => {
      const tr = document.createElement('tr');

      const tdSku = document.createElement('td');
      tdSku.className = 'td-sku';
      tdSku.textContent = p.sku;

      const tdName = document.createElement('td');
      tdName.textContent = p.name;

      const tdCat = document.createElement('td');
      tdCat.textContent = p.category;

      const tdPrice = document.createElement('td');
      tdPrice.className = 'td-price';
      tdPrice.textContent = fmtPrice(p.price);

      const tdAct = document.createElement('td');
      tdAct.className = 'td-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-ghost';
      editBtn.textContent = 'Editar';
      editBtn.setAttribute('aria-label', 'Editar ' + p.name);
      editBtn.addEventListener('click', () => openEditModal(p));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-danger';
      delBtn.textContent = 'Excluir';
      delBtn.setAttribute('aria-label', 'Excluir ' + p.name);
      delBtn.addEventListener('click', () => openConfirmDelete(p));

      tdAct.appendChild(editBtn);
      tdAct.appendChild(delBtn);

      tr.appendChild(tdSku);
      tr.appendChild(tdName);
      tr.appendChild(tdCat);
      tr.appendChild(tdPrice);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });

    showTable();
    updatePaginationControls(data);

    const from = state.page * state.size + 1;
    const to   = from + content.length - 1;
    setStatus(total + ' produto(s) encontrado(s). Exibindo ' + from + '–' + to + '.');
  }

  function updatePaginationControls(data) {
    prevBtn.disabled = state.page <= 0;
    nextBtn.disabled = state.page >= data.totalPages - 1;
    pageInfo.textContent =
      'Página ' + (state.page + 1) + ' de ' + (data.totalPages || 1);
    pagination.hidden = false;
  }

  // ── Filtros ──────────────────────────────────────────────────────────
  function applyFilters() {
    state.category = filterCategory.value.trim();
    state.minPrice = filterMin.value.trim();
    state.maxPrice = filterMax.value.trim();
    state.sort     = filterSort.value;
    state.size     = parseInt(filterSize.value, 10) || 20;
    state.page     = 0; // volta à primeira página ao mudar filtros
    loadProducts();
  }

  filterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters();
  });

  clearBtn.addEventListener('click', () => {
    filterForm.reset();
    filterSize.value = '20';
    state.category = '';
    state.minPrice = '';
    state.maxPrice = '';
    state.sort     = '';
    state.size     = 20;
    state.page     = 0;
    loadProducts();
  });

  // ── Paginação ────────────────────────────────────────────────────────
  prevBtn.addEventListener('click', () => {
    if (state.page > 0) {
      state.page -= 1;
      loadProducts();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (state.page < state.totalPages - 1) {
      state.page += 1;
      loadProducts();
    }
  });

  // ── Modal formulário ─────────────────────────────────────────────────
  function openModal() {
    clearFormErrors();
    formErrorEl.hidden = true;
    productModal.hidden = false;
    // Foco no primeiro campo
    setTimeout(() => skuIn.focus(), 50);
  }

  function closeModal() {
    productModal.hidden = true;
    newProductBtn.focus();
  }

  function openNewModal() {
    modalTitle.textContent = 'Novo produto';
    productForm.reset();
    productIdIn.value = '';
    skuIn.disabled = false;
    submitBtn.textContent = 'Salvar';
    openModal();
  }

  function openEditModal(product) {
    modalTitle.textContent = 'Editar produto';
    productIdIn.value  = product.id;
    skuIn.value        = product.sku;
    skuIn.disabled     = false;
    nameIn.value       = product.name;
    descIn.value       = product.description || '';
    categoryIn.value   = product.category;
    priceIn.value      = product.price;
    submitBtn.textContent = 'Atualizar';
    openModal();
  }

  newProductBtn.addEventListener('click', openNewModal);
  modalCloseBtn.addEventListener('click', closeModal);
  formCancelBtn.addEventListener('click', closeModal);

  // Fechar modal com Escape
  productModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Fechar ao clicar no overlay
  productModal.addEventListener('click', (e) => {
    if (e.target === productModal) closeModal();
  });

  // ── Submissão do formulário ──────────────────────────────────────────
  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.mutating) return; // evita envio duplicado

    clearFormErrors();
    formErrorEl.hidden = true;

    const id = productIdIn.value;
    const isEdit = Boolean(id);
    const method = isEdit ? 'PUT' : 'POST';
    const url    = isEdit ? '/api/products/' + id : '/api/products';

    const priceRaw = priceIn.value.trim();
    const body = {
      sku:         skuIn.value.trim(),
      name:        nameIn.value.trim(),
      description: descIn.value.trim(),
      category:    categoryIn.value.trim(),
      price:       priceRaw !== '' ? Number(priceRaw) : null,
    };

    state.mutating = true;
    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Atualizando…' : 'Salvando…';

    let res, data;
    try {
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      data = await tryParseJson(res);
    } catch (err) {
      showFormError('Falha de rede. Verifique a conexão e tente novamente.');
      return;
    } finally {
      state.mutating = false;
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Atualizar' : 'Salvar';
    }

    if (res.ok) {
      closeModal();
      await loadProducts();
      setStatus(isEdit ? 'Produto atualizado com sucesso.' : 'Produto criado com sucesso.');
    } else {
      handleApiError(data, res.status);
    }
  });

  function clearFormErrors() {
    ['sku', 'name', 'description', 'category', 'price'].forEach((f) => {
      const el = $(f + '-error');
      if (el) el.textContent = '';
    });
  }

  function showFormError(msg) {
    formErrorEl.hidden = false;
    formErrorEl.textContent = msg;
  }

  function handleApiError(data, status) {
    if (!data) {
      showFormError('Erro ' + status + '. Tente novamente.');
      return;
    }

    // Erros de campo (400 de validação)
    if (data.errors && typeof data.errors === 'object') {
      let hasFieldErr = false;
      Object.entries(data.errors).forEach(([field, msg]) => {
        const el = $(field + '-error');
        if (el) {
          el.textContent = msg;
          hasFieldErr = true;
        }
      });
      if (!hasFieldErr) {
        showFormError(data.detail || 'Dados inválidos.');
      } else {
        // Mostra detalhe geral acima e cada erro no campo
        showFormError(data.detail || 'Um ou mais campos são inválidos.');
      }
      return;
    }

    // 409 conflito de SKU
    if (status === 409) {
      showFormError(data.detail || 'Já existe um produto com este SKU.');
      return;
    }

    // outros erros
    showFormError(data.detail || data.title || 'Erro ' + status + '.');
  }

  // ── Modal de confirmação de exclusão ─────────────────────────────────
  let pendingDeleteId = null;

  function openConfirmDelete(product) {
    pendingDeleteId = product.id;
    confirmMsg.textContent =
      'Deseja excluir o produto "' + product.name + '" (SKU: ' + product.sku + ')? Esta ação não pode ser desfeita.';
    confirmModal.hidden = false;
    confirmCancel.focus();
  }

  function closeConfirmModal() {
    pendingDeleteId = null;
    confirmModal.hidden = true;
  }

  confirmCancel.addEventListener('click', () => {
    closeConfirmModal();
  });

  confirmModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeConfirmModal();
  });

  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirmModal();
  });

  confirmDelete.addEventListener('click', async () => {
    if (!pendingDeleteId || state.mutating) return;

    state.mutating = true;
    confirmDelete.disabled = true;
    confirmDelete.textContent = 'Excluindo…';

    const id = pendingDeleteId;
    let res;
    try {
      res = await fetch('/api/products/' + id, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      closeConfirmModal();
      showError('Falha de rede ao excluir. Tente novamente.');
      return;
    } finally {
      state.mutating = false;
      confirmDelete.disabled = false;
      confirmDelete.textContent = 'Excluir';
    }

    closeConfirmModal();

    if (res.ok || res.status === 204) {
      // Se era o único item da última página, volta para a página anterior
      const isLastItemOnPage =
        state.totalElements % state.size === 1 && state.page > 0;
      if (isLastItemOnPage) {
        state.page = Math.max(0, state.page - 1);
      }
      await loadProducts();
      setStatus('Produto excluído com sucesso.');
    } else {
      const data = await tryParseJson(res);
      showError(
        (data && data.detail) || 'Erro ' + res.status + ' ao excluir o produto.'
      );
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────
  async function tryParseJson(res) {
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) return await res.json();
    } catch (_) { /* ignore */ }
    return null;
  }

  // ── Init ─────────────────────────────────────────────────────────────
  loadProducts();
})();
