// ==UserScript==
// @name         智慧树掌握度答题-AI自动答题脚本 (Zhihuishu AI Auto-Answering)
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  半自动完成智慧树掌握度练习。新增支持免费模式(GLM-4.5-Flash)及自定义多种AI服务商(DeepSeek/Zhipu/OpenAI/Gemini)。
// @author       Coren
// @match        https://studywisdomh5.zhihuishu.com/study*
// @match        https://studywisdomh5.zhihuishu.com/exam*
// @match        https://studywisdomh5.zhihuishu.com/pointOfMastery*
// @connect      api.coren.xin
// @connect      open.bigmodel.cn
// @connect      api.deepseek.com
// @connect      api.openai.com
// @connect      generativelanguage.googleapis.com
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
        .input-group { display: flex; flex-direction: column; }
        .input-group label { margin-bottom: 5px; color: #333; font-weight: 500; }
        .input-group input, .input-group select { padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
        #start-button { padding: 10px 15px; background-color: #198754; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; transition: background-color 0.3s; }
        #start-button:hover { background-color: #157347; }
        #status-log { margin-top: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 4px; height: 100px; overflow-y: auto; font-size: 12px; color: #555; border: 1px solid #e0e0e0; }
        .custom-settings.hidden, .model-name-group.hidden { display: none; }
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
                        <option value="custom">自定义模式</option>
                    </select>
                </div>
                <div class="custom-settings hidden">
                    <div class="input-group">
                        <label for="provider-select">服务商:</label>
                        <select id="provider-select">
                            <option value="deepseek">DeepSeek</option>
                            <option value="zhipu">Zhipu (智谱 GLM)</option>
                            <option value="openai">OpenAI (GPT)</option>
                            <option value="gemini">Google (Gemini)</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label for="api-key" id="api-key-label">API Key:</label>
                        <input type="password" id="api-key" placeholder="在此输入你的API Key">
                    </div>
                    <div class="input-group model-name-group hidden">
                        <label for="model-name">模型名称:</label>
                        <input type="text" id="model-name" placeholder="例如: Qwen/Qwen2.5-72B-Instruct">
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
    const modelNameGroup = document.querySelector('.model-name-group');
    const modelNameInput = document.getElementById('model-name');
    const statusLog = document.getElementById('status-log');

    let isPanelVisible = false;
    let autoMode = false;

    // --- 3. [重构] AI服务商配置中心 ---
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
        }
    };

    // --- 4. [重构] UI交互逻辑 ---
    toggleButton.addEventListener('click', () => {
        isPanelVisible = !isPanelVisible;
        panel.classList.toggle('show', isPanelVisible);
        toggleButton.textContent = isPanelVisible ? 'X' : 'AI';
    });

    // [修正] 读取并验证保存的设置
    modeSelect.value = GM_getValue('answer_mode', 'free');
    let savedProvider = GM_getValue('api_provider', 'deepseek');
    // 检查保存的服务商是否仍然有效，如果无效则重置为默认值
    if (!API_PROVIDERS[savedProvider]) {
        savedProvider = 'deepseek';
        GM_setValue('api_provider', savedProvider);
    }
    providerSelect.value = savedProvider;
    apiKeyInput.value = GM_getValue('api_key', '');
    modelNameInput.value = GM_getValue('model_name', '');


    function updateUIVisibility() {
        const mode = modeSelect.value;
        const providerKey = providerSelect.value;
        const provider = API_PROVIDERS[providerKey];

        // 确保provider存在，以防万一
        if (!provider) {
             customSettings.classList.add('hidden');
             modelNameGroup.classList.add('hidden');
             return;
        }

        if (mode === 'custom') {
            customSettings.classList.remove('hidden');
            apiKeyLabel.textContent = `${provider.name} API Key:`;
            if (provider.requiresModel) {
                modelNameGroup.classList.remove('hidden');
            } else {
                modelNameGroup.classList.add('hidden');
            }
        } else {
            customSettings.classList.add('hidden');
            modelNameGroup.classList.add('hidden');
        }
    }

    modeSelect.addEventListener('change', () => { GM_setValue('answer_mode', modeSelect.value); updateUIVisibility(); });
    providerSelect.addEventListener('change', () => { GM_setValue('api_provider', providerSelect.value); updateUIVisibility(); });
    apiKeyInput.addEventListener('input', () => { GM_setValue('api_key', apiKeyInput.value); });
    modelNameInput.addEventListener('input', () => { GM_setValue('model_name', modelNameInput.value); });

    startButton.addEventListener('click', () => toggleAutoMode(!autoMode));
    updateUIVisibility();

    // --- 5. [重构] 核心功能函数 ---
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

    function getAIAnswer(question, options, type) {
        return new Promise((resolve) => {
            const mode = modeSelect.value;
            const prompt = `你是一个专业的在线课程答题助手。请根据以下题目和选项，直接给出正确答案的字母。规则：1.  **${type === '多选题' ? '这是一个多选题，答案可能有多个。' : '这是一个' + type + '。'}** 2.  **直接返回代表正确选项的字母，不要包含任何其他解释、标点符号或文字。** -   例如：如果答案是A，就返回 "A"。-   如果是多选题，答案是A和B，就返回 "AB"。-   如果是判断题，对的返回 "A"，错的返回 "B"。---题目: ${question}---选项:${options.map((opt, index) => `${String.fromCharCode(65 + index)}. ${opt}`).join('\n')}---你的答案 (仅字母):`;
            const messages = [{ "role": "user", "content": prompt }];

            let url, headers, data, providerConfig;

            if (mode === 'free') {
                url = "https://api.coren.xin/zhipu-free-proxy";
                headers = { "Content-Type": "application/json" };
                data = JSON.stringify({ messages: messages });
                providerConfig = API_PROVIDERS.zhipu; // 免费模式使用智谱的解析器
            } else {
                const providerKey = providerSelect.value;
                const apiKey = apiKeyInput.value;
                const modelName = modelNameInput.value;
                providerConfig = API_PROVIDERS[providerKey];

                if (!apiKey) { log('错误: 自定义模式下必须提供API Key'); return resolve(null); }
                if (!providerConfig) { log(`错误: 未知的服务商: ${providerKey}`); return resolve(null); }
                if (providerConfig.requiresModel && !modelName) { log(`错误: ${providerConfig.name} 需要填写模型名称`); return resolve(null); }

                url = typeof providerConfig.url === 'function' ? providerConfig.url(apiKey) : providerConfig.url;
                headers = providerConfig.buildHeaders(apiKey);
                data = JSON.stringify(providerConfig.buildPayload(messages, modelName));
                
                // [修正] 移除冗长的调试日志
            }

            log("正在请求AI回答...");

            GM_xmlhttpRequest({
                method: "POST",
                url,
                headers,
                data,
                timeout: 15000,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        const responseData = JSON.parse(response.responseText);
                        const content = providerConfig.parseResponse(responseData);

                        if (content) {
                            const answer = content.trim().toUpperCase().replace(/[^A-Z]/g, '');
                            if (answer) { log(`AI 回答: ${answer}`); resolve(answer); }
                            else {
                                log(`API响应成功，但AI未返回有效答案。`);
                                log(`原始响应: <pre>${JSON.stringify(responseData, null, 2)}</pre>`);
                                resolve(null);
                            }
                        } else {
                            log(`API 响应格式不正确或内容为空。`);
                            log(`原始响应: <pre>${JSON.stringify(responseData, null, 2)}</pre>`);
                            resolve(null);
                        }
                    } else {
                        log(`API 请求失败: ${response.status} ${response.statusText}`);
                        log(`原始响应: ${response.responseText}`);
                        resolve(null);
                    }
                },
                onerror: (error) => { log(`API 调用出错: ${error.statusText || '网络错误'}`); resolve(null); },
                ontimeout: () => { log(`API 请求超时 (15秒)。请检查网络或服务商状态。`); resolve(null); }
            });
        });
    }

    // --- 6. 页面处理逻辑 (基本无变化) ---
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
                const aiAnswer = await getAIAnswer(questionTitle, optionsText, questionType);
                if (aiAnswer) {
                    log(`尝试选择AI答案: ${aiAnswer}`);
                    for (let char of aiAnswer) {
                        const optionIndex = char.charCodeAt(0) - 65;
                        if (optionIndex >= 0 && optionIndex < optionsElements.length) {
                            const labelElement = optionsElements[optionIndex];
                            const inputElement = labelElement.querySelector('.el-radio__original, .el-checkbox__original');
                            if (inputElement) { reliableClick(inputElement); }
                            else { log(`错误：找不到选项 ${char} 的内部input元素。`); }
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                }

                if (modeSelect.value === 'free') {
                    log("免费模式，等待2秒以避免API速率限制...");
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

    async function findAndClickGrayItem() {
        log("在主页面，寻找灰色项目...");
        let grayItem;
        await new Promise(resolve => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                grayItem = document.querySelector('.item-box.gray');
                if (grayItem) { clearInterval(interval); resolve(); }
                if (Date.now() - startTime > 10000) { clearInterval(interval); log("超时：10秒内未找到灰色项目。"); resolve(); }
            }, 500);
        });
        if (grayItem) {
            log("已找到灰色项目，准备点击...");
            grayItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 1000));
            const hoverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: unsafeWindow });
            grayItem.dispatchEvent(hoverEvent);
            await new Promise(r => setTimeout(r, 1000));
            const improveButtons = document.querySelectorAll('.custom-content div, .el-popper div');
            const improveButton = Array.from(improveButtons).find(el => el.textContent.includes('提升掌握度'));
            if (improveButton) { log("找到'提升掌握度'按钮，点击进入..."); reliableClick(improveButton); }
            else { log("未找到'提升掌握度'按钮，10秒后重试..."); setTimeout(mainLoop, 10000); }
        } else {
            log("恭喜！未找到灰色项目，任务全部完成。");
            toggleAutoMode(false);
        }
    }

    function mainLoop() {
        if (!autoMode) return;
        const currentUrl = window.location.href;
        if (currentUrl.includes('/study/mastery')) { findAndClickGrayItem(); }
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
    }, false);

})();

