/**
 * @name         PornPack Dispatcher Library
 * @description  115 并发请求调度引擎（含请求合并、排队限流、DOM 批量渲染）
 * @version      1.0.0
 */

window.PornDispatcher = class PornDispatcher {
    constructor(options) {
        // 依赖注入：接收主脚本传来的上下文方法
        this.getReq = options.getReq;
        this.getWestCache = options.getWestCache;
        this.setWestCache = options.setWestCache;
        this.applyMatchTagState = options.applyMatchTagState;
        this.sleep = options.sleep;

        // 核心调度变量
        this.waitMap = {};       // 字典：存放等待同一番号的多个影片卡片 (合并同类项)
        this.searchQueue = [];   // 队列：存放需要查询的番号
        this.isSearching = false;
        this.lastReqTime = 0;    // [ADD] 记录上一次请求时间
    }

    /**
     * 统一派发器：接收新加载的影片卡片，分配处理策略
     */
    dispatch(item, details, skipCacheCheck) {
        const prefix = details.matchPrefix || details.dateStr;
        if (!prefix) return;

        // 【P1 优化】调用方已检查过缓存时跳过二次检查
        if (!skipCacheCheck) {
            const cachedVideos = this.getWestCache(prefix);
            if (cachedVideos) {
                this.applyMatchTagState(item, cachedVideos);
                return;
            }
        }

        // 查等待队列，合并同类项
        if (!this.waitMap[prefix]) this.waitMap[prefix] = [];
        this.waitMap[prefix].push({ item, details });

        // 加入查询队列并触发引擎
        if (!this.searchQueue.includes(prefix)) {
            this.searchQueue.push(prefix);
            this.processQueue();
        }
    }

    /**
     * 极速处理引擎：使用安全稳健的 while 迭代代替危险的死递归
     */
    async processQueue() {
        if (this.isSearching || !this.searchQueue.length) return;
        this.isSearching = true;

        // [MOD] 使用 while 迭代代替异步死递归，彻底杜绝长时间挂机时的内存泄漏
        while (this.searchQueue.length > 0) {
            const prefix = this.searchQueue[0];
            const pendingItems = this.waitMap[prefix] || [];

            try {
                const sampleDetails = pendingItems[0]?.details;
                if (sampleDetails) {
                    const req = this.getReq();
                    let { data = [] } = await req.filesSearchAllVideos(prefix);
                    let videos = window.PornMatcher.getMatchedVideos(data, sampleDetails);

                    // [ADD] 瀑布流备选方案 1：偏门资源检索 (演员+厂牌+年份+标题)
                    if (!videos.length) {
                        const fullYear = sampleDetails.dateStr ? "20" + sampleDetails.dateStr.split(/[-.]/)[0] : "";
                        const firstActor = (sampleDetails.actors && sampleDetails.actors.length > 0) ? sampleDetails.actors[0] : (sampleDetails.actor !== 'Unknown_Actor' ? sampleDetails.actor.split('&')[0].trim() : '');
                        const obscureKw = [firstActor, sampleDetails.maker, fullYear, sampleDetails.titleKeyword].filter(Boolean).join(' ');

                        if (obscureKw && obscureKw.length >= 3) {
                            const fb2 = await req.filesSearchAllVideos(obscureKw);
                            videos = window.PornMatcher.getMatchedVideos(fb2.data, sampleDetails);
                        }
                    }

                    if (!videos.length && sampleDetails.titleKeyword) {
                        const fb = await req.filesSearchAllVideos(sampleDetails.titleKeyword);
                        videos = window.PornMatcher.getMatchedVideos(fb.data, sampleDetails);
                    }

                    this.setWestCache(prefix, videos);

                    // 批量渲染：一网打尽网页上所有相同的影片卡片
                    pendingItems.forEach(({ item }) => {
                        this.applyMatchTagState(item, videos);
                    });
                }
            } catch (e) {
                pendingItems.forEach(({ item }) => this.applyMatchTagState(item, []));
            } finally {
                delete this.waitMap[prefix]; // 处理完释放内存
            }

            this.searchQueue.shift();

            // 如果队列里还有任务，就等 300ms 再进入下一次循环，防止风控
            if (this.searchQueue.length > 0) {
                await this.sleep(300);
            }
        }

        this.isSearching = false;
    }
};