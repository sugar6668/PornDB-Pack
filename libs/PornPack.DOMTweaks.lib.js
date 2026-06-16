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
            /* 资料与推荐防闪烁隐藏结界 (交由 C++ 原生渲染管线在绘制前抹除) */
            body.west-info-collapsed .w-full.bg-white.shadow-sm.rounded-sm.overflow-hidden.p-4.mb-5,
            body.west-info-collapsed .west-info-tab-node { display: none !important; }
            body.west-similar-collapsed .grid-cols-performer-card { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    // 2. 统一寻找挂载容器 (核心修复：精确制导，避开被隐藏的资料 Tab)
    static getOrCreateActionBar(doc) {
        let group = doc.getElementById('jav-filter-group');
        if (group) return group;

        // 演员页面有多个 n-tabs，必须精确找到包含“视频/JAV/Scenes”的那个真实作品容器！
        const allTabs = Array.from(doc.querySelectorAll('.n-tabs'));
        // 倒序查找，或者通过文本匹配，确保找到的是视频列表上方的 Tab
        let targetTabs = allTabs.find(tab => tab.innerText.includes('JAV') || tab.innerText.includes('Scenes')) || allTabs[allTabs.length - 1];

        if (targetTabs) {
            const scrollContent = targetTabs.querySelector('.n-tabs-nav-scroll-content');
            if (scrollContent) {
                group = doc.createElement('div');
                group.id = 'jav-filter-group';
                group.className = 'jav-filter-group';
                // 使用 margin-left: auto 把按钮完美推到原生标签的右侧
                group.style.cssText = 'display: inline-flex; align-items: center; gap: 8px; margin-left: auto; padding-right: 15px;';
                scrollContent.appendChild(group);
                return group;
            }
        }

        // 备用兜底（影片详情页可能没有 tab，直接放在网格上方）
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

        // 无论 Vue 怎么重建 DOM，只要进入演员页，立刻在 body 上加结界锁
        if (!doc.body.classList.contains('west-info-collapsed') && !doc.body.dataset.panelInit) {
            doc.body.classList.add('west-info-collapsed');
            doc.body.dataset.panelInit = '1';
        }

        const group = this.getOrCreateActionBar(doc);
        if (!group) return;

        // 识别那个用于展示参数的 Info Tab，动态给它挂上标记，配合 CSS 进行防闪烁隐藏
        const allTabs = Array.from(doc.querySelectorAll('.n-tabs'));
        const infoTabs = allTabs.find(tab => tab.innerText.includes('Info') || tab.innerText.includes('Sites'));
        if (infoTabs && !infoTabs.classList.contains('west-info-tab-node')) {
            infoTabs.classList.add('west-info-tab-node');
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
        if (!location.href.includes('/scenes/') && !location.href.includes('/performers/')) return;
        this.initGlobalStyles();

        if (!doc.body.classList.contains('west-similar-collapsed') && !doc.body.dataset.similarInit) {
            doc.body.classList.add('west-similar-collapsed');
            doc.body.dataset.similarInit = '1';
        }

        const group = this.getOrCreateActionBar(doc);
        if (!group) return;

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