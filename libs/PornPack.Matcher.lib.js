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

        // 提取必要特征
        const makerFirst = String(details.maker || '').split(/[^a-zA-Z0-9]/)[0].toLowerCase();
        const hasMaker = (details.makerRegex && details.makerRegex.test(n)) || (makerFirst.length >= 3 && nClean.includes(makerFirst));
        const hasDate = details.dateStr && (n.includes(details.dateStr) || n.includes(details.dateStr.replace(/\./g, '')));
        const hasYear = details.dateStr && n.includes("20" + details.dateStr.split(/[-.]/)[0]);
        const hasTitle = (details.titleClean && nClean.includes(details.titleClean)) || (details.titleKeyword && nClean.includes(details.titleKeyword.toLowerCase().replace(this.REGEX_NON_ALPHANUM, '')));
        const hasActor = details.actorRegexes && details.actorRegexes.some(r => r.test(n));

        // 1. 第一优先级：标准格式（厂牌 + 精确日期）
        if (hasMaker && hasDate) {
            return 1000 + (hasTitle ? 100 : 0);
        }

        // 2. 备选格式：必须凑齐 演员 + 厂牌 + 年份 + 标题 (严禁混入无关项)
        // 这一步逻辑：必须 4 个全部为 true，否则一律给 0 分，防止误匹配
        if (hasMaker && hasYear && hasActor && hasTitle) {
            return 100; // 只要凑齐这4个，给予备选通过分
        }

        return 0; // 不匹配任何模式，一律丢弃
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