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


        // O(1) 内存化加载硬盘数据
        const localData = GM_getValue('pdb_fav_performers', '[]');
        try {
            this.favSet = new Set(JSON.parse(localData));
        } catch (e) {
            this.favSet = new Set();
        }
        this.isInit = true;
    }

    static save() {
        GM_setValue('pdb_fav_performers', JSON.stringify([...this.favSet]));
    }

    static getIcons() {
        return {
            liked: window.PornUIAssets.icons.heartLiked,
            unliked: window.PornUIAssets.icons.heartUnliked
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
            aNode.style.display = "inline-flex";
            aNode.style.alignItems = "center";
            aNode.style.flexWrap = "nowrap";
            aNode.style.whiteSpace = "nowrap";

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
            // [MOD] 初始化时：如果是已收藏状态，给按钮加上 is-liked 类名以触发动画
            btn.className = isFav ? 'pdb-fav-btn is-liked' : 'pdb-fav-btn';
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
                    btn.classList.remove('is-liked'); // [ADD] 移除动画
                } else {
                    self.favSet.add(performerSlug);
                    btn.innerHTML = icons.liked;
                    btn.title = '取消喜爱';
                    aNode.classList.add('pdb-fav-highlight');
                    btn.classList.add('is-liked'); // [ADD] 触发变大变小闪烁动画
                }
                self.save();
            };

            // 作为子元素塞入 a 标签内部末尾，完美共享底色区块与排版
            aNode.appendChild(btn);
        });
    }
};