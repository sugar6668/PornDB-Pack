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

        let score = 0;
        let hasDate = false, hasMaker = false, hasTitle = false, hasActor = false;
        let hasYearOnly = false;

        // [MOD] 修复 baseAlpha 获取不到的情况，增加 details.studio 作为坚实后盾
        const makerName = String(details.baseAlpha || details.studio || details.maker || '').trim();
        if (makerName && makerName.toLowerCase() !== 'unknown') {
            const suffixes = ['raw', 'network', 'vr', 'plus', 'premium', 'gold', 'vip', 'black', 'extra'];
            suffixes.forEach(suffix => {
                const suffixRegex = new RegExp(`\\b${suffix}\\b`, 'i');
                if (!suffixRegex.test(makerName)) {
                    const collisionRegex = new RegExp(makerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s_.-]*' + suffix, 'i');
                    if (collisionRegex.test(n)) score -= 1000; // 致命惩罚
                }
            });
        }

        if (details.dateStr) {
            const cleanDate = details.dateStr.replace(/\./g, '');
            const dashDate = details.dateStr.replace(/\./g, '-');
            const fullYearDate = `20${details.dateStr}`;
            const fullYearDash = `20${dashDate}`;

            if (n.includes(details.dateStr) || n.includes(cleanDate) || n.includes(dashDate) || n.includes(fullYearDate) || n.includes(fullYearDash)) {
                hasDate = true;
            } else {
                const year = "20" + details.dateStr.split(/[-.]/)[0];
                if (n.includes(year)) hasYearOnly = true;
            }
        }

        if (details.makerRegex && details.makerRegex.test(n)) hasMaker = true;

        // [MOD] 将标题匹配长度提高到 6，过滤掉极其容易撞车的通用短词汇
        const cleanT = details.titleClean !== undefined ? details.titleClean : (details.titlePart || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        if (cleanT.length >= 6 && nClean.includes(cleanT)) hasTitle = true;

        if (details.actorRegexes && details.actorRegexes.length > 0) {
            details.actorRegexes.forEach(regex => {
                if (regex.test(n)) hasActor = true;
            });
        }

        if (details.dateStr && !hasDate && !hasYearOnly) {
            if (this.REGEX_DATE_FORMAT.test(n)) return score;
        }

        // [ADD] 开始：追加标准命名霸体置顶逻辑。无视任何拦截，直接赋予绝对高分！
        const fullTitleClean = details.fullTitleClean !== undefined
            ? details.fullTitleClean
            : String(details.fullTitle || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');

        if (fullTitleClean && fullTitleClean.length > 5 && nClean.includes(fullTitleClean)) {
            score += 2000;
            return score; // 直接免检放行
        }

        // [MOD] 终极严苛匹配模式拦截网 (针对未命中霸体名称的散装文件)：
        // 1. 必须有“厂牌” 2. 必须有“时间信息” 3. 如果只有“年份”，则必须有“演员”或“标题”作为辅助参考
        if (!hasMaker) return 0;
        if (!hasDate && !hasYearOnly) return 0;
        if (!hasDate && hasYearOnly && !hasActor && !hasTitle) return 0;

        // [MOD] 偏门资源特例放行：如果缺失精确到日的日期，只有“年份”，则必须【同时】具备“演员”和“标题”进行双重校验，防止同厂牌同年碰瓷！
        if (!hasDate && hasYearOnly) {
            if (!hasActor || !hasTitle) {
                return 0; 
            }
        }

        // 基础必要条件得分：厂牌 + 完整日期得 100 分
        score += 100;

        // 附加得分：在满足了上述严苛条件的基础上，如果有演员或标题，增加排序优先级
        if (hasActor) score += 50;
        if (hasTitle) score += 40;

        return score;
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
        const cleanedDetails = { ...details, makerClean, titleClean, fullTitleClean, actorsClean, makerRegex, actorRegexes  };

        return dataArray
            .map(it => {
                it.matchScore = this.getMatchScore(it.n, cleanedDetails);
                return it;
            })
            .filter(it => it.matchScore >= 40) // 铁面无私及格线
            .sort((a, b) => b.matchScore - a.matchScore);
    }
};