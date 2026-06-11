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
     * 计算视频文件名与页面抓取详情的匹配度得分 (网页抓取核心打分)
     */
    static getMatchScore(videoName, details) {
        const n = String(videoName || '').toLowerCase();
        const nClean = n.replace(this.REGEX_NON_ALPHANUM, '');

        let score = 0;
        let hasDate = false, hasMaker = false, hasTitle = false, hasActor = false;
        let hasYearOnly = false; // 💡 年份宽容匹配

        if (details.dateStr) {
            const cleanDate = details.dateStr.replace(/\./g, ''); 
            const dashDate = details.dateStr.replace(/\./g, '-'); 
            const fullYearDate = `20${details.dateStr}`; 
            const fullYearDash = `20${dashDate}`; 
            
            if (n.includes(details.dateStr) || n.includes(cleanDate) || n.includes(dashDate) || n.includes(fullYearDate) || n.includes(fullYearDash)) {
                hasDate = true;
            } else {
                // 💡 年份降级兜底
                const year = "20" + details.dateStr.split(/[-.]/)[0];
                if (n.includes(year)) {
                    hasYearOnly = true;
                }
            }
        }

        const maker = String(details.baseAlpha || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        if (maker && maker !== 'unknown' && nClean.includes(maker)) hasMaker = true;

        const cleanT = (details.titlePart || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        if (cleanT.length >= 4 && nClean.includes(cleanT)) hasTitle = true;

        if (details.actors && details.actors.length > 0) {
            details.actors.forEach(actor => {
                const ac = actor.toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
                if (ac && nClean.includes(ac)) hasActor = true;
            });
        }

        // 💡 免死金牌！只要包含了对应年份，绝不误伤打 0 分！
        if (details.dateStr && !hasDate && !hasYearOnly) {
            if (this.REGEX_DATE_FORMAT.test(n)) return 0;
        }

        // 组合加分
        if (hasMaker && hasDate) score += 100;
        else if (hasMaker && hasYearOnly) score += 80;

        if (hasActor && hasTitle) score += 50;
        if (hasMaker && hasTitle) score += 40;
        
        if (hasActor && hasDate) score += 30;
        else if (hasActor && hasYearOnly) score += 20;

        if (hasDate && hasTitle) score += 20;
        else if (hasYearOnly && hasTitle) score += 15;

        // 瀑布流极致宽容！连厂牌和演员都没抓到时，仅靠标题和年份也强行捞起！
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
        let hasYearOnly = false; // 💡 年份降级兜底
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

        const maker = String(item.baseAlpha || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (maker && maker !== 'unknown' && rawNorm.includes(maker)) {
            hasMaker = true;
            score += 70;
        }

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
        return dataArray
            .map(it => {
                it.matchScore = this.getMatchScore(it.n, details);
                return it;
            })
            .filter(it => it.matchScore > 0)
            .sort((a, b) => b.matchScore - a.matchScore);
    }
};