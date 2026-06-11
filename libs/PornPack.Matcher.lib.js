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
     * 给“默认云下载目录”里的候选项打分 (秒传兜底算法)
     */
    static getOfflineRescueScore(name, item) {
        const raw = String(name || '').toLowerCase();
        const rawNorm = raw.replace(/[^a-z0-9]/g, '');

        let score = 0;
        let hasDate = false;
        let hasYearOnly = false; // 新增
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
                // 年份降级分数
                const year = "20" + dateStr.split(/[-.]/)[0];
                if (raw.includes(year)) {
                    hasYearOnly = true;
                    score += 80;
                }
            }
        }

        // 厂牌匹配
        const maker = String(item.baseAlpha || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (maker && maker !== 'unknown' && rawNorm.includes(maker)) {
            hasMaker = true;
            score += 70;
        }

        // 演员匹配
        const actors = Array.isArray(item.actors) ? item.actors : [];
        actors.forEach((actor) => {
            const ac = String(actor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!ac || ac.length < 3) return;
            if (rawNorm.includes(ac)) {
                actorHits += 1;
                score += 35;
            }
        });

        // 组合加权 (加入了年份降级逻辑)
        if (hasMaker && hasDate) score += 120;
        else if (hasMaker && hasYearOnly) score += 80;

        if (hasDate && actorHits > 0) score += 60;
        else if (hasYearOnly && actorHits > 0) score += 40;

        if (hasMaker && actorHits > 0) score += 40;
        if (actorHits >= 2) score += 50;

        // 分辨率微调
        if (/2160p|1080p|4k/.test(raw)) score += 10;

        return score;
    }

    /**
     * 给“默认云下载目录”里的候选项打分 (秒传兜底算法)
     */
    static getOfflineRescueScore(name, item) {
        const raw = String(name || '').toLowerCase();
        const rawNorm = raw.replace(/[^a-z0-9]/g, '');

        let score = 0;
        let hasDate = false;
        let hasMaker = false;
        let actorHits = 0;

        // 修改点 2：秒传兜底打分的日期逻辑也做同样的精简
        const dateStr = String(item.dateStr || '').trim();
        if (dateStr) {
            const cleanDate = dateStr.replace(/\./g, '');
            const dashDate = dateStr.replace(/\./g, '-');

            if (raw.includes(dateStr) || raw.includes(cleanDate) || raw.includes(dashDate)) {
                hasDate = true;
                score += 120;
            }
        }

        // 厂牌匹配
        const maker = String(item.baseAlpha || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (maker && maker !== 'unknown' && rawNorm.includes(maker)) {
            hasMaker = true;
            score += 70;
        }

        // 演员匹配
        const actors = Array.isArray(item.actors) ? item.actors : [];
        actors.forEach((actor) => {
            const ac = String(actor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!ac || ac.length < 3) return;
            if (rawNorm.includes(ac)) {
                actorHits += 1;
                score += 35;
            }
        });

        // 组合加权
        if (hasMaker && hasDate) score += 120;
        if (hasDate && actorHits > 0) score += 60;
        if (hasMaker && actorHits > 0) score += 40;
        if (actorHits >= 2) score += 50;

        // 分辨率微调
        if (/2160p|1080p|4k/.test(raw)) score += 10;

        return score;
    }

    /**
     * 从115文件列表中筛选出匹配的视频，按得分排序
     */
    static getMatchedVideos(dataArray, details) {
        if (!dataArray || !dataArray.length) return [];
        return dataArray
            .map(it => {
                it.matchScore = this.getMatchScore(it.n, details);
                return it;
            })
            .filter(it => it.matchScore > 0)
            .sort((a, b) => b.matchScore - a.matchScore);
    }
};