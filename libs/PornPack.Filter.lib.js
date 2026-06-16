/**
 * @name         PornPack Filter Library
 * @description  PornDB 厂牌白名单极速过滤模块
 * @version      1.0.0
 */

window.PornFilter = class PornFilter {
    constructor(defaultWhitelist = []) {
        this.storageKey = 'pdb_studio_whitelist_v1';
        // 正则化函数：统一转小写，并剔除所有空格和点，以完美匹配 "blackedraw" 和 "Blacked Raw" 等
        this.normalize = (name) => String(name).toLowerCase().replace(/[\s.]/g, '');
        
        // 存入和读取的白名单均强制统一为正则化格式
        this.whitelist = this.loadWhitelist(defaultWhitelist.map(this.normalize));
        this.currentStudioMap = new Map();
        
        this.initCSS();
        this.initUI();
        this.startFastTagger();
    }

    loadWhitelist(defaultList) {
        if (typeof GM_getValue !== 'undefined') {
            const saved = GM_getValue(this.storageKey);
            if (saved && Array.isArray(saved)) return saved;
        }
        return defaultList;
    }

    saveWhitelist(list) {
        this.whitelist = list;
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue(this.storageKey, list);
        }
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

    startFastTagger() {
        const checkCard = (card) => {
            if (card.dataset.studioChecked) return;
            const studioLink = card.querySelector('a[href*="/sites/"]');
            if (studioLink) {
                const studioName = studioLink.textContent.trim() || studioLink.querySelector('img')?.getAttribute('title') || '未知片商';
                card.dataset.studioName = studioName; // 保留原始排版名称供 UI 展示
                const normName = this.normalize(studioName);
                
                if (!this.whitelist.includes(normName)) {
                    card.dataset.studioHidden = '1'; // 挂载结界，瞬间 CSS 隐藏
                }
                card.dataset.studioChecked = '1';
            }
        };

        document.querySelectorAll('.grid-cols-scene-card .w-scene-card').forEach(checkCard);

        new MutationObserver((mutations) => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.classList.contains('w-scene-card')) {
                        checkCard(node);
                    } else if (node.nodeType === 1 && node.querySelector) {
                        node.querySelectorAll('.w-scene-card').forEach(checkCard);
                    }
                });
            });
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

        // 收集所有片商及其在当前页卡片数量
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
        // 读取此时面板上打着勾的正则化名称，形成新的白名单数组
        const checkedNormNames = Array.from(this.modal.querySelectorAll('.pdb-checkbox:checked')).map(cb => cb.dataset.normName);
        
        document.querySelectorAll('.grid-cols-scene-card .w-scene-card').forEach(card => {
            const normName = this.normalize(card.dataset.studioName);
            if (checkedNormNames.includes(normName)) {
                delete card.dataset.studioHidden; // 移除结界，重新显示
            } else {
                card.dataset.studioHidden = '1';  // 加上结界，隐藏卡片
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
        if (!location.href.includes('/performers/')) return;
        const filterGroup = doc.getElementById('jav-filter-group');
        if (!filterGroup || doc.getElementById('pdb-top-filter-btn')) return;

        const btn = doc.createElement('button');
        btn.id = 'pdb-top-filter-btn';
        btn.className = 'jav-filter-btn';
        btn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; color: #10b981; border-color: #10b981; font-weight: bold;';
        btn.innerHTML = `⚙️ 厂牌过滤`;
        
        btn.onclick = (e) => {
            e.preventDefault();
            this.showModal();
        };

        // 插入过滤按钮容器中
        filterGroup.appendChild(btn);
    }
};