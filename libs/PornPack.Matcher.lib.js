/**
 * @name         PornPack Matcher Library
 * @description  智能匹配打分与秒传兜底算法模块
 * @version      1.0.0
 */

window.PornMatcher = class PornMatcher {
    // 静态正则常量
    static REGEX_NON_ALPHANUM = /[^a-z0-9]/g;
    static REGEX_DATE_FORMAT = /(20\d{2}|\b\d{2})[-._](0[1-9]|1[0-2])[-._](0[1-9]|[12]\d|3[01])/;

    /**
     * [ADD] 核心防误伤分词边界生成器
     * 完美解决 Tushy 碰瓷 TushyRaw，Mia 碰瓷 Amia 的包含漏洞
     */
    static buildExactRegex(targetStr) {
        if (!targetStr || String(targetStr).toLowerCase() === 'unknown') return null;
        const tokens = String(targetStr).trim().split(/[-_.\s]+/);
        if (!tokens.length || !tokens[0]) return null;

        // 允许单词之间有任意的连接符(空格、点、横杠、下划线)，或直接相连
        const body = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s_.-]*');

        // 动态边界锁定：如果首尾是字母，则相邻的字符绝对不能是字母
        const firstChar = tokens[0][0];
        const lastToken = tokens[tokens.length - 1];
        const lastChar = lastToken[lastToken.length - 1];

        const leftBound = /[a-zA-Z]/.test(firstChar) ? '(^|[^a-zA-Z])' : '(^|[^0-9])';
        const rightBound = /[a-zA-Z]/.test(lastChar) ? '($|[^a-zA-Z])' : '($|[^0-9])';

        return new RegExp(leftBound + body + rightBound, 'i');
    }

    /**
     * 计算视频文件名与页面抓取详情的匹配度得分 (网页抓取核心打分)
     */
    static getMatchScore(videoName, details) {
        const n = String(videoName || '').toLowerCase();
        const nClean = n.replace(this.REGEX_NON_ALPHANUM, '');

        let score = 0;
        let hasDate = false, hasMaker = false, hasTitle = false, hasActor = false;
        let hasYearOnly = false;

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

        // [MOD] 厂牌判断：使用编译好的边界正则，杜绝 TushyRaw 被 Tushy 截胡
        if (details.makerRegex && details.makerRegex.test(n)) {
            hasMaker = true;
        }

        // 标题由于经常残缺，依然保留宽容的去符号包含算法
        const cleanT = details.titleClean !== undefined ? details.titleClean : (details.titlePart || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        if (cleanT.length >= 4 && nClean.includes(cleanT)) hasTitle = true;

        // [MOD] 演员判断：使用编译好的边界正则，杜绝 Mia Malkova 被 Mia 截胡
        if (details.actorRegexes && details.actorRegexes.length > 0) {
            details.actorRegexes.forEach(regex => {
                if (regex.test(n)) hasActor = true;
            });
        }

        if (details.dateStr && !hasDate && !hasYearOnly) {
            if (this.REGEX_DATE_FORMAT.test(n)) return 0;
        }

        if (hasMaker && hasDate) {
            score += 100;
        } else if (hasMaker && hasYearOnly) {
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
     * 给“默认云下载目录”里的候选项打分 (秒传与离线刮削兜底算法)
     */
    static getOfflineRescueScore(name, item) {
        const raw = String(name || '').toLowerCase();
        const rawNorm = raw.replace(/[^a-z0-9]/g, '');

        let score = 0;
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

        // [MOD] 秒传离线兜底也应用精准边界匹配
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

        // 组合加权
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
     * 从115文件列表中筛选出匹配的视频，按得分排序
     */
    static getMatchedVideos(dataArray, details) {
        if (!dataArray || !dataArray.length) return [];

        // [MOD] 性能优化：只编译一次边界正则，供整个列表循环使用！杜绝每次打分都去重复生成正则。
        const makerRegex = this.buildExactRegex(details.baseAlpha);
        const actorRegexes = (details.actors || []).map(a => this.buildExactRegex(a)).filter(Boolean);
        const titleClean = (details.titlePart || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        
        // 组装新的 details 传给打分器
        const cleanedDetails = { ...details, makerRegex, actorRegexes, titleClean };

        return dataArray
            .map(it => {
                it.matchScore = this.getMatchScore(it.n, cleanedDetails);
                return it;
            })
            .filter(it => it.matchScore > 0)
            .sort((a, b) => b.matchScore - a.matchScore);
    }
};