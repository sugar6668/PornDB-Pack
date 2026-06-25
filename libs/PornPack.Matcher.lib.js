/**
 * @name         PornPack Matcher Library
 * @description  智能匹配打分与秒传兜底算法模块
 * @version      1.0.0
 */

window.PornMatcher = class PornMatcher {
    static REGEX_NON_ALPHANUM = /[^a-z0-9]/g;
    static REGEX_DATE_FORMAT = /(20\d{2}|\b\d{2})[-._](0[1-9]|1[0-2])[-._](0[1-9]|[12]\d|3[01])/;

    static buildExactRegex(targetStr) {
        if (!targetStr || String(targetStr).toLowerCase() === 'unknown') return null;
        const tokens = String(targetStr).trim().split(/[-_.\s]+/);
        if (!tokens.length || !tokens[0]) return null;

        const body = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s_.-]*');
        const firstChar = tokens[0][0];
        const lastToken = tokens[tokens.length - 1];
        const lastChar = lastToken[lastToken.length - 1];

        const leftBound = /[a-zA-Z]/.test(firstChar) ? '(^|[^a-zA-Z])' : '(^|[^0-9])';
        const rightBound = /[a-zA-Z]/.test(lastChar) ? '($|[^a-zA-Z])' : '($|[^0-9])';

        return new RegExp(leftBound + body + rightBound, 'i');
    }

    static getMatchScore(videoName, details) {
        const n = String(videoName || '').toLowerCase();
        const nClean = n.replace(this.REGEX_NON_ALPHANUM, '');

        // 1. 厂牌识别：正则或纯文本包含
        const makerFirst = String(details.maker || '').split(/[^a-zA-Z0-9]/)[0].toLowerCase();
        const hasMaker = (details.makerRegex && details.makerRegex.test(n)) || (makerFirst.length >= 3 && nClean.includes(makerFirst));

        // 2. 日期/年份识别
        const hasDate = details.dateStr && (n.includes(details.dateStr) || n.includes(details.dateStr.replace(/\./g, '')));
        const hasYear = details.dateStr && n.includes("20" + details.dateStr.split(/[-.]/)[0]);

        // 3. 标题识别：正则或关键词包含
        const titleClean = (details.titleClean || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        const titleKwClean = (details.titleKeyword || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        const hasTitle = (titleClean.length >= 4 && nClean.includes(titleClean)) || (titleKwClean.length >= 4 && nClean.includes(titleKwClean));

        // 4. 演员识别：正则或名称包含
        const actorNamesClean = (details.actors || []).map(a => a.toLowerCase().replace(this.REGEX_NON_ALPHANUM, ''));
        const hasActor = (details.actorRegexes && details.actorRegexes.some(r => r.test(n))) || (actorNamesClean.some(act => act.length >= 4 && nClean.includes(act)));

        // --- 逻辑判断分层 ---

        // 第一优先级：标准格式（厂牌 + 精确日期）
        if (hasMaker && hasDate) {
            return 1000 + (hasTitle ? 100 : 0);
        }

        // 第二优先级（备选格式）：必须四要素全齐 (厂牌 + 年份 + 演员 + 标题)
        // 任何一项缺失，或者这四项中有一项匹配不上，直接返回 0
        if (hasMaker && hasYear && hasActor && hasTitle) {
            return 100;
        }

        return 0; // 不匹配，直接丢弃
    }

    static getOfflineRescueScore(name, item) {
        return this.getMatchScore(name, {
            baseAlpha: item.baseAlpha,
            studio: item.baseAlpha,
            dateStr: item.dateStr,
            titlePart: item.titlePart,
            actors: item.actors,
            makerRegex: this.buildExactRegex(item.baseAlpha),
            actorRegexes: (item.actors || []).map(a => this.buildExactRegex(a)).filter(Boolean)
        });
    }

    static getMatchedVideos(dataArray, details) {
        if (!dataArray || !dataArray.length) return [];

        // [MOD] 性能优化：提前将 details 的正则清洗结果缓存下来，避免在 map 中执行几百次相同的运算
        const makerClean = String(details.baseAlpha || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        const titleClean = (details.titlePart || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        // [ADD] 提取 fullTitle 特征，用于识别是否为已重命名的标准刮削文件
        const fullTitleClean = String(details.fullTitle || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        const actorsClean = (details.actors || []).map(a => String(a).toLowerCase().replace(this.REGEX_NON_ALPHANUM, '')).filter(Boolean);
        // [FIX] 构建 makerRegex 和 actorRegexes，恢复 hasMaker/hasActor 评分能力
        const makerRegex = this.buildExactRegex(details.baseAlpha || details.maker || '');
        const actorRegexes = (details.actors || []).map(a => this.buildExactRegex(a)).filter(Boolean);

        // [MOD] 将 fullTitleClean 一并注入向下传递
        const cleanedDetails = { ...details, makerClean, titleClean, fullTitleClean, actorsClean, makerRegex, actorRegexes };

        return dataArray
            .map(it => {
                it.matchScore = this.getMatchScore(it.n, cleanedDetails);
                return it;
            })
            .filter(it => it.matchScore >= 40) // 铁面无私及格线
            .sort((a, b) => b.matchScore - a.matchScore);
    }
};