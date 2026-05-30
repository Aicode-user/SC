// ==UserScript==
// @name         SimCompanies 导购妙妙小工具
// @namespace    https://www.simcompanies.com/zh-cn/company/0/TGW-groupp/
// @version      7.2 流畅输入+本地永久存储
// @description  多文本切块试算，柔性匹配真实利润区间；输入框流畅不卡顿，配置自动本地保存
// @match        https://www.simcompanies.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ===================== 基础配置 =====================
    const DEFAULT_ITEM_DATA = {
        "96":  { name: "LUX",  q3: 76500,  step: 1500  },
        "99":  { name: "SAT",  q3: 51000,  step: 1000  },
        "97":  { name: "SEP",  q3: 31400,  step: 800   },
        "91":  { name: "SOR",  q3: 105000, step: 2000  },
        "95":  { name: "JUM",  q3: 222000, step: 4000  },
        "94":  { name: "BFR",  q3: 740000, step: 15000 },
    };

    const MIN_Q = 0, MAX_Q = 12;
    const IDEAL_PROFIT = 3000;
    const MAX_ACCEPT_PROFIT = 10000;
    const PRICE_SAFE_OFFSET = 25000;
    const ALL_ITEMS = Object.values(DEFAULT_ITEM_DATA).map(i => i.name);
    const SPLITTERS = /\n|\||-|—|,|，|\(|\)|\[|\]| |\//g;

    // ===================== 本地存储：加载/保存配置 =====================
    function loadConfig() {
        try {
            const saved = localStorage.getItem('SimCompanies_TradeConfig');
            return saved ? JSON.parse(saved) : DEFAULT_ITEM_DATA;
        } catch (e) {
            return DEFAULT_ITEM_DATA;
        }
    }

    function saveConfig(data) {
        try {
            localStorage.setItem('SimCompanies_TradeConfig', JSON.stringify(data));
        } catch (e) {}
    }

    // 初始化加载本地配置
    let ITEM_DATA = loadConfig();

    // ===================== 工具函数 =====================
    function debug(...args) { console.log("[导购]", ...args); }

    // 防抖：解决输入框连续输入卡顿问题
    function debounce(func, delay = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // ===================== 刷新标签 =====================
    function refreshProfitTags() {
        document.querySelectorAll('.profit-tag').forEach(t => t.remove());
        scanTradeIcons();
    }

    // ===================== 右侧配置面板（优化输入+自动保存） =====================
    function createEditablePanel() {
        if (document.getElementById('price-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'price-panel';
        panel.style.cssText = `position:fixed; top:20px; right:20px; width:340px; background:#1a1b26; color:#eee; border-radius:10px; padding:12px; z-index:9999; font-size:12px; border:1px solid #445; max-height:85vh; overflow-y:auto;`;

        const header = document.createElement('div');
        header.style.cssText = 'font-weight:bold; font-size:14px; cursor:pointer; margin-bottom:10px;';
        header.textContent = '📊 品质价格表 Q0~Q12（点击折叠）✅ 配置已自动保存';
        panel.appendChild(header);

        const content = document.createElement('div');
        panel.appendChild(content);
        header.onclick = () => { content.style.display = content.style.display === 'none' ? 'block' : 'none'; };

        // 渲染配置（防抖更新，不打断输入）
        const renderAll = debounce(() => {
            content.innerHTML = '';
            for (const id in ITEM_DATA) {
                const it = ITEM_DATA[id];
                const wrap = document.createElement('div');
                wrap.style.marginBottom = '12px';
                wrap.style.paddingBottom = '8px';
                wrap.style.borderBottom = '1px solid #333';

                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.gap = '6px';
                row.style.alignItems = 'center';

                const name = document.createElement('div');
                name.style.minWidth = '50px';
                name.style.fontWeight = 'bold';
                name.style.color = '#9cf';
                name.textContent = it.name;

                // Q3输入框
                const q3Input = document.createElement('input');
                q3Input.type = 'number';
                q3Input.value = it.q3;
                q3Input.style.width = '70px';
                q3Input.style.padding = '4px 6px';
                q3Input.style.background = '#223';
                q3Input.style.color = '#fff';
                q3Input.style.border = '1px solid #556';
                q3Input.style.borderRadius = '4px';
                q3Input.style.outline = 'none';

                // 步长输入框
                const stepInput = document.createElement('input');
                stepInput.type = 'number';
                stepInput.value = it.step;
                stepInput.style.width = '60px';
                stepInput.style.padding = '4px 6px';
                stepInput.style.background = '#223';
                stepInput.style.color = '#fff';
                stepInput.style.border = '1px solid #556';
                stepInput.style.borderRadius = '4px';
                stepInput.style.outline = 'none';

                row.append(name,
                    Object.assign(document.createElement('div'), { textContent: 'Q3', style: 'width:24px' }),
                    q3Input,
                    Object.assign(document.createElement('div'), { textContent: '每Q±', style: 'width:36px' }),
                    stepInput
                );
                wrap.appendChild(row);

                // 品质价格展示
                const qRow = document.createElement('div');
                qRow.style.display = 'flex';
                qRow.style.flexWrap = 'wrap';
                qRow.style.gap = '3px';
                qRow.style.marginTop = '6px';
                for (let q = MIN_Q; q <= MAX_Q; q++) {
                    const p = it.q3 + (q - 3) * it.step;
                    const t = document.createElement('span');
                    t.style.cssText = 'padding:2px 3px; min-width:34px; text-align:center; background:#252536; border-radius:3px; font-size:10px;';
                    t.innerHTML = `Q${q}<br>${p.toLocaleString()}`;
                    qRow.appendChild(t);
                }
                wrap.appendChild(qRow);
                content.appendChild(wrap);

                // 输入更新：流畅输入 + 自动保存
                const updateConfig = debounce(() => {
                    ITEM_DATA[id].q3 = Number(q3Input.value) || 0;
                    ITEM_DATA[id].step = Number(stepInput.value) || 0;
                    saveConfig(ITEM_DATA); // 实时保存到本地
                    renderAll();
                    refreshProfitTags();
                });

                q3Input.addEventListener('input', updateConfig);
                stepInput.addEventListener('input', updateConfig);
            }
        });

        renderAll();
        document.body.appendChild(panel);
    }

    // ===================== 核心：多文本切块生成候选片段 =====================
    function getCandidateSegments(fullText, currName) {
        let segments = fullText.split(SPLITTERS).map(s => s.trim()).filter(s => s.length > 2);
        let unique = [...new Set(segments)];
        return unique.filter(s => {
            const hasOther = ALL_ITEMS.some(name => name !== currName && s.includes(name));
            return !hasOther;
        });
    }

    // ===================== 解析函数 =====================
    function parseQ(seg) {
        const m = seg.match(/Q(\d+)(?:\/\d+)?/i);
        return m ? Math.min(Math.max(parseInt(m[1]), MIN_Q), MAX_Q) : 3;
    }

    function parseP(seg) {
        let p = 0;
        const atM = seg.match(/@\s*(\d+(?:[,.]\d+)*)([kKmM]?)/i);
        if (atM) {
            let num = atM[1].replace(/[,.]/g, '');
            const u = atM[2].toLowerCase();
            p = parseFloat(num) || 0;
            if (u === 'k') p *= 1000;
            if (u === 'm') p *= 1000000;
            return p;
        }
        const uM = seg.match(/(\d+\.?\d*)(k|m)/i);
        if (uM) {
            p = parseFloat(uM[1]) || 0;
            p *= uM[2] === 'k' ? 1000 : 1000000;
            return p;
        }
        const nM = seg.match(/\b(\d{4,})\b/);
        return nM ? parseFloat(nM[1]) : 0;
    }

    function parseQty(seg) {
        const clean = seg.replace(/@\d+|\d+k|\d+m/gi, '');
        const m = clean.match(/\b(\d{1,4})\b/);
        return m ? m[1] : '';
    }

    // ===================== 多切块择优 =====================
    function getBestResult(segments, item) {
        let candidates = [];
        segments.forEach(seg => {
            const q = parseQ(seg);
            const p = parseP(seg);
            const qty = parseQty(seg);
            if (p <= 0) return;
            const expect = item.q3 + (q - 3) * item.step;
            const profit = expect - p;
            const priceValid = Math.abs(p - expect) < PRICE_SAFE_OFFSET;
            if (!priceValid) return;
            candidates.push({ q, p, qty, profit, score: 0 });
        });

        candidates.forEach(c => {
            const absP = Math.abs(c.profit);
            if (absP <= IDEAL_PROFIT) c.score = 10;
            else if (absP <= MAX_ACCEPT_PROFIT) c.score = 5;
            else c.score = 0;
        });

        candidates.sort((a, b) => b.score - a.score);
        return candidates[0] || null;
    }

    // ===================== 核心扫描 =====================
    function scanTradeIcons() {
        const icons = document.querySelectorAll('img[alt^=":re-"]');
        icons.forEach(icon => {
            const reId = icon.alt.match(/:re-(\d+):/)?.[1];
            const item = ITEM_DATA[reId];
            if (!item) return;

            const msgBox = icon.closest('div[class*="css-"]') || icon.parentElement.parentElement;
            if (!msgBox) return;
            if (msgBox.querySelectorAll(`[data-re-id="${reId}"]`).length) return;
            if (msgBox.querySelectorAll('.profit-tag').length >= 6) return;

            const fullText = msgBox.textContent.trim();
            const segments = getCandidateSegments(fullText, item.name);
            const best = getBestResult(segments, item);
            const lower = fullText.toLowerCase();
            const type = /卖|出|售|sell/.test(lower) ? '【卖】' : /买|收|求|buy/.test(lower) ? '【买】' : '【交易】';

            const tag = document.createElement('span');
            tag.className = 'profit-tag';
            tag.dataset.reId = reId;
            tag.style.cssText = 'margin-left:8px; font-weight:bold; font-size:13px;';

            if (best) {
                const { q, p, qty, profit } = best;
                const color = profit > 0 ? '#00ff00' : profit < 0 ? '#ff4444' : '#cccccc';
                const profitText = profit > 0 ? `✅ 赚${Math.round(profit)}` :
                                   profit < 0 ? `❌ 亏${Math.round(Math.abs(profit))}` : `⚖️ 平`;
                tag.style.color = color;
                tag.textContent = `${item.name} ${qty} Q${q} ${type} ${profitText}`;
            } else {
                tag.style.color = '#cccccc';
                tag.textContent = `${item.name} Q${parseQ(fullText)} ${type} 未出价`;
            }

            msgBox.appendChild(tag);
        });
    }

    // ===================== 监听+初始化 =====================
    const observer = new MutationObserver(() => {
        clearTimeout(window.scanTimer);
        window.scanTimer = setTimeout(scanTradeIcons, 300);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createEditablePanel();
            observer.observe(document.body, { childList:true, subtree:true });
            scanTradeIcons();
        });
    } else {
        createEditablePanel();
        observer.observe(document.body, { childList:true, subtree:true });
        scanTradeIcons();
    }

    console.log("✅ 7.2版 流畅输入+本地自动保存 已加载");
})();