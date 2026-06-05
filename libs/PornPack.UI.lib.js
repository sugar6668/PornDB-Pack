/**
 * @name         PornPack UI Library
 * @description  ThePornDB 专属 UI 组件构建与 DOM 渲染模块
 * @version      1.0.0
 */

window.PornUI = class PornUI {
    /**
     * 构建详情页的主控制面板 (外壳与基本按钮)
     */
    static buildControlPanel(details) {
        const wrap = document.createElement('div');
        wrap.className = 'x-west-wrap';
        wrap.id = 'west-control-panel';

        // 顶层基础信息与操作行
        const row1 = document.createElement('div');
        row1.className = 'west-row';
        row1.innerHTML = `
            <span style="font-weight:bold; color:#7b5ea7; font-size:15px; margin-right:10px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
                PornDB 刮削控制台
            </span>
            <button class="west-magnet-btn is-copy" id="west-btn-copy-title" title="点击复制">
                📄 标题: ${details.matchPrefix}
            </button>
            <button class="west-magnet-btn is-copy" id="west-btn-copy-actor" title="点击复制">
                📄 演员: ${details.actor}
            </button>
            <button class="west-magnet-btn is-sukebei" id="west-btn-smart-offline">
                ⚡ 智能刮削归档
            </button>
        `;

        // 磁力搜索组件区
        const magnetSlot = document.createElement('div');
        magnetSlot.className = 'west-magnet-slot';
        magnetSlot.style.marginTop = '15px';
        
        magnetSlot.innerHTML = `
            <div class="west-unified-box">
                <div class="west-control-bar">
                    <div class="west-engine-group" id="west-engine-group">
                        <button class="west-engine-btn active" data-engine="BitSearch">BitSearch</button>
                        <button class="west-engine-btn" data-engine="BTDigg">BTDigg</button>
                        <button class="west-engine-btn" data-engine="PirateBay">PirateBay</button>
                    </div>
                    <div class="west-divider"></div>
                    <input type="text" class="west-kw-input" id="west-kw-input" value="${details.matchPrefix || details.titleKeyword}">
                    <button class="west-engine-btn west-pl-btn" id="west-btn-search">🔍 搜索磁力</button>
                    <button class="west-engine-btn west-copy-btn" id="west-btn-copy-magnet-kw">📄 复制关键词</button>
                </div>
                <div id="jav-nong-table-wrap" style="display:none;">
                    <table id="jav-nong-table">
                        <tbody>
                            <tr class="nong-head-row">
                                <th style="width:55%;">资源名称</th>
                                <th style="width:15%;">大小</th>
                                <th style="width:30%;">操作</th>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        wrap.appendChild(row1);
        wrap.appendChild(magnetSlot);
        return wrap;
    }

    /**
     * 渲染磁力搜索结果表格
     * @param {HTMLElement} tableBody - tbody 元素
     * @param {Array} data - 搜索到的磁力数据数组
     * @param {Function} onOfflineClick - 点击“离线到115”的回调函数
     */
    static renderMagnetTable(tableBody, data, onOfflineClick) {
        // 清空除表头外的所有行
        tableBody.querySelectorAll('tr:not(.nong-head-row)').forEach(r => r.remove());

        if (!data || data.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="3" style="text-align:center; padding:20px; color:#999;">📭 未搜索到相关资源</td>`;
            tableBody.appendChild(tr);
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            
            // 资源名称列
            const tdName = document.createElement('td');
            tdName.innerHTML = `
                <div class="nong-magnet-name">
                    <a href="${item.src || item.maglink}" target="_blank" title="在新标签页打开来源">${item.title}</a>
                    ${item.extraHtml ? item.extraHtml : ''}
                </div>`;
            
            // 大小列
            const tdSize = document.createElement('td');
            tdSize.style.fontWeight = 'bold';
            tdSize.style.color = '#7b5ea7';
            tdSize.textContent = item.size || '未知';

            // 操作列
            const tdAction = document.createElement('td');
            
            // 复制磁力按钮
            const aCopy = document.createElement('a');
            aCopy.className = 'nong-copy';
            aCopy.textContent = '📋 复制磁力';
            aCopy.onclick = () => {
                GM_setClipboard(item.maglink);
                aCopy.textContent = '✅ 已复制';
                setTimeout(() => aCopy.textContent = '📋 复制磁力', 2000);
            };

            const spanSpace = document.createElement('span');
            spanSpace.textContent = ' | ';
            spanSpace.style.color = '#ccc';

            // 离线到 115 按钮
            const aOffline = document.createElement('a');
            aOffline.className = 'nong-offline-115';
            aOffline.textContent = '⬇️ 离线并归档至115';
            aOffline.onclick = () => onOfflineClick(item, aOffline);

            tdAction.appendChild(aCopy);
            tdAction.appendChild(spanSpace);
            tdAction.appendChild(aOffline);

            tr.appendChild(tdName);
            tr.appendChild(tdSize);
            tr.appendChild(tdAction);
            tableBody.appendChild(tr);
        });
    }

    /**
     * 在瀑布流卡片上添加状态标签
     */
    static updateMatchTag(cardElement, statusClass, textContent) {
        let tag = cardElement.querySelector('.x-west-match');
        if (!tag) {
            tag = document.createElement('div');
            tag.className = 'x-west-match';
            tag.style.cssText = 'position:absolute; top:8px; right:8px; z-index:10; padding:4px 8px; border-radius:4px; color:#fff; font-size:12px; font-weight:bold; pointer-events:none; box-shadow:0 2px 4px rgba(0,0,0,0.2);';
            cardElement.style.position = 'relative';
            cardElement.appendChild(tag);
        }
        
        // 移除旧的状态类
        tag.classList.remove('is-success', 'is-info', 'is-warning', 'is-danger', 'is-normal');
        // 添加新状态类
        if (statusClass) tag.classList.add(statusClass);
        tag.textContent = textContent;
    }
};