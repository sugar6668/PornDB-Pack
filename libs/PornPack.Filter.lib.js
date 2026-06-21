/**
 * @name         PornPack Filter Library
 * @description  PornDB 厂牌白名单极速过滤模块
 * @version      1.0.0
 */

window.PornFilter = class PornFilter {
    constructor(defaultWhitelist = []) {
        this.storageKey = 'pdb_studio_whitelist_v1';

        // 【核心修复】：必须初始化这个 Map 容器，否则点击按钮渲染列表时会崩溃！
        this.currentStudioMap = new Map();

        // 1. 厂牌名格式化算法（切分冒号、去空格去点、转小写）
        this.normalize = (name) => String(name).split(':')[0].toLowerCase().replace(/[\s.]/g, '');

        // 2. 将传入的默认数组进行规范化
        const defaults = defaultWhitelist.map(this.normalize);

        // 3. 读取本地浏览器缓存（如果没缓存则返回空数组）
        const cached = this.loadWhitelist ? this.loadWhitelist([]) : [];

        // 4. 取并集！强制把代码里最新的 DEFAULT_STUDIOS 塞进白名单，并自动去重
        this.whitelist = [...new Set([...defaults, ...cached])];

        // 5. 把合并后的最全名单重新存回硬盘，刷新缓存
        if (this.saveWhitelist) this.saveWhitelist(this.whitelist);
        this.initCSS();

        // 自动调用弹窗初始化函数
        if (typeof this.initModal === 'function') this.initModal();
        else if (typeof this.createModal === 'function') this.createModal();
        else if (typeof this.initUI === 'function') this.initUI();

        this.startFastTagger();
    }

    loadWhitelist(defaultList) {
        // 内部辅助函数：安全解析并验证是否为数组
        const parseValidArray = (val) => {
            try {
                const parsed = typeof val === 'string' ? JSON.parse(val) : val;
                return Array.isArray(parsed) ? parsed : null;
            } catch (e) {
                return null;
            }
        };

        // 1. 优先尝试从油猴 (GM_getValue) 读取
        if (typeof GM_getValue === 'function') {
            const saved = parseValidArray(GM_getValue(this.storageKey));
            if (saved) return saved; // 读到有效数据直接返回，提前结束函数
        }

        // 2. 兜底尝试从 localStorage 读取
        try {
            const localSaved = parseValidArray(localStorage.getItem(this.storageKey));
            if (localSaved) return localSaved; // 读到兜底数据直接返回
        } catch (e) { } // 捕获隐身模式下访问 localStorage 可能抛出的异常

        // 3. 都没读到，返回默认列表
        return defaultList;
    }

    saveWhitelist(list) {
        this.whitelist = list;
        const jsonStr = JSON.stringify(list); // 统一序列化，解决原生数组拦截问题

        // 1. 写入油猴沙盒
        if (typeof GM_setValue === 'function') {
            try { GM_setValue(this.storageKey, jsonStr); } catch (e) { }
        }

        // 2. 双重备份至 localStorage
        try { localStorage.setItem(this.storageKey, jsonStr); } catch (e) { }
    }

    initCSS() {
        const style = document.createElement('style');
        style.innerHTML = `
            /* 极速隐藏结界 */
            .grid-cols-scene-card .w-scene-card[data-studio-hidden="1"] { display: none !important; }
            
            /* 现代化 Modal UI */
            #pdb-filter-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 999998; display: none;
            }
            #pdb-filter-modal {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                z-index: 999999; background: #1f2937; color: #f3f4f6; border: 1px solid #374151;
                border-radius: 12px; width: 380px; max-height: 85vh; display: none;
                flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.5); font-family: sans-serif;
            }
            .pdb-modal-header { padding: 16px 20px; border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center; }
            .pdb-modal-header h3 { margin: 0; font-size: 16px; color: #fff; font-weight: 600; display:flex; align-items:center; gap:8px;}
            .pdb-modal-body { padding: 12px 20px; overflow-y: auto; flex: 1; }
            .pdb-modal-footer { padding: 16px 20px; border-top: 1px solid #374151; background: #111827; border-radius: 0 0 12px 12px; display: flex; flex-direction: column; gap: 10px; }
            
            .pdb-filter-item { 
                display: flex; justify-content: space-between; align-items: center; 
                padding: 10px 12px; margin-bottom: 8px; background: #374151; border-radius: 8px; cursor: pointer; transition: 0.2s; border: 1px solid transparent;
            }
            .pdb-filter-item:hover { background: #4b5563; border-color: #6b7280; }
            .pdb-filter-item.is-active { border-color: #10b981; background: rgba(16, 185, 129, 0.1); }
            
            .pdb-checkbox { width: 18px; height: 18px; accent-color: #10b981; cursor: pointer; }
            .pdb-studio-name { font-size: 14px; font-weight: 500; flex: 1; margin-left: 10px; }
            .pdb-studio-count { font-size: 12px; background: #4b5563; padding: 2px 8px; border-radius: 12px; color: #d1d5db; font-weight: bold; }
            
            .pdb-btn-row { display: flex; gap: 10px; }
            .pdb-btn { flex: 1; padding: 9px 0; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; text-align: center; }
            .pdb-btn-primary { background: #10b981; color: #fff; }
            .pdb-btn-primary:hover { background: #059669; }
            .pdb-btn-warning { background: #f59e0b; color: #fff; }
            .pdb-btn-warning:hover { background: #d97706; }
            .pdb-btn-secondary { background: #4b5563; color: #fff; }
            .pdb-btn-secondary:hover { background: #6b7280; }
        `;
        document.head.appendChild(style);
    }

    // [ADD] 极速打标器：利用微任务队列，在浏览器渲染新卡片前瞬间判定并隐藏
    startFastTagger() {
        // 【核心修复】：过滤拦截只在演员及演员子站页面生效！厂牌主页、搜索页等一律罢工放行！
        if (!location.href.includes('/performers/') && !location.href.includes('/performer-sites/')) return;

        const checkCard = (card) => {
            if (card.dataset.studioChecked) return;
            card.dataset.studioChecked = '1';

            const studioLink = card.querySelector('a[href*="/sites/"]');
            if (studioLink) {
                const studioName = studioLink.textContent.trim() || studioLink.querySelector('img')?.getAttribute('title') || '未知片商';
                card.dataset.studioName = studioName;
                const normName = this.normalize(studioName);

                // 如果命中黑名单，瞬间打上隐藏标签
                if (!this.whitelist.includes(normName)) {
                    card.dataset.studioHidden = '1';
                }
            }
        };

        // 页面初始加载时的扫描
        document.querySelectorAll('.grid-cols-scene-card .w-scene-card:not([data-studio-checked="1"])').forEach(checkCard);

        // 监听 Vue 动态插入（翻页/切换路由）
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

        document.querySelectorAll('.grid-cols-scene-card .w-scene-card').forEach(card => {
            const normName = this.normalize(card.dataset.studioName);
            if (checkedNormNames.includes(normName)) {
                delete card.dataset.studioHidden;
            } else {
                card.dataset.studioHidden = '1';
            }
        });

        if (saveAsDefault) {
            this.saveWhitelist(checkedNormNames);
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
        // 【逻辑同步】：过滤按钮也绝不允许在厂牌页(/sites/)出现，防止引起逻辑混乱
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