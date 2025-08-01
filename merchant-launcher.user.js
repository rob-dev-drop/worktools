// ==UserScript==
// @name         MarketOps Tools
// @namespace    http://tampermonkey.net/
// @version      1.2.1
// @description  A merchant switcher AND a case tracker. Last updated July 30th
// @match        https://sellercentral.amazon.com/*
// @match        https://advertising.amazon.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://github.com/rob-dev-drop/worktools/raw/refs/heads/main/merchant-launcher.user.js
// @downloadURL  https://github.com/rob-dev-drop/worktools/raw/refs/heads/main/merchant-launcher.user.js
// @author       Roberto Rivas
// ==/UserScript==

(function () {
    'use strict';

    // MERCHANT SWITCHER CODE STARTS HERE

    const localStorageKey = 'simpleMerchants';
    const KEEP_PARAMS = [
        'mons_sel_dir_mcid',
        'mons_sel_mkid',
        'mons_sel_dir_paid',
        'mons_sel_dc'
    ];

    let merchantData = [];
    try {
        merchantData = JSON.parse(GM_getValue(localStorageKey, '[]'));
    } catch (e) {
        merchantData = [];
    }

    let editMode = false;
    let dragSrcIdx = null;

    // -- UI Elements --
    const container = document.createElement('div');
    container.id = 'merchant-launcher-widget';
    document.body.appendChild(container);

    // Tiny Icon Button (bottom left)
    const trigger = document.createElement('button');
    trigger.id = 'merchant-trigger';
    trigger.title = 'Show Merchant Launcher';
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Show Merchant Launcher');
    trigger.textContent = '🗂️';
    container.appendChild(trigger);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'merchant-panel';
    container.appendChild(panel);

    // Top Bar in Panel: Edit switch only (not visible when panel closed)
    const topBar = document.createElement('div');
    topBar.id = 'merchant-topbar';
    panel.appendChild(topBar);

    // Edit Switch
    const editSwitchLabel = document.createElement('label');
    editSwitchLabel.id = 'merchant-edit-switch-label';
    editSwitchLabel.innerHTML = `
        <input type="checkbox" id="merchant-edit-switch" style="display:none;">
        <span class="merchant-switch-slider"></span>
        <span class="merchant-switch-text">Edit</span>
    `;
    topBar.appendChild(editSwitchLabel);

    // Toolbar: import/export icons
    const toolbar = document.createElement('div');
    toolbar.id = 'merchant-toolbar';
    topBar.appendChild(toolbar);

    // Import Icon (shown only in edit mode)
    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'merchant-toolbar-btn';
    importBtn.innerHTML = '📥';
    importBtn.title = 'Import';
    toolbar.appendChild(importBtn);

    // Export Icon (shown only in edit mode)
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'merchant-toolbar-btn';
    exportBtn.innerHTML = '📤';
    exportBtn.title = 'Export';
    toolbar.appendChild(exportBtn);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    fileInput.accept = '.json';
    panel.appendChild(fileInput);

    // Optional tip for edit mode
    const editTip = document.createElement('div');
    editTip.id = 'merchant-edit-tip';
    editTip.style.display = 'none';
    editTip.textContent = 'Drag to reorder. Use ✏️/❌ to edit or delete merchants.';
    panel.appendChild(editTip);

    const listContainer = document.createElement('div');
    listContainer.id = 'merchant-list-container';
    panel.appendChild(listContainer);

    // Add button
    const addBtn = document.createElement('button');
    addBtn.id = 'add-merchant';
    addBtn.textContent = '+ Add';
    panel.appendChild(addBtn);

    // Help Button (text, next to addBtn)
    const helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.id = 'merchant-help-btn';
    helpBtn.textContent = 'Help';
    addBtn.after(helpBtn);

    // Inline Add Form (hidden by default)
    const addForm = document.createElement('div');
    addForm.id = 'merchant-add-form';
    addForm.style.display = 'none';
    addForm.innerHTML = `
        <input type="text" id="add-name" placeholder="Merchant Name" style="margin-bottom:4px; width:90%;" />
        <input type="text" id="add-url" placeholder="Merchant URL" style="margin-bottom:4px; width:90%;" />
        <button id="add-save">Save</button>
        <button id="add-cancel" style="margin-left:8px;">Cancel</button>
    `;
    panel.appendChild(addForm);

    // --- DRAG-AND-DROP LOGIC ---
    function onDragStart(e, idx) {
        if (!editMode) return e.preventDefault();
        dragSrcIdx = idx;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", idx); // required for Firefox
        e.target.classList.add("dragging");
    }
    function onDragOver(e, idx) {
        if (!editMode) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // Highlight drop target row
        const rows = listContainer.querySelectorAll('.merchant-row');
        rows.forEach((row, i) => {
            row.classList.toggle('drag-over', i === idx);
        });
    }
    function onDrop(e, idx) {
        if (!editMode) return;
        e.preventDefault();
        if (dragSrcIdx === null || dragSrcIdx === idx) return;
        // Move item
        const [moved] = merchantData.splice(dragSrcIdx, 1);
        merchantData.splice(idx, 0, moved);
        saveMerchants();
        dragSrcIdx = null;
        clearDragHighlight();
    }
    function onDragEnd() {
        dragSrcIdx = null;
        clearDragHighlight();
    }
    function clearDragHighlight() {
        const rows = listContainer.querySelectorAll('.merchant-row');
        rows.forEach(row => row.classList.remove('drag-over', 'dragging'));
    }

    // --- FUNCTIONS ---
    function saveMerchants() {
        GM_setValue(localStorageKey, JSON.stringify(merchantData));
        renderList();
    }

    function renderList() {
        listContainer.innerHTML = '';
        if (merchantData.length === 0) {
            const welcome = document.createElement('div');
            welcome.style.margin = '12px';
            welcome.style.color = '#265f30';
            welcome.innerHTML = `
                <b>Welcome!</b><br>
                Click <b>+ Add</b> to add a merchant.<br>
                (or import a list)<br>
            `;
            listContainer.appendChild(welcome);
        } else {
            merchantData.forEach((merchant, idx) => {
                const row = document.createElement('div');
                row.className = 'merchant-row';
                if (editMode) {
                    row.draggable = true;
                    row.title = "Drag to reorder";
                } else {
                    row.draggable = false;
                    row.title = "";
                }
                row.ondragstart = (e) => onDragStart(e, idx);
                row.ondragover = (e) => onDragOver(e, idx);
                row.ondrop = (e) => onDrop(e, idx);
                row.ondragend = onDragEnd;
                row.ondragleave = clearDragHighlight;

                // Drag handle (visible only in edit mode)
                const dragHandle = document.createElement('span');
                dragHandle.className = 'drag-handle';
                dragHandle.textContent = '⠿';
                dragHandle.title = "Drag to reorder";
                dragHandle.style.display = editMode ? 'inline-block' : 'none';
                row.appendChild(dragHandle);

                // Name button (always shown)
                const nameBtn = document.createElement('button');
                nameBtn.className = 'merchant-name-btn';
                nameBtn.textContent = merchant.name;
                nameBtn.title = merchant.url || '';
                nameBtn.onclick = () => {
                    if (merchant.url && merchant.url.trim().length > 0) {
                        window.open(merchant.url, '_blank');
                    }
                };
                nameBtn.style.flex = '1 1 75%';
                nameBtn.tabIndex = 0;
                if (editMode) nameBtn.disabled = true;
                else nameBtn.disabled = false;
                row.appendChild(nameBtn);

                // Edit & Delete buttons (only in edit mode)
                if (editMode) {
                    const editBtn = document.createElement('button');
                    editBtn.textContent = '✏️';
                    editBtn.title = 'Edit';
                    editBtn.onclick = () => editMerchant(idx);
                    row.appendChild(editBtn);

                    const delBtn = document.createElement('button');
                    delBtn.textContent = '❌';
                    delBtn.title = 'Delete';
                    delBtn.onclick = () => {
                        if (confirm(`Delete "${merchant.name}"?`)) {
                            merchantData.splice(idx, 1);
                            saveMerchants();
                        }
                    };
                    row.appendChild(delBtn);
                }

                listContainer.appendChild(row);
            });
        }
    }

    function cleanUrl(url) {
        try {
            const u = new URL(url);
            // Build new params object with only those in KEEP_PARAMS
            const newParams = [];
            for (const key of KEEP_PARAMS) {
                if (u.searchParams.has(key)) {
                    newParams.push(`${key}=${encodeURIComponent(u.searchParams.get(key))}`);
                }
            }
            u.search = newParams.length ? '?' + newParams.join('&') : '';
            u.hash = '';
            return u.origin + u.pathname + u.search;
        } catch (e) {
            return url; // fallback: don't break if not parseable
        }
    }

    function showAddForm(name, url) {
        addForm.style.display = 'block';
        document.getElementById('add-name').value = name || '';
        document.getElementById('add-url').value = url || '';
        addBtn.style.display = 'none';
        helpBtn.style.display = 'none';
    }

    function hideAddForm() {
        addForm.style.display = 'none';
        addBtn.style.display = '';
        helpBtn.style.display = '';
    }

    function addMerchant() {
        const defaultName = document.title.replace(/Amazon Seller Central( - )?/i, '').trim() || 'Amazon Seller';
        const clean = cleanUrl(window.location.href);
        showAddForm(defaultName, clean);
    }

    // Save from Add Form
    addForm.querySelector('#add-save').onclick = function() {
        const name = addForm.querySelector('#add-name').value.trim();
        const url = addForm.querySelector('#add-url').value.trim();
        if (!name || !url) {
            alert('Name and URL required!');
            return;
        }
        merchantData.push({ name, url });
        saveMerchants();
        hideAddForm();
    };

    addForm.querySelector('#add-cancel').onclick = function() {
        hideAddForm();
    };

    // Edit Merchant
    function editMerchant(idx) {
        const merchant = merchantData[idx];
        showAddForm(merchant.name, merchant.url);
        addForm.querySelector('#add-save').onclick = function() {
            const name = addForm.querySelector('#add-name').value.trim();
            const url = addForm.querySelector('#add-url').value.trim();
            if (!name || !url) {
                alert('Name and URL required!');
                return;
            }
            merchantData[idx] = { name, url };
            saveMerchants();
            hideAddForm();
        };
        addForm.querySelector('#add-cancel').onclick = function() {
            hideAddForm();
        };
    }

    // Import/Export/Help logic
    importBtn.onclick = () => fileInput.click();
    fileInput.onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported) && imported.every(m => m.name && m.url)) {
                    if (confirm("Replace your current merchant list?")) {
                        merchantData = imported;
                        saveMerchants();
                    }
                } else {
                    alert('Invalid file format.');
                }
            } catch (err) {
                alert('Import failed: ' + err.message);
            }
        };
        reader.readAsText(file);
        fileInput.value = '';
    };

    exportBtn.onclick = () => {
        const blob = new Blob([JSON.stringify(merchantData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'merchants-backup.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    helpBtn.onclick = () => {
        alert(
`Account Switcher
------------------------
- To add a merchant correctly:
- Switch to the desired account as usual
- Click on '+ Add'
- Change 'Amazon" to the desired name.
- Use the Edit switch (panel top) to rearrange or edit merchants.
- Drag to reorder, use ✏️/❌ to edit or delete.
- Click a merchant name (Edit OFF) to open in a new tab.
- Export/Import are visible only in Edit mode.
`
        );
    };

    addBtn.onclick = addMerchant;

    // Panel toggle with animation
    trigger.onclick = () => {
        const isOpen = !panel.classList.contains('open');
        panel.classList.toggle('open', isOpen);
        topBar.style.display = isOpen ? "flex" : "none";
        setEditSwitchState();
        updateToolbarIcons();
    };

    // Edit switch logic
    const editSwitchInput = editSwitchLabel.querySelector('#merchant-edit-switch');
    editSwitchInput.onchange = function() {
        editMode = this.checked;
        editTip.style.display = editMode ? 'block' : 'none';
        renderList();
        updateToolbarIcons();
    };

    function updateToolbarIcons() {
        importBtn.style.display = exportBtn.style.display = editMode ? "inline-block" : "none";
    }

    function setEditSwitchState() {
        editSwitchInput.checked = editMode;
        editTip.style.display = editMode ? 'block' : 'none';
        updateToolbarIcons();
    }

    // --- Green Styles + Tiny Icon + Help Button + Spacing ---
    const style = document.createElement('style');
    style.textContent = `
        #merchant-launcher-widget {
            position: fixed;
            bottom: 7px;
            left: 7px;
            z-index: 9999;
            font-family: 'Segoe UI', sans-serif;
        }
        #merchant-trigger {
            background: #d0e5ca;
            color: #258c36;
            border: none;
            border-radius: 50%;
            box-shadow: 0 2px 6px rgba(38, 95, 48, 0.14);
            width: 30px;
            height: 30px;
            font-size: 17px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.17s, box-shadow 0.16s;
            outline: none;
            padding: 0;
        }
        #merchant-trigger:hover, #merchant-trigger:focus {
            background: #c1eac0;
            box-shadow: 0 2px 10px rgba(38, 95, 48, 0.20);
        }
        #merchant-panel {
            position: absolute;
            bottom: 38px;
            left: 0;
            background: #fff;
            border: 2px solid #258c36;
            border-radius: 14px 14px 14px 14px;
            box-shadow: 0 10px 24px rgba(38, 95, 48, 0.18);
            min-width: 260px;
            padding: 10px 10px 7px 10px;
            opacity: 0;
            transform: translateY(18px) scale(0.97);
            pointer-events: none;
            transition: opacity 0.22s cubic-bezier(.47,1.64,.41,.8), transform 0.22s cubic-bezier(.47,1.64,.41,.8);
            z-index: 999;
            display: block;
        }
        #merchant-panel.open {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
        }
        #merchant-topbar {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            background: none;
            color: #258c36;
            font-size: 14px;
            padding: 0 0 3px 0;
            border-radius: 0;
            box-shadow: none;
            font-weight: normal;
        }
        #merchant-edit-switch-label {
            display: flex;
            align-items: center;
            cursor: pointer;
            margin-left: 0;
            margin-right: 3px;
        }
        .merchant-switch-slider {
            display: inline-block;
            width: 28px;
            height: 16px;
            background: #e6f8e5;
            border-radius: 18px;
            margin-right: 5px;
            position: relative;
            transition: background .18s;
        }
        #merchant-edit-switch:checked + .merchant-switch-slider {
            background: #c1eac0;
        }
        .merchant-switch-slider:before {
            content: '';
            position: absolute;
            left: 2px;
            top: 2px;
            width: 9px;
            height: 9px;
            background: #258c36;
            border-radius: 50%;
            transition: left 0.17s;
        }
        #merchant-edit-switch:checked + .merchant-switch-slider:before {
            left: 14px;
            background: #15571f;
        }
        .merchant-switch-text {
            font-weight: 600;
            color: #258c36;
            font-size: 12.5px;
            margin-left: 2px;
            margin-top: 1px;
        }
        #merchant-toolbar {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .merchant-toolbar-btn {
            background: none;
            border: none;
            color: #258c36;
            font-size: 15px;
            cursor: pointer;
            margin: 0 1px 0 1px;
            padding: 1.5px;
            border-radius: 50%;
            transition: background 0.13s;
            position: relative;
        }
        .merchant-toolbar-btn:hover, .merchant-toolbar-btn:focus {
            background: #e6f8e5;
        }
        .merchant-toolbar-btn[title]:hover:after, .merchant-toolbar-btn[title]:focus:after {
            content: attr(title);
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            bottom: -22px;
            white-space: nowrap;
            background: #258c36;
            color: #fff;
            padding: 2px 6px;
            border-radius: 5px;
            font-size: 12px;
            opacity: 0.97;
            pointer-events: none;
            z-index: 10;
        }
        #merchant-list-container {
            margin-bottom: 8px;
            margin-top: 8px;
        }
        .merchant-row {
            display: flex;
            align-items: center;
            gap: 1.5px;
            margin-bottom: 1.5px;
            background: transparent;
            border-radius: 5px;
            padding: 1.5px 1px 1.5px 4px;
            cursor: pointer;
            transition: background 0.16s;
        }
        .merchant-row.dragging {
            opacity: 0.45;
            background: #a7e1a2;
        }
        .merchant-row.drag-over {
            border: 2px dashed #258c36;
            background: #d1eecf;
        }
        .drag-handle {
            cursor: grab;
            font-size: 14px;
            color: #258c36;
            user-select: none;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 1px 0 1px;
            vertical-align: middle;
            outline: none !important;
        }
        .drag-handle:focus, .drag-handle:active {
            outline: none !important;
            box-shadow: none !important;
            background: transparent !important;
        }
        .merchant-name-btn {
            background: none;
            color: #258c36;
            border: none;
            border-radius: 4px;
            font-weight: 600;
            font-size: 13px;
            padding: 3px 0px;
            text-align: left;
            cursor: pointer;
            outline: none;
            transition: background .18s;
        }
        .merchant-name-btn:hover:enabled {
            background: #c1eac0;
            color: #15571f;
        }
        .merchant-name-btn:disabled {
            cursor: not-allowed;
            opacity: 0.7;
        }
        #add-merchant, #merchant-panel button:not(#merchant-admin):not(.merchant-toolbar-btn):not(#merchant-help-btn) {
            background: #c1eac0;
            color: #258c36;
            border: none;
            border-radius: 4px;
            margin-right: 2px;
            padding: 4px 7px;
            font-size: 13px;
            cursor: pointer;
            margin-top: 1.5px;
        }
        #add-merchant:hover, #merchant-panel button:not(#merchant-admin):hover:not(.merchant-toolbar-btn):not(#merchant-help-btn) {
            background: #a7e1a2;
            color: #15571f;
        }
        #merchant-help-btn {
            background: none;
            border: none;
            color: #258c36;
            font-size: 13.5px;
            margin-left: 1px;
            margin-right: 0;
            padding: 4px 6px;
            cursor: pointer;
            border-radius: 4px;
            transition: background 0.13s;
            vertical-align: middle;
        }
        #merchant-help-btn:hover, #merchant-help-btn:focus {
            background: #e6f8e5;
            color: #15571f;
        }
        #merchant-add-form {
            background: #e6f8e5;
            border-radius: 6px;
            padding: 6px 4px 5px 4px;
            margin: 5px 0 2px 0;
            border: 1px solid #c1eac0;
            box-shadow: 0 1px 2px rgba(38,95,48,0.04);
        }
        #merchant-add-form input {
            display: block;
            margin-bottom: 3px;
            font-size: 13px;
            border-radius: 3px;
            border: 1px solid #c1eac0;
            padding: 2.5px 6px;
        }
        #merchant-add-form button {
            background: #258c36;
            color: #fff;
            border: none;
            border-radius: 4px;
            margin-right: 1px;
            padding: 3px 7px;
            font-size: 13px;
            cursor: pointer;
        }
        #merchant-add-form button:hover {
            background: #15571f;
        }
        #merchant-edit-tip {
            background: #c1eac0;
            color: #15571f;
            border-radius: 4px;
            padding: 4px 6px 2px 6px;
            font-size: 11.5px;
            margin-bottom: 3px;
            font-style: italic;
            text-align: center;
        }
        @media (max-width: 600px) {
            #merchant-panel {
                min-width: 130px;
                font-size: 11px;
                padding: 5px 2px 2px 2px;
            }
            .merchant-name-btn {
                font-size: 11px;
                padding: 2px 2px;
            }
            #merchant-trigger {
                width: 22px;
                height: 22px;
                font-size: 11px;
            }
        }
    `;
    document.head.appendChild(style);

    // Initial state
    topBar.style.display = 'none';
    setEditSwitchState();
    renderList();

    // CASE TRACKER CODE STARTS HERE

    const caseKey_alt = 'simpleCases';
    const merchantKey_alt = 'simpleMerchants';

    let caseData = [];
    try {
        caseData = JSON.parse(GM_getValue(caseKey_alt, '[]'));
    } catch (e) {
        caseData = [];
    }

    let merchantList = [];
    try {
        merchantList = JSON.parse(GM_getValue(merchantKey_alt, '[]'));
    } catch (e) {
        merchantList = [];
    }

    const caseContainer = document.createElement('div');
    caseContainer.id = 'case-launcher-widget';
    caseContainer.style.position = 'fixed';
    caseContainer.style.bottom = '7px';
    caseContainer.style.left = '45px';
    caseContainer.style.zIndex = '9999';
    document.body.appendChild(caseContainer);

    const caseTrigger = document.createElement('button');
    caseTrigger.id = 'case-trigger';
    caseTrigger.title = 'Show Case Tracker';
    caseTrigger.type = 'button';
    caseTrigger.setAttribute('aria-label', 'Show Case Tracker');
    caseTrigger.textContent = '📋';
    caseTrigger.style.cssText = `
        background: #e5d0d0;
        color: #8c2525;
        border: none;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(95, 38, 38, 0.14);
        width: 30px;
        height: 30px;
        font-size: 17px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    caseContainer.appendChild(caseTrigger);

    const casePanel = document.createElement('div');
    casePanel.id = 'case-panel';
    casePanel.style.cssText = `
        position: absolute;
        bottom: 38px;
        left: 0;
        background: #fff;
        border: 2px solid #8c2525;
        border-radius: 14px;
        box-shadow: 0 10px 24px rgba(95, 38, 38, 0.18);
        min-width: 280px;
        padding: 10px;
        display: none;
        z-index: 999;
    `;
    caseContainer.appendChild(casePanel);

    const caseListContainer = document.createElement('div');
    casePanel.appendChild(caseListContainer);

    const caseAddBtn = document.createElement('button');
    caseAddBtn.textContent = '+ Add Case';
    caseAddBtn.style = 'background:#f2bcbc;color:#8c2525;border:none;border-radius:4px;margin-top:6px;padding:4px 8px;cursor:pointer;';
    casePanel.appendChild(caseAddBtn);
    const caseExportBtn = document.createElement('button');
    caseExportBtn.textContent = '⬇ Export CSV';
    caseExportBtn.style = 'background:#f2bcbc;color:#8c2525;border:none;border-radius:4px;margin-top:6px;margin-left:6px;padding:4px 8px;cursor:pointer;';
    casePanel.appendChild(caseExportBtn);

    const caseAddForm = document.createElement('div');
    caseAddForm.style.display = 'none';
    casePanel.appendChild(caseAddForm);

    function showAddCaseForm(title = '', url = '', merchant = '', editIdx = null) {
        caseAddForm.innerHTML = `
            <input type="text" id="case-title" placeholder="Case Title" style="margin-top:6px;width:95%;margin-bottom:4px;" />
            <input type="text" id="case-url" placeholder="Case URL" style="width:95%;margin-bottom:4px;" />
            <select id="case-merchant" style="width:95%;margin-bottom:6px;">
                <option value="">Select Merchant</option>
                ${merchantList.map(m => `<option value="${m.name}">${m.name}</option>`).join('')}
            </select>
            <button id="case-save">Save</button>
            <button id="case-cancel" style="margin-left:8px;">Cancel</button>
        `;
        caseAddForm.style.display = 'block';
        caseAddBtn.style.display = 'none';

        document.getElementById('case-title').value = title;
        document.getElementById('case-url').value = url;
        document.getElementById('case-merchant').value = merchant;

        const saveBtn = caseAddForm.querySelector('#case-save');
        const cancelBtn = caseAddForm.querySelector('#case-cancel');

        saveBtn.onclick = () => {
            const newTitle = document.getElementById('case-title').value.trim();
            const newUrl = document.getElementById('case-url').value.trim();
            const newMerchant = document.getElementById('case-merchant').value.trim();

            if (!newTitle || !newUrl || !newMerchant) {
                alert('Title, URL, and Merchant are required.');
                return;
            }

            const entry = { title: newTitle, url: newUrl, merchant: newMerchant };
            if (editIdx !== null) {
                caseData[editIdx] = entry;
            } else {
                caseData.push(entry);
            }
            saveCases();
            caseAddForm.style.display = 'none';
            caseAddBtn.style.display = 'inline-block';
        };

        cancelBtn.onclick = () => {
            caseAddForm.style.display = 'none';
            caseAddBtn.style.display = 'inline-block';
        };

    }
    function exportCasesAsCSV() {
    if (!caseData.length) {
        alert('No case data to export.');
        return;
    }

    const header = ['Title', 'URL', 'Merchant'];
    const rows = caseData.map(c => [
        `"${c.title.replace(/"/g, '""')}"`,
        `"${c.url.replace(/"/g, '""')}"`,
        `"${c.merchant.replace(/"/g, '""')}"`
    ]);

    const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'cases-export.csv');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}


    function renderCaseList() {
        caseListContainer.innerHTML = '';
        if (caseData.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.textContent = 'No cases yet. Click + Add Case.';
            emptyMsg.style.color = '#8c2525';
            caseListContainer.appendChild(emptyMsg);
            return;
        }

        caseData.forEach((item, idx) => {
            const row = document.createElement('div');
            row.style = 'display:flex;align-items:flex-start;gap:4px;margin-bottom:6px;flex-direction: column;border-bottom: 1px solid #eee;padding-bottom:4px;';

            const btn = document.createElement('button');
            const caseId = (() => {
                try {
                    const u = new URL(item.url);
                    return u.searchParams.get('caseID');
                } catch (e) {
                    return '';
                }
            })();
            const label = caseId ? `[${item.merchant}] [${caseId}]` : `[${item.merchant}]`;
            btn.innerHTML = `<b>${item.title}</b><br><small style="color:#a44;">${label}</small>`;
            btn.title = item.url;
            btn.onclick = () => {
                if (item.url && item.url.trim()) {
                    window.open(item.url, '_blank');
                }
            };
            btn.style = 'text-align:left;background:none;border:none;color:#8c2525;cursor:pointer;';
            row.appendChild(btn);

            const controls = document.createElement('div');
            controls.style = 'display:flex;gap:4px;';

            const editBtn = document.createElement('button');
            editBtn.textContent = '✏️';
            editBtn.style = 'background:none;border:none;cursor:pointer;';
            editBtn.onclick = () => showAddCaseForm(item.title, item.url, item.merchant, idx);
            controls.appendChild(editBtn);

            const delBtn = document.createElement('button');
            delBtn.textContent = '❌';
            delBtn.style = 'background:none;border:none;cursor:pointer;';
            delBtn.onclick = () => {
                if (confirm(`Delete case "${item.title}"?`)) {
                    caseData.splice(idx, 1);
                    saveCases();
                }
            };
            controls.appendChild(delBtn);
            row.appendChild(controls);

            caseListContainer.appendChild(row);
        });
    }

    function saveCases() {
        GM_setValue(caseKey_alt, JSON.stringify(caseData));
        renderCaseList();
    }

    caseAddBtn.onclick = () => {
        const customTitleSpan = document.querySelector('span[data-test-tag="case-title"]');
        const caseTitle = customTitleSpan ? customTitleSpan.textContent.trim() : document.title.trim();
        showAddCaseForm(caseTitle, window.location.href);
    };

    caseExportBtn.onclick = exportCasesAsCSV;


    caseTrigger.onclick = () => {
        casePanel.style.display = casePanel.style.display === 'none' ? 'block' : 'none';
    };

    renderCaseList();

    document.addEventListener('click', (event) => {
    // Merchant panel
    const isClickInsideMerchant = container.contains(event.target) || trigger.contains(event.target);
    if (!isClickInsideMerchant && panel.classList.contains('open')) {
        panel.classList.remove('open');
        topBar.style.display = 'none';
    }

    // Case panel
    const isClickInsideCase = caseContainer.contains(event.target) || caseTrigger.contains(event.target);
    if (!isClickInsideCase && casePanel.style.display === 'block') {
        casePanel.style.display = 'none';
    }
});

})();
