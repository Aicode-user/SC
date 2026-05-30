// ==UserScript==
// @name         Sim Companies 航空频道聊天估价
// @namespace    https://www.simcompanies.com/zh-cn/company/0/TGW-groupp/
// @version      15.2
// @description  修复点击跳转无效，收购价双重过滤
// @match        *://*.simcompanies.com/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 配置
    let CHAT_K = '';
    let LAST_ID = 999999999;
    let LOADING = false;
    let MESSAGE_HISTORY = [];
    let MESSAGE_DOM_MAP = new Map(); // 消息ID→DOM元素映射（强化管理）
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    // 价格区间优化（针对收购价数量级错误）
    const MIN_SELL_PRICE = 10000;    // 出售价最低1万
    const MAX_SELL_PRICE = 10000000; // 出售价最高1000万
    const MIN_BUY_PRICE = 50000;     // 收购价最低5万（更严格过滤）
    const MAX_BUY_PRICE = 5000000;   // 收购价最高500万（更合理上限）
    const TRIM_RATIO = 0.15;         // 修剪15%极端报价

    // 修正后的6种标尺图核心物品（亚轨道火箭替换机身）
    const TARGET_ITEMS = {
        're-91': '亚轨道火箭',  // 替换原re-77机身
        're-94': 'BFR',
        're-95': '喷气客机',
        're-96': '豪华飞机',
        're-97': '单引擎飞机',
        're-99': '人造卫星'
    };
    const TARGET_CODES = Object.keys(TARGET_ITEMS);
    const TARGET_NAMES = Object.values(TARGET_ITEMS);

    // ==============================================
    // 核心修复：事件委托 + 全局跳转管理
    // ==============================================
    // 1. 全局事件委托（解决动态元素点击无效）
    function setupGlobalClickHandler() {
        document.addEventListener('click', function(e) {
            const target = e.target;
            // 检测是否为价格跳转按钮
            if (target.classList.contains('price-jump-btn')) {
                const msgId = parseInt(target.dataset.msgId);
                if (!isNaN(msgId)) {
                    jumpToMsg(msgId);
                    e.stopPropagation();
                }
            }
        });
        console.log('全局点击委托已设置');
    }

    // 2. 增强版跳转函数（含调试与容错）
    function jumpToMsg(msgId) {
        console.log('尝试跳转到消息ID:', msgId);
        const dom = MESSAGE_DOM_MAP.get(msgId);
        if (!dom) {
            console.warn('未找到消息DOM，ID:', msgId);
            alert('未找到对应消息，请重新加载消息');
            return;
        }

        // 平滑滚动并高亮
        dom.scrollIntoView({behavior: 'smooth', block: 'center'});
        dom.style.border = '2px solid #0cf';
        dom.style.backgroundColor = '#2a2a3a';
        setTimeout(() => {
            dom.style.border = 'none';
            dom.style.backgroundColor = '#222';
        }, 1500);
        console.log('跳转成功，消息ID:', msgId);
    }

    // ==============================================
    // UI 面板（优化按钮与提示）
    // ==============================================
    function buildPanel() {
        let panel = document.getElementById('air-trade-fixed');
        if(panel) panel.remove();

        panel = document.createElement('div');
        panel.id = 'air-trade-fixed';
        panel.style.cssText = `position:fixed; left:10px; top:50px; width:360px; background:#111; color:#fff; z-index:9999999; padding:10px; border-radius:6px; border:1px solid #09f; display:flex; flex-direction:column; gap:6px; max-height:80vh;`;

        const title = document.createElement('div');
        title.textContent = '6标尺物品2h估价（亚轨道火箭版）';
        title.style.cssText = 'text-align:center; font-weight:bold; border-bottom:1px solid #333; padding:4px;';
        panel.appendChild(title);

        const inp = document.createElement('input');
        inp.placeholder = '频道ID(航天X/中文交易k)';
        inp.style.cssText = 'padding:6px; background:#222; color:#fff; border:1px solid #444; border-radius:4px;';
        panel.appendChild(inp);

        const btnBox = document.createElement('div');
        btnBox.style.display = 'flex';
        btnBox.style.gap = '4px';
        const btn1 = document.createElement('button'); btn1.textContent = '加载最新'; btn1.style = 'flex:1;padding:6px;background:#07c;color:#fff;border:none;border-radius:4px;cursor:pointer';
        const btn2 = document.createElement('button'); btn2.textContent = '加载更早'; btn2.style = 'flex:1;padding:6px;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer';
        const btn3 = document.createElement('button'); btn3.textContent = '分析2小时'; btn3.style = 'flex:1;padding:6px;background:#0c8;color:#fff;border:none;border-radius:4px;cursor:pointer';
        btnBox.append(btn1,btn2,btn3);
        panel.appendChild(btnBox);

        const msgArea = document.createElement('div');
        msgArea.id = 'msg-area';
        msgArea.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;font-size:12px;white-space:pre-wrap;';
        panel.appendChild(msgArea);

        const resultArea = document.createElement('div');
        resultArea.id = 'result-area';
        resultArea.style.cssText = 'background:#1a1a1a;padding:8px;border-radius:4px;display:none;font-size:12px;line-height:1.5;';
        panel.appendChild(resultArea);

        const tip = document.createElement('div');
        tip.id = 'tip';
        tip.style.cssText = 'font-size:11px;color:#888;text-align:center;';
        tip.textContent = '收购价双重过滤，点击价格跳转验证来源（已修复）';
        panel.appendChild(tip);

        document.body.appendChild(panel);

        // 事件绑定
        btn1.addEventListener('click', () => {
            CHAT_K = inp.value.trim() || 'k';
            LAST_ID = 999999999;
            MESSAGE_HISTORY = [];
            MESSAGE_DOM_MAP.clear();
            msgArea.innerHTML = '';
            resultArea.style.display = 'none';
            loadMessages();
            console.log('已重置数据，加载最新消息');
        });

        btn2.addEventListener('click', () => {
            if (CHAT_K) loadMessages();
            else alert('请先输入频道ID');
        });

        btn3.addEventListener('click', () => {
            try {
                if(MESSAGE_HISTORY.length === 0) {
                    alert('请先加载消息');
                    return;
                }
                doAnalyze();
                console.log('分析执行成功');
            } catch (e) {
                console.error('分析按钮点击错误:', e);
                alert('分析执行出错，请查看控制台');
            }
        });
    }

    // ==============================================
    // 加载消息 + 强化DOM映射（确保不丢失）
    // ==============================================
    function loadMessages() {
        if(LOADING) return;
        LOADING = true;
        document.getElementById('tip').textContent = '加载中...';

        GM_xmlhttpRequest({
            method:'GET',
            url:`https://www.simcompanies.com/api/v2/chatroom/${CHAT_K}/from-id/${LAST_ID}/`,
            credentials:'include',
            headers:{'Accept':'application/json'},
            onload:(r)=>{
                LOADING=false;
                try{
                    if(r.responseText.includes('You cannot access')){
                        document.getElementById('tip').textContent='无此频道权限';
                        return;
                    }
                    const data = JSON.parse(r.responseText);
                    const msgs = data.messages||data||[];
                    if(msgs.length===0){
                        document.getElementById('tip').textContent='无更多消息';
                        return;
                    }
                    const box = document.getElementById('msg-area');
                    msgs.forEach(m=>{
                        MESSAGE_HISTORY.push(m);
                        const item = document.createElement('div');
                        item.dataset.msgId = m.id; // 绑定消息ID
                        item.style='background:#222;padding:6px;border-radius:4px;white-space:pre-wrap;transition:all 0.2s';
                        const t = new Date(m.datetime).toLocaleString().slice(5,-3);
                        const c = replaceReOnly(m.body||'');
                        item.innerHTML = `<div style="color:#0cf;font-weight:bold;">${m.sender?.company||'未知'}</div><div style="color:#777;font-size:10px;">${t}</div><div style="color:#eee;margin-top:2px;">${c}</div>`;
                        box.appendChild(item);
                        MESSAGE_DOM_MAP.set(m.id, item); // 强制存储映射
                        console.log('消息DOM已存储，ID:', m.id);
                    });
                    LAST_ID = Math.min(...msgs.map(x=>x.id));
                    document.getElementById('tip').textContent=`已加载 ${msgs.length} 条 | 总计 ${MESSAGE_HISTORY.length} 条`;
                }catch(e){
                    document.getElementById('tip').textContent='加载失败';
                    console.error('消息加载错误:', e);
                }
            },
            onerror:()=>{
                LOADING=false;
                document.getElementById('tip').textContent='网络错误';
                console.error('GM_xmlhttpRequest错误');
            }
        });
    }

    // 替换RE编码
    function replaceReOnly(text){
        let res = text.replace(/</g,'&lt;').replace(/>/g,'&gt;');
        for(let [k,v] of Object.entries(TARGET_ITEMS)) res = res.split(k).join(v);
        return res;
    }

    // ==============================================
    // 核心：收购价双重过滤 + 出售价精准提取
    // ==============================================
    // 1. 严格隔离数量文本（彻底排除数量干扰）
    function isQuantityText(s){
        return /\d+\s*(x|个|件|pcs|份|组)/i.test(s) ||
               /(数量|quantity|count|amount):?\s*\d+/i.test(s);
    }

    // 2. 精准解析k/w单位（无识别错误）
    function parseValidUnit(s){
        const str = s.toLowerCase().replace(/\s+/g,'');
        const match = str.match(/^(\d+\.?\d*)([kw])?$/);
        if(!match) return 0;
        const [,nStr,unit] = match;
        let num = parseFloat(nStr);
        if(isNaN(num)) return 0;
        if(unit === 'k') num *= 1000;
        if(unit === 'w') num *= 10000;
        return Math.round(num);
    }

    // 3. 多方案提取价格（按优先级，区分买卖类型过滤）
    function extractValidPrice(str, tradeType){
        const lower = str.toLowerCase();
        let price = 0;

        // 方案1：@后精准提取（游戏标准报价格式，最高优先级）
        const atMatch = lower.match(/@\s*(\d+\.?\d*[kw]?)/);
        if(atMatch && !isQuantityText(atMatch[1])){
            price = parseValidUnit(atMatch[1]);
            if(validatePrice(price, tradeType)) return price;
        }

        // 方案2：Q等级紧邻提取（排除数量干扰）
        const qMatch = lower.match(/q(\d{1,2})\s*([^\d]*)(\d+\.?\d*[kw]?)/i);
        if(qMatch && !isQuantityText(qMatch[3])){
            price = parseValidUnit(qMatch[3]);
            if(validatePrice(price, tradeType)) return price;
        }

        // 方案3：收购价专用过滤（仅保留"收/Qx/价格"格式）
        if(tradeType === 'buy'){
            const buyMatch = lower.match(/(收|收购|求)\s*(.+?)\s*q(\d{1,2})\s*(\d+\.?\d*[kw]?)/i);
            if(buyMatch && !isQuantityText(buyMatch[4])){
                price = parseValidUnit(buyMatch[4]);
                if(validatePrice(price, tradeType)) return price;
            }
        }

        return 0;
    }

    // 4. 价格有效性验证（区分买卖类型，双重过滤收购价）
    function validatePrice(price, tradeType){
        if(tradeType === 'buy'){
            // 收购价双重过滤：范围更严格 + 必须高于出售价下限
            return price >= MIN_BUY_PRICE && price <= MAX_BUY_PRICE && price >= MIN_SELL_PRICE;
        }else{
            // 出售价常规过滤
            return price >= MIN_SELL_PRICE && price <= MAX_SELL_PRICE;
        }
    }

    // 5. 提取Q等级
    function extractQ(str){
        const m = str.toLowerCase().match(/q(\d{1,2})/i);
        return m ? m[1] : '';
    }

    // 6. 仅识别6种标尺物品（含亚轨道火箭）
    function findItem(str){
        const lower = str.toLowerCase();
        for(let c of TARGET_CODES) if(lower.includes(c)) return TARGET_ITEMS[c];
        for(let n of TARGET_NAMES) if(lower.includes(n)) return n;
        return '';
    }

    // 7. 识别买卖类型（更精准匹配）
    function getTradeType(str){
        const lower = str.toLowerCase();
        if(/buy|收|收购|求购|求/.test(lower)) return 'buy';
        if(/sell|卖|出售|出|售/.test(lower)) return 'sell';
        return '';
    }

    // 8. 稳健统计（修剪极端报价）
    function robustPrice(arr){
        if(!arr.length) return 0;
        const sorted = [...arr].sort((a,b)=>a-b);
        const trim = Math.floor(sorted.length * TRIM_RATIO);
        const trimmed = trim > 0 ? sorted.slice(trim, sorted.length - trim) : sorted;
        return Math.round(trimmed.reduce((a,b)=>a+b,0)/trimmed.length);
    }

    // ==============================================
    // 分析 + 渲染可点击价格（使用data-属性替代onclick）
    // ==============================================
    function doAnalyze(){
        const buy={}, sell={};
        const now = Date.now();
        // 存储有效报价对应的消息ID，用于跳转
        const PRICE_MSG_MAP = {};

        MESSAGE_HISTORY.forEach(msg=>{
            const dt = new Date(msg.datetime).getTime();
            if(now - dt > TWO_HOURS) return;
            const body = msg.body||'';

            // 基础信息识别
            const type = getTradeType(body);
            const item = findItem(body);
            const q = extractQ(body);
            const price = extractValidPrice(body, type);
            const msgId = msg.id;

            // 仅保留有效数据
            if(!type || !item || !q || price === 0) return;

            // 存入数据
            const target = type === 'buy' ? buy : sell;
            if(!target[item]) target[item] = {};
            if(!target[item][q]) target[item][q] = [];
            target[item][q].push(price);

            // 绑定消息ID
            const key = `${type}_${item}_Q${q}`;
            if(!PRICE_MSG_MAP[key]) PRICE_MSG_MAP[key] = [];
            PRICE_MSG_MAP[key].push(msgId);
            console.log('价格与消息绑定:', key, '→', msgId);
        });

        // 渲染可点击价格（使用class和data-属性）
        let html = '';
        html+=`<div style="color:#0cf;font-weight:bold;margin-bottom:6px;">📥 2小时收购价</div>`;
        html+= render(buy, 'buy', PRICE_MSG_MAP);
        html+=`<div style="color:#0cf;font-weight:bold;margin:8px 0 6px 0;">📤 2小时出售价</div>`;
        html+= render(sell, 'sell', PRICE_MSG_MAP);

        const res = document.getElementById('result-area');
        res.innerHTML = html;
        res.style.display = 'block';
    }

    // 修复：使用data-msg-id替代内联onclick，配合事件委托
    function render(data, type, map){
        let html = '';
        const items = Object.keys(data);
        if(!items.length) return '<div style="color:#666;">无有效报价</div>';
        items.forEach(name=>{
            html+=`<div style="margin:4px 0;">${name}：`;
            Object.entries(data[name]).forEach(([q,arr])=>{
                const avg = robustPrice(arr);
                const key = `${type}_${name}_Q${q}`;
                const msgIds = map[key]||[];
                const firstMsgId = msgIds[0] || 0;
                // 关键修复：添加class和data-msg-id属性，移除内联onclick
                html+=`<span class="price-jump-btn" data-msg-id="${firstMsgId}"
                       style="color:#fff;background:#222;padding:2px 4px;border-radius:3px;margin:0 2px;cursor:pointer;transition:all 0.2s;"
                       title="点击跳转到原始消息 #${firstMsgId}">
                       Q${q} ${avg.toLocaleString()}</span>`;
            });
            html+=`</div>`;
        });
        return html;
    }

    // 启动流程（新增事件委托设置）
    setupGlobalClickHandler();
    buildPanel();
    setInterval(()=>{
        if(!document.getElementById('air-trade-fixed')){
            buildPanel();
            console.log('面板重建');
        }
    }, 1000);
})();