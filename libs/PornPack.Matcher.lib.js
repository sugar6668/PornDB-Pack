/**
 * @name         PornPack Matcher Library
 * @description  智能匹配打分与秒传兜底算法模块
 * @version      1.0.0
 */

window.PornMatcher = class PornMatcher {
    // 静态正则常量
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

    /**
     * 计算视频文件名与页面抓取详情的匹配度得分
     */
    static getMatchScore(videoName, details) {
        const n = String(videoName || '').toLowerCase();
        const nClean = n.replace(this.REGEX_NON_ALPHANUM, '');

        let score = 0;
        let hasDate = false, hasMaker = false, hasTitle = false, hasActor = false;
        let hasYearOnly = false;

        // ==========================================
        // [ADD] 核心修复：衍生厂牌碰瓷拦截器 (一票否决)
        // ==========================================
        if (details.baseAlpha) {
            const makerName = String(details.baseAlpha).trim();
            // 欧美最常见的衍生后缀黑名单
            const suffixes = ['raw', 'network', 'vr', 'plus', 'premium', 'gold', 'vip'];
            
            suffixes.forEach(suffix => {
                // 如果我们要找的目标厂牌本身不带这个后缀 (比如目标是 Tushy)
                const suffixRegex = new RegExp(`\\b${suffix}\\b`, 'i');
                if (!suffixRegex.test(makerName)) {
                    // 但 115 搜出来的文件名里，厂牌名后面紧跟着这个后缀 (比如 Tushy.Raw 或 Tushy-Raw)
                    const collisionRegex = new RegExp(makerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s_.-]*' + suffix, 'i');
                    if (collisionRegex.test(n)) {
                        score -= 1000; // 致命惩罚！直接打成负分，绝对不可能展示
                    }
                }
            });
        }
        // ==========================================

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

        const cleanT = details.titleClean !== undefined ? details.titleClean : (details.titlePart || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        if (cleanT.length >= 4 && nClean.includes(cleanT)) hasTitle = true;

        if (details.actorRegexes && details.actorRegexes.length > 0) {
            details.actorRegexes.forEach(regex => {
                if (regex.test(n)) hasActor = true;
            });
        }

        if (details.dateStr && !hasDate && !hasYearOnly) {
            if (this.REGEX_DATE_FORMAT.test(n)) return score; // 即使时间不对，也要带着可能被扣的负分返回
        }

        if (hasMaker && hasDate) score += 100;
        else if (hasMaker && hasYearOnly) {
            if (hasActor || hasTitle) score += 80;
        }

        if (hasActor && hasTitle) score += 50;
        if (hasMaker && hasTitle) score += 40;
        if (hasActor && hasDate) score += 30;
        else if (hasActor && hasYearOnly) score += 20;
        if (hasDate && hasTitle) score += 20;
        else if (hasYearOnly && hasTitle) score += 15;
        if (!hasMaker && !hasActor && hasYearOnly && hasTitle) score += 30;

        return score;
    }

    /**
     * 秒传与离线刮削兜底算法
     */
    static getOfflineRescueScore(name, item) {
        const raw = String(name || '').toLowerCase();
        const rawNorm = raw.replace(/[^a-z0-9]/g, '');

        let score = 0;
        
        // [ADD] 离线兜底同样应用碰瓷拦截
        if (item.baseAlpha) {
            const makerName = String(item.baseAlpha).trim();
            const suffixes = ['raw', 'network', 'vr', 'plus', 'premium', 'gold', 'vip'];
            suffixes.forEach(suffix => {
                const suffixRegex = new RegExp(`\\b${suffix}\\b`, 'i');
                if (!suffixRegex.test(makerName)) {
                    const collisionRegex = new RegExp(makerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s_.-]*' + suffix, 'i');
                    if (collisionRegex.test(raw)) score -= 1000; 
                }
            });
        }

        let hasDate = false;
        let hasYearOnly = false;
        let hasMaker = false;
        let actorHits = 0;

        const dateStr = String(item.dateStr || '').trim();
        if (dateStr) {
            const cleanDate = dateStr.replace(/\./g, '');
            const dashDate = dateStr.replace(/\./g, '-');
            const fullYearDate = `20${dateStr}`;
            const fullYearDash = `20${dashDate}`;

            if (raw.includes(dateStr) || raw.includes(cleanDate) || raw.includes(dashDate) || raw.includes(fullYearDate) || raw.includes(fullYearDash)) {
                hasDate = true;
                score += 120;
            } else {
                const year = "20" + dateStr.split(/[-.]/)[0];
                if (raw.includes(year)) {
                    hasYearOnly = true;
                    score += 80;
                }
            }
        }

        const makerRegex = this.buildExactRegex(item.baseAlpha);
        if (makerRegex && makerRegex.test(raw)) {
            hasMaker = true;
            score += 70;
        }

        const actors = Array.isArray(item.actors) ? item.actors : [];
        actors.forEach((actor) => {
            const actorRegex = this.buildExactRegex(actor);
            if (actorRegex && actorRegex.test(raw)) {
                actorHits += 1;
                score += 35;
            }
        });

        if (hasMaker && hasDate) score += 120;
        else if (hasMaker && hasYearOnly) score += 80;

        if (hasDate && actorHits > 0) score += 60;
        else if (hasYearOnly && actorHits > 0) score += 40;

        if (hasMaker && actorHits > 0) score += 40;
        if (actorHits >= 2) score += 50;
        if (/2160p|1080p|4k/.test(raw)) score += 10;

        return score;
    }

    /**
     * 最终筛选器
     */
    static getMatchedVideos(dataArray, details) {
        if (!dataArray || !dataArray.length) return [];

        const makerRegex = this.buildExactRegex(details.baseAlpha);
        const actorRegexes = (details.actors || []).map(a => this.buildExactRegex(a)).filter(Boolean);
        const titleClean = (details.titlePart || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        
        const cleanedDetails = { ...details, makerRegex, actorRegexes, titleClean };

        return dataArray
            .map(it => {
                it.matchScore = this.getMatchScore(it.n, cleanedDetails);
                return it;
            })
            // 这里将过滤线提高到 40 分，配合负分系统，绝不放过任何一个衍生物
            .filter(it => it.matchScore >= 40)
            .sort((a, b) => b.matchScore - a.matchScore);
    }
};