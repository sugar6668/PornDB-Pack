/**
 * @name         PornPack Archiver Library
 * @description  基于 JavPack 高级封装链路 (Verify -> Clean -> Rename -> Cover) 的智能刮削核心
 * @version      1.0.0
 */

window.PornArchiver = class PornArchiver {
    constructor(options) {
        this.req115 = options.req115;
        this.updateBtnUI = options.updateBtnUI;
        this.sleep = options.sleep;
        this.triggerAutoMatch = options.triggerAutoMatch;
    }

    // 兼容旧版的调用接口（废弃实际后台慢队列功能，改用前端同步快跑）
    getQueue() { return []; }
    scheduleNextPoll() { }

    /**
     * 核心入口：接收主脚本的任务推送
     */
    async addTask(item) {
        try {
            const success = await this.executePipeline(item);
            if (!success) {
                if (this.updateBtnUI) this.updateBtnUI(item.hash, `验证失败`, '#dc3545');
            }
        } catch (e) {
            console.error("离线高级链路执行异常:", e);
            // [MOD] 捕获抛出的具体错误信息，若没有则显示“执行异常”
            const msg = (e && e.message && e.message.length <= 15) ? e.message : '执行异常';
            if (this.updateBtnUI) this.updateBtnUI(item.hash, msg, '#dc3545');
        }
    }

    /**
     * 【高级封装链路核心】
     * 完全对齐 JavDB：handleVerify -> handleClean -> handleRename -> handleCover
     */
    async executePipeline(item) {
        let file_id = "";
        let videos = [];
        let srts = [];

        // ==========================================
        // 步骤 1：HandleVerify (高频验证下载状态与提取目标)
        // ==========================================
        // [MOD] 提升重试次数至 60 次（约等待 3 分钟），解决部分非“秒传”资源解析与下载慢导致脚本过早放弃的问题
        let zeroProgressCount = 0; // [ADD] 连续无进度计数器
        for (let i = 0; i < 60; i++) {
            if (this.updateBtnUI) this.updateBtnUI(item.hash, `验证进度(${i + 1}/60)...`, '#f39c12');
            await this.sleep(3000); // [MOD] 统一 3 秒请求间隔，避免高频请求被 115 接口风控

            // [MOD] 增加安全判断，防止 115 返回空数据时引发 Cannot read properties 的报错中断
            const taskRes = await this.req115.lixianTaskLists();
            const tasks = taskRes?.tasks || [];
            const task = tasks.find(t => t.info_hash && t.info_hash.toLowerCase() === item.hash.toLowerCase());

            if (task) {
                if (task.status === 2 && task.file_id) {
                    file_id = String(task.file_id);
                    break;
                } else if (task.status === -1) {
                    if (this.updateBtnUI) this.updateBtnUI(item.hash, `资源死链报错`, '#dc3545');
                    return false;
                } else {
                    // [ADD] 智能死种检测：解析当前进度并判断
                    const currentPercent = Math.floor(task.percent || 0);
                    if (task.status === 1 && this.updateBtnUI) {
                        this.updateBtnUI(item.hash, `下载 ${currentPercent}%`, '#f39c12');
                    }

                    if (currentPercent === 0) {
                        zeroProgressCount++;
                        // [ADD] 连续 10 次（约 30 秒）进度为 0 则抛出异常放弃
                        if (zeroProgressCount >= 10) {
                            throw new Error("无速度死种放弃");
                        }
                    } else {
                        zeroProgressCount = 0; // [ADD] 进度有动静，立刻重置计数器
                    }
                }
            }
        }

        // [MOD] 若超时仍没拿到 file_id，抛出具体原因给 UI 捕获显示，避免干巴巴的 false
        if (!file_id) throw new Error("下载耗时过长放弃");

        // 提取视频文件 (强制过滤 > 150MB，保留多集)
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `提取视频...`, '#f39c12');
        // 先检查是否有套娃目录，确定正确的 CID
        let videoCid = file_id;
        {
            const allFiles = await this.req115.filesAll(file_id);
            // [ADD] 检查当前根目录是否直接包含大于 150MB 的视频文件
            const hasLargeFileInRoot = allFiles.data.some(f => f.fid && f.s > 150 * 1024 * 1024);
            const folders = allFiles.data.filter(f => !f.fid && f.cid);

            // [MOD] 修复Bug：只有当根目录【没有】大视频，且【存在】子文件夹时，才认为是套娃并下钻。防止被同级广告文件夹骗走
            if (!hasLargeFileInRoot && folders.length > 0) {
                videoCid = folders[0].cid;
            }
        }
        for (let i = 0; i < 5; i++) {
            await this.sleep(1000);
            const { data } = await this.req115.filesAllVideos(videoCid);
            videos = data.filter(v => v.s > 150 * 1024 * 1024);
            if (videos.length > 0) break;
        }

        // [MOD] 同理，抛出具体错误供 UI 捕获
        if (!videos.length) throw new Error("未找到大体积视频");

        // 提取原盘附带的字幕文件 (srt, ass, vtt等)
        try {
            const srtRes = await this.req115.filesAllSRTs(videoCid);
            srts = srtRes.data || [];
        } catch (e) { }

        const keepFiles = [...videos, ...srts];

        // ==========================================
        // 步骤 2：HandleClean (调用原生清理组件，秒杀广告和空壳)
        // ==========================================
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `清理杂质...`, '#f39c12');
        await this.req115.handleClean(keepFiles, file_id);

        // ==========================================
        // 步骤 3：HandleRename (调用原生重命名组件，含多集编号和中文后缀)
        // ==========================================
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `智能重命名...`, '#f39c12');

        // 严谨的中文标识判断机制
        const checkZh = (name) => {
            if (/中字|字幕|\b(chs|cht|sub)\b/i.test(name)) return true;
            if (/[-_]c(?=\.[a-zA-Z0-9]+$|$)/i.test(name)) return true;
            return false;
        };

        const hasZh = videos.some(v => checkZh(v.n)) || srts.length > 0;

        // [MOD] 过滤非法字符，防止目录创建失败或重命名失败导致后续移动报错
        const safeDirArray = item.finalDirArray.map(d => (d || '').replace(/[\\/:*?"<>|]/g, '').trim());
        const safeNewName = (item.newName || '').replace(/[\\/:*?"<>|]/g, '').trim();

        // 确保最终归档目录被创建
        const finalCid = await this.req115.handleDir(safeDirArray);
        if (!finalCid) throw new Error("目标归档目录创建失败"); // [ADD] 拦截空目录异常

        // 利用 JavPack 的 handleRename 完美分配后缀 (强制关闭破解/无码标签)
        await this.req115.handleRename(keepFiles, file_id, {
            rename: safeNewName, // [MOD] 使用安全文件名
            renameTxt: { zh: " [中文]", crack: "", no: "-${no}", sep: " " },
            zh: hasZh,
            crack: false
        });

        // ==========================================
        // 步骤 4：物理转移到最终演员目录，并彻底销毁 BT 空壳
        // ==========================================
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `转移归档...`, '#f39c12');
        const moveRes = await this.req115.filesMove(keepFiles.map(f => f.fid), finalCid);

        // [MOD] 严谨校验：只有确认转移成功，才允许删除源文件夹，彻底杜绝数据误删丢失！
        if (moveRes && moveRes.state) {
            await this.req115.rbDelete([file_id], item.cid);
        } else {
            throw new Error("文件物理转移失败，已终止清理以保护数据");
        }

        // ==========================================
        // 步骤 5：HandleCover (调用原生封面组件)
        // ==========================================
        if (item.coverUrl) {
            if (this.updateBtnUI) this.updateBtnUI(item.hash, `上传封面...`, '#f39c12');
            try {
                const coverRes = await this.req115.handleCover(item.coverUrl, finalCid, item.coverName || 'cover.jpg');
                if (coverRes?.data?.file_id || coverRes?.data?.fileid) {
                    await this.sleep(1500);
                    await this.req115.filesEdit(finalCid, coverRes.data.file_id || coverRes.data.fileid);
                }
            } catch (e) { }
        }

        // ==========================================
        // 步骤 6：全链路完成，触发界面刷新
        // ==========================================
        if (this.updateBtnUI) this.updateBtnUI(item.hash, `离线完成`, '#8e44ad');

        if (this.triggerAutoMatch) {
            setTimeout(() => {
                // 用任务自身的数据构造 prefixKey，不依赖 document.WESTDETAILS
                const prefixKey = (item.matchPrefix || item.baseAlpha || '') + (item.dateStr || '');
                if (prefixKey) {
                    // 同时清除 GM 持久层 + 内存层缓存
                    if (typeof GMdeleteValue !== 'undefined') GMdeleteValue('pdbv4' + prefixKey);
                    if (window.PornDriveAPI) window.PornDriveAPI.deleteMatchCache(prefixKey);
                }
                this.triggerAutoMatch();
            }, 3500);
        }

        return true;
    }

    async flattenAfterOffline(details, dirArray, directVideo = null) {
        // [MOD] 过滤非法字符
        const safeDirArray = dirArray.map(d => (d || '').replace(/[\\/:*?"<>|]/g, '').trim());
        const targetCid = await this.req115.handleDir(safeDirArray);
        if (!targetCid) throw new Error("无法创建或获取目标目录");

        let video = directVideo; // 直接接收前端传来的精确目标

        // 只有在前端没传精确目标时，才去执行它原本的“盲搜”兜底
        if (!video) {
            const safeSearchKw = (kw) => (kw || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, ' ').replace(/\s+/g, ' ').trim();
            const fullYear = details.dateStr ? "20" + details.dateStr.split(/[-.]/)[0] : "";
            const firstActor = (details.actors && details.actors.length > 0) ? details.actors[0] : (details.actor !== 'Unknown_Actor' ? details.actor.split('&')[0].trim() : '');
            const makerFirst = String(details.maker || '').split(/[^a-zA-Z0-9]/)[0];
            const tKw = details.titleKeyword || '';

            // [MOD] 归档系统同步更新高精度搜索组合
            const searchStrategies = [
                details.baseAlpha && details.dateStr
                    ? details.baseAlpha + ' ' + details.dateStr   // ← 用 baseAlpha + dateStr 分开传，更精准且不经 safeSearchKw 破坏
                    : details.matchPrefix,
                [firstActor, tKw].filter(Boolean).join(' '),
                [makerFirst, tKw].filter(Boolean).join(' '),
                tKw,
                [firstActor, fullYear].filter(Boolean).join(' '),
            ];

            for (let rawKw of searchStrategies) {
                if (!rawKw || rawKw.trim().length < 3) continue;
                let kw = safeSearchKw(rawKw).substring(0, 40);
                if (!kw || kw.length < 3) continue;

                let searchRes = await this.req115.filesSearchAllVideos(kw);
                let videos = window.PornMatcher ? window.PornMatcher.getMatchedVideos(searchRes?.data || [], details) : [];
                if (videos.length > 0) {
                    video = videos[0];
                    break;
                }
            }
        }

        if (!video) throw new Error("归档中止：115中未找到该影片！");

        const sourceCid = video.cid;
        const sourceFid = video.fid;

        // 原生提取关联字幕
        const srtRes = await this.req115.filesAllSRTs(sourceCid);
        const srts = srtRes?.data || [];
        const keepFiles = [video, ...srts];

        // 转移至目标目录并执行【智能风控】清理
        if (String(sourceCid) !== String(targetCid)) {
            const moveRes = await this.req115.filesMove(keepFiles.map(f => f.fid), targetCid);

            // [MOD] 智能安全校验：确认转移成功后，探测源目录是否为真正的废弃空壳
            if (moveRes && moveRes.state && sourceCid !== '0') {
                // 1. 获取源目录下所有的剩余内容（不包含套娃深层，只看当前层）
                const remaining = await this.req115.filesAll(sourceCid);
                const allItems = remaining?.data || [];

                // 2. 统计子文件夹数量（115 中没有 fid 且有 cid 的为文件夹）
                const folderCount = allItems.filter(f => !f.fid && f.cid).length;

                // 3. 【新版安全阈值】：子文件夹数量在 3 个以内（容忍少量广告文件夹）
                if (folderCount <= 3) {
                    // 4. 再次确认有没有大视频被遗漏 (大于 100MB 的算作正经视频)
                    const hasLargeVideo = allItems.some(v => v.fid && v.s > 100 * 1024 * 1024);
                    if (!hasLargeVideo) {
                        await this.req115.rbDelete([sourceCid]); // 确认为 BT 垃圾空壳，安全销毁
                    } else {
                        console.log(`[PornArchiver保护机制] 源目录仍包含大体积视频，已拦截删除操作。`);
                    }
                } else {
                    // 超过 3 个目录，触发保护机制，仅移动目标视频，保留源目录！
                    console.log(`[PornArchiver保护机制] 源目录包含 ${folderCount} 个子文件夹，超出安全阈值，已拦截删除操作。`);
                }
            } else if (!moveRes || !moveRes.state) {
                throw new Error("文件转移失败，归档中止");
            }
            await this.sleep(1200);
        }

        // 严谨的中文标识判断机制
        const checkZh = (name) => {
            if (/中字|字幕|\b(chs|cht|sub)\b/i.test(name)) return true;
            if (/[-_]c(?=\.[a-zA-Z0-9]+$|$)/i.test(name)) return true;
            return false;
        };
        const hasZh = checkZh(video.n) || srts.length > 0;

        let cleanRawTitle = details.titlePart || details.title || '';
        let maker = details.maker ? details.maker.trim() : '';
        if (maker && cleanRawTitle.toLowerCase().startsWith(maker.toLowerCase())) {
            cleanRawTitle = cleanRawTitle.substring(maker.length).replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '').trim();
        }
        // [MOD] 过滤重命名的非法字符
        let cleanNewName = (details.matchPrefix ? `${details.matchPrefix} ${cleanRawTitle}` : details.fullTitle).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();

        // 仅保留中文标签挂载，关闭 crack 标签
        await this.req115.handleRename(keepFiles, targetCid, {
            rename: cleanNewName,
            renameTxt: { zh: " [中文]", crack: "", no: "-${no}", sep: " " },
            zh: hasZh,
            crack: false
        });

        // 原生封面挂载
        if (details.coverUrl) {
            const coverRes = await this.req115.handleCover(details.coverUrl, targetCid, `${details.baseAlpha}.${details.dateStr}.jpg`);
            if (coverRes?.data?.fileid || coverRes?.data?.file_id) {
                await this.req115.filesEdit(targetCid, coverRes.data.fileid || coverRes.data.file_id);
            }
        }
        return targetCid;
    }
};