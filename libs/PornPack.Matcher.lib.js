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

        // ===============================================
        // [MOD] 终极防碰瓷及格线体系重构 (40分及格)
        // ===============================================
        if (hasMaker && hasDate) score += 100;    // 厂牌+日期 = 绝对真理 (100分，过)
        if (hasMaker && hasActor) score += 50;    // 厂牌+演员 = 强关联 (50分，过)
        if (hasActor && hasDate) score += 50;     // 演员+日期 = 强关联 (50分，过)
        if (hasActor && hasTitle) score += 40;    // 演员+标题 = 擦边及格 (40分，过)
        
        // 🚨 削弱项：防止标题碰瓷
        if (hasMaker && hasTitle) score += 20;    // 厂牌+标题 = 太容易撞车，只给20分 (不及格！)
        if (hasDate && hasTitle) score += 20;     // 日期+标题 = 证据不足，只给20分 (不及格！)
        
        if (hasMaker && hasYearOnly) {
            if (hasActor || hasTitle) score += 30; 
        }

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

        const makerName = details.baseAlpha || details.studio || details.maker || '';
        const makerRegex = this.buildExactRegex(makerName);
        const actorRegexes = (details.actors || []).map(a => this.buildExactRegex(a)).filter(Boolean);
        const titleClean = (details.titlePart || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        
        const cleanedDetails = { ...details, baseAlpha: makerName, makerRegex, actorRegexes, titleClean };

        return dataArray
            .map(it => {
                it.matchScore = this.getMatchScore(it.n, cleanedDetails);
                return it;
            })
            .filter(it => it.matchScore >= 40) // 铁面无私及格线
            .sort((a, b) => b.matchScore - a.matchScore);
    }
};