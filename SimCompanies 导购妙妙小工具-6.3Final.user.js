// ==UserScript==
// @name         SimCompanies 导购妙妙小工具
// @namespace    https://www.simcompanies.com/zh-cn/company/0/TGW-groupp/
// @version      6.3 Final
// @description  6.3原版功能，单消息最多6条提示，UI修改配置自动刷新利润计算，利润标签逻辑不会搞，别信它（纯AI编写）
// @match        https://www.simcompanies.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ===================== 物品配置（可编辑） =====================
    let ITEM_DATA = {
        "96":  { name: "LUX",  q3: 77000,  step: 1000  },
        "99":  { name: "SAT",  q3: 50000,  step: 1000  },
        "97":  { name: "SEP",  q3: 31000,  step: 1000  },
        "91":  { name: "SOR",  q3: 105000, step: 1500  },
        "95":  { name: "JUM",  q3: 222000, step: 4000 },
        "94":  { name: "BFR",  q3: 730000, step: 10000 },
    };

    const MIN_Q = 0;
    const MAX_Q = 12;

    // ===================== 刷新利润标签（UI修改后自动执行） =====================
    function refreshProfitTags() {
        // 清空所有旧利润标签
        document.querySelectorAll('.profit-tag').forEach(tag => tag.remove());
        // 重新扫描计算最新利润
        scanTradeIcons();
    }

    // ===================== 右侧可编辑面板（修改后自动刷新利润） =====================
    function createEditablePanel() {
        if (document.getElementById('price-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'price-panel';
        panel.style.cssText = `position:fixed; top:20px; right:20px; width:340px; background:#1a1b26; color:#eee; border-radius:10px; padding:12px; z-index:9999; font-size:12px; border:1px solid #445; max-height:85vh; overflow-y:auto;`;
        const header = document.createElement('div');
        header.style.cssText = 'font-weight:bold; font-size:14px; cursor:pointer; margin-bottom:10px;';
        header.textContent = '📊 品质价格表 Q0~Q12（点击折叠）';
        panel.appendChild(header);
        const content = document.createElement('div');
        panel.appendChild(content);
        header.onclick = () => { content.style.display = content.style.display === 'none' ? 'block' : 'none'; };
        function renderAll() {
            content.innerHTML = '';
            for (const id in ITEM_DATA) {
                const it = ITEM_DATA[id];
                const itemWrap = document.createElement('div');
                itemWrap.style.marginBottom = '12px';
                itemWrap.style.paddingBottom = '8px';
                itemWrap.style.borderBottom = '1px solid #333';
                const topRow = document.createElement('div');
                topRow.style.display = 'flex';
                topRow.style.gap = '6px';
                topRow.style.alignItems = 'center';
                const nameLabel = document.createElement('div');
                nameLabel.style.minWidth = '50px';
                nameLabel.style.fontWeight = 'bold';
                nameLabel.style.color = '#9cf';
                nameLabel.textContent = it.name;
                const q3Input = document.createElement('input');
                q3Input.type = 'number';
                q3Input.value = it.q3;
                q3Input.style.width = '70px';
                q3Input.style.padding = '2px 4px';
                q3Input.style.background = '#223';
                q3Input.style.color = '#fff';
                q3Input.style.border = '1px solid #556';
                q3Input.style.borderRadius = '4px';
                const stepInput = document.createElement('input');
                stepInput.type = 'number';
                stepInput.value = it.step;
                stepInput.style.width = '60px';
                stepInput.style.padding = '2px 4px';
                stepInput.style.background = '#223';
                stepInput.style.color = '#fff';
                stepInput.style.border = '1px solid #556';
                stepInput.style.borderRadius = '4px';
                topRow.append(nameLabel,Object.assign(document.createElement('div'), { textContent: 'Q3', style: 'width:24px' }),q3Input,Object.assign(document.createElement('div'), { textContent: '每Q±', style: 'width:36px' }),stepInput);
                itemWrap.appendChild(topRow);
                const qRow = document.createElement('div');
                qRow.style.display = 'flex';
                qRow.style.flexWrap = 'wrap';
                qRow.style.gap = '3px';
                qRow.style.marginTop = '6px';
                for (let q = MIN_Q; q <= MAX_Q; q++) {
                    const price = it.q3 + (q - 3) * it.step;
                    const tag = document.createElement('span');
                    tag.style.cssText = 'padding:2px 3px; min-width:34px; text-align:center; background:#252636; border-radius:3px; font-size:10px;';
                    tag.innerHTML = `Q${q}<br>${price.toLocaleString()}`;
                    qRow.appendChild(tag);
                }
                itemWrap.appendChild(qRow);
                content.appendChild(itemWrap);

                // 核心修复：修改配置后 → 自动刷新所有利润
                function updateItem() {
                    ITEM_DATA[id].q3 = Number(q3Input.value) || 0;
                    ITEM_DATA[id].step = Number(stepInput.value) || 0;
                    renderAll();
                    refreshProfitTags(); // 实时刷新利润
                }
                q3Input.oninput = updateItem;
                stepInput.oninput = updateItem;
            }
        }
        renderAll();
        document.body.appendChild(panel);
    }

    // ===================== 核心扫描（6.3原版+单消息6条限制） =====================
    function scanTradeIcons() {
        const allItemIcons = document.querySelectorAll('img[alt^=":re-"]');

        allItemIcons.forEach(icon => {
            const altText = icon.alt;
            const reIdMatch = altText.match(/:re-(\d+):/);
            if (!reIdMatch) return;
            const reId = reIdMatch[1];
            const itemConfig = ITEM_DATA[reId];
            if (!itemConfig) return;

            const msgContainer = icon.closest('div[class*="css-"]') || icon.parentElement.parentElement;
            if (!msgContainer) return;

            // 单条消息最多6条利润提示
            const existTags = msgContainer.querySelectorAll('.profit-tag');
            if (existTags.length >= 6) return;
            // 同物品不重复添加
            if (msgContainer.querySelector(`[data-re-id="${reId}"]`)) return;

            const msgText = msgContainer.textContent || '';
            const lowerText = msgText.toLowerCase();

            // 价格识别
            const priceMatch = msgText.match(/@\s*(\d+\.?\d*)k?/i);
            let price = 0;
            if (priceMatch) {
                price = parseFloat(priceMatch[1]);
                if (priceMatch[0].includes('k')) price *= 1000;
            }
            // 数量识别
            const quantity = (msgText.replace(/@\d+/g, '').match(/\d+/) || [])[0] || '';
            // 品质识别
            const qualityMatch = msgText.match(/q(\d+)/i);
            const q = qualityMatch ? parseInt(qualityMatch[1]) : 3;
            // 区分买卖
            const isSeller = /卖|出|售|sell/i.test(lowerText);
            const isBuyer = /买|收|求|buy/i.test(lowerText);
            const tradeType = isSeller ? '【卖】' : isBuyer ? '【买】' : '【交易】';

            // 无出价处理
            if (price === 0) {
                const tag = document.createElement('span');
                tag.className = 'profit-tag';
                tag.dataset.reId = reId;
                tag.style.marginLeft = '8px';
                tag.style.fontWeight = 'bold';
                tag.style.fontSize = '13px';
                tag.style.color = '#cccccc';
                tag.textContent = `${itemConfig.name} ${quantity} Q${q} ${tradeType} 未出价`;
                msgContainer.appendChild(tag);
                return;
            }

            // 利润计算
            const expectPrice = itemConfig.q3 + (q - 3) * itemConfig.step;
            const profit = expectPrice - price;

            // 利润标签
            const profitTag = document.createElement('span');
            profitTag.className = 'profit-tag';
            profitTag.dataset.reId = reId;
            profitTag.style.marginLeft = '8px';
            profitTag.style.fontWeight = 'bold';
            profitTag.style.fontSize = '13px';
            profitTag.style.color = profit > 0 ? '#00ff00' : profit < 0 ? '#ff4444' : '#cccccc';

            let profitText = '';
            if (profit > 0) profitText = `✅ 赚${profit.toFixed(0)}`;
            else if (profit < 0) profitText = `❌ 亏${Math.abs(profit).toFixed(0)}`;
            else profitText = `⚖️ 平`;

            profitTag.textContent = `${itemConfig.name} ${quantity} Q${q} ${tradeType} ${profitText}`;
            msgContainer.appendChild(profitTag);
        });
    }

    // ===================== 监听逻辑 =====================
    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (let mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                shouldCheck = true;
                break;
            }
        }
        if (shouldCheck) {
            clearTimeout(window._scInjectTimer);
            window._scInjectTimer = setTimeout(scanTradeIcons, 300);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createEditablePanel();
            observer.observe(document.body, { childList: true, subtree: true });
            scanTradeIcons();
        });
    } else {
        createEditablePanel();
        observer.observe(document.body, { childList: true, subtree: true });
        scanTradeIcons();
    }

    console.log("✅ 6.3最终版·UI修改实时刷新利润");
})();