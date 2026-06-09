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

        let isCollapsed = true;

        const updateUI = () => {
            btn.innerHTML = isCollapsed ? '展开资料' : '收起资料';
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
};