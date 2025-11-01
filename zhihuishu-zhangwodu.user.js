// ==UserScript==
// @name         知到智慧树掌握度答题-AI自动答题脚本(Zhihuishu AI Auto-Answering)
// @namespace    http://tampermonkey.net/
// @version      1.4.1
// @description  半自动完成智慧树掌握度练习。新增题库(Gist)搜索模式，支持搜题失败自动Fallback AI。支持免费模式(GLM-4.5-Flash)及自定义多种AI服务商(DeepSeek/Zhipu/OpenAI/Gemini/Coren)。
// @author       Coren
// @match        https://studywisdomh5.zhihuishu.com/study*
// @match        https://studywisdomh5.zhihuishu.com/exam*
// @match        https://studywisdomh5.zhihuishu.com/pointOfMastery*
// @connect      api.coren.xin
// @connect      open.bigmodel.cn
// @connect      api.deepseek.com
// @connect      api.openai.com
// @connect      generativelanguage.googleapis.com
// @connect      gist.githubusercontent.com
// @connect      *
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @license      CC BY-NC-SA 4.0
// @license      https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. UI 和样式 ---
    GM_addStyle(`
        #ai-panel { position: fixed; top: 100px; right: 20px; width: 300px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); z-index: 9999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; transition: transform 0.3s ease-in-out; transform: translateX(110%); }
        #ai-panel.show { transform: translateX(0); }
        #panel-toggle { position: fixed; top: 100px; right: 20px; width: 40px; height: 40px; background-color: #0d6efd; color: white; border: none; border-radius: 50%; cursor: pointer; z-index: 10000; display: flex; justify-content: center; align-items: center; font-size: 20px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2); }
        #panel-header { padding: 15px; background-color: #0d6efd; color: white; border-top-left-radius: 8px; border-top-right-radius: 8px; font-size: 18px; font-weight: 500; }
        #panel-content { padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .input-group { display: flex; flex-direction: column; gap: 5px; }
        .input-group label { margin-bottom: 0; color: #333; font-weight: 500; }
        .input-group input, .input-group select { padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
        #start-button { padding: 10px 15px; background-color: #198754; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; transition: background-color 0.3s; }
        #start-button:hover { background-color: #157347; }
        #status-log { margin-top: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 4px; height: 100px; overflow-y: auto; font-size: 12px; color: #555; border: 1px solid #e0e0e0; }
        .custom-settings.hidden, .quizbank-settings.hidden, .api-url-group.hidden { display: none; }
    `);

    const panelHTML = `
        <button id="panel-toggle">AI</button>
        <div id="ai-panel">
            <div id="panel-header">AI 自动答题设置</div>
            <div id="panel-content">
                <div class="input-group">
                    <label for="mode-select">答题模式:</label>
                    <select id="mode-select">
                        <option value="free">免费模式 (GLM-4.5-Flash)</option>
                        <option value="quizbank">题库模式 (Gist/JSON)</option>
                        <option value="custom">自定义 AI 模式</option>
                    </select>
                </div>

                <div class="quizbank-settings hidden">
                    <div class="input-group">
                        <label for="quizbank-url">题库 JSON 地址:</label>
                        <input type="text" id="quizbank-url" placeholder="https://.../raw/.../quiz.json">
                    </div>
                    <div class="input-group" style="flex-direction: row; align-items: center; margin-top: 5px;">
                        <input type="checkbox" id="fallback-ai" style="width: 16px; height: 16px; margin-right: 8px; padding: 0;">
                        <label for="fallback-ai" style="margin-bottom: 0; font-weight: normal;">题库未命中则自动 AI</label>
                    </div>
                    <button id="refresh-quizbank" style="padding: 8px; background-color: #0d6efd; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin-top: 10px;">刷新/加载题库</button>
                    <small style="font-size: 12px; color: #555; margin-top: 5px;">题库格式: [ { "q": "问题...", "a": "A" }, ... ]</small>
                </div>

                <div class="custom-settings hidden">
                    <div class="input-group">
                        <label for="provider-select">服务商:</label>
                        <select id="provider-select">
                            <option value="deepseek">DeepSeek</option>
                            <option value="zhipu">Zhipu (智谱 GLM)</option>
                            <option value="openai">OpenAI (GPT)</option>
                            <option value="gemini">Google (Gemini)</option>
                            <option value="coren">Coren API (非公开-自有)</option>
                        </select>
                    </div>
                    <div class="input-group api-url-group hidden">
                         <label for="api-url">API 地址:</label>
                         <input type="text" id="api-url" placeholder="https://api.coren.xin/query">
                    </div>
                    <div class="input-group">
                        <label for="api-key" id="api-key-label">API Key:</label>
                        <input type="password" id="api-key" placeholder="在此输入你的API Key">
                    </div>
                </div>
                <button id="start-button">开始自动答题</button>
                <div id="status-log">状态日志...</div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', panelHTML);

    // --- 2. DOM元素 & 变量初始化 ---
    const panel = document.getElementById('ai-panel');
    const toggleButton = document.getElementById('panel-toggle');
    const startButton = document.getElementById('start-button');
    const modeSelect = document.getElementById('mode-select');
    const customSettings = document.querySelector('.custom-settings');
    const providerSelect = document.getElementById('provider-select');
    const apiKeyInput = document.getElementById('api-key');
    const apiKeyLabel = document.getElementById('api-key-label');
    const apiUrlGroup = document.querySelector('.api-url-group');
    const apiUrlInput = document.getElementById('api-url');
    const statusLog = document.getElementById('status-log');
    const quizbankSettings = document.querySelector('.quizbank-settings');
    const quizbankUrlInput = document.getElementById('quizbank-url');
    const fallbackAiCheckbox = document.getElementById('fallback-ai');
    const refreshQuizbankButton = document.getElementById('refresh-quizbank');

    let isPanelVisible = false;
    let autoMode = false;
    let quizBank = []; 

    // --- 3.AI服务商配置中心 ---
    const API_PROVIDERS = {
        deepseek: {
            name: "DeepSeek",
            url: "https://api.deepseek.com/v1/chat/completions",
            buildHeaders: (key) => ({ "Content-Type": "application/json", "Authorization": `Bearer ${key}` }),
            buildPayload: (messages, model) => ({ model: "deepseek-chat", messages, max_tokens: 50, temperature: 0 }),
            parseResponse: (data) => data.choices?.[0]?.message?.content
        },
        zhipu: {
            name: "Zhipu (智谱 GLM)",
            url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            buildHeaders: (key) => ({ "Content-Type": "application/json", "Authorization": `Bearer ${key}` }),
            buildPayload: (messages, model) => ({ model: "glm-4", messages, max_tokens: 50, temperature: 0, thinking: {type: "disabled"} }),
            parseResponse: (data) => data.choices?.[0]?.message?.content
        },
        openai: {
            name: "OpenAI (GPT)",
            url: "https://api.openai.com/v1/chat/completions",
            buildHeaders: (key) => ({ "Content-Type": "application/json", "Authorization": `Bearer ${key}` }),
            buildPayload: (messages, model) => ({ model: "gpt-3.5-turbo", messages, max_tokens: 50, temperature: 0 }),
            parseResponse: (data) => data.choices?.[0]?.message?.content
        },
        gemini: {
            name: "Google (Gemini)",
            url: (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`,
            buildHeaders: (key) => ({ "Content-Type": "application/json" }),
            buildPayload: (messages, model) => ({
                contents: messages.map(msg => ({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] })),
                generationConfig: { maxOutputTokens: 50, temperature: 0 }
            }),
            parseResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text
        },
        coren: {
            name: "Coren API (自有)",
            requiresApiUrl: true, // 特殊标记，需要显示URL输入框
            parseResponse: (data) => (data.code === 0 && data.data) ? data.data.answer : null
        }
    };

    // --- 4.UI交互与设置管理 ---
    toggleButton.addEventListener('click', () => {
        isPanelVisible = !isPanelVisible;
        panel.classList.toggle('show', isPanelVisible);
        toggleButton.textContent = isPanelVisible ? 'X' : 'AI';
    });

    // --- 辅助函数：读写设置 ---
    function getStoredApiKeys() {
        return JSON.parse(GM_getValue('api_keys_storage', '{}'));
    }

    function saveStoredApiKeys(keys) {
        GM_setValue('api_keys_storage', JSON.stringify(keys));
    }

    // --- 加载设置 ---
    modeSelect.value = GM_getValue('answer_mode', 'free');
    let savedProvider = GM_getValue('api_provider', 'deepseek');
    if (!API_PROVIDERS[savedProvider]) {
        savedProvider = 'deepseek';
        GM_setValue('api_provider', savedProvider);
    }
    providerSelect.value = savedProvider;
    apiUrlInput.value = GM_getValue('api_url', 'https://api.coren.xin/query');
    const allApiKeys = getStoredApiKeys();
    apiKeyInput.value = allApiKeys[savedProvider] || '';
    // 加载题库设置
    quizbankUrlInput.value = GM_getValue('quizbank_url', '');
    fallbackAiCheckbox.checked = GM_getValue('fallback_ai', false);


    function updateUIVisibility() {
        const mode = modeSelect.value;
        const providerKey = providerSelect.value;
        const provider = API_PROVIDERS[providerKey];

        // 默认隐藏所有
        customSettings.classList.add('hidden');
        quizbankSettings.classList.add('hidden');

        if (mode === 'custom') {
            if (!provider) return; // 安全检查
            customSettings.classList.remove('hidden');
            apiKeyLabel.textContent = `${provider.name} Key:`;
            if (provider.requiresApiUrl) {
                apiUrlGroup.classList.remove('hidden');
            } else {
                apiUrlGroup.classList.add('hidden');
            }
        } else if (mode === 'quizbank') {
            quizbankSettings.classList.remove('hidden');
        }
        // free 模式下两者都保持 hidden
    }

    // --- 事件监听 ---
    modeSelect.addEventListener('change', () => {
        GM_setValue('answer_mode', modeSelect.value);
        updateUIVisibility();
    });

    providerSelect.addEventListener('change', () => {
        const newProvider = providerSelect.value;
        GM_setValue('api_provider', newProvider);
        const allKeys = getStoredApiKeys();
        apiKeyInput.value = allKeys[newProvider] || ''; // 切换时加载新服务商的key
        updateUIVisibility();
    });

    apiKeyInput.addEventListener('input', () => {
        const currentProvider = providerSelect.value;
        const allKeys = getStoredApiKeys();
        allKeys[currentProvider] = apiKeyInput.value;
        saveStoredApiKeys(allKeys);
    });

    apiUrlInput.addEventListener('input', () => {
        GM_setValue('api_url', apiUrlInput.value);
    });

    // 题库事件监听
    quizbankUrlInput.addEventListener('input', () => {
        GM_setValue('quizbank_url', quizbankUrlInput.value);
    });

    fallbackAiCheckbox.addEventListener('change', () => {
        GM_setValue('fallback_ai', fallbackAiCheckbox.checked);
    });

    refreshQuizbankButton.addEventListener('click', fetchQuizBank);


    startButton.addEventListener('click', () => toggleAutoMode(!autoMode));
    updateUIVisibility();

    // --- 5.核心功能函数 ---
    function log(message) {
        console.log(`[AI脚本] ${message}`);
        const timestamp = new Date().toLocaleTimeString();
        statusLog.innerHTML += `<div>${timestamp}: ${message}</div>`;
        statusLog.scrollTop = statusLog.scrollHeight;
    }

    function reliableClick(element) {
        if (!element) { log("警告: 尝试点击一个不存在的元素。"); return; }
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: unsafeWindow });
        element.dispatchEvent(clickEvent);
    }

    // --- Levenshtein 距离算法 ---
    function getLevenshteinDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
        for (let i = 0; i <= a.length; i++) { matrix[0][i] = i; }
        for (let j = 0; j <= b.length; j++) { matrix[j][0] = j; }
        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j - 1][i] + 1,      // deletion
                    matrix[j][i - 1] + 1,      // insertion
                    matrix[j - 1][i - 1] + cost // substitution
                );
            }
        }
        return matrix[b.length][a.length];
    }

    // --- 题库搜索功能 ---
    function findInQuizBank(question) {
        if (quizBank.length === 0) {
            log("题库为空，跳过搜索。");
            return null;
        }
        log(`开始在 ${quizBank.length} 条题库中搜索...`);
        let bestMatch = null;
        let highestSimilarity = 0;

        // 预处理问题，移除题号和空格，提高匹配率
        const processedQuestion = question.replace(/^\d+[.、\s]*/, '').trim();

        for (const item of quizBank) {
            if (!item.q || !item.a) continue; // 跳过无效数据

            // 预处理题库中的问题
            const processedItemQ = item.q.replace(/^\d+[.、\s]*/, '').trim();

            // 1. 简单的完全匹配
            if (processedQuestion === processedItemQ) {
                 log(`题库精确命中: ${item.a}`);
                 return item.a;
            }

            // 2. 模糊匹配 (计算相似度)
            const distance = getLevenshteinDistance(processedQuestion, processedItemQ);
            const similarity = 1 - (distance / Math.max(processedQuestion.length, processedItemQ.length, 1)); // 避免除以0

            if (similarity > highestSimilarity) {
                highestSimilarity = similarity;
                bestMatch = item;
            }
        }

        // 检查最佳匹配是否超过阈值 (90%)
        const similarityThreshold = 0.9;
        if (highestSimilarity >= similarityThreshold) {
            log(`题库模糊命中 (相似度 ${(highestSimilarity * 100).toFixed(1)}%): ${bestMatch.a}`);
            return bestMatch.a;
        }

        log(`题库未命中，最高相似度: ${(highestSimilarity * 100).toFixed(1)}% (未达 90%)`);
        return null;
    }

    // --- 题库加载功能 ---
    async function fetchQuizBank() {
        const url = quizbankUrlInput.value;
        if (!url) {
            log("错误: 题库 URL 为空。");
            return;
        }
        log("正在从 Gist/URL 加载题库...");
        quizBank = []; // 加载前清空
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            timeout: 15000,
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        let data = JSON.parse(response.responseText);
                        if (Array.isArray(data)) {
                            quizBank = data.filter(item => item.q && item.a); // 过滤无效条目
                            log(`题库加载成功！共 ${quizBank.length} 条有效记录。`);
                        } else {
                            log("错误: 题库格式不是一个 JSON 数组。");
                            quizBank = [];
                        }
                    } catch (e) {
                        log(`题库JSON解析失败: ${e.message}`);
                        quizBank = [];
                    }
                } else {
                    log(`题库加载失败: ${response.status} ${response.statusText}`);
                }
            },
            onerror: (err) => log(`题库 Gist/URL 请求错误: ${err.statusText || 'Network Error'}`),
            ontimeout: () => log("题库 Gist/URL 请求超时。")
        });
    }

    function callAiApi(question, options, type, aiMode) {
        return new Promise((resolve) => {
            // aiMode: 'free' or 'custom'
            const prompt = `你是一个专业的在线课程答题助手。请根据以下题目和选项，直接给出正确答案的字母。规则：1.  **${type === '多选题' ? '这是一个多选题，答案可能有多个。' : '这是一个' + type + '。'}** 2.  **直接返回代表正确选项的字母，不要包含任何其他解释、标点符号或文字。** -   例如：如果答案是A，就返回 "A"。-   如果是多选题，答案是A和B，就返回 "AB"。-   如果是判断题，对的返回 "A"，错的返回 "B"。---题目: ${question}---选项:${options.map((opt, index) => `${String.fromCharCode(65 + index)}. ${opt}`).join('\n')}---你的答案 (仅字母):`;
            const messages = [{ "role": "user", "content": prompt }];

            let url, headers, data, providerConfig, method = "POST";

            if (aiMode === 'free') {
                url = "https://api.coren.xin/zhipu-free-proxy";
                headers = { "Content-Type": "application/json" };
                data = JSON.stringify({ messages: messages });
                providerConfig = API_PROVIDERS.zhipu;
            } else { // 'custom'
                const providerKey = providerSelect.value;
                const apiKey = apiKeyInput.value;
                providerConfig = API_PROVIDERS[providerKey];

                if (!apiKey) { log('错误: AI 模式下必须提供API Key'); return resolve(null); }
                if (!providerConfig) { log(`错误: 未知的服务商: ${providerKey}`); return resolve(null); }

                if (providerKey === 'coren') {
                    const apiUrl = apiUrlInput.value;
                    if (!apiUrl) { log('错误: Coren API 模式下必须提供API地址'); return resolve(null); }
                    const typeMap = { '多选题': 'multiple', '单选题': 'single', '判断题': 'judgement', '填空题': 'completion' };
                    const englishType = typeMap[type] || 'default';
                    const params = new URLSearchParams({ token: apiKey, title: question, options: options.map((opt, index) => `${String.fromCharCode(65 + index)}. ${opt}`).join('\n'), type: englishType });
                    url = `${apiUrl.split('?')[0]}?${params.toString()}`;
                    method = "GET";
                    headers = {};
                    data = undefined;
                } else {
                    url = typeof providerConfig.url === 'function' ? providerConfig.url(apiKey) : providerConfig.url;
                    headers = providerConfig.buildHeaders(apiKey);
                    data = JSON.stringify(providerConfig.buildPayload(messages));
                }
            }

            log("正在请求AI回答...");
            GM_xmlhttpRequest({
                method,
                url,
                headers,
                data,
                timeout: 15000,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const responseData = JSON.parse(response.responseText);
                            const content = providerConfig.parseResponse(responseData);

                            if (content !== null) {
                                let answer = content.trim();
                                // Coren API 的判断题直接返回"对""错"，其他API返回A/B，需要统一处理
                                // 其他所有API返回的答案都清理成纯字母
                                if (providerSelect.value !== 'coren' || type !== '判断题') {
                                    answer = answer.toUpperCase().replace(/[^A-Z]/g, '');
                                }
                                log(`AI 回答: ${answer}`);
                                resolve(answer);
                            } else {
                                log(`API 返回错误: ${responseData.message || '内容为空'}`);
                                resolve(null);
                            }
                        } catch (e) {
                            log(`解析API响应失败: ${e.message}`);
                            resolve(null);
                        }
                    } else {
                        log(`API 请求失败: ${response.status} ${response.statusText}`);
                        resolve(null);
                    }
                },
                onerror: (error) => { log(`API 调用出错: ${error.statusText || '网络错误'}`); resolve(null); },
                ontimeout: () => { log(`API 请求超时 (15秒)。`); resolve(null); }
            });
        });
    }

    // --- 总的答案获取调度函数 ---
    async function getAnswer(question, options, type) {
        const mode = modeSelect.value;

        if (mode === 'quizbank') {
            const bankAnswer = findInQuizBank(question);
            if (bankAnswer) {
                log(`答案来自题库: ${bankAnswer}`);
                return bankAnswer; // 题库命中
            }

            // 题库未命中
            const fallback = fallbackAiCheckbox.checked;
            if (fallback) {
                log("题库未命中，执行 AI Fallback...");
                // 决定 Fallback 使用哪种 AI：检查自定义设置是否有效，否则用免费
                const customKey = apiKeyInput.value;
                const providerKey = providerSelect.value;
                const aiModeToUse = (customKey && API_PROVIDERS[providerKey]) ? 'custom' : 'free';
                
                log(`Fallback AI 模式: ${aiModeToUse}`);
                return await callAiApi(question, options, type, aiModeToUse);
            } else {
                log("题库未命中，且未开启 AI Fallback。");
                return null; // 搜题失败
            }
        } else {
            // 'free' or 'custom' AI 模式
            return await callAiApi(question, options, type, mode);
        }
    }


    // --- 6. 页面处理逻辑 ---
    async function processTestPage() {
        log("进入答题页面，开始处理...");
        try { await waitForQuestionChange("1", 10000); }
        catch(e) { log(`错误: ${e.message}`); toggleAutoMode(false); return; }

        const questionItems = document.querySelectorAll('.answer-card .list .item');
        log(`共 ${questionItems.length} 道题。`);
        for (const questionEl of questionItems) {
            if (!autoMode) { log("自动答题已停止。"); return; }
            if (questionEl.classList.contains('violet')) {
                log(`第 ${questionEl.textContent.trim()} 题已完成，跳过。`);
                continue;
            }
            const questionNumber = questionEl.textContent.trim();
            log(`开始处理第 ${questionNumber} 题...`);
            if (!questionEl.classList.contains('active')) { reliableClick(questionEl); }
            try {
                await waitForQuestionChange(questionNumber);
                await new Promise(r => setTimeout(r, 300));
                const questionContainer = document.querySelector('.exam-item:not([style*="display: none"]) .question-item');
                const questionType = questionContainer.querySelector('.quest-type')?.innerText.trim() || '单选题';
                const questionTitle = questionContainer.querySelector('.quest-title .option-name')?.innerText.trim();
                const optionsElements = Array.from(questionContainer.querySelectorAll('.el-radio, .el-checkbox'));
                const optionsText = optionsElements.map(el => el.querySelector('.preStyle')?.innerText.trim());

                if (!questionTitle || optionsElements.length === 0) { log("错误: 无法解析题目或选项，跳过此题。"); continue; }
                log(`题目 (${questionType}): ${questionTitle}`);

                // --- 调用总调度函数 ---
                const answer = await getAnswer(questionTitle, optionsText, questionType);
                
                if (answer) {
                    log(`尝试选择答案: ${answer}`);
                    for (let char of answer) {
                        const optionIndex = char.charCodeAt(0) - 65;
                        if (optionIndex >= 0 && optionIndex < optionsElements.length) {
                            const labelElement = optionsElements[optionIndex];
                            const inputElement = labelElement.querySelector('.el-radio__original, .el-checkbox__original');
                            if (inputElement) { reliableClick(inputElement); }
                            else { log(`错误：找不到选项 ${char} 的内部input元素。`); }
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                } else {
                    log("未找到答案，跳过此题。");
                }

                if (modeSelect.value === 'free' || (modeSelect.value === 'quizbank' && fallbackAiCheckbox.checked)) {
                    log("避免API速率限制 (或快速翻页)，等待2秒...");
                    await new Promise(r => setTimeout(r, 2000));
                }

            } catch (err) { log(`处理第 ${questionNumber} 题时出错: ${err.message}, 跳过此题。`); continue; }
        }
        if (autoMode) {
            log("所有题目回答完毕，准备提交...");
            await new Promise(r => setTimeout(r, 1000));
            const submitButton = document.querySelector('.submit');
            reliableClick(submitButton);
            log("已提交答案。");
        }
    }

    function waitForQuestionChange(qNum, timeout = 7000) {
        log(`正在等待第 ${qNum} 题加载...`);
        return new Promise((resolve, reject) => {
            const intervalTime = 200;
            let elapsedTime = 0;
            const interval = setInterval(() => {
                elapsedTime += intervalTime;
                if (elapsedTime >= timeout) { clearInterval(interval); reject(new Error(`等待第 ${qNum} 题超时`)); return; }
                const answerCardItem = Array.from(document.querySelectorAll('.answer-card .list .item')).find(item => item.textContent.trim() === qNum);
                if (!answerCardItem || !answerCardItem.classList.contains('active')) return;
                const visibleExamItem = Array.from(document.querySelectorAll('.exam-item')).find(el => el.offsetHeight > 0);
                const questionContainer = visibleExamItem?.querySelector('.question-item');
                const titleElement = questionContainer?.querySelector('.quest-title .option-index');
                if (titleElement && titleElement.textContent.trim().startsWith(qNum)) {
                    log(`第 ${qNum} 题加载成功!`);
                    clearInterval(interval);
                    resolve();
                }
            }, intervalTime);
        });
    }

    async function processResultsPage() {
        if (!autoMode) return;
        log("进入结算页面，准备返回...");
        await new Promise(r => setTimeout(r, 3000));
        const backButton = document.querySelector('.backup-icon');
        if (backButton) { reliableClick(backButton); log("已返回主页面，准备开始下一轮。"); }
        else { log("错误: 未找到返回按钮。"); }
    }

    // 简化主页逻辑，仅滚动和提示
    async function findAndScrollToGrayItem() {
        log("在主页面，寻找灰色项目...");
        const grayItem = document.querySelector('.item-box.gray');

        if (grayItem) {
            log("已找到灰色项目，正在滚动至该位置...");
            grayItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 1000));
            log("已定位到灰色项目，请手动点击进入练习。");
        } else {
            log("恭喜！未找到灰色项目，任务全部完成。");
            toggleAutoMode(false);
        }
    }


    function mainLoop() {
        if (!autoMode) return;
        const currentUrl = window.location.href;
        if (currentUrl.includes('/study/mastery')) { findAndScrollToGrayItem(); }
        else if (currentUrl.includes('/exam')) { processTestPage(); }
        else if (currentUrl.includes('/pointOfMastery')) { processResultsPage(); }
    }

    function toggleAutoMode(start) {
        autoMode = start;
        if (autoMode) {
            startButton.textContent = '停止自动答题';
            startButton.style.backgroundColor = '#dc3545';
            log('自动答题已开始！');
            mainLoop();
        } else {
            startButton.textContent = '开始自动答题';
            startButton.style.backgroundColor = '#198754';
            log('自动答题已停止。');
        }
    }

    // --- 7. 启动脚本和监听器 ---
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            log(`URL 变动: ${url}`);
            if(autoMode) setTimeout(mainLoop, 2000);
        }
    }).observe(document, { subtree: true, childList: true });

    window.addEventListener('load', () => {
        log("AI答题脚本已加载。请在右侧面板选择模式并开始。");
        // 启动时自动加载题库
        if (GM_getValue('answer_mode', 'free') === 'quizbank' && GM_getValue('quizbank_url', '')) {
            fetchQuizBank();
        }
    }, false);

})();
