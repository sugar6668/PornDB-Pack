/**
 * @name         PornPack Filter Library
 * @description  PornDB 厂牌白名单极速过滤模块
 * @version      1.0.0
 */

window.PornFilter = class PornFilter {
    constructor(defaultWhitelist = []) {
        this.storageKey = 'pdb_studio_whitelist_v1';
        this.currentStudioMap = new Map();
        this.normalize = (name) => String(name).split(':')[0].toLowerCase().replace(/[\s.]/g, '');

        const defaults = defaultWhitelist.map(this.normalize);
        const cached = this.loadWhitelist ? this.loadWhitelist([]) : [];
        this.whitelist = [...new Set([...defaults, ...cached])];

        if (this.saveWhitelist) this.saveWhitelist(this.whitelist);
        this.initCSS();

        if (typeof this.initModal === 'function') this.initModal();
        else if (typeof this.createModal === 'function') this.createModal();
        else if (typeof this.initUI === 'function') this.initUI();

        this.startFastTagger();
    }

    loadWhitelist(defaultList) {
        const parseValidArray = (val) => {
            try {
                const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                return Array.isArray(parsed) ? parsed : null;
            } catch (e) {
                return null;
            }
        };

        if (typeof GM_getValue === 'function') {
            const saved = parseValidArray(GM_getValue(this.storageKey));
            if (saved) return saved;
        }

        try {
            const localSaved = parseValidArray(localStorage.getItem(this.storageKey));
            if (localSaved) return localSaved;
        } catch (e) { }

        return defaultList;
    }

    saveWhitelist(list) {
        this.whitelist = list;
        const jsonStr = JSON.stringify(list);

        if (typeof GM_setValue === 'function') {
            try { GM_setValue(this.storageKey, jsonStr); } catch (e) { }
        }
        try { localStorage.setItem(this.storageKey, jsonStr); } catch (e) { }
    }

    initCSS() {
        
    }

    startFastTagger() {
        if (!location.href.includes('/performers/') && !location.href.includes('/performer-sites/')) return;

        const checkCard = (card) => {
            if (card.dataset.studioChecked) return;
            card.dataset.studioChecked = '1';

            const studioLink = card.querySelector('a[href*="/sites/"]');
            if (studioLink) {
                const studioName = studioLink.textContent.trim() || studioLink.querySelector('img')?.getAttribute('title') || '未知片商';
                card.dataset.studioName = studioName;
                const normName = this.normalize(studioName);

                if (!this.whitelist.includes(normName)) {
                    card.dataset.studioHidden = '1';
                }
            }
        };

        document.querySelectorAll('.grid-cols-scene-card .w-scene-card:not([data-studio-checked="1"])').forEach(checkCard);

        new MutationObserver((mutations) => {
            for (let m of mutations) {
                if (m.addedNodes.length) {
                    for (let node of m.addedNodes) {
                        if (node.nodeType === 1) {
                            if (node.classList.contains('w-scene-card')) {
                                checkCard(node);
                            } else if (node.querySelector) {
                                const cards = node.querySelectorAll('.w-scene-card:not([data-studio-checked="1"])');
                                cards.forEach(checkCard);
                            }
                        }
                    }
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    initUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'pdb-filter-overlay';

        this.modal = document.createElement('div');
        this.modal.id = 'pdb-filter-modal';
        this.modal.innerHTML = `
            <div class="pdb-modal-header">
                <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg> 厂牌过滤白名单</h3>
                <button id="pdb-modal-close" style="background:none; border:none; color:#9ca3af; cursor:pointer; font-size:18px;">✕</button>
            </div>
            <div class="pdb-modal-body" id="pdb-studios-list"></div>
            <div class="pdb-modal-footer">
                <div class="pdb-btn-row">
                    <button class="pdb-btn pdb-btn-secondary" id="pdb-select-all">全部勾选</button>
                    <button class="pdb-btn pdb-btn-secondary" id="pdb-select-invert">反向选择</button>
                </div>
                <div class="pdb-btn-row">
                    <button class="pdb-btn pdb-btn-primary" id="pdb-apply-temp" title="仅改变当前页面的展示，不修改默认配置">仅本次生效</button>
                    <button class="pdb-btn pdb-btn-warning" id="pdb-save-default" title="保存当前勾选项为默认白名单，下次打开网页自动生效">保存为默认白名单</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.overlay);
        document.body.appendChild(this.modal);

        this.overlay.onclick = () => this.hideModal();
        this.modal.querySelector('#pdb-modal-close').onclick = () => this.hideModal();

        this.modal.querySelector('#pdb-select-all').onclick = () => {
            this.modal.querySelectorAll('.pdb-checkbox').forEach(cb => { cb.checked = true; this.updateItemStyle(cb); });
        };
        this.modal.querySelector('#pdb-select-invert').onclick = () => {
            this.modal.querySelectorAll('.pdb-checkbox').forEach(cb => { cb.checked = !cb.checked; this.updateItemStyle(cb); });
        };
        this.modal.querySelector('#pdb-apply-temp').onclick = () => {
            this.applyFilter(false);
            this.hideModal();
        };
        this.modal.querySelector('#pdb-save-default').onclick = () => {
            this.applyFilter(true);
            const btn = this.modal.querySelector('#pdb-save-default');
            const oldText = btn.innerText;
            btn.innerText = '已成功覆写配置！';
            setTimeout(() => { btn.innerText = oldText; this.hideModal(); }, 1200);
        };
    }

    updateItemStyle(cb) {
        const item = cb.closest('.pdb-filter-item');
        if (cb.checked) item.classList.add('is-active');
        else item.classList.remove('is-active');
    }

    renderList() {
        const cards = document.querySelectorAll('.grid-cols-scene-card .w-scene-card');
        this.currentStudioMap.clear();

        cards.forEach(card => {
            const name = card.dataset.studioName || '未知片商';
            if (!this.currentStudioMap.has(name)) this.currentStudioMap.set(name, []);
            this.currentStudioMap.get(name).push(card);
        });

        const listContainer = this.modal.querySelector('#pdb-studios-list');
        let html = '';
        const sorted = Array.from(this.currentStudioMap.entries()).sort((a, b) => b[1].length - a[1].length);

        if (sorted.length === 0) {
            html = `<div style="text-align:center; color:#6b7280; padding:20px 0;">当前页面未解析到片商数据</div>`;
        } else {
            sorted.forEach(([name, arr]) => {
                const normName = this.normalize(name);
                const isShowing = arr[0].dataset.studioHidden !== '1';
                html += `
                    <label class="pdb-filter-item ${isShowing ? 'is-active' : ''}">
                        <input type="checkbox" class="pdb-checkbox" data-norm-name="${normName}" ${isShowing ? 'checked' : ''}>
                        <span class="pdb-studio-name">${name}</span>
                        <span class="pdb-studio-count">${arr.length} 部</span>
                    </label>
                `;
            });
        }
        listContainer.innerHTML = html;
        listContainer.querySelectorAll('.pdb-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => this.updateItemStyle(e.target));
        });
    }

    applyFilter(saveAsDefault = false) {
        const checkedNormNames = Array.from(this.modal.querySelectorAll('.pdb-checkbox:checked')).map(cb => cb.dataset.normName);
        const uncheckedNormNames = Array.from(this.modal.querySelectorAll('.pdb-checkbox:not(:checked)')).map(cb => cb.dataset.normName);

        document.querySelectorAll('.grid-cols-scene-card .w-scene-card').forEach(card => {
            const normName = this.normalize(card.dataset.studioName);
            if (checkedNormNames.includes(normName)) {
                delete card.dataset.studioHidden;
            } else {
                card.dataset.studioHidden = '1';
            }
        });

        if (saveAsDefault) {
            let mergedSet = new Set(this.whitelist);
            checkedNormNames.forEach(name => mergedSet.add(name));
            uncheckedNormNames.forEach(name => mergedSet.delete(name));
            this.whitelist = Array.from(mergedSet);
            this.saveWhitelist(this.whitelist);
        }
    }

    showModal() {
        this.renderList();
        this.overlay.style.display = 'block';
        this.modal.style.display = 'flex';
    }

    hideModal() {
        this.overlay.style.display = 'none';
        this.modal.style.display = 'none';
    }

    ensureTopButton(doc) {
        if (!location.href.includes('/performers/') && !location.href.includes('/performer-sites/')) return;
        if (doc.getElementById('pdb-top-filter-btn')) return;

        const group = doc.getElementById('jav-filter-group');
        if (!group) return;

        const btn = doc.createElement('button');
        btn.id = 'pdb-top-filter-btn';
        btn.className = 'jav-filter-btn active';
        btn.innerHTML = `厂牌过滤`;

        btn.onclick = (e) => {
            e.preventDefault();
            this.showModal();
        };

        group.appendChild(btn);
    }
};