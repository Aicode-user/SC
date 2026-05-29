// ==UserScript==
// @name         Sim Companies 航空交易价格估算
// @namespace    https://www.simcompanies.com/zh-cn/company/0/TGW-groupp/
// @version      10.6
// @description  不要完全相信，纯AI代码
// @match        *://*.simcompanies.com/*
// @grant        GM_xmlhttpRequest
// @run-at       /
// ==/UserScript==

(function() {
    'use strict';

    // 配置
    let CHAT_K = '';
    let LAST_ID = 999999999;
    let LOADING = false;
    let MESSAGE_HISTORY = [];
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const MIN_VALID_PRICE = 10; // 最低有效价格

    // 航空物品对照表
    const PRODUCT_MAP = {
        're-77':'机身','re-78':'机翼','re-80':'飞行计算机','re-81':'座舱',
        're-82':'姿态控制器','re-84':'燃料储罐','re-85':'固体燃料助推器',
        're-86':'火箭发动机','re-87':'隔热板','re-88':'离子推进器',
        're-89':'喷气发动机','re-90':'亚轨道二级火箭','re-91':'亚轨道火箭',
        're-92':'轨道助推器','re-93':'星际飞船','re-94':'BFR',
        're-95':'喷气客机','re-96':'豪华飞机','re-97':'单引擎飞机','re-99':'人造卫星'
    };
    const ALLOW_RE = Object.keys(PRODUCT_MAP);

    // ==============================================
    // UI 创建（完全保留）
    // ==============================================
    function buildPanel() {
        let panel = document.getElementById('air-trade-fixed');
        if(panel) panel.remove();

        panel = document.createElement('div');
        panel.id = 'air-trade-fixed';
        panel.style.cssText = `
            position:fixed; left:10px; top:50px; width:320px;
            background:#111; color:#fff; z-index:9999999;
            padding:10px; border-radius:6px; border:1px solid #09f;
            display:flex; flex-direction:column; gap:6px;
            max-height:80vh;
        `;

        const title = document.createElement('div');
        title.textContent = '航空交易行情';
        title.style.cssText = 'text-align:center; font-weight:bold; border-bottom:1px solid #333; padding:4px;';
        panel.appendChild(title);

        const inp = document.createElement('input');
        inp.placeholder = '频道ID(航天X，中文交易k，区分大小写a-z)';
        inp.style.cssText = 'padding:6px; background:#222; color:#fff; border:1px solid #444; border-radius:4px;';
        panel.appendChild(inp);

        const btnBox = document.createElement('div');
        btnBox.style.display = 'flex';
        btnBox.style.gap = '4px';
        const btn1 = document.createElement('button'); btn1.textContent = '加载最新'; btn1.style = 'flex:1;padding:6px;background:#07c;color:#fff;border:none;border-radius:4px;';
        const btn2 = document.createElement('button'); btn2.textContent = '加载更早'; btn2.style = 'flex:1;padding:6px;background:#333;color:#fff;border:none;border-radius:4px;';
        const btn3 = document.createElement('button'); btn3.textContent = '分析2小时'; btn3.style = 'flex:1;padding:6px;background:#0c8;color:#fff;border:none;border-radius:4px;';
        btnBox.append(btn1,btn2,btn3);
        panel.appendChild(btnBox);

        const msgArea = document.createElement('div');
        msgArea.id = 'msg-area';
        msgArea.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;font-size:12px;white-space:pre-wrap;';
        panel.appendChild(msgArea);

        const resultArea = document.createElement('div');
        resultArea.id = 'result-area';
        resultArea.style.cssText = 'background:#1a1a1a;padding:6px;border-radius:4px;display:none;font-size:12px;line-height:1.3;';
        panel.appendChild(resultArea);

        const tip = document.createElement('div');
        tip.id = 'tip';
        tip.style.cssText = 'font-size:11px;color:#888;text-align:center;';
        tip.textContent = '输入k后加载消息';
        panel.appendChild(tip);

        document.body.appendChild(panel);

        btn1.onclick = () => {
            CHAT_K = inp.value.trim() || 'k';
            LAST_ID = 999999999;
            MESSAGE_HISTORY = [];
            msgArea.innerHTML = '';
            resultArea.style.display = 'none';
            loadMessages();
        };
        btn2.onclick = () => CHAT_K && loadMessages();
        btn3.onclick = () => {
            if(MESSAGE_HISTORY.length === 0) return alert('先加载消息');
            doAnalyze();
        };
    }

    // ==============================================
    // 加载消息（完全保留）
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
                        item.style='background:#222;padding:6px;border-radius:4px;white-space:pre-wrap;';
                        const t = new Date(m.datetime).toLocaleString().slice(5,-3);
                        const c = replaceReOnly(m.body||'');
                        item.innerHTML = `
                            <div style="color:#0cf;font-weight:bold;">${m.sender?.company||'未知'}</div>
                            <div style="color:#777;font-size:10px;">${t}</div>
                            <div style="color:#eee;margin-top:2px;">${c}</div>
                        `;
                        box.appendChild(item);
                    });
                    LAST_ID = Math.min(...msgs.map(x=>x.id));
                    document.getElementById('tip').textContent=`已加载 ${msgs.length} 条`;
                }catch(e){
                    document.getElementById('tip').textContent='加载失败';
                }
            },
            onerror:()=>{
                LOADING=false;
                document.getElementById('tip').textContent='网络错误';
            }
        });
    }

    // ==============================================
    // 仅替换RE代码，保留原文（无正则）
    // ==============================================
    function replaceReOnly(text){
        let result = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        for(let [code, name] of Object.entries(PRODUCT_MAP)){
            result = result.split(code).join(name);
        }
        return result;
    }

    // ==============================================
    // 【核心】无正则·纯字符串价格分析
    // 识别：@后价格 / k(千) / w(万)
    // ==============================================
    function doAnalyze(){
        const buy = {}, sell = {};
        const now = Date.now();

        // 1. 遍历所有消息
        MESSAGE_HISTORY.forEach(msg => {
            // 时间过滤：只保留2小时内
            const msgTime = new Date(msg.datetime).getTime();
            if(now - msgTime > TWO_HOURS) return;

            const content = msg.body.toLowerCase().trim();
            let tradeType = '';

            // 2. 纯字符串判断买卖类型
            if(content.includes('buy') || content.includes('收购')) tradeType = 'buy';
            if(content.includes('sell') || content.includes('出售')) tradeType = 'sell';
            if(!tradeType) return;

            // 3. 纯字符串匹配：只识别指定航空物品(re-xx)
            let targetItem = '';
            for(let reCode of ALLOW_RE){
                if(content.includes(reCode)){
                    targetItem = PRODUCT_MAP[reCode];
                    break;
                }
            }
            if(!targetItem) return;

            // 4. 纯字符串提取Q等级 (q1~q99)
            const qStr = extractQLevel(content);
            if(!qStr) return;

            // 5. 纯字符串提取价格（核心：识别@ / k / w）
            const price = extractPrice(content);
            if(price < MIN_VALID_PRICE) return;

            // 6. 分组存储价格
            const target = tradeType === 'buy' ? buy : sell;
            if(!target[targetItem]) target[targetItem] = {};
            if(!target[targetItem][qStr]) target[targetItem][qStr] = [];
            target[targetItem][qStr].push(price);
        });

        // 渲染结果
        let html='';
        html+=`<div style="color:#0cf;font-weight:bold;margin-bottom:4px;">📥 2小时收购价</div>`;
        html+= renderData(buy);
        html+=`<div style="color:#0cf;font-weight:bold;margin:6px 0 4px 0;">📤 2小时出售价</div>`;
        html+= renderData(sell);

        const resBox = document.getElementById('result-area');
        resBox.innerHTML = html;
        resBox.style.display = 'block';
    }

    // ==============================================
    // 工具函数1：纯字符串提取 Q等级
    // ==============================================
    function extractQLevel(str){
        const qIndex = str.indexOf('q');
        if(qIndex === -1) return '';

        let qNum = '';
        // 取q后面1-2位数字
        for(let i=qIndex+1; i<str.length; i++){
            const char = str[i];
            if(char >= '0' && char <= '9'){
                qNum += char;
                if(qNum.length === 2) break;
            }else{
                break;
            }
        }
        return qNum.length >=1 ? qNum : '';
    }

    // ==============================================
    // 工具函数2：纯字符串提取价格（识别 @ / k / w）
    // ==============================================
    function extractPrice(str){
        let price = 0;

        // 规则1：提取 @ 后面的价格
        const atIndex = str.indexOf('@');
        if(atIndex !== -1){
            const afterAt = str.slice(atIndex + 1).trim();
            price = parseNumberWithUnit(afterAt);
            if(price > 0) return price;
        }

        // 规则2：全文查找 k / w 价格
        price = parseNumberWithUnit(str);
        return price;
    }

    // ==============================================
    // 工具函数3：纯字符串解析数字 + 单位(k=1000,w=10000)
    // ==============================================
    function parseNumberWithUnit(str){
        let numStr = '';
        let unit = 1;

        // 纯字符串提取连续数字
        for(let char of str){
            if((char >= '0' && char <= '9') || char === '.'){
                numStr += char;
            }else{
                // 识别单位 k / w
                if(char === 'k') unit = 1000;
                if(char === 'w') unit = 10000;
                break;
            }
        }

        const num = parseFloat(numStr);
        return isNaN(num) ? 0 : num * unit;
    }

    // ==============================================
    // 渲染价格（保留格式）
    // ==============================================
    function renderData(data){
        let html = '';
        const items = Object.keys(data);
        if(items.length === 0) return '<div style="color:#666;">无有效出价</div>';

        items.forEach(name => {
            html+=`<div style="color:#fff;margin:1px 0;">${name}：`;
            Object.entries(data[name]).forEach(([q, prices])=>{
                const avg = (prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(0);
                html+=`Q${q}:${avg} `;
            });
            html+=`</div>`;
        });
        return html;
    }

    // ==============================================
    // 启动
    // ==============================================
    buildPanel();
    setInterval(()=>!document.getElementById('air-trade-fixed')&&buildPanel(), 1000);
})();