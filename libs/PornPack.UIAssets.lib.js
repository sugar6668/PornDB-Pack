/**
 * @name         PornPack UIAssets Library
 * @description  统一存放所有沉长的 SVG 图标与 HTML 模板字符串
 * @version      1.0.0
 */

 window.PornUIAssets = {
    // 1. 存放所有独立图标
    icons: {
        spinner14: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="margin-right: 4px; flex-shrink: 0;"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-dasharray="16" stroke-dashoffset="16" d="M12 3c4.97 0 9 4.03 9 9"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.3s" values="16;0"/><animateTransform attributeName="transform" dur="1.5s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path><path stroke-dasharray="64" stroke-dashoffset="64" stroke-opacity=".3" d="M12 3c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9c0 -4.97 4.03 -9 9 -9Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="1.2s" values="64;0"/></path></g></svg>`,
        success14: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="margin-right: 4px; flex-shrink: 0;"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-dasharray="64" stroke-dashoffset="64" d="M3 12c0 -4.97 4.03 -9 9 -9c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="64;0"/></path><path stroke-dasharray="14" stroke-dashoffset="14" d="M8 12l3 3l5 -5"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.6s" dur="0.2s" values="14;0"/></path></g></svg>`,
        fail14: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" style="margin-right: 4px; flex-shrink: 0;"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-dasharray="64" stroke-dashoffset="64" d="M12 3c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9c-4.97 0 -9 -4.03 -9 -9c0 -4.97 4.03 -9 9 -9Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="64;0"/></path><path stroke-dasharray="8" stroke-dashoffset="8" d="M12 12l4 4M12 12l-4 -4M12 12l-4 4M12 12l4 -4"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.6s" dur="0.2s" values="8;0"/></path></g></svg>`,
        heartLiked: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="color: #e74c3c;"><path fill="currentColor" d="m12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5C2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53z"/></svg>`,
        heartUnliked: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="color: inherit; opacity: 0.6;"><path fill="currentColor" d="m12.1 18.55l-.1.1l-.11-.1C7.14 14.24 4 11.39 4 8.5C4 6.5 5.5 5 7.5 5c1.54 0 3.04 1 3.57 2.36h1.86C13.46 6 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5c0 2.89-3.14 5.74-7.9 10.05M16.5 3c-1.74 0-3.41.81-4.5 2.08C10.91 3.81 9.24 3 7.5 3C4.42 3 2 5.41 2 8.5c0 3.77 3.4 6.86 8.55 11.53L12 21.35l1.45-1.32C18.6 15.36 22 12.27 22 8.5C22 5.41 19.58 3 16.5 3"/></svg>`,
        closeX: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        dropArrow: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`
    },
    
    // 2. 存放庞大的 HTML 模板（可通过传参插入动态数据）
    templates: {
        // 数据管理面板模板，HTML 已清理为纯 Class 形式
        dataManagerModal: (defaultUrl, defaultUser, defaultPass) => `
            <div class="pdb-dm-modal">
                <div class="pdb-dm-header">
                    <span>脚本数据管理与云同步</span>
                    <span id="dm-close-btn" class="pdb-dm-close">&times;</span>
                </div>
                
                <div class="pdb-dm-body">
                    <div class="pdb-dm-section">
                        <div class="pdb-dm-title">WebDAV 同步配置 (选填)</div>
                        <div class="pdb-dm-col">
                            <input type="text" id="dm-dav-url" class="pdb-dm-input" placeholder="WebDAV 链接 (例如 https://dav.jianguoyun.com/dav/)" value="${defaultUrl}">
                            <div class="pdb-dm-row">
                                <input type="text" id="dm-dav-user" class="pdb-dm-input flex-1" placeholder="账号" value="${defaultUser}">
                                <input type="password" id="dm-dav-pass" class="pdb-dm-input flex-1" placeholder="应用密码" value="${defaultPass}">
                            </div>
                            <button id="dm-save-dav" class="pdb-dm-btn pdb-dm-btn-sm pdb-dm-btn-blue">保存配置</button>
                        </div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <div class="pdb-dm-title">包含的数据范围</div>
                        <label class="pdb-dm-checkbox-label">
                            <input type="checkbox" id="chk-core" checked> 
                            <span><b>核心资产数据</b> (喜爱演员名单、厂牌白名单及各类设置项)</span>
                        </label>
                        <label class="pdb-dm-checkbox-label">
                            <input type="checkbox" id="chk-match"> 
                            <span><b>影片匹配刮削缓存</b> (庞大，非必要，丢失可重新刮削)</span>
                        </label>
                        <label class="pdb-dm-checkbox-label">
                            <input type="checkbox" id="chk-dir"> 
                            <span><b>115目录树缓存</b> (底层加速用，换网盘账号会失效)</span>
                        </label>
                    </div>

                    <div class="pdb-dm-grid">
                        <button id="btn-export-local" class="pdb-dm-btn pdb-dm-btn-lg pdb-dm-btn-green">导出到本地文件</button>
                        <button id="btn-import-local" class="pdb-dm-btn pdb-dm-btn-lg pdb-dm-btn-orange">从本地文件恢复</button>
                        <button id="btn-push-dav" class="pdb-dm-btn pdb-dm-btn-lg pdb-dm-btn-purple">推送备份到 WebDAV</button>
                        <button id="btn-pull-dav" class="pdb-dm-btn pdb-dm-btn-lg pdb-dm-btn-pink">从 WebDAV 恢复</button>
                    </div>
                </div>
            </div>
            <input type="file" id="dm-file-input" accept=".json" style="display:none;">
        `,
        // 1. 小窗预览骨架模板
        quickViewModal: (loadingText) => `
            <div class="pdb-qv-loading">${loadingText}</div>
            <div class="pdb-qv-modal">
                <button class="pdb-qv-close">${window.PornUIAssets.icons.closeX}</button>
                <iframe class="pdb-qv-iframe"></iframe>
            </div>
        `,

        // 2. 字幕检索弹窗骨架模板
        subtitleModal: (defaultKw) => `
            <div class="pdb-sub-modal">
                <div class="pdb-sub-header">
                    <div class="pdb-sub-search-wrap">
                        <span class="pdb-sub-title">迅雷字幕检索:</span>
                        <input type="text" id="sub-search-input" value="${defaultKw}" class="pdb-sub-input" placeholder="输入检索词..." />
                        <button id="sub-search-btn" class="pdb-sub-btn">重新搜索</button>
                    </div>
                    <span class="pdb-sub-close" id="sub-close-btn">&times;</span>
                </div>
                <div class="pdb-sub-body">
                    <div class="pdb-sub-content"></div>
                    <div class="pdb-sub-preview-wrap">
                        <div class="pdb-sub-preview-header">
                            <span>字幕内容预览</span><span id="preview-status" class="pdb-sub-preview-status">暂无预览</span>
                        </div>
                        <textarea class="pdb-sub-textarea" readonly></textarea>
                    </div>
                </div>
            </div>
        `,

        // 3. 磁力控制台面板模板
        magnetWidget: (initKw) => `
            <div class="west-control-bar">
                <button class="west-engine-btn west-pl-btn" id="btn-pl-jump" title="新标签页打开 Pornolab 搜索">Pornolab</button>
                <button class="west-engine-btn west-copy-btn" id="btn-copy-kw">复制词条</button>
                <div class="west-divider"></div>
                <div class="west-engine-group" id="engine-btn-group">
                    <button class="west-engine-btn" data-engine="BTDigg">BTDigg</button>
                    <button class="west-engine-btn" data-engine="PirateBay">PirateBay</button>
                    <button class="west-engine-btn active" data-engine="BitSearch">BitSearch</button>
                </div>
                <input type="text" id="jav-nong-kw" class="west-kw-input" title="修改关键词后回车重搜" value="${initKw}" placeholder="输入关键词回车重搜..." />
            </div>
            <div id="jav-nong-table-wrap">
                <table id="jav-nong-table">
                    <tr class="nong-head-row">
                        <th>资源名称</th>
                        <th style="width:80px; text-align:center;">大小</th>
                        <th style="width:60px; text-align:center;">操作</th>
                        <th style="width:150px; text-align:center;">离线</th>
                    </tr>
                </table>
            </div>
        `,
        // [ADD] 4. 磁力表格单行数据模板
        magnetTableRow: (item, isTop, linkClass) => `
            <td>
                <span class="nong-magnet-name pdb-mag-name-box" title="${item.title}">
                    ${isTop} <a href="${item.src}" target="_blank" class="${linkClass}">${item.title}</a>
                </span>
                ${item.extraHtml || ''} 
            </td>
            <td class="pdb-mag-size-td">${item.size}</td>
            <td class="pdb-mag-action-td"><a class="nong-copy" data-mag="${item.maglink}">复制</a></td>
            <td class="pdb-mag-action-td"><a class="nong-offline-115" data-mag="${item.maglink}">离线刮削</a></td>
        `,

        // [ADD] 5. 智能控制台外壳模板 (已剔除内联样式)
        smartConsoleWrapper: () => `
            <div class="x-west-wrap">
                <div class="west-console-title">
                    115 智能控制台
                    <span class="west-match-status">等待搜索...</span>
                </div>
                <div class="west-match-list" style="width:100%; display:flex; flex-direction:column;"></div>
                <div class="west-magnet-slot"></div>
            </div>
        `,

        // [ADD] 6. 智能控制台单条影片模板
        smartConsoleItem: (item, tip, chnPath, targetDir, coverBtnClass, coverBtnText) => `
            <div class="zymatch-item-west">
                <button class="x-match-btn-wide" title="${tip}" data-cid="${item.cid}">
                    ${item.n}
                    <div class="x-match-pc-path" id="west-path-${item.cid}">${chnPath}</div>
                </button>
                <div class="buttons">
                    <button class="is-offline x-west-offline-btn" data-dir="${targetDir}" title="移动此文件到：${targetDir}">刮削归档</button>
                    <button class="is-rename" data-action="rename" data-cid="${item.cid}" data-fid="${item.fid}" data-n="${item.n}">重命名</button>
                    <button class="${coverBtnClass}" id="west-cover-${item.cid}" data-action="cover" data-cid="${item.cid}">${coverBtnText}</button>
                    <button class="is-delviedo" data-action="delv" data-cid="${item.cid}" data-fid="${item.fid}">删视频</button>
                    <button class="is-delfolder" data-action="delf" data-cid="${item.cid}">删文件夹</button>
                    <button class="is-clearmatch" data-action="clearmatch" data-cid="${item.cid}" data-fid="${item.fid}">清除匹配</button>
                </div>
            </div>
        `
    }
};