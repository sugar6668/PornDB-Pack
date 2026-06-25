/**
 * @name         PornPack DOM Tweaks Library
 * @description  PornDB 站点样式与页面结构改造模块
 * @version      1.0.0
 */

window.PornDOMTweaks = class PornDOMTweaks {
    // 1. 注入防闪烁全局 CSS 结界
    static initGlobalStyles() {
       
    }

    // 2. 统一寻找挂载容器（独立安全容器版）
    static getOrCreateActionBar(doc) {
        let group = doc.getElementById('jav-filter-group');
        if (group) return group;

        // [ADD] 核心级高优先级拦截：完美瞄准原网页 Search 按钮所在的右对齐整行容器
        const searchRow = doc.querySelector('.flex.justify-end.mb-3');
        if (searchRow) {
            group = doc.createElement('div');
            group.id = 'jav-filter-group';
            group.className = 'jav-filter-group';
            // [ADD] 针对 Search 行定制无缝版面样式
            group.style.cssText = 'display: flex; align-items: center; gap: 8px; margin: 0 15px 0 0 !important; padding: 0; flex-wrap: wrap; box-sizing: border-box;';
            // [ADD] 将轻量化容器插到该行的最左侧（firstChild 守护位）
            searchRow.insertBefore(group, searchRow.firstChild);
            return group;
        }

        // [MOD] 平滑兜底：若当前页面没有 Search 这一行，则退回原本安全的瀑布流网格上方块级方案
        const grid = doc.querySelector('.grid-cols-scene-card') || doc.querySelector('.grid-cols-performer-site-card');
        if (grid) {
            group = doc.createElement('div');
            group.id = 'jav-filter-group';
            group.className = 'jav-filter-group';
            group.style.cssText = 'display: flex; width: 100%; margin: 5px 0 15px 0; padding: 12px; background: #fdfdfd; border: 1px dashed #7b5ea7; border-radius: 8px; justify-content: flex-start; align-items: center; gap: 8px; flex-wrap: wrap; box-sizing: border-box;';
            grid.parentNode.insertBefore(group, grid);
            return group;
        }
        return null;
    }

    // ==========================================
    // 模块：瀑布流状态过滤器
    // ==========================================
    static ensureFilterButtons(doc) {
        const group = this.getOrCreateActionBar(doc);
        if (!group || doc.getElementById('west-status-filter-all')) return;

        const filters = [
            { id: 'all', text: '显示所有' },
            { id: 'matched', text: '显示已匹配' },
            { id: 'unmatched', text: '显示未匹配' }
        ];

        filters.forEach((f, idx) => {
            const btn = doc.createElement('button');
            btn.id = `west-status-filter-${f.id}`;
            btn.className = `jav-filter-btn ${idx === 0 ? 'active' : ''}`;
            btn.innerText = f.text;

            btn.onclick = (e) => {
                e.preventDefault();
                doc.querySelectorAll('[id^="west-status-filter-"]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                doc.body.classList.remove('filter-mode-matched', 'filter-mode-unmatched');
                if (f.id !== 'all') doc.body.classList.add(`filter-mode-${f.id}`);
            };
            group.appendChild(btn);
        });
    }

    // ==========================================
    // 模块：演员页面全局资料折叠 (物理零闪烁版)
    // ==========================================
    static ensurePerformerPanelToggle(doc) {
        if (!location.href.includes('/performers/') && !location.href.includes('/performer-sites/')) return;

        // 无论 Vue 怎么重建 DOM，只要进入演员页，立刻在 body 上加结界锁
        if (!doc.body.classList.contains('west-info-collapsed') && !doc.body.dataset.panelInit) {
            doc.body.classList.add('west-info-collapsed');
            doc.body.dataset.panelInit = '1';
        }

        const group = this.getOrCreateActionBar(doc);
        if (!group) return;

        // 【精准隐藏】：寻找上面那一层用来展示“资料/外部链接”的 n-tabs 并打上隐藏标记
        const allTabs = Array.from(doc.querySelectorAll('.n-tabs'));
        for (let tabWrap of allTabs) {
            // 利用原生特征识别
            if (tabWrap.querySelector('[data-name="info"], [data-name="sites"]')) {
                if (!tabWrap.classList.contains('west-info-tab-node')) {
                    tabWrap.classList.add('west-info-tab-node');
                }
                break;
            }
        }

        let btn = doc.getElementById('west-performer-toggle');
        if (!btn) {
            btn = doc.createElement('button');
            btn.id = 'west-performer-toggle';
            btn.className = 'jav-filter-btn';
            btn.onclick = (e) => {
                e.preventDefault();
                doc.body.classList.toggle('west-info-collapsed');
                this.updateToggleButton(btn, doc.body.classList.contains('west-info-collapsed'), '资料');
            };
            group.insertBefore(btn, group.firstChild); // 插在控制台最前面
        }
        this.updateToggleButton(btn, doc.body.classList.contains('west-info-collapsed'), '资料');
    }

    // ==========================================
    // 模块：相似推荐折叠 (物理零闪烁版)
    // ==========================================
    static ensureSimilarScenesToggle(doc) {
        if (!location.href.includes('/scenes/') && !location.href.includes('/performers/') && !location.href.includes('/performer-sites/')) return;

        if (!doc.body.classList.contains('west-similar-collapsed') && !doc.body.dataset.similarInit) {
            doc.body.classList.add('west-similar-collapsed');
            doc.body.dataset.similarInit = '1';
        }

        const group = this.getOrCreateActionBar(doc);
        if (!group) return;

        // [ADD] 动态寻找推荐网格，并打上隐藏标靶（精准区分作品页和演员页）
        let similarGrid = null;
        if (location.href.includes('/scenes/')) {
            similarGrid = doc.querySelector('.grid-cols-scene-card'); // 详情页的推荐是作品卡片
        } else {
            similarGrid = doc.querySelector('.grid-cols-performer-card'); // 演员页的推荐是演员卡片
        }
        if (similarGrid && !similarGrid.classList.contains('west-similar-grid-node')) {
            similarGrid.classList.add('west-similar-grid-node');
        }

        let btn = doc.getElementById('west-similar-toggle');
        if (!btn) {
            btn = doc.createElement('button');
            btn.id = 'west-similar-toggle';
            btn.className = 'jav-filter-btn';
            btn.onclick = (e) => {
                e.preventDefault();
                doc.body.classList.toggle('west-similar-collapsed');
                this.updateToggleButton(btn, doc.body.classList.contains('west-similar-collapsed'), '推荐');
            };
            group.appendChild(btn); // 插在控制台最后面
        }
        this.updateToggleButton(btn, doc.body.classList.contains('west-similar-collapsed'), '推荐');
    }

    // 更新按钮高亮与文字状态
    static updateToggleButton(btn, isCollapsed, typeName) {
        if (isCollapsed) {
            btn.classList.add('active');
            btn.innerHTML = `显示${typeName}`;
        } else {
            btn.classList.remove('active');
            btn.innerHTML = `收起${typeName}`;
        }
    }
};