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
    }

    /**
     * 统一派发器：接收新加载的影片卡片，分配处理策略
     */
    dispatch(item, details) {
        const prefix = details.matchPrefix || details.dateStr;
        if (!prefix) return;

        // 1. 查本地永久缓存 (秒出结果)
        const cachedVideos = this.getWestCache(prefix);
        if (cachedVideos) {
            this.applyMatchTagState(item, cachedVideos);
            return;
        }

        // 2. 查等待队列，合并同类项
        if (!this.waitMap[prefix]) this.waitMap[prefix] = [];
        this.waitMap[prefix].push({ item, details });

        // 3. 加入查询队列并触发引擎
        if (!this.searchQueue.includes(prefix)) {
            this.searchQueue.push(prefix);
            this.processQueue();
        }
    }

    /**
     * 极速处理引擎：消费队列，带安全缓冲
     */
    async processQueue() {
        if (this.isSearching || !this.searchQueue.length) return;
        this.isSearching = true;

        const prefix = this.searchQueue[0];
        const pendingItems = this.waitMap[prefix] || []; 

        try {
            const sampleDetails = pendingItems[0]?.details;
            if (sampleDetails) {
                const req = this.getReq();
                let { data = [] } = await req.filesSearchAllVideos(prefix);
                let videos = window.PornMatcher.getMatchedVideos(data, sampleDetails);

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
        this.isSearching = false;

        // 【关键参数】：安全缓冲，防止并发风控
        await this.sleep(300);
        this.processQueue(); 
    }
};