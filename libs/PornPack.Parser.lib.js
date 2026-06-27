/**
 * @name         PornPack Parser Library
 * @description  PornDB 站点元数据解析与清洗模块
 * @version      1.0.0
 */

window.PornParser = class PornParser {
    // 静态正则常量
    static REGEX_ILLEGAL_PATH = /[\\/:*?"<>|]/g;
    static REGEX_MULTI_SPACE = /\s+/g;

    /**
     * 清理字符串，用于生成合法文件名
     */
    static slugify(str) {
        return String(str).replace(this.REGEX_ILLEGAL_PATH, '').replace(this.REGEX_MULTI_SPACE, ' ').trim();
    }

    /**
     * 解析英文日期字符串（如 Jan 5, 2024）为两位数年份：24.01.05
     */
    static parseDate(str) {
        const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
        const m = str.trim().match(/([a-zA-Z]{3,})\s+(\d{1,2}),\s+(\d{4})/);
        if (m) {
            const mm = months[m[1].toLowerCase().substring(0, 3)];
            if (!mm) return '';
            const dd = m[2].padStart(2, '0');
            // 🌟 核心修改：利用 slice(-2) 直接截取年份 m[3] 的最后两位
            return `${m[3].slice(-2)}.${mm}.${dd}`;
        }
        return '';
    }

    /**
     * 解析瀑布流卡片信息
     */
    static parseWaterfallDetails(item) {
        let details = { matchPrefix: '', baseAlpha: '', dateStr: '', titlePart: '', titleKeyword: '', fullTitle: '', maker: '', actors: [], url: '', coverUrl: '', isValid: false };
        try {
            const h2 = item.querySelector('h2');
            details.titlePart = h2 ? h2.textContent.trim() : '';

            const dateMatch = item.textContent.match(/([a-zA-Z]{3,})\s+(\d{1,2}),\s+(\d{4})/);
            if (dateMatch) details.dateStr = this.parseDate(dateMatch[0]);

            const siteA = item.querySelector('a[href*="/sites/"]');
            if (siteA) details.maker = siteA.textContent.trim();
            else {
                const txtMatch = item.textContent.match(/Vixen|Blacked|Tushy|Manyvids|Brazzers|Reality Kings|Bratty Sis/i);
                if (txtMatch) details.maker = txtMatch[0];
            }
            details.maker = details.maker.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
            details.baseAlpha = details.maker.replace(/\s+/g, '');

            if (details.dateStr && details.titlePart) details.isValid = true;

            if (details.baseAlpha && details.dateStr) {
                details.matchPrefix = `${details.baseAlpha}.${details.dateStr}`;
            } else if (details.actor !== 'Unknown_Actor' && details.dateStr) {
                details.matchPrefix = `${details.actor?.replace(/\s+/g, '') || ''}.${details.dateStr}`;
            } else {
                details.matchPrefix = '';
            }
            details.titleKeyword = details.titlePart.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2).slice(0, 2).join(' ');

            const customMakers = ['FansDB', 'OnlyFans', 'Patreon', 'ManyVids'];

            if (customMakers.includes(details.maker) || !details.titlePart) {
                const prefix = details.maker ? `${details.maker} ` : '';
                details.fullTitle = this.slugify(`${prefix}${details.actor || ''} (onlyfans).${details.dateStr}`);
            } else {
                let cleanTitle = details.titlePart || '';
                if (details.maker && cleanTitle.toLowerCase().startsWith(details.maker.toLowerCase())) {
                    cleanTitle = cleanTitle.substring(details.maker.length).trim();
                    cleanTitle = cleanTitle.replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '').trim();
                }
                details.fullTitle = this.slugify(`${details.maker}.${details.dateStr} ${cleanTitle}`);
            }

            if (details.actor) {
                // 以左括号 "(" 为界限切割字符串，只保留前半部分，并去除两端多余空格
                details.actor = details.actor.split('(')[0].trim();
            }
            if (Array.isArray(details.actors) && details.actors.length > 0) {
                // 如果有多个演员构成的数组，用同样的方法批量清洗
                details.actors = details.actors.map(a => a.split('(')[0].trim());
            }

            return details;
        } catch (e) { return details; }
    }

    /**
     * 解析单个影片详情页面信息
     */
    static parseWestDetails(doc) {
        let details = { matchPrefix: '', baseAlpha: '', dateStr: '', titlePart: '', titleKeyword: '', fullTitle: '', maker: '', series: '', actor: 'Unknown_Actor', actors: [], tags: [], plot: '', director: '', runtime: '', url: location.href, coverUrl: '', isValid: false };
        try {
            // [MOD] 1. 精准抓取 Tags (基于提供的 class 容器)
            const tagWrap = doc.querySelector('[class="flex flex-wrap gap-1"]');
            if (tagWrap) {
                // 遍历容器内的链接获取具体标签名
                tagWrap.querySelectorAll('a').forEach(node => {
                    const tag = node.textContent.trim();
                    if (tag && !details.tags.includes(tag)) details.tags.push(tag);
                });
            }

            // [MOD] 2. 精准抓取剧情简介 Plot (基于提供的 class 容器)
            const plotNode = doc.querySelector('[class="w-5/6 whitespace-break-spaces"]');
            if (plotNode) details.plot = plotNode.textContent.trim();

            // [ADD] 3. 精准抓取导演 Director (基于提供的 class 容器)
            const dirNode = doc.querySelector('[class="flex flex-wrap gap-x-1 empty:hidden"]');
            if (dirNode) {
                // 优先抓取 a 标签内的干净名字，如果没有则清理前缀文字
                const dirLink = dirNode.querySelector('a');
                details.director = dirLink ? dirLink.textContent.trim() : dirNode.textContent.replace(/Director/i, '').replace(/[:：]/g, '').trim();
            }

            // [MOD] 4. 精准抓取时长 Runtime (基于提供的厂牌/日期综合容器)
            const infoWrap = doc.querySelector('[class="flex flex-col md:flex-row gap-1 mr-2 md:items-center"]');
            if (infoWrap) {
                const match = infoWrap.textContent.match(/\b(\d+)\s*min/i);
                if (match) details.runtime = match[1];
            }
            // 优先从页面 h1 获取最纯净的原始标题 (对齐瀑布流逻辑)
            const h1 = doc.querySelector('h1');
            if (h1) {
                const t = h1.textContent.trim();
                if (t && t.toLowerCase() !== 'similar scenes') details.titlePart = t;
            }
            // 如果 h1 抓取失败，降级使用 og:title，并强行切除演员名污染
            if (!details.titlePart) {
                const ogTitle = doc.querySelector('meta[property="og:title"]');
                if (ogTitle) {
                    let rawTitle = ogTitle.getAttribute('content') || '';
                    // [MOD] 仅剔除站点后缀标识，彻底删除极度危险的 " in " 和 " - " 暴力腰斩逻辑，保护原始标题完整性
                    rawTitle = rawTitle.replace(/\s*[-|]\s*ThePornDB\s*$/i, '').trim();

                    details.titlePart = rawTitle;
                }
            }

            let dateRawStr = '';
            const dateContainers = doc.querySelectorAll('div.whitespace-nowrap');
            dateContainers.forEach(el => {
                const txt = el.textContent.trim().replace(/^-\s*/, '');
                if (/[a-zA-Z]{3,}\s+\d{1,2},\s+\d{4}/.test(txt)) dateRawStr = txt;
            });
            if (!dateRawStr) {
                const m = doc.body.textContent.match(/([a-zA-Z]{3,})\s+(\d{1,2}),\s+(\d{4})/);
                if (m) dateRawStr = m[0];
            }
            if (dateRawStr) details.dateStr = this.parseDate(dateRawStr);

            const siteNode = doc.querySelector('a[href*="/sites/"]') || doc.querySelector('a[href*="/networks/"]');
            if (siteNode) {
                details.maker = Array.from(siteNode.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE)
                    .map(n => n.textContent.trim())
                    .join('') || siteNode.textContent.trim();
            } else {
                // 核心修复：精准切分出厂牌名！
                const infoNodes = doc.querySelectorAll('div.flex, div.whitespace-nowrap');
                for (let el of infoNodes) {
                    const txt = el.textContent.trim();
                    // 寻找包含日期且带有横杠的文本
                    if (dateRawStr && txt.includes(dateRawStr) && txt.includes('-')) {
                        const extractedMaker = txt.split('-')[0].trim();
                        // 过滤掉误判的超长文本
                        if (extractedMaker && extractedMaker.length < 40) {
                            details.maker = extractedMaker;
                            break;
                        }
                    }
                }

                // 原有的兜底逻辑
                if (!details.maker && /onlyfans|fansdb/i.test(doc.body.textContent)) {
                    details.maker = 'FansDB';
                }
            }
            details.maker = details.maker.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
            details.baseAlpha = details.maker.replace(/\s+/g, '');

            details.actors = [];
            const maleBlacklist = ['mick blue', 'keiran lee', 'manuel ferrara', 'jordi el nino polla', 'rocco siffredi', 'steve holmes', 'markus dupree', 'charles dera', 'damon dice', 'isiah maxwell', 'christian clay', 'oliver flynn', 'luke hardy', 'vince karter', 'tommy pistol', 'xander corvus', 'ryan driller', 'logan pierce', 'james deen', 'danny d', 'ramon nomar', 'johnny sins', 'seth gamble', 'alex adams', 'ricky johnson', 'quinton james', 'michael vegas'];
            const actorGrid = doc.querySelector('.grid-cols-performer-site-card') || doc.querySelector('div[class*="grid-cols-performer-site-card"]');

            if (actorGrid) {
                const allPerformers = Array.from(actorGrid.querySelectorAll('a[href*="/performers/"]'));
                allPerformers.forEach(node => {
                    const cardWrapper = node.closest('.w-performer-site-card') || node.parentElement;
                    const isMaleElement = cardWrapper.querySelector('[title="Male"], [title*="Male"], [title*="Trans"]');
                    let scanHtml = (cardWrapper ? cardWrapper.innerHTML : node.outerHTML).toLowerCase();
                    const hasMaleIcon = scanHtml.includes('fa-mars') || scanHtml.includes('♂') || scanHtml.includes('transgender');

                    if (isMaleElement || hasMaleIcon) return;
                    const act = node.textContent.trim();
                    if (act && maleBlacklist.includes(act.toLowerCase())) return;
                    if (act && !details.actors.includes(act)) details.actors.push(act);
                });
            }

            if (details.actors.length > 0) {
                details.actor = details.actors.join(' & ');
            } else {
                details.actor = 'Unknown_Actor';
            }

            let finalImg = '';
            const tpdbImg = doc.querySelector('img[data-preview-src*="/scene/"]') || doc.querySelector('img[src*="/scene/"]');
            if (tpdbImg) {
                finalImg = tpdbImg.getAttribute('data-preview-src') || tpdbImg.getAttribute('src') || tpdbImg.src;
            } else {
                const videoEl = doc.querySelector('video[poster]');
                if (videoEl && videoEl.getAttribute('poster')) finalImg = videoEl.getAttribute('poster');
            }
            details.coverUrl = finalImg;

            // [ADD] 抓取标签与简介，供 NFO 生成使用
            const tagNodes = doc.querySelectorAll('a[href*="/tags/"]');
            tagNodes.forEach(n => {
                const txt = n.textContent.trim();
                if (txt && !details.tags.includes(txt)) details.tags.push(txt);
            });
            const descMeta = doc.querySelector('meta[name="description"]');
            if (descMeta) details.plot = descMeta.getAttribute('content').trim();

            if (details.dateStr && details.titlePart) details.isValid = true;

            // 修复：对齐瀑布流逻辑，如果没有厂牌，降级使用“演员名.日期”作为匹配前缀
            if (details.baseAlpha && details.dateStr) {
                details.matchPrefix = `${details.baseAlpha}.${details.dateStr}`;
            } else if (details.actor && details.actor !== 'Unknown_Actor' && details.dateStr) {
                details.matchPrefix = `${details.actor.replace(/\s+/g, '')}.${details.dateStr}`;
            } else {
                details.matchPrefix = '';
            }

            details.titleKeyword = details.titlePart.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2).slice(0, 2).join(' ');

            let cleanTitle = details.titlePart || '';
            if (details.maker && cleanTitle.toLowerCase().startsWith(details.maker.toLowerCase())) {
                cleanTitle = cleanTitle.substring(details.maker.length).trim();
                cleanTitle = cleanTitle.replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '').trim();
            }
            details.fullTitle = this.slugify(`${details.maker}.${details.dateStr} ${cleanTitle}`);

            if (details.actor) {
                // 以左括号 "(" 为界限切割字符串，只保留前半部分，并去除两端多余空格
                details.actor = details.actor.split('(')[0].trim();
            }
            if (Array.isArray(details.actors) && details.actors.length > 0) {
                // 如果有多个演员构成的数组，用同样的方法批量清洗
                details.actors = details.actors.map(a => a.split('(')[0].trim());
            }

            return details;
        } catch (e) { return details; }
    }
};