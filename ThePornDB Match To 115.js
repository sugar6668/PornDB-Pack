// ==UserScript==
// @name         ThePornDB Match To 115
// @namespace    PornDB.local
// @version      2.0.0
// @description  完美重构逻辑模块分离
// @icon         https://theporndb.net/favicon.ico
// @match        https://theporndb.net/*
// @match        https://api.theporndb.net/*
// @match        https://captchaapi.115.com/*
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.UIAssets.lib.js
// @resource     PornDB_CSS https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/static/PornDB.UI.css
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/JavPack.Grant.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/JavPack.Req.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/JavPack.Req115.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/JavPack.Verify115.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.DriveAPI.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.DOMTweaks.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.Dispatcher.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.MagnetUI.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.Archiver.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.MagnetSearch.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.Matcher.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.Parser.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.QuickView.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.Bookmark.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.Subtitle.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.NFO.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.Filter.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.Favorites.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.DataManager.lib.js
// @require      https://github.com/Tampermonkey/utils/raw/d8a4543a5f828dfa8eefb0a3360859b6fe9c3c34/requires/gh_2215_make_GM_xhr_more_parallel_again.js
// @connect      whatslink.info
// @connect      *
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        unsafeWindow
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
// @grant        GM_getResourceURL
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        window.close
// ==/UserScript==

(function () {
    'use strict';
    // 1. 提取并注入远端 CSS (已全部外置分离)
    // [MOD] 彻底干掉内联样式字符串，从 @resource 拉取！
    const uiCss = GM_getResourceText("PornDB_CSS");
    if (uiCss) GM_addStyle(uiCss);

    const WRAPCLASS = 'x-west-wrap';
    const MATCHTAGCLASS = 'x-west-match';
    const OFFLINEBTNCLASS = 'x-west-offline-btn';
    const SCENE_CARD_SELECTOR = '.grid-cols-scene-card .w-scene-card';
    // [ADD] 你提供的基础大厂名单，脚本内部会自动转成小写+去空格进行兼容匹配
    const DEFAULT_STUDIOS = ["blacked", "blackedraw", "deeper", "tushy", "tushyraw", "vixen", "fansdb", "wowgirls", "angelslove", "manyvids", "hegre", "private", "privatestars"];
    // [ADD] 注入过滤系统底层
    const pornFilter = typeof window.PornFilter !== 'undefined' ? new window.PornFilter(DEFAULT_STUDIOS) : null;

    // 2. 基础工具与 115 API 通信模块
    function gmFetch(url, opts = {}) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET', timeout: 20000, withCredentials: true, anonymous: false, ...opts, url,
                onload(r) { r.loadstuts = true; resolve(r); }, onerror(r) { r.loadstuts = false; resolve(r); },
                ontimeout(r) { r.loadstuts = false; r.finalUrl = url; resolve(r); },
            });
        });
    }
    const getReq = () => typeof Req115 !== 'undefined' ? Req115 : null;
    const getGrant = () => typeof Grant !== 'undefined' ? Grant : null;

    const formatBytes = (bytes) => {
        if (!bytes) return '0KB'; const k = 1024, units = ['KB', 'MB', 'GB', 'TB'];
        const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(k)) - 1, units.length - 1));
        return (bytes / Math.pow(k, i + 1)).toFixed(2) + units[i];
    };
    const getRealChinesePath = (item) => item.realPath || (item.paths && Array.isArray(item.paths) ? item.paths.map(p => p.name || p.file_name).filter(n => n && n !== '网盘').join('/') : item.t || item.pc || '');
    const formatTip = (item) => `[${formatBytes(item.s || item.size || 0)}] ${item.n} ${getRealChinesePath(item) ? '\n' + getRealChinesePath(item) : ''}`;

    // 3. Archiver 队列管理器初始化
    const updateBtnUI = (hash, txt, color) => {
        document.querySelectorAll(`.nong-offline-115[data-taskhash="${hash}"]`).forEach(b => {
            // 解决小窗和不同环境下的对齐换行问题，强行锁死在一行
            b.style.display = 'inline-flex';
            b.style.alignItems = 'center';
            b.style.justifyContent = 'center';

            // 绿色(#28a745)、橙色(#e07b2a)、黄色(#f39c12) 都属于中间/等待状态 -> 转圈动画
            if (color === '#f39c12' || color === '#28a745' || color === '#e07b2a') {
                b.innerHTML = window.PornUIAssets.icons.spinner14 + `<span>${txt}</span>`;
            } else if (color === '#8e44ad') {
                b.innerHTML = window.PornUIAssets.icons.success14 + `<span>${txt}</span>`;
            } else if (color === '#dc3545') {
                b.innerHTML = window.PornUIAssets.icons.fail14 + `<span>${txt}</span>`;
            }
            b.style.color = color;
            if (color === '#8e44ad' || color === '#28a745') b.style.pointerEvents = 'none';
        });
    };

    const pornArchiver = new window.PornArchiver({
        safeReq115: window.PornDriveAPI.safeReq115.bind(window.PornDriveAPI), req115: getReq(), updateBtnUI, sleep: window.PornDriveAPI.sleep, rand: window.PornDriveAPI.rand,
        triggerAutoMatch: () => { if (document.WESTDETAILS) doAutoMatch(document, document.WESTDETAILS); }
    });
    if (pornArchiver.getQueue().length) pornArchiver.scheduleNextPoll(18000, 30000);

    const magnetUI = new window.PornMagnetUI({
        pornArchiver: pornArchiver,
        gmFetch: gmFetch,
        updateBtnUI: updateBtnUI
    });
    // 可关闭小窗功能
    const quickView = typeof window.PornQuickView !== 'undefined' ? new window.PornQuickView({
        gmFetch: gmFetch,
        magnetUI: magnetUI,
        doAutoMatch: doAutoMatch
    }) : null;

    // 4. UI 渲染：匹配标签与瀑布流加载
    // Detect -C/_C only next to a date or at the end of a filename title.
    const hasChineseSubtitleTag = (name = '') => {
        const base = String(name).replace(/\.[^.]+$/, '');
        return /\u4e2d\u5b57|\u5b57\u5e55|\b(?:chs|cht|sub)\b/i.test(base)
            || /\b\d{2,4}[._-]\d{1,2}[._-]\d{1,2}(?:[._ -]*[-_]c)(?=$|[._ -])/i.test(base)
            || /(?:-c|_c)$/i.test(base);
    };

    const applyMatchTagState = (item, videos) => {
        delete item.dataset.westObserved; // 匹配完毕，释放排队锁
        let node = item.querySelector(`.${MATCHTAGCLASS}`);
        if (!node) {
            // 【核心修复】：脱离 Vue 的监控中心（a标签），直接把标签挂在外层 item 卡片上！
            item.style.position = 'relative';
            item.insertAdjacentHTML('beforeend', `<a href="javascript:void(0);" class="tag is-normal ${MATCHTAGCLASS}"></a>`);
            node = item.querySelector(`.${MATCHTAGCLASS}`);
        }

        const len = videos.length;
        const newText = len ? `${len} 部` : '未找到';
        let newClass = `tag is-normal ${MATCHTAGCLASS}`;
        let newTitle = '';
        let newCid = '';
        let status = 'none';

        if (len) {
            const hasZh = videos.some(v => hasChineseSubtitleTag(v.n));
            const has4k = videos.some(v => /4k|2160p/i.test(v.n));
            let className = 'is-success'; status = 'success';

            if (has4k && hasZh) { className = 'is-danger'; status = 'danger'; }
            else if (hasZh) { className = 'is-warning'; status = 'warning'; }
            else if (has4k) { className = 'is-info'; status = 'info'; }

            newClass = `tag ${className} ${MATCHTAGCLASS}`;
            newTitle = videos.map(v => formatTip(v)).join('\n\n');
            newCid = String(videos[0].cid);
        }

        if (node.textContent !== newText) node.textContent = newText;
        if (node.className !== newClass) node.className = newClass;
        if (node.title !== newTitle) node.title = newTitle;
        if (node.dataset.cid !== newCid) node.dataset.cid = newCid;
        // Keep misses visible: left click redraws local state; right click forces a 115 refresh.
        if (node.style.opacity !== (len ? '1' : '0.72')) node.style.opacity = len ? '1' : '0.72';

        const parentCard = item.closest('.w-scene-card') || item.closest('.west-detail-player');
        if (parentCard && parentCard.dataset.matchStatus !== status) {
            parentCard.dataset.matchStatus = status;
        }
        if (window.PornSubtitle) {
            void window.PornSubtitle.refreshCardIndicator(item, videos);
        }
    };

    // 实例化：高并发智能调度引擎
    const pornDispatcher = new window.PornDispatcher({
        getReq,
        getWestCache: (k) => window.PornDriveAPI.getMatchCache(k),
        getMatchState: (k) => window.PornDriveAPI.getMatchState(k),
        commitMatchState: (k, patch) => window.PornDriveAPI.commitMatchState(k, patch),
        onStateCommitted: (prefixKey) => refreshCardsFromMatchCache(prefixKey, null, { allowEmpty: true }),
        setWestCache: (k, v) => window.PornDriveAPI.setMatchCache(k, v),
        applyMatchTagState,
        sleep: window.PornDriveAPI.sleep
    });

    // 改造：懒加载观察器（真正的按需懒解析）
    const observer = new IntersectionObserver((entries) => {
        // 【P1 优化】分批处理：每帧最多同步处理 5 张，其余延后到 requestAnimationFrame
        const BATCH_MAX = 5;
        const processBatch = (batch) => {
            for (let i = 0; i < batch.length; i++) {
                const entry = batch[i];
                if (!entry.isIntersecting) continue;
                const item = entry.target;
                observer.unobserve(item);
                delete item.dataset.westObserved;

                const cardId = item.dataset.westCardId;
                let currentDetails = westFingerprintMap.get(cardId);

                // [MOD] 解析前置到了 bind 函数中，此处直接拦截无效详情
                if (!currentDetails) {
                    continue;
                }

                item.dataset.westQueued = '1';
                const matchPrefix = currentDetails.matchPrefix || currentDetails.dateStr;
                item.dataset.westMatchedId = matchPrefix;

                const cachedVideos = window.PornDriveAPI.getMatchCache(matchPrefix);
                if (cachedVideos) {
                    applyMatchTagState(item, cachedVideos);
                } else {
                    // 【P1 优化】去掉无意义的 requestAnimationFrame 包装，直接调度
                    pornDispatcher.dispatch(item, currentDetails, true);
                }
            }
        };

        const firstBatch = entries.slice(0, BATCH_MAX);
        processBatch(firstBatch);
        if (entries.length > BATCH_MAX) {
            requestAnimationFrame(() => processBatch(entries.slice(BATCH_MAX)));
        }
    }, { threshold: 0.1 }); // [MOD] 阈值调低到 0.1，让卡片刚露头就开始处理，体验更平滑

    // 【性能核武】：建一个内存映射表。不管 Vue 怎么销毁重建卡片，只要链接一样，瞬间从内存拿结果！
    const westFingerprintMap = new Map();

    // 【CPU 性能核武】：支持全量扫描（首次/SPA）和增量注入（MutationObserver）两种模式
    function bindWaterfallObserver(doc, cardList) {
        let cards = cardList;
        if (!cards) {
            // 全量模式：首次加载 / SPA 路由切换
            cards = doc.querySelectorAll('.grid-cols-scene-card .w-scene-card'); // [MOD] 去掉属性选择器，统一在内部用 href 校验
        }
        if (!cards.length) return;

        cards.forEach(item => {
            const aNode = item.querySelector('a[href*="/scenes/"]');
            const cardId = aNode ? aNode.getAttribute('href') : null;
            if (!cardId) return;

            // [MOD] 核心修复 1：使用 href 链接作为锁，彻底解决 Vue 框架 DOM 节点复用导致的状态锁死问题！
            if (item.dataset.westProcessed === cardId) return;
            item.dataset.westProcessed = cardId;

            // [MOD] 复用的节点必须清空旧匹配标签和排队状态
            delete item.dataset.westObserved;
            delete item.dataset.westQueued;
            const oldTag = item.querySelector('.x-west-match');
            if (oldTag) oldTag.remove();

            // 依赖 Filter 极速打标器的结果，如果是杂牌，直接拒绝进入 115 队列
            if (item.dataset.studioHidden === '1') {
                return;
            }

            // [MOD] 核心修复 2：提前解析校验，如果是还没渲染完的空卡片，取消锁定留给下次 Mutation 重试，杜绝卡死！
            let details = window.PornParser.parseWaterfallDetails(item);
            if (!details.isValid) {
                delete item.dataset.westProcessed;
                return;
            }
            westFingerprintMap.set(cardId, details);

            // 分发通行证，排队锁，直接扔进懒加载队列
            item.dataset.westCardId = cardId;
            item.dataset.westMatchedId = details.matchPrefix || details.dateStr;
            item.dataset.westObserved = '1';
            observer.observe(item);
        });
    }

    const getCardMatchPrefix = (card) => {
        if (!card) return '';
        if (card.dataset.westMatchedId) return card.dataset.westMatchedId;

        const cardId = card.dataset.westCardId || card.querySelector('a[href*="/scenes/"]')?.getAttribute('href') || '';
        const cachedDetails = cardId ? westFingerprintMap.get(cardId) : null;
        const parsedDetails = cachedDetails || window.PornParser.parseWaterfallDetails(card);
        const prefixKey = parsedDetails?.matchPrefix || parsedDetails?.dateStr || '';

        if (prefixKey) {
            card.dataset.westMatchedId = prefixKey;
            if (cardId) {
                card.dataset.westCardId = cardId;
                if (!cachedDetails && parsedDetails?.isValid) westFingerprintMap.set(cardId, parsedDetails);
            }
        }
        return prefixKey;
    };

    const getMatchHostDetails = (host) => {
        if (!host) return null;
        if (host.classList?.contains('west-detail-player')) return document.WESTDETAILS || null;
        const cardId = host?.dataset?.westCardId || host?.querySelector('a[href*="/scenes/"]')?.getAttribute('href') || '';
        return westFingerprintMap.get(cardId) || window.PornParser.parseWaterfallDetails(host);
    };

    // Match tags deliberately own their click surfaces: local redraw on left click,
    // remote verification on right click. This also prevents unrelated card menus.
    document.addEventListener('click', (event) => {
        const tag = event.target.closest(`.${MATCHTAGCLASS}`);
        if (!tag) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const host = tag.closest('.w-scene-card, .west-detail-player');
        const detailState = getMatchHostDetails(host);
        const prefixKey = detailState?.matchPrefix || detailState?.dateStr || getCardMatchPrefix(host);
        if (prefixKey) refreshCardsFromMatchCache(prefixKey, host, { allowEmpty: true });
    }, true);

    document.addEventListener('contextmenu', (event) => {
        const tag = event.target.closest(`.${MATCHTAGCLASS}`);
        if (!tag) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const host = tag.closest('.w-scene-card, .west-detail-player');
        const details = getMatchHostDetails(host);
        if (host && details?.isValid) pornDispatcher.dispatch(host, details, true);
    }, true);

    const quickViewChangedPrefixes = new Set();

    const notifyMatchCacheChanged = (prefixKey) => {
        if (!prefixKey) return;
        if (window.self !== window.top && window.parent) {
            window.parent.postMessage({ type: 'West_MatchState_Updated', detail: { prefixKey, revision: window.PornDriveAPI.getMatchState(prefixKey)?.revision || 0 } }, location.origin);
        }
    };

    const refreshCardsFromMatchCache = (prefixKey, sourceCard = null, { allowEmpty = false } = {}) => {
        if (!prefixKey || typeof window.PornDriveAPI === 'undefined') return;

        const cards = [];
        const pushCard = (card) => {
            if (!card || cards.includes(card)) return;
            card.dataset.westMatchedId = prefixKey;
            cards.push(card);
        };

        pushCard(sourceCard);
        document.querySelectorAll(SCENE_CARD_SELECTOR).forEach(card => {
            if (getCardMatchPrefix(card) === prefixKey) pushCard(card);
        });
        if (!cards.length) return;

        window.PornDriveAPI.clearMatchStateMemory(prefixKey);
        const latestState = window.PornDriveAPI.getMatchState(prefixKey);
        if (!latestState && !allowEmpty) return;
        const latestCache = latestState?.data || [];

        cards.forEach(card => {
            if (typeof pornDispatcher !== 'undefined') pornDispatcher.applyMatchTagState(card, latestCache);
            else applyMatchTagState(card, latestCache);
            if (window.PornSubtitle) void window.PornSubtitle.refreshCardIndicator(card, latestCache, { force: true });
        });
    };

    // 6. 详情页智能控制台注入与深度匹配 (终极防污染 + 智能洗白缓存版)
    async function doAutoMatch(doc, details) {
        const req = getReq(); if (!req) return;
        const listNode = doc.querySelector('.west-match-list'), statusNode = doc.querySelector('.west-match-status');
        if (!listNode || !statusNode) return;
        if (!details.isValid) { statusNode.textContent = "页面特征解析失败"; return; }

        statusNode.textContent = "正在 115 深度搜索...";
        try {
            let videos = [];
            const cacheKey = details.matchPrefix || details.dateStr;
            const cachedState = window.PornDriveAPI.getMatchState(cacheKey);
            const expectedRevision = cachedState?.revision || 0;
            let searchedRemotely = !cachedState || cachedState.needsResolve;

            // A resolved hit or miss is final for normal browsing. needsResolve is an internal offline repair flag.
            if (!searchedRemotely) {
                videos = cachedState.data;
            } else {
                const tKw = details.titleKeyword || '';
                const firstActor = (details.actors && details.actors.length > 0) ? details.actors[0] : (details.actor !== 'Unknown_Actor' ? details.actor.split('&')[0].trim() : '');
                
                // [MOD] 精确组合策略：优先匹配标准格式，匹配失败则用“演员+标题”降级搜
                const aliasPrefixes = (details.makerAliases || [])
                    .map(alias => details.dateStr ? `${alias}.${details.dateStr}` : alias)
                    .filter(alias => alias && alias.toLowerCase() !== String(details.matchPrefix || '').toLowerCase());
                const searchStrategies = [...new Set([
                    details.matchPrefix, // 1. 厂牌+日期
                    ...aliasPrefixes, // 2. 厂牌别名+日期
                    [firstActor, tKw].filter(Boolean).join(' ') // 3. 演员+标题
                ])];
                const safeKw = (str) => String(str || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, ' ').replace(/\s+/g, ' ').trim();

                for (let kw of searchStrategies) {
                if (!kw || kw.trim().length < 3) continue;
                let cleanKw = safeKw(kw); // 使用极简净化
                if (cleanKw.length < 3) continue;
                
                const response = await req.filesSearchAllVideos(cleanKw);
                if (response?.state === false) throw new Error(response.error_msg || '115 \u641c\u7d22\u63a5\u53e3\u5f02\u5e38');
                videos = window.PornMatcher.getMatchedVideos(response?.data || [], details);
                if (videos.length > 0) break;
            }
            }

            // [ADD] 开始：追加智能排序逻辑，强制将已经刮削归档的视频置顶第一位
            if (searchedRemotely) {
                const result = window.PornDriveAPI.commitMatchState(cacheKey, {
                    data: videos,
                    status: videos.length ? 'matched' : 'unmatched',
                    source: 'search',
                    needsResolve: false,
                    expectedRevision,
                });
                // A newer offline/delete mutation wins over this older search response.
                videos = result.state?.data || videos;
                if (result.committed) notifyMatchCacheChanged(cacheKey);
            }

            videos.sort((a, b) => {
                const getArchiveScore = (item) => {
                    let score = 0;
                    // 1. 如果带有专属封面，必然是已经归档过的
                    if (item.hasCover) score += 100;

                    // 2. 如果存在真实中文路径且非脏数据目录，加分
                    const isFake = !item.realPath || item.realPath === '获取失败' || item.realPath === '根目录' || item.realPath === item.t || item.realPath === item.pc;
                    if (!isFake && item.realPath) {
                        score += 50;
                        if (item.realPath.includes('欧美演员')) score += 50; // 完美命中目标刮削路径
                    }

                    // 3. 拦截首次请求还没有 realPath 的情况，检查 115 原始返回的父级文件夹(pc)
                    if (item.pc && item.pc !== '根目录' && item.pc !== '云下载' && item.pc !== '115') {
                        score += 20;
                    }

                    return score;
                };

                const scoreA = getArchiveScore(a);
                const scoreB = getArchiveScore(b);

                // 只有状态不同时才干预排序，否则保持匹配度原顺序不变
                return scoreA !== scoreB ? scoreB - scoreA : 0;
            });
            // [ADD] 结束

            const playerWrap = doc.querySelector('video:not(.x-data18-thumb-video)')?.parentElement;
            if (playerWrap) { playerWrap.classList.add('west-detail-player'); applyMatchTagState(playerWrap, videos); }

            const targetDir = `欧美演员/${details.actor}/${details.fullTitle}`;

            if (videos.length) {
                statusNode.innerHTML = `<span style="display: inline-flex; align-items: center; color: #28a745;">${window.PornUIAssets.icons.success14} 找到 ${videos.length} 个影片</span>`;

                // 2. 瞬间渲染列表
                let htmlFragments = [];
                for (let i = 0; i < videos.length; i++) {
                    let item = videos[i];

                    // 【判定缓存是否被污染】：如果存的是日期(item.t)或特征码(item.pc)，说明是假的
                    let isFakePath = !item.realPath || item.realPath === '获取失败' || item.realPath === '根目录' || item.realPath === item.t || item.realPath === item.pc;

                    // 界面显示逻辑：如果有真目录显示真目录，否则显示临时兜底信息
                    let chnPath = !isFakePath ? item.realPath : (item.t || item.pc || '正在排队获取精确目录...');
                    let coverBtnText = item.hasCover ? '已有封面' : '传封面';
                    let coverBtnClass = item.hasCover ? 'is-cover has-cover' : 'is-cover';
                    const renameBaseName = buildStandardizedArchiveName(details);
                    const renameExt = (String(item.n || '').match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || String(item.ico || 'mp4').replace(/^\./, '').toLowerCase();
                    const renameTip = renameBaseName ? `重命名后：${renameBaseName}.${renameExt}` : '重命名为标准刮削格式';

                    const tip = formatTip(item);
                    htmlFragments.push(window.PornUIAssets.templates.smartConsoleItem(item, tip, chnPath, targetDir, coverBtnClass, coverBtnText, renameTip));
                }
                listNode.innerHTML = htmlFragments.join('');

                // [ADD] 绑定清除匹配按钮：从缓存读取→过滤→同步写回，与删视频/删文件夹的逻辑一致
                listNode.querySelectorAll('.is-clearmatch').forEach(btn => {
                    btn.addEventListener('click', (ev) => {
                        ev.preventDefault(); ev.stopPropagation();
                        // [MOD] 抓取 fid 而非 cid
                        const targetFid = btn.dataset.fid;
                        // 从权威缓存读取，而非依赖局部变量 videos（防后台洗白循环覆盖）
                        let cachedVideos = window.PornDriveAPI.getMatchCache(cacheKey) || [];
                        // [MOD] 改为根据 fid（文件唯一ID）进行精确过滤，保护同目录下的其他文件
                        cachedVideos = cachedVideos.filter(v => String(v.fid) !== targetFid);
                        // [MOD] 直接调用新 API 进行保存，API 内部已经包揽了内存和异步落盘的处理
                        window.PornDriveAPI.setMatchCache(cacheKey, cachedVideos, 'clear');
                        notifyMatchCacheChanged(cacheKey);
                        // 同步局部变量 videos，确保后续渲染/循环使用最新数据
                        // [MOD] 同步修改寻找索引的依据
                        const idx = videos.findIndex(v => String(v.fid) === targetFid);
                        if (idx !== -1) videos.splice(idx, 1);
                        // 更新播放器卡片边框状态
                        const playerWrap = doc.querySelector('video:not(.x-data18-thumb-video)')?.parentElement;
                        if (playerWrap) applyMatchTagState(playerWrap, cachedVideos);
                        // 移除该条 DOM
                        const itemNode = btn.closest('.zymatch-item-west');
                        if (itemNode) itemNode.remove();
                        // 更新状态提示
                        if (!cachedVideos.length) {
                            listNode.innerHTML = '';
                            // [MOD] 清除最后一条匹配时：只销毁缓存并同步主卡片，避免旧索引把刚清理的结果刷回卡片。
                            window.PornDriveAPI.setMatchCache(cacheKey, [], 'clear');
                            notifyMatchCacheChanged(cacheKey);
                            statusNode.innerHTML = `<span style="display: inline-flex; align-items: center; color: #dc3545;">${window.PornUIAssets.icons.fail14} 未找到相关影片</span>`;
                        } else {
                            statusNode.innerHTML = `<span style="display: inline-flex; align-items: center; color: #28a745;">${window.PornUIAssets.icons.success14}找到 ${cachedVideos.length} 个影片</span>`;
                        }
                    });
                });

                // Remote outcomes were committed above; cached matched and unmatched states are both durable.

                // 3. 后台串行队列：洗白污染数据，补齐缺失数据
                (async () => {
                    let hasNewData = false;
                    for (let i = 0; i < videos.length; i++) {
                        let item = videos[i];
                        let needWait = false;

                        let isFakePath = !item.realPath || item.realPath === '获取失败' || item.realPath === '根目录' || item.realPath === item.t || item.realPath === item.pc;

                        // 【核心修复】：只要是假目录，强制重新请求 115！
                        if (isFakePath) {
                            try {
                                const path = await window.PornDriveAPI.fetchRealChinesePath(item.cid);
                                // 只有 115 真正返回了内容，才允许写入 realPath，坚决不存临时兜底词
                                if (path && path !== '') {
                                    item.realPath = path;
                                    const pathNode = doc.getElementById(`west-path-${item.cid}`);
                                    if (pathNode) pathNode.textContent = path;
                                    hasNewData = true;
                                }
                                needWait = true;
                            } catch (e) { }
                        }

                        // 按 NFO / PBF / 字幕模块的文件列表逻辑调用 filesAll(cid) 检查封面。
                        // 严格匹配 *.cover.<image> 或 cover.<image>，避免普通图片被误判为封面。
                        if (item.coverDetectionVersion !== 2) {
                            try {
                                const filesRes = await req.filesAll(item.cid);
                                item.hasCover = !!filesRes?.data?.some(f => /(?:^|[._\s-])cover\.(?:jpe?g|png|webp|gif)$/i.test(String(f.n || '')));
                                item.coverDetectionVersion = 2;

                                if (item.hasCover) {
                                    const coverBtn = doc.getElementById(`west-cover-${item.cid}`);
                                    if (coverBtn) {
                                        coverBtn.textContent = '已有封面';
                                        coverBtn.classList.add('has-cover');
                                    }
                                }
                                hasNewData = true;
                                needWait = true;
                            } catch (e) { }
                        }

                        if (needWait) await new Promise(r => setTimeout(r, 400));
                    }

                    // 如果洗白成功拿到了真正的中文目录，彻底覆盖旧的脏缓存
                    if (hasNewData) {
                        // [MOD] 必须使用 fid (文件唯一ID) 过滤！如果用 cid 会导致同目录下已清除的视频复活！
                        let freshCache = window.PornDriveAPI.getMatchCache(cacheKey);
                        if (freshCache !== null) {
                            const freshFids = new Set(freshCache.map(v => String(v.fid)));
                            videos = videos.filter(v => freshFids.has(String(v.fid)));
                        }
                        window.PornDriveAPI.setMatchCache(cacheKey, videos, 'search');
                        notifyMatchCacheChanged(cacheKey);
                    }
                })();

            } else {
                statusNode.innerHTML = `<span style="display: inline-flex; align-items: center; color: #dc3545;">${window.PornUIAssets.icons.fail14} 未找到相关影片</span>`;
                listNode.innerHTML = '';
            }
        } catch (err) { statusNode.textContent = "搜索失败"; }
    }

    const ensureWestPanel = (doc) => {
        if (!location.href.includes('/scenes/')) return;
        const targetContainer = doc.querySelector('div.bg-black.text-white') || doc.querySelector('.flex.flex-wrap.gap-y-5.gap-x-2') || doc.querySelector('video:not(.x-data18-thumb-video)')?.parentElement?.parentElement || doc.querySelector('div.w-full.bg-white');
        if (!targetContainer) return;

        const oldWrap = doc.querySelector(`.${WRAPCLASS}`);
        if (oldWrap) { if (doc.WESTDETAILS && doc.WESTDETAILS.url !== location.href) { oldWrap.remove(); } else { return; } }

        const details = window.PornParser.parseWestDetails(doc);
        if (!details.isValid) return;

        targetContainer.insertAdjacentHTML('beforebegin', window.PornUIAssets.templates.smartConsoleWrapper());

        doc.WESTDETAILS = details;
        const magnetSlot = doc.querySelector('.west-magnet-slot');

        if (magnetSlot) {
            magnetSlot.innerHTML = '';
            const unifiedWidget = magnetUI.createMagnetWidget(details);
            magnetSlot.appendChild(unifiedWidget);
        }
        doAutoMatch(doc, details);
    };

    const syncMatchCacheFromDirectory = async (details, cid, fallbackVideos = []) => {
        const cacheKey = details.matchPrefix || details.dateStr;
        const req = getReq();
        let videos = [];
        for (let i = 0; i < 6; i++) {
            try {
                const { data: files = [] } = await req.filesAllVideos(cid);
                videos = window.PornMatcher.getMatchedVideos(files, details);
            } catch (e) {
                videos = [];
            }
            if (videos.length) break;
            if (i < 5) await (window.PornDriveAPI.sleep ? window.PornDriveAPI.sleep(700) : new Promise(r => setTimeout(r, 700)));
        }
        if (!videos.length && fallbackVideos.length) videos = fallbackVideos;
        if (videos.length && fallbackVideos.length) {
            const fallbackMeta = fallbackVideos[0];
            videos = videos.map(video => ({
                ...video,
                realPath: video.realPath || fallbackMeta.realPath,
                hasCover: video.hasCover || fallbackMeta.hasCover,
                coverDetectionVersion: video.coverDetectionVersion || fallbackMeta.coverDetectionVersion
            }));
        }
        if (videos.length) {
            window.PornDriveAPI.setMatchCache(cacheKey, videos, 'offline');
            notifyMatchCacheChanged(cacheKey);
        } else {
            window.PornDriveAPI.markMatchNeedsResolve(cacheKey, 'offline');
        }
        return videos;
    };

    const resolveRenamedDirectoryPath = async (cid, baseName, previousPath = '') => {
        const previousParts = String(previousPath).split('/').filter(Boolean);
        const predictedPath = previousParts.length
            ? [...previousParts.slice(0, -1), baseName].join('/')
            : baseName;
        if (typeof window.PornDriveAPI.fetchRealChinesePath !== 'function') return predictedPath;
        const sleep = window.PornDriveAPI.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));

        for (let attempt = 0; attempt < 6; attempt++) {
            const realPath = await window.PornDriveAPI.fetchRealChinesePath?.(cid);
            if (realPath && realPath.split('/').filter(Boolean).at(-1) === baseName) return realPath;
            if (attempt < 5) await sleep(700);
        }
        return predictedPath;
    };

    const buildOfflineFallbackVideos = (details, cid, directVideo, dir) => {
        if (!directVideo?.fid) return [];
        const baseName = buildStandardizedArchiveName(details);
        const ext = (String(directVideo.ico || '').replace(/^\./, '') || (String(directVideo.n || '').match(/\.([^.]+)$/) || [])[1] || 'mp4').toLowerCase();
        return [{
            ...directVideo,
            cid: String(cid),
            n: `${baseName}${hasChineseSubtitleTag(directVideo.n) ? ' [中文]' : ''}.${ext}`,
            ico: ext,
            realPath: dir.join('/'),
            hasCover: !!details.coverUrl,
            coverDetectionVersion: details.coverUrl ? 2 : directVideo.coverDetectionVersion,
            matchScore: 1000
        }];
    };

    // 7. 事件委托机制与系统引导
    const executeOffline = async (details, btn, doc) => {
        const req = getReq(), grant = getGrant();
        if (!req || !grant || !details) return;
        const dir = btn.dataset.dir.split('/').filter(Boolean);

        // 绝招：从旁边的“重命名”按钮上，直接白嫖视频的精确 ID，彻底告别底层盲搜！
        const renameBtn = btn.parentElement.querySelector('.is-rename');
        let directVideo = null;
        if (renameBtn && renameBtn.dataset.fid) {
            directVideo = { fid: renameBtn.dataset.fid, cid: renameBtn.dataset.cid, n: renameBtn.dataset.n };
        }

        grant.notify({ status: 'success', msg: `正在归档至：${dir.join(' / ')}` });
        try {
            // [MOD] 接收归档后返回的最新目录 ID (newCid)
            const newCid = await pornArchiver.flattenAfterOffline(details, dir, directVideo);
            // 小窗归档完成后立即把新目录中的视频写回匹配缓存；关闭小窗时主页面会读取该缓存并刷新原卡片。
            if (newCid) await syncMatchCacheFromDirectory(details, newCid, buildOfflineFallbackVideos(details, newCid, directVideo, dir));
            grant.notify({ status: 'success', msg: `目录刮削梳理完成！` });

            const itemDom = btn.closest('.zymatch-item-west');
            if (itemDom) {
                // [MOD] 同步更新该条目下所有元素的 data-cid，防止后续的 书签直传/字幕直传/传封面 定位到旧的废弃目录里
                if (newCid) {
                    itemDom.querySelectorAll('[data-cid]').forEach(el => el.dataset.cid = String(newCid));
                    // [ADD] 核心修复：归档后目录ID变化，必须同步修改封面按钮的 ID，否则后台洗白程序会找不到节点！
                    const coverBtn = itemDom.querySelector('.is-cover');
                    if (coverBtn) coverBtn.id = `west-cover-${newCid}`;
                }

                const wideBtn = itemDom.querySelector('.x-match-btn-wide');
                if (wideBtn) {
                    wideBtn.innerHTML = `
                        ${details.fullTitle} <span style="color:#28a745; font-size:12px; font-weight:bold;">[归档成功]</span>
                        <div class="x-match-pc-path" style="color:#28a745; font-weight:bold;">${dir.join('/')}</div>
                    `;
                }
                btn.textContent = '已完成';
                btn.style.pointerEvents = 'none';
                btn.style.background = '#28a745';
                btn.style.borderColor = '#28a745';

                // [ADD] 核心修复：刮削归档流程本身就包含传封面，完成后立刻将界面的按钮状态置为"已有封面"
                if (details.coverUrl) {
                    const coverBtn = itemDom.querySelector('.is-cover');
                    if (coverBtn) {
                        coverBtn.textContent = '已有封面';
                        coverBtn.classList.add('has-cover');
                    }
                }
            }
        }
        catch (e) { grant.notify({ status: 'error', msg: `归档失败: ${e.message}` }); }
    };

    function buildStandardizedArchiveName(details) {
        let cleanRawTitle = details.titlePart || details.title || '';
        const maker = (details.maker || '').trim();
        if (maker && cleanRawTitle.toLowerCase().startsWith(maker.toLowerCase())) {
            cleanRawTitle = cleanRawTitle.substring(maker.length).replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '').trim();
        }
        return (details.matchPrefix ? `${details.matchPrefix} ${cleanRawTitle}` : details.fullTitle)
            .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
    }

    const renameArchivedBundle = async (details, cid, primaryFid) => {
        const req = getReq();
        const { data = [] } = await req.filesAll(cid);
        const baseName = buildStandardizedArchiveName(details);
        const coverBaseName = [details.baseAlpha, details.dateStr].filter(Boolean).join('.') || baseName;
        if (!baseName) throw new Error('未能生成标准文件名');

        const groups = { video: [], subtitle: [], nfo: [], pbf: [], cover: [] };
        const videoExts = new Set(['mp4', 'mkv', 'avi', 'wmv', 'mov', 'm4v', 'ts', 'webm']);
        const subtitleExts = new Set(['srt', 'ass', 'ssa', 'vtt', 'sub']);
        for (const file of data) {
            if (!file.fid) continue;
            const ext = (String(file.n || '').match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
            if (!ext) continue;
            if (videoExts.has(ext)) groups.video.push({ ...file, ext });
            else if (subtitleExts.has(ext)) groups.subtitle.push({ ...file, ext });
            else if (ext === 'nfo') groups.nfo.push({ ...file, ext });
            else if (ext === 'pbf') groups.pbf.push({ ...file, ext });
            else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) && /(?:cover|poster|fanart|thumb)/i.test(file.n || '')) groups.cover.push({ ...file, ext });
        }

        const renameObj = { [cid]: baseName };
        const renameGroup = (files, makeName) => {
            files.sort((a, b) => String(a.n).localeCompare(String(b.n))).forEach((file, index) => {
                renameObj[file.fid] = makeName(file, index, files.length);
            });
        };
        renameGroup(groups.video, (file, index, count) => `${baseName}${count > 1 ? `-${String(index + 1).padStart(2, '0')}` : ''}.${file.ext}`);
        renameGroup(groups.subtitle, (file, index, count) => `${baseName}${hasChineseSubtitleTag(file.n) ? ' [中文]' : ''}${count > 1 ? `-${String(index + 1).padStart(2, '0')}` : ''}.${file.ext}`);
        renameGroup(groups.nfo, (file, index, count) => `${baseName}${count > 1 ? `-${String(index + 1).padStart(2, '0')}` : ''}.nfo`);
        renameGroup(groups.pbf, (file, index, count) => `${baseName}${count > 1 ? `-${String(index + 1).padStart(2, '0')}` : ''}.pbf`);
        renameGroup(groups.cover, (file, index, count) => `${coverBaseName}.cover${count > 1 ? `-${String(index + 1).padStart(2, '0')}` : ''}.${file.ext}`);

        await req.filesBatchRename(renameObj);
        const primary = groups.video.find(file => String(file.fid) === String(primaryFid)) || groups.video[0];
        return { baseName, primaryName: primary ? renameObj[primary.fid] : baseName, count: Object.keys(renameObj).length - 1 };
    };

    const executeMatch = async (details, btn, doc) => {
        const req = getReq(), grant = getGrant();
        if (!req || !grant || !details) return;
        const action = btn.dataset.action, cid = btn.dataset.cid, fid = btn.dataset.fid;

        // [MOD] 修复双重前缀Bug：这里只提取最纯净的 key，不加 'pdb_v4_'，交由底层 set/get 函数去加
        const realKey = details.matchPrefix || details.dateStr;

        if (action === 'rename') {
            if (!window.confirm('将同步重命名当前文件夹、视频、字幕、NFO、PBF 和已有封面，是否继续？')) return;
            const result = await renameArchivedBundle(details, cid, fid);
            btn.dataset.n = result.primaryName;
            grant.notify({ status: 'success', msg: `已同步重命名文件夹及 ${result.count} 个文件！` });

            // 同步刷新缓存，确保关闭小窗后主卡片读取到已改名的新文件。
            const itemDom = btn.closest('.zymatch-item-west');
            const currentPath = itemDom?.querySelector('.x-match-pc-path')?.textContent?.trim() || '';
            const renamedExt = (String(result.primaryName || '').match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
            const renamedPath = await resolveRenamedDirectoryPath(cid, result.baseName, currentPath);
            const syncedVideos = await syncMatchCacheFromDirectory(details, cid, [{
                fid,
                cid,
                n: result.primaryName,
                ico: renamedExt,
                realPath: renamedPath,
                matchScore: 1000
            }]);
            const refreshedVideos = (syncedVideos.length ? syncedVideos : [{ fid, cid, n: result.primaryName, ico: renamedExt }]).map(video => {
                if (String(video.cid) !== String(cid)) return video;
                return {
                    ...video,
                    realPath: renamedPath,
                    ...(String(video.fid) === String(fid) ? { n: result.primaryName, ico: renamedExt } : {})
                };
            });
            window.PornDriveAPI.setMatchCache(realKey, refreshedVideos, 'rename');
            notifyMatchCacheChanged(realKey);

            if (itemDom) {
                const wideBtn = itemDom.querySelector('.x-match-btn-wide');
                if (wideBtn) {
                    wideBtn.title = formatTip({ n: result.primaryName, realPath: renamedPath });
                    wideBtn.innerHTML = `${result.primaryName} <span style="color:#28a745; font-size:12px; font-weight:bold;">[已改名]</span><div class="x-match-pc-path">${renamedPath}</div>`;
                }
                btn.title = `重命名后：${result.primaryName}\n目录：${renamedPath}`;
                btn.style.background = '#28a745';
                btn.style.borderColor = '#28a745';
            }
        } else if (action === 'cover') {
            if (btn.classList.contains('has-cover')) { grant.notify({ status: 'warning', msg: '该目录已存在封面' }); return; }
            if (!details.coverUrl) { grant.notify({ status: 'error', msg: '未找到可用封面' }); return; }
            const coverRes = await req.handleCover(details.coverUrl, cid, `${details.baseAlpha}.${details.dateStr}.cover.jpg`);
            const fileId = coverRes?.data?.fileid || coverRes?.data?.file_id || coverRes?.file_id || coverRes?.fileid;
            if (fileId) {
                await req.filesEdit(cid, fileId);
                let cachedVideos = window.PornDriveAPI.getMatchCache(realKey);
                if (!cachedVideos?.length) cachedVideos = await syncMatchCacheFromDirectory(details, cid);
                if (cachedVideos?.length) {
                    window.PornDriveAPI.setMatchCache(realKey, cachedVideos.map(video => String(video.cid) === String(cid) ? { ...video, hasCover: true, coverDetectionVersion: 2 } : video), 'cover');
                }
                notifyMatchCacheChanged(realKey);
                btn.textContent = '已有封面'; btn.classList.add('has-cover'); grant.notify({ status: 'success', msg: '封面上传成功！' });
            }
            else { grant.notify({ status: 'error', msg: '封面设为专属可能失败' }); }
        } else if (action === 'delv' || action === 'delf') {
            await req.rbDelete(action === 'delv' ? [fid] : [cid], cid);
            grant.notify({ status: 'success', msg: '已删除！' });

            let cachedVideos = window.PornDriveAPI.getMatchCache(realKey) || [];

            // 【关键修复 1】：修复判定逻辑，严谨区分是删文件(fid)还是删文件夹(cid)
            cachedVideos = cachedVideos.filter(v => {
                if (action === 'delv') return String(v.fid) !== String(fid);
                if (action === 'delf') return String(v.cid) !== String(cid);
                return true;
            });

            window.PornDriveAPI.setMatchCache(realKey, cachedVideos, 'delete');
            const itemDom = btn.closest('.zymatch-item-west');
            if (itemDom) {
                const listNode = itemDom.parentElement;
                itemDom.remove();

                const statusNode = doc.querySelector('.west-match-status');
                if (statusNode && statusNode.innerHTML.includes('找到')) {
                    const remainCount = listNode.querySelectorAll('.zymatch-item-west').length;
                    if (remainCount > 0) {
                        statusNode.innerHTML = statusNode.innerHTML.replace(/找到 \d+ 个/, `找到 ${remainCount} 个`);
                    } else {
                        // [MOD] 列表清空时：仅销毁缓存，不要立刻触发重新搜索！防止 115 搜索索引延迟导致查出“幽灵文件”
                        window.PornDriveAPI.setMatchCache(realKey, [], 'delete');
                        statusNode.innerHTML = `<span style="display: inline-flex; align-items: center; color: #dc3545;">${window.PornUIAssets.icons.fail14} 未找到相关影片</span>`;
                    }
                }

                const playerWrap = doc.querySelector('.west-detail-player');
                if (playerWrap) applyMatchTagState(playerWrap, cachedVideos);
            }
            notifyMatchCacheChanged(realKey);
        }
    };

    function bindWestActions(doc) {
        if (doc.XWESTJHSBOUND) return; doc.XWESTJHSBOUND = true;
        doc.addEventListener('click', async (e) => {
            // 获取就近的详情数据：优先读弹窗盒子的数据，如果没有再读整个页面的数据
            const wrap = e.target.closest('.x-west-wrap');
            const targetDetails = wrap && wrap.WESTDETAILS ? wrap.WESTDETAILS : doc.WESTDETAILS;
            const targetDoc = wrap || doc; // 把渲染结果挂载回对应的容器里

            const btn = e.target.closest('.is-rename, .is-cover, .is-delviedo, .is-delfolder');
            if (btn && btn.closest('.zymatch-item-west')) {
                e.preventDefault(); e.stopPropagation();
                if (btn.dataset.busy === '1') return; btn.dataset.busy = '1';
                const originalText = btn.textContent; btn.textContent = '执行中..'; btn.style.opacity = '0.5';
                try { await executeMatch(targetDetails, btn, targetDoc); } catch (err) { getGrant()?.notify({ status: 'error', msg: err?.message }); }
                finally { setTimeout(() => { delete btn.dataset.busy; btn.textContent = originalText; btn.style.opacity = '1'; }, 800); }
            }

            const offlineBtn = e.target.closest(`.${OFFLINEBTNCLASS}`);
            if (offlineBtn) {
                e.preventDefault(); e.stopPropagation();
                if (offlineBtn.dataset.busy === '1') return; offlineBtn.dataset.busy = '1';
                const originalText = offlineBtn.textContent; offlineBtn.textContent = '刮削执行中...'; offlineBtn.classList.add('is-loading');
                try { await executeOffline(targetDetails, offlineBtn, targetDoc); } catch (err) { getGrant()?.notify({ status: 'error', msg: err?.message }); }
                finally { setTimeout(() => { delete offlineBtn.dataset.busy; offlineBtn.textContent = originalText; offlineBtn.classList.remove('is-loading'); }, 800); }
            }

            const btnWide = e.target.closest('.x-match-btn-wide');
            if (btnWide && btnWide.dataset.cid) GM_openInTab(`https://115.com/?cid=${btnWide.dataset.cid}&mode=wangpan`);
        }, true);
    }

    // 优化 3：SPA 路由劫持无缝衔接 ---
    const wrapHistoryMethod = (type) => { const orig = history[type]; return function () { const rv = orig.apply(this, arguments); window.dispatchEvent(new Event('SPA_URL_CHANGE')); return rv; }; };
    history.pushState = wrapHistoryMethod('pushState'); history.replaceState = wrapHistoryMethod('replaceState');

    // 移除 800ms 的死等，交由下方的 Observer 自动捕获 DOM 变化
    // [ADD] 记录当前URL，防止初始加载时前端框架的 replaceState 误触清空逻辑
    let lastSpaUrl = location.href;
    const handleSPAChange = () => {
        // [MOD] 如果 URL 没真正变化（如 Vue 初始化的 replaceState），不执行重置逻辑，防止误杀首次加载的指纹缓存！
        if (lastSpaUrl === location.href) return;
        lastSpaUrl = location.href;

        if (document.WESTDETAILS) document.WESTDETAILS.url = location.href;

        // [MOD] 必须在 bindWaterfallObserver 之前清空旧指纹！顺序不能反，否则会把新录入的卡片指纹也干掉
        if (typeof westFingerprintMap !== 'undefined') westFingerprintMap.clear();

        ensureWestPanel(document);
        bindWaterfallObserver(document);
    };
    window.addEventListener('popstate', handleSPAChange); window.addEventListener('SPA_URL_CHANGE', handleSPAChange);

    // [ADD] 监听小窗关闭事件，打通 iframe 与主页面的缓存壁垒
    window.addEventListener('West_QuickView_Closed', (e) => {
        const card = e.detail?.card;
        const prefixKey = e.detail?.prefixKey || getCardMatchPrefix(card);
        if (prefixKey) setTimeout(() => {
            refreshCardsFromMatchCache(prefixKey, card, { allowEmpty: quickViewChangedPrefixes.has(prefixKey) });
            quickViewChangedPrefixes.delete(prefixKey);
        }, 400);
    });

    // 小窗内完成字幕直传后，立即把同一张主页面卡片的字幕标识刷新出来。
    const refreshSubtitleIndicatorsForCid = (cid) => {
        const targetCid = String(cid || '');
        if (!targetCid || !window.PornSubtitle) return;
        document.querySelectorAll(`${SCENE_CARD_SELECTOR}[data-west-matched-id]`).forEach(card => {
            const videos = window.PornDriveAPI.getMatchCache(card.dataset.westMatchedId);
            if (videos?.some(video => String(video?.cid || '') === targetCid)) {
                void window.PornSubtitle.refreshCardIndicator(card, videos, { force: true });
            }
        });
    };
    window.addEventListener('West_Subtitle_Uploaded', (e) => refreshSubtitleIndicatorsForCid(e.detail?.cid));
    window.addEventListener('message', (e) => {
        if (e.origin !== location.origin) return;
        if (e.data?.type === 'West_Subtitle_Uploaded') {
            refreshSubtitleIndicatorsForCid(e.data.detail?.cid);
        } else if (e.data?.type === 'West_MatchState_Updated' || e.data?.type === 'West_MatchCache_Updated') {
            const prefixKey = e.data.detail?.prefixKey;
            const incomingRevision = Number(e.data.detail?.revision || 0);
            const localRevision = window.PornDriveAPI.getMatchState(prefixKey)?.revision || 0;
            if (incomingRevision && incomingRevision < localRevision) return;
            if (prefixKey) quickViewChangedPrefixes.add(prefixKey);
            refreshCardsFromMatchCache(prefixKey, null, { allowEmpty: true });
        }
    });

    const bootDoc = (doc) => {
        ensureWestPanel(doc);
        bindWestActions(doc);
        bindWaterfallObserver(doc);
        if (window.PornDOMTweaks) {
            window.PornDOMTweaks.ensureFilterButtons(doc);
            window.PornDOMTweaks.ensurePerformerPanelToggle(doc);
            window.PornDOMTweaks.ensureSimilarScenesToggle(doc);
        }
        if (window.PornBookmark) window.PornBookmark.ensureButtonExists();
        if (window.PornSubtitle) window.PornSubtitle.ensureButtonExists();
        if (window.PornNFOGenerator) window.PornNFOGenerator.ensureButtonExists();
        if (window.PornFavorites) { // [ADD] 初始与增量挂载喜爱图标
            window.PornFavorites.init();
            window.PornFavorites.ensureIcons(document);
        }
        if (typeof quickView !== 'undefined' && quickView) quickView.ensureButtons(doc);
        // [ADD] 将过滤面板唤起按钮挂载至网页顶部
        if (pornFilter) {
            pornFilter.refreshScope();
            pornFilter.ensureTopButton(doc);
        }
        if (window.PornDataManager) window.PornDataManager.ensureButtonExists(doc);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bootDoc(document), { once: true }); else bootDoc(document);

    // ==========================================
    // [MOD] 升级版免疫拦截网：超轻量级探针，彻底切断 DOM 冲突死循环
    // ==========================================
    // 修改后的代码片段（已包含改动）
    let domUpdateTimer = null;
    new MutationObserver((mutations) => {
        let needUpdate = false;

        // [MOD] 核心修复 3：简化探针。Vue SPA 翻页经常不新增 DOM，只替换文本(characterData)！
        for (let m of mutations) {
            if (m.type === 'childList' || m.type === 'characterData') {
                const target = m.target;
                if (target && target.nodeType === 1) {
                    const className = target.className || '';
                    if (typeof className === 'string' && (className.includes('qv-static-btn') || className.includes('x-west-match') || className.includes('jav-filter-group') || className.includes('x-data18-'))) {
                        continue;
                    }
                }
                needUpdate = true;
                break; // 只要有任何非自身 UI 内容变动，立刻准备扫描
            }
        }

        if (!needUpdate) return;

        if (domUpdateTimer) clearTimeout(domUpdateTimer);
        domUpdateTimer = setTimeout(() => {
            ensureWestPanel(document);
            // [MOD] 全量极速扫描代替增量扫描：内部通过 href 加锁，扫描 100 张卡片耗时不到 1ms，彻底杜绝漏卡死锁！
            bindWaterfallObserver(document);
            if (window.PornDOMTweaks) {
                window.PornDOMTweaks.ensureFilterButtons(document);
                window.PornDOMTweaks.ensurePerformerPanelToggle(document);
                window.PornDOMTweaks.ensureSimilarScenesToggle(document);
            }
            if (window.PornBookmark) window.PornBookmark.ensureButtonExists();
            if (window.PornSubtitle) window.PornSubtitle.ensureButtonExists();
            if (window.PornNFOGenerator) window.PornNFOGenerator.ensureButtonExists();
            if (window.PornFavorites) { // [ADD] 初始与增量挂载喜爱图标
                window.PornFavorites.init();
                window.PornFavorites.ensureIcons(document);
            }
            if (typeof quickView !== 'undefined' && quickView) quickView.ensureButtons(document);
            if (typeof pornFilter !== 'undefined' && pornFilter) {
                pornFilter.refreshScope();
                pornFilter.ensureTopButton(document);
            }
            if (window.PornDataManager) window.PornDataManager.ensureButtonExists(document);
        }, 300);
    }).observe(document.body, { childList: true, subtree: true });    // 8. 扩展：初始化书签导出模块

})();
