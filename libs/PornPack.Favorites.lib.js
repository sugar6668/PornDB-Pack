/**
 * @name         PornPack Favorites Library
 * @description  纯本地高性能的喜爱演员标注与高亮系统
 * @version      1.0.0
 */

window.PornFavorites = class PornFavorites {
    static favSet = new Set();
    static isInit = false;

    static init() {
        if (this.isInit) return;

        // [ADD] 注入高亮字体与交互图标全局样式
        const style = document.createElement('style');
        style.innerHTML = `
            .pdb-fav-btn { cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 25px; height: 25px; margin-left: 6px; transition: transform 0.1s ease; }
            .pdb-fav-btn:hover { transform: scale(1.25); }
            .pdb-fav-btn svg { width: 100%; height: 100%; }
            .pdb-fav-highlight { color: #e74c3c !important; font-weight: bold !important; text-shadow: 0 0 1px rgba(231,76,60,0.2); }
        `;
        document.head.appendChild(style);

        // O(1) 内存化加载硬盘数据
        const localData = GM_getValue('pdb_fav_performers', '[]');
        try {
            this.favSet = new Set(JSON.parse(localData));
        } catch(e) {
            this.favSet = new Set();
        }
        this.isInit = true;
    }

    static save() {
        GM_setValue('pdb_fav_performers', JSON.stringify([...this.favSet]));
    }

    static getIcons() {
        return {
            liked: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="color: #e74c3c;"><path fill="currentColor" d="m12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5C2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53z"/></svg>`,
            unliked: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="color: inherit; opacity: 0.6;"><path fill="currentColor" d="m12.1 18.55l-.1.1l-.11-.1C7.14 14.24 4 11.39 4 8.5C4 6.5 5.5 5 7.5 5c1.54 0 3.04 1 3.57 2.36h1.86C13.46 6 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5c0 2.89-3.14 5.74-7.9 10.05M16.5 3c-1.74 0-3.41.81-4.5 2.08C10.91 3.81 9.24 3 7.5 3C4.42 3 2 5.41 2 8.5c0 3.77 3.4 6.86 8.55 11.53L12 21.35l1.45-1.32C18.6 15.36 22 12.27 22 8.5C22 5.41 19.58 3 16.5 3"/></svg>`
        };
    }

    static ensureIcons(doc) {
        if (!this.isInit) this.init();

        // [核心] 全局检索包含演员信息的 a 标签，排除已经处理过的节点
        const nodes = doc.querySelectorAll('a[href*="/performers/"]:not([data-fav-processed="1"])');
        if (!nodes.length) return;

        const icons = this.getIcons();
        const self = this;

        nodes.forEach(aNode => {
            // [防误伤] 如果 a 标签内包裹了图片(如演员头像照片)，跳过不处理
            if (aNode.querySelector('img')) {
                aNode.dataset.favProcessed = "1";
                return;
            }

            aNode.dataset.favProcessed = "1";

            // 提取网址中的唯一标识后缀 (例如 /performers/12345-angela-white 提取 12345-angela-white)
            const urlMatch = aNode.href.match(/\/performers\/([^/?#]+)/);
            if (!urlMatch) return;
            const performerSlug = urlMatch[1];

            const isFav = self.favSet.has(performerSlug);

            // 初始高亮判定
            if (isFav) {
                aNode.classList.add('pdb-fav-highlight');
            }

            // 构建独立交互图标节点
            const btn = doc.createElement('span');
            btn.className = 'pdb-fav-btn';
            btn.innerHTML = isFav ? icons.liked : icons.unliked;
            btn.title = isFav ? '取消喜爱' : '标记喜爱';

            // 点击拦截，防止误触页面跳转
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                const currentlyFav = self.favSet.has(performerSlug);
                if (currentlyFav) {
                    self.favSet.delete(performerSlug);
                    btn.innerHTML = icons.unliked;
                    btn.title = '标记喜爱';
                    aNode.classList.remove('pdb-fav-highlight');
                } else {
                    self.favSet.add(performerSlug);
                    btn.innerHTML = icons.liked;
                    btn.title = '取消喜爱';
                    aNode.classList.add('pdb-fav-highlight');
                }
                self.save();
            };

            // 作为子元素塞入 a 标签内部末尾，完美共享底色区块与排版
            aNode.appendChild(btn);
        });
    }
};