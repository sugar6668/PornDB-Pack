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
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.Filter.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.Favorites.lib.js
// @require      https://raw.githubusercontent.com/sugar6668/PornDB-Pack/refs/heads/dev/libs/PornPack.DataManager.lib.js
// @require      https://github.com/Tampermonkey/utils/raw/d8a4543a5f828dfa8eefb0a3360859b6fe9c3c34/requires/gh_2215_make_GM_xhr_more_parallel_again.js
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
            const hasZh = videos.some(v => /chs|cht|sub|中字|-c|_c/i.test(v.n));
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
        if (node.style.opacity !== (len ? '1' : '0')) node.style.opacity = len ? '1' : '0';

        const parentCard = item.closest('.w-scene-card') || item.closest('.west-detail-player');
        if (parentCard && parentCard.dataset.matchStatus !== status) {
            parentCard.dataset.matchStatus = status;
        }
    };

    // 实例化：高并发智能调度引擎
    const pornDispatcher = new window.PornDispatcher({
        getReq,
        getWestCache: (k) => window.PornDriveAPI.getMatchCache(k),
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
            item.dataset.westObserved = '1';
            observer.observe(item);
        });
    }

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
            const cachedVideos = window.PornDriveAPI.getMatchCache(cacheKey);

            // 1. 优先读取本地缓存
            if (cachedVideos !== null) {
                videos = cachedVideos;
            } else {
                const tKw = details.titleKeyword || '';
                const firstActor = (details.actors && details.actors.length > 0) ? details.actors[0] : (details.actor !== 'Unknown_Actor' ? details.actor.split('&')[0].trim() : '');
                
                // [MOD] 精确组合策略：优先匹配标准格式，匹配失败则用“演员+标题”降级搜
                const searchStrategies = [
                    details.matchPrefix, // 1. 厂牌+日期 
                    [firstActor, tKw].filter(Boolean).join(' ') // 2. 演员+标题 
                ];
                const safeKw = (str) => String(str || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, ' ').replace(/\s+/g, ' ').trim();

                for (let kw of searchStrategies) {
                if (!kw || kw.trim().length < 3) continue;
                let cleanKw = safeKw(kw); // 使用极简净化
                if (cleanKw.length < 3) continue;
                
                let { data = [] } = await req.filesSearchAllVideos(cleanKw);
                videos = window.PornMatcher.getMatchedVideos(data, details);
                if (videos.length > 0) break;
            }
            }

            // [ADD] 开始：追加智能排序逻辑，强制将已经刮削归档的视频置顶第一位
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

            const playerWrap = doc.querySelector('video')?.parentElement;
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

                    const tip = formatTip(item);
                    htmlFragments.push(window.PornUIAssets.templates.smartConsoleItem(item, tip, chnPath, targetDir, coverBtnClass, coverBtnText));
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
                        window.PornDriveAPI.setMatchCache(cacheKey, cachedVideos);
                        // 同步局部变量 videos，确保后续渲染/循环使用最新数据
                        // [MOD] 同步修改寻找索引的依据
                        const idx = videos.findIndex(v => String(v.fid) === targetFid);
                        if (idx !== -1) videos.splice(idx, 1);
                        // 更新播放器卡片边框状态
                        const playerWrap = doc.querySelector('video')?.parentElement;
                        if (playerWrap) applyMatchTagState(playerWrap, cachedVideos);
                        // 移除该条 DOM
                        const itemNode = btn.closest('.zymatch-item-west');
                        if (itemNode) itemNode.remove();
                        // 更新状态提示
                        if (!cachedVideos.length) {
                            listNode.innerHTML = '';
                            // [MOD] 清除最后一条匹配时：直接销毁缓存并自动触发新一轮的深度搜索
                            window.PornDriveAPI.deleteMatchCache(cacheKey);
                            // [ADD] 补回动态转圈 SVG 图标与 Flex 对齐样式
                            statusNode.innerHTML = `<span style="display: inline-flex; align-items: center; color: #e07b2a;">${window.PornUIAssets.icons.spinner14}正在重新深度搜索...</span>`;
                            doAutoMatch(doc, details);
                        } else {
                            statusNode.innerHTML = `<span style="display: inline-flex; align-items: center; color: #28a745;">${window.PornUIAssets.icons.success14}找到 ${cachedVideos.length} 个影片</span>`;
                        }
                    });
                });

                if (!cachedVideos) window.PornDriveAPI.setMatchCache(cacheKey, videos);

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

                        if (item.hasCover === undefined) {
                            try {
                                const filesRes = await req.filesAll(item.cid);
                                item.hasCover = filesRes && filesRes.data && filesRes.data.some(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.n));

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
                        window.PornDriveAPI.setMatchCache(cacheKey, videos);
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
        const targetContainer = doc.querySelector('div.bg-black.text-white') || doc.querySelector('.flex.flex-wrap.gap-y-5.gap-x-2') || doc.querySelector('video')?.parentElement?.parentElement || doc.querySelector('div.w-full.bg-white');
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

    const executeMatch = async (details, btn, doc) => {
        const req = getReq(), grant = getGrant();
        if (!req || !grant || !details) return;
        const action = btn.dataset.action, cid = btn.dataset.cid, fid = btn.dataset.fid, oldName = btn.dataset.n;

        // [MOD] 修复双重前缀Bug：这里只提取最纯净的 key，不加 'pdb_v4_'，交由底层 set/get 函数去加
        const realKey = details.matchPrefix || details.dateStr;

        if (action === 'rename') {
            let tags = /chs|cht|sub|中字|字幕|-c|_c/i.test(oldName) ? " 中文" : "";
            await req.handleRename([{ fid, n: oldName, cid }], cid, { rename: details.fullTitle + tags, renameTxt: { zh: false, crack: false, no: '', sep: '' }, zh: false, crack: false });
            grant.notify({ status: 'success', msg: '重命名成功！' });

            // [MOD] 杀缓存并直接更新前端名字 (修正为正确的纯净 key)
            window.PornDriveAPI.deleteMatchCache(realKey);

            const itemDom = btn.closest('.zymatch-item-west');
            if (itemDom) {
                const wideBtn = itemDom.querySelector('.x-match-btn-wide');
                if (wideBtn) wideBtn.innerHTML = wideBtn.innerHTML.replace(oldName, `${details.fullTitle}${tags} <span style="color:#28a745; font-size:12px; font-weight:bold;">[已改名]</span>`);
                btn.textContent = '已改名';
                btn.style.pointerEvents = 'none';
                btn.style.background = '#28a745';
                btn.style.borderColor = '#28a745';
            }
        } else if (action === 'cover') {
            if (btn.classList.contains('has-cover')) { grant.notify({ status: 'warning', msg: '该目录已存在封面' }); return; }
            if (!details.coverUrl) { grant.notify({ status: 'error', msg: '未找到可用封面' }); return; }
            const coverRes = await req.handleCover(details.coverUrl, cid, `${details.baseAlpha}.${details.dateStr}.jpg`);
            const fileId = coverRes?.data?.fileid || coverRes?.data?.file_id || coverRes?.file_id || coverRes?.fileid;
            if (fileId) { await req.filesEdit(cid, fileId); btn.textContent = '已有封面'; btn.classList.add('has-cover'); grant.notify({ status: 'success', msg: '封面上传成功！' }); }
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

            if (typeof window.PornDriveAPI !== 'undefined') {
                window.PornDriveAPI.matchCache.set(realKey, cachedVideos); // [MOD] 指向新的内存池
                window.PornDriveAPI.pendingDiskWrites.delete('pdb_v4_' + realKey); // [MOD] 从缓冲队列中剔除
            }
            GM_setValue('pdb_v4_' + realKey, { ts: Date.now(), data: cachedVideos });
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
                        window.PornDriveAPI.deleteMatchCache(realKey);
                        statusNode.innerHTML = `<span style="display: inline-flex; align-items: center; color: #dc3545;">${window.PornUIAssets.icons.fail14} 未找到相关影片</span>`;
                    }
                }

                const playerWrap = doc.querySelector('.west-detail-player');
                if (playerWrap) applyMatchTagState(playerWrap, cachedVideos);
            }
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
        const card = e.detail.card;
        if (card && card.dataset.westMatchedId) {
            const prefixKey = card.dataset.westMatchedId;
            // 1. 强杀主页面内存锁，迫使下次读取物理硬盘（获取 iframe 刚刚更新的最新数据）
            if (typeof window.PornDriveAPI !== 'undefined') window.PornDriveAPI.matchCache.delete(prefixKey);

            // 2. 延迟 400ms 保证 iframe 内的硬盘写入（GM_setValue）已彻底落盘
            setTimeout(() => {
                const latestCache = window.PornDriveAPI.getMatchCache(prefixKey);
                if (latestCache !== null) {
                    if (typeof pornDispatcher !== 'undefined') pornDispatcher.applyMatchTagState(card, latestCache);
                    else applyMatchTagState(card, latestCache);
                } else {
                    // 如果还没匹配到，说明小窗中删除了数据，或者发起了新搜索，重新扔进派发器去搜
                    const currentDetails = westFingerprintMap.get(card.dataset.westCardId);
                    if (currentDetails && typeof pornDispatcher !== 'undefined') {
                        pornDispatcher.dispatch(card, currentDetails, true);
                    }
                }
            }, 400);
        }
    })

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
        if (pornFilter) pornFilter.ensureTopButton(doc);
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
                    if (typeof className === 'string' && (className.includes('qv-static-btn') || className.includes('x-west-match') || className.includes('jav-filter-group'))) {
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
            if (typeof pornFilter !== 'undefined' && pornFilter) pornFilter.ensureTopButton(document);
            if (window.PornDataManager) window.PornDataManager.ensureButtonExists(document);
        }, 300);
    }).observe(document.body, { childList: true, subtree: true });    // 8. 扩展：初始化书签导出模块

})();