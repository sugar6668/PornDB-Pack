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
        const rightBound = /[a-zA-Z]/.test(lastChar) ? '($|[^a-zA-Z]|com($|[^a-zA-Z]))' : '($|[^0-9])';

        return new RegExp(leftBound + body + rightBound, 'i');
    }

    static getMatchScore(videoName, details) {
        const n = String(videoName || '').toLowerCase();
        const nClean = n.replace(this.REGEX_NON_ALPHANUM, '');

        // 【优化】厂牌识别：严格边界校验
        const hasMaker = (details.makerRegex && details.makerRegex.test(n)) || false;

        // 【优化】年份识别：不仅找 2021，还要找括号内或单独的数字
        const yearMatch = n.match(/(?:^|[^0-9])(20\d{2})(?:$|[^0-9])/);
        const hasYear = (details.dateStr && n.includes("20" + details.dateStr.split(/[-.]/)[0])) || (yearMatch && yearMatch[1] === details.dateStr.split(/[-.]/)[0]);

        const titleClean = (details.titleClean || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        const titleKwClean = (details.titleKeyword || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        const hasTitle = (titleClean.length >= 4 && nClean.includes(titleClean)) || (titleKwClean.length >= 4 && nClean.includes(titleKwClean));
        const titleWords = String(details.titlePart || '').toLowerCase().split(/[^a-z0-9]/).filter(w => w.length >= 4);
        const hasPartialTitle = hasTitle || titleWords.some(w => n.includes(w));

        const actorNamesClean = (details.actors || []).map(a => a.toLowerCase().replace(this.REGEX_NON_ALPHANUM, ''));
        const hasActor = (details.actorRegexes && details.actorRegexes.some(r => r.test(n))) || (actorNamesClean.some(act => act.length >= 4 && nClean.includes(act)));

        // 1. 第一优先级：标准格式（厂牌 + 精确日期）
        const hasDate = details.dateStr && (n.includes(details.dateStr) || n.includes(details.dateStr.replace(/\./g, '')));
        if (hasMaker && hasDate) {
            return 1000 + (hasTitle ? 100 : 0);
        }

        // 2. 备选格式：必须凑齐 演员 + 厂牌 + 年份 + 标题
        if (hasMaker && hasYear && hasActor && hasTitle) {
            return 100;
        }
        // 3. 宽容合集格式：凑齐 演员 + 厂牌 + 年份 + 任意标题关键词
        if (hasMaker && hasYear && hasActor && hasPartialTitle) {
            return 80;
        }

        return 0;
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
        
        // [MOD] 构建 makerRegex 时优先使用包含空格的 maker，防止 "Reality Kings" 被压缩成 "RealityKings" 导致正则匹配失效
        const makerRegex = this.buildExactRegex(details.maker || details.baseAlpha || '');
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