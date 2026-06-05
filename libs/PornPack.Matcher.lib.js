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
     * 计算视频文件名与页面抓取详情的匹配度得分
     * @param {string} videoName - 离线/搜索出的视频文件名
     * @param {Object} details - 刮削到的影片详细信息对象
     */
    static getMatchScore(videoName, details) {
        const n = String(videoName || '').toLowerCase();
        const nClean = n.replace(this.REGEX_NON_ALPHANUM, '');

        let score = 0;
        let hasDate = false, hasMaker = false, hasTitle = false, hasActor = false;

        // 检查日期
        if (details.dateStr) {
            const cleanDate = details.dateStr.replace(/\./g, '');
            const shortDate = details.dateStr.substring(2);
            if (n.includes(details.dateStr) || n.includes(cleanDate) || n.includes(shortDate) || n.includes(details.dateStr.replace(/\./g, '-'))) {
                hasDate = true;
            }
        }

        // 检查制作商
        const maker = String(details.baseAlpha || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        if (maker && maker !== 'unknown' && nClean.includes(maker)) hasMaker = true;

        // 检查标题
        const cleanT = (details.titlePart || '').toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
        if (cleanT.length >= 4 && nClean.includes(cleanT)) hasTitle = true;

        // 检查演员
        if (details.actors && details.actors.length > 0) {
            details.actors.forEach(actor => {
                const ac = actor.toLowerCase().replace(this.REGEX_NON_ALPHANUM, '');
                if (ac && nClean.includes(ac)) hasActor = true;
            });
        }

        // 排他性检测：有日期格式但没匹配上，直接给0分
        if (details.dateStr && !hasDate) {
            if (this.REGEX_DATE_FORMAT.test(n)) return 0;
        }

        // 组合加分
        if (hasMaker && hasDate) score += 100;
        if (hasActor && hasTitle) score += 50;
        if (hasMaker && hasTitle) score += 40;
        if (hasActor && hasDate) score += 30;
        if (hasDate && hasTitle) score += 20;

        return score;
    }

    /**
     * 给“默认云下载目录”里的候选项打分 (秒传兜底算法)
     * @param {string} name - 候选文件/目录名
     * @param {object} item - renameQ 当前任务项
     */
    static getOfflineRescueScore(name, item) {
        const raw = String(name || '').toLowerCase();
        const rawNorm = raw.replace(/[^a-z0-9]/g, '');

        let score = 0;
        let hasDate = false;
        let hasMaker = false;
        let actorHits = 0;

        // 1) 日期匹配
        const dateStr = String(item.dateStr || '').trim();
        if (dateStr) {
            const dotDate = dateStr;
            const cleanDate = dateStr.replace(/\./g, '');
            const dashDate = dateStr.replace(/\./g, '-');

            const parts = dateStr.split('.');
            let shortDotDate = '', shortCleanDate = '', shortDashDate = '';

            if (parts.length === 3) {
                shortDotDate = `${parts[0].slice(-2)}.${parts[1]}.${parts[2]}`;
                shortCleanDate = `${parts[0].slice(-2)}${parts[1]}${parts[2]}`;
                shortDashDate = `${parts[0].slice(-2)}-${parts[1]}-${parts[2]}`;
            }

            if (raw.includes(dotDate) || raw.includes(cleanDate) || raw.includes(dashDate) ||
                (shortDotDate && raw.includes(shortDotDate)) ||
                (shortCleanDate && raw.includes(shortCleanDate)) ||
                (shortDashDate && raw.includes(shortDashDate))) {
                hasDate = true;
                score += 120;
            }
        }

        // 2) 厂牌匹配
        const maker = String(item.baseAlpha || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (maker && maker !== 'unknown' && rawNorm.includes(maker)) {
            hasMaker = true;
            score += 70;
        }

        // 3) 演员匹配
        const actors = Array.isArray(item.actors) ? item.actors : [];
        actors.forEach((actor) => {
            const ac = String(actor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!ac || ac.length < 3) return;
            if (rawNorm.includes(ac)) {
                actorHits += 1;
                score += 35;
            }
        });

        // 4) 组合加权
        if (hasMaker && hasDate) score += 120;
        if (hasDate && actorHits > 0) score += 60;
        if (hasMaker && actorHits > 0) score += 40;
        if (actorHits >= 2) score += 50;

        // 5) 分辨率微调
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