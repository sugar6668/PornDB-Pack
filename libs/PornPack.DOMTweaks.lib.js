/**
 * @name         PornPack DOM Tweaks Library
 * @description  PornDB 站点样式与页面结构改造模块
 * @version      1.0.0
 */

window.PornDOMTweaks = class PornDOMTweaks {
    // 1. 注入防闪烁全局 CSS 结界
    static initGlobalStyles() {
        if (document.getElementById('west-dom-tweaks-css')) return;
        const style = document.createElement('style');
        style.id = 'west-dom-tweaks-css';
        style.innerHTML = `
            /* 资料与推荐防闪烁隐藏结界 */
            body.west-info-collapsed .w-full.bg-white.shadow-sm.rounded-sm.overflow-hidden.p-4.mb-5,
            body.west-info-collapsed .n-tabs.n-tabs--card-type.n-tabs--medium-size.n-tabs--top { display: none !important; }
            body.west-similar-collapsed .grid-cols-performer-card { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    // 2. 统一寻找或建立挂载容器
    static getOrCreateActionBar(doc) {
        let group = doc.getElementById('jav-filter-group');
        if (group) return group;

        // [核心要求]：精准挂载到原生的 tab 滚动容器中
        const scrollContent = doc.querySelector('.n-tabs-nav-scroll-content');
        if (scrollContent) {
            group = doc.createElement('div');
            group.id = 'jav-filter-group';
            group.className = 'jav-filter-group';
            // 使用内联 flex 完美接在原生 tab 标签序列的最后方
            group.style.cssText = 'display: inline-flex; align-items: center; gap: 8px; margin-left: 15px; padding-right: 15px;';
            scrollContent.appendChild(group);
            return group;
        }

        // 备用兜底（影片详情页可能没有 tab，放在网格上方）
        const grid = doc.querySelector('.grid-cols-scene-card') || doc.querySelector('.grid-cols-performer-site-card');
        if (grid) {
            group = doc.createElement('div');
            group.id = 'jav-filter-group';
            group.className = 'jav-filter-group';
            group.style.cssText = 'display: flex; width: 100%; margin: 15px 0; justify-content: flex-start; gap: 8px;';
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
        if (!location.href.includes('/performers/')) return;
        this.initGlobalStyles();

        // 无论 DOM 怎么重建，只要是演员页，立刻在 body 上加折叠锁
        if (!doc.body.classList.contains('west-info-collapsed') && !doc.body.dataset.panelInit) {
            doc.body.classList.add('west-info-collapsed');
            doc.body.dataset.panelInit = '1';
        }

        if (doc.getElementById('west-performer-toggle')) return;

        const group = this.getOrCreateActionBar(doc);
        if (!group) return;

        const btn = doc.createElement('button');
        btn.id = 'west-performer-toggle';
        btn.className = 'jav-filter-btn active';
        btn.innerHTML = doc.body.classList.contains('west-info-collapsed') ? '展开资料' : '收起资料';

        btn.onclick = (e) => {
            e.preventDefault();
            const isCollapsed = doc.body.classList.toggle('west-info-collapsed');
            btn.classList.toggle('active', isCollapsed);
            btn.innerHTML = isCollapsed ? '展开资料' : '收起资料';
        };

        group.insertBefore(btn, group.firstChild); // 插在最前面
    }

    // ==========================================
    // 模块：相似推荐折叠 (物理零闪烁版)
    // ==========================================
    static ensureSimilarScenesToggle(doc) {
        if (!location.href.includes('/scenes/') && !location.href.includes('/performers/')) return;
        this.initGlobalStyles();

        if (!doc.body.classList.contains('west-similar-collapsed') && !doc.body.dataset.similarInit) {
            doc.body.classList.add('west-similar-collapsed');
            doc.body.dataset.similarInit = '1';
        }

        if (doc.getElementById('west-similar-toggle')) return;

        const group = this.getOrCreateActionBar(doc);
        if (!group) return;

        const btn = doc.createElement('button');
        btn.id = 'west-similar-toggle';
        btn.className = 'jav-filter-btn active';
        btn.innerHTML = doc.body.classList.contains('west-similar-collapsed') ? '显示推荐' : '收起推荐';

        btn.onclick = (e) => {
            e.preventDefault();
            const isCollapsed = doc.body.classList.toggle('west-similar-collapsed');
            btn.classList.toggle('active', isCollapsed);
            btn.innerHTML = isCollapsed ? '显示推荐' : '收起推荐';
        };

        group.appendChild(btn);
    }
};