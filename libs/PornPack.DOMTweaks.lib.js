/**
 * @name         PornPack DOM Tweaks Library
 * @description  PornDB 站点样式与页面结构改造模块（过滤器、资料折叠等）
 * @version      1.0.0
 */

window.PornDOMTweaks = class PornDOMTweaks {

    // ==========================================
    // 1. 瀑布流状态过滤器模块
    // ==========================================
    static ensureFilterButtons(doc) {
        // 找到 tabs 的滚动容器和 JAV 标签页
        const scrollContent = doc.querySelector('.n-tabs-nav-scroll-content');
        const javTab = doc.querySelector('div[data-name="jav"]');

        if (scrollContent && javTab && !doc.getElementById('jav-filter-group')) {
            const group = doc.createElement('div');
            group.id = 'jav-filter-group';
            group.className = 'jav-filter-group';

            const filters = [
                { id: 'all', text: '显示所有' },
                { id: 'matched', text: '显示已匹配' },
                { id: 'unmatched', text: '显示未匹配' }
            ];

            filters.forEach((f, idx) => {
                const btn = doc.createElement('button');
                btn.className = `jav-filter-btn ${idx === 0 ? 'active' : ''}`;
                btn.innerText = f.text;

                btn.onclick = (e) => {
                    e.preventDefault();
                    // 切换按钮高亮
                    group.querySelectorAll('.jav-filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // 切换 body class，触发 CSS 引擎规则
                    doc.body.classList.remove('filter-mode-matched', 'filter-mode-unmatched');
                    if (f.id !== 'all') {
                        doc.body.classList.add(`filter-mode-${f.id}`);
                    }
                };
                group.appendChild(btn);
            });

            scrollContent.appendChild(group);
        }
    }

    // ==========================================
    // 2. 演员页面全局资料折叠模块
    // ==========================================
    static ensurePerformerPanelToggle(doc) {
        if (!location.href.includes('/performers/')) return;
        if (doc.getElementById('west-performer-toggle')) return;

        // 定位到底部的视频导航栏
        const allTabs = Array.from(doc.querySelectorAll('.n-tabs'));
        const videoTabs = allTabs.find(tab => tab.innerText.includes('JAV(s)') || tab.innerText.includes('Scenes'));
        if (!videoTabs) return;

        // 定位上方的参数资料导航栏和卡片
        const infoTabs = allTabs.find(tab => tab.innerText.includes('Info') || tab.innerText.includes('Sites'));
        const targetCards = Array.from(doc.querySelectorAll('.w-full.bg-white.shadow-sm.rounded-sm.overflow-hidden.p-4.mb-5'));

        const elementsToHide = [...targetCards];
        if (infoTabs) elementsToHide.push(infoTabs);
        if (elementsToHide.length === 0) return;

        const scrollContent = videoTabs.querySelector('.n-tabs-nav-scroll-content');
        if (!scrollContent) return;

        // 获取或创建过滤按钮组容器
        let filterGroup = doc.getElementById('jav-filter-group');
        if (!filterGroup) {
            filterGroup = doc.createElement('div');
            filterGroup.id = 'jav-filter-group';
            filterGroup.className = 'jav-filter-group';
            scrollContent.appendChild(filterGroup);
        } else if (!scrollContent.contains(filterGroup)) {
            scrollContent.appendChild(filterGroup);
        }

        // 创建折叠开关
        const btn = doc.createElement('button');
        btn.id = 'west-performer-toggle';
        btn.className = 'jav-filter-btn';
        btn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; white-space: nowrap;';

        let isCollapsed = true;
        const iconExpand = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="margin-left: 4px; flex-shrink: 0;"><path fill="currentColor" d="M13.79 10.21a1 1 0 0 0 1.42 0a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-.33-.21a1 1 0 0 0-.76 0a1 1 0 0 0-.33.21l-2.5 2.5a1 1 0 0 0 1.42 1.42l.79-.8v5.18l-.79-.8a1 1 0 0 0-1.42 1.42l2.5 2.5a1 1 0 0 0 .33.21a.94.94 0 0 0 .76 0a1 1 0 0 0 .33-.21l2.5-2.5a1 1 0 0 0-1.42-1.42l-.79.8V9.41ZM7 4h10a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2m10 16H7a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2"/></svg>`;
        const iconCollapse = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="margin-left: 4px; flex-shrink: 0;"><path fill="currentColor" d="M7 11h10a1 1 0 0 0 0-2h-4V5.41l.79.8a1 1 0 0 0 1.42 0a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-.33-.21a1 1 0 0 0-.76 0a1 1 0 0 0-.33.21l-2.5 2.5a1 1 0 0 0 1.42 1.42l.79-.8V9H7a1 1 0 0 0 0 2m10 2H7a1 1 0 0 0 0 2h4v3.59l-.79-.8a1 1 0 0 0-1.42 1.42l2.5 2.5a1 1 0 0 0 .33.21a.94.94 0 0 0 .76 0a1 1 0 0 0 .33-.21l2.5-2.5a1 1 0 0 0-1.42-1.42l-.79.8V15h4a1 1 0 0 0 0-2"/></svg>`;

        const updateUI = () => {
            btn.innerHTML = isCollapsed ? `展开资料 ${iconExpand}` : `收起资料 ${iconCollapse}`;
            if (isCollapsed) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
            elementsToHide.forEach(el => {
                if (el) el.style.display = isCollapsed ? 'none' : '';
            });
        };

        btn.onclick = (e) => {
            e.preventDefault();
            isCollapsed = !isCollapsed;
            updateUI();
        };

        filterGroup.insertBefore(btn, filterGroup.firstChild);
        updateUI();
    }
    // 3. 详情页/演员页 相似推荐折叠模块 (精准阻断懒加载请求)
    static ensureSimilarScenesToggle(doc) {
        // [MOD] 放开限制，允许在影片页和演员页同时运行
        if (!location.href.includes('/scenes/') && !location.href.includes('/performers/')) return;
        if (doc.getElementById('west-similar-toggle')) return; // 防止重复创建

        let sceneGrid = null;
        let performerGrid = null;

        // [MOD] 智能分流，防止在演员页把演员本人的正片给误杀了！
        if (location.href.includes('/scenes/')) {
            // 在影片页：可以隐藏下方的“相似影片”和“相似演员”
            sceneGrid = doc.querySelector('.grid.grid-cols-scene-card.justify-items-center.gap-x-2.gap-y-4');
            performerGrid = doc.querySelector('.grid.grid-cols-performer-card.justify-items-center.gap-x-2.gap-y-4');
        } else if (location.href.includes('/performers/')) {
            // 在演员页：只隐藏下方的“相似演员”，绝不能动 sceneGrid（那是正片）
            performerGrid = doc.querySelector('.grid.grid-cols-performer-card.justify-items-center.gap-x-2.gap-y-4');
        }

        const targets = [sceneGrid, performerGrid].filter(Boolean);
        if (targets.length === 0) return;

        // [MOD] 采用与脚本完全一致的按钮类名和样式
        const btn = doc.createElement('button');
        btn.id = 'west-similar-toggle';
        btn.className = 'jav-filter-btn active'; // 初始为紫色激活状态
        btn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; white-space: nowrap;';

        let isCollapsed = true;
        const iconExpand = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="margin-left: 4px; flex-shrink: 0;"><path fill="currentColor" d="M13.79 10.21a1 1 0 0 0 1.42 0a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-.33-.21a1 1 0 0 0-.76 0a1 1 0 0 0-.33.21l-2.5 2.5a1 1 0 0 0 1.42 1.42l.79-.8v5.18l-.79-.8a1 1 0 0 0-1.42 1.42l2.5 2.5a1 1 0 0 0 .33.21a.94.94 0 0 0 .76 0a1 1 0 0 0 .33-.21l2.5-2.5a1 1 0 0 0-1.42-1.42l-.79.8V9.41ZM7 4h10a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2m10 16H7a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2"/></svg>`;
        const iconCollapse = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="margin-left: 4px; flex-shrink: 0;"><path fill="currentColor" d="M7 11h10a1 1 0 0 0 0-2h-4V5.41l.79.8a1 1 0 0 0 1.42 0a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-.33-.21a1 1 0 0 0-.76 0a1 1 0 0 0-.33.21l-2.5 2.5a1 1 0 0 0 1.42 1.42l.79-.8V9H7a1 1 0 0 0 0 2m10 2H7a1 1 0 0 0 0 2h4v3.59l-.79-.8a1 1 0 0 0-1.42 1.42l2.5 2.5a1 1 0 0 0 .33.21a.94.94 0 0 0 .76 0a1 1 0 0 0 .33-.21l2.5-2.5a1 1 0 0 0-1.42-1.42l-.79.8V15h4a1 1 0 0 0 0-2"/></svg>`;

        const updateUI = () => {
            btn.innerHTML = isCollapsed ? `显示推荐 ${iconExpand}` : `收起推荐 ${iconCollapse}`;
            if (isCollapsed) {
                btn.classList.add('active');
                targets.forEach(el => el.style.display = 'none');
            } else {
                btn.classList.remove('active');
                targets.forEach(el => el.style.display = '');
            }
        };

        btn.onclick = (e) => {
            e.preventDefault();
            isCollapsed = !isCollapsed;
            updateUI();
        };

        // [MOD] 按钮位置：智能吸附“放到一块”
        const existingGroup = doc.getElementById('jav-filter-group');
        if (existingGroup) {
            // 如果页面里已经有按钮组（比如演员页的“展开资料”旁边），直接追加到一起
            existingGroup.appendChild(btn);
        } else {
            // 如果没有按钮组（比如影片页），就原地创建一个同款布局的容器
            const wrap = doc.createElement('div');
            wrap.id = 'west-similar-toggle-wrap';
            wrap.className = 'jav-filter-group';
            wrap.style.cssText = 'display: flex; width: 100%; margin: 15px 0; justify-content: flex-start; gap: 8px;';
            wrap.appendChild(btn);

            const firstGrid = targets[0];
            let insertAnchor = firstGrid;
            // 自动寻找栅格上方的 <h2> 标题（如“Similar Scenes”），连同标题一起压在下方
            if (firstGrid.previousElementSibling && /^h[1-6]$/i.test(firstGrid.previousElementSibling.tagName)) {
                insertAnchor = firstGrid.previousElementSibling;
            }
            insertAnchor.insertAdjacentElement('beforebegin', wrap);
        }

        updateUI();
    }
};