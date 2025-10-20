// ==UserScript==
// @name         智慧树掌握度答题-AI自动答题脚本 (Zhihuishu AI Auto-Answering)
// @namespace    http://tampermonkey.net/
// @version      1.1.2
// @description  在智慧树(studywisdomh5)学习页面，自动完成灰色知识点的掌握度练习。提供UI面板，可自定义API Key。
// @author       Coren
// @match        https://studywisdomh5.zhihuishu.com/study*
// @match        https://studywisdomh5.zhihuishu.com/exam*
// @match        https://studywisdomh5.zhihuishu.com/pointOfMastery*
// @connect      api.deepseek.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @license CC BY-NC-SA 4.0
// license: https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. 创建并注入UI面板和样式 ---

    GM_addStyle(`
        #ai-panel { position: fixed; top: 100px; right: 20px; width: 300px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); z-index: 9999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; transition: transform 0.3s ease-in-out; transform: translateX(110%); }
        #ai-panel.show { transform: translateX(0); }
        #panel-toggle { position: fixed; top: 100px; right: 20px; width: 40px; height: 40px; background-color: #007bff; color: white; border: none; border-radius: 50%; cursor: pointer; z-index: 10000; display: flex; justify-content: center; align-items: center; font-size: 20px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2); }
        #panel-header { padding: 15px; background-color: #007bff; color: white; border-top-left-radius: 8px; border-top-right-radius: 8px; font-size: 18px; font-weight: 500; }
        #panel-content { padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .input-group { display: flex; flex-direction: column; }
        .input-group label { margin-bottom: 5px; color: #333; font-weight: 500; }
        .input-group input { padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
        #start-button { padding: 10px 15px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; transition: background-color 0.3s; }
        #start-button:hover { background-color: #218838; }
        #status-log { margin-top: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 4px; height: 100px; overflow-y: auto; font-size: 12px; color: #555; border: 1px solid #e0e0e0; }
    `);

    const panelHTML = `
        <button id="panel-toggle">AI</button>
        <div id="ai-panel">
            <div id="panel-header">AI 自动答题设置</div>
            <div id="panel-content">
                <div class="input-group">
                    <label for="api-key">DeepSeek API Key:</label>
                    <input type="password" id="api-key" placeholder="在此输入你的API Key">
                </div>
                <button id="start-button">开始自动答题</button>
                <div id="status-log">状态日志...</div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', panelHTML);

    // --- 2. 获取DOM元素并初始化变量 ---

    const panel = document.getElementById('ai-panel');
    const toggleButton = document.getElementById('panel-toggle');
    const startButton = document.getElementById('start-button');
    const apiKeyInput = document.getElementById('api-key');
    const statusLog = document.getElementById('status-log');

    let isPanelVisible = false;
    let autoMode = false;

    // --- 3. UI面板交互逻辑 ---

    toggleButton.addEventListener('click', () => {
        isPanelVisible = !isPanelVisible;
        panel.classList.toggle('show', isPanelVisible);
        toggleButton.textContent = isPanelVisible ? 'X' : 'AI';
    });

    apiKeyInput.value = GM_getValue('deepseek_api_key') || '';

    startButton.addEventListener('click', () => {
        toggleAutoMode(!autoMode);
    });

    // --- 4. 核心功能函数 ---

    function log(message) {
        console.log(`[AI脚本] ${message}`);
        const timestamp = new Date().toLocaleTimeString();
        statusLog.innerHTML += `<div>${timestamp}: ${message}</div>`;
        statusLog.scrollTop = statusLog.scrollHeight;
    }

    // [NEW] 统一的、更可靠的点击函数
    function reliableClick(element) {
        if (!element) {
            log("警告: 尝试点击一个不存在的元素。");
            return;
        }
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: unsafeWindow
        });
        element.dispatchEvent(clickEvent);
    }

    function getAIAnswer(question, options, type) {
        return new Promise((resolve) => {
            const apiKey = apiKeyInput.value;
            if (!apiKey) {
                log('错误: 请先设置DeepSeek API Key');
                resolve(null);
                return;
            }
            GM_setValue('deepseek_api_key', apiKey);
            const prompt = `你是一个专业的在线课程答题助手。请根据以下题目和选项，直接给出正确答案的字母。规则：1.  **${type === '多选题' ? '这是一个多选题，答案可能有多个。' : '这是一个' + type + '。'}** 2.  **直接返回代表正确选项的字母，不要包含任何其他解释、标点符号或文字。** -   例如：如果答案是A，就返回 "A"。-   如果是多选题，答案是A和B，就返回 "AB"。-   如果是判断题，对的返回 "A"，错的返回 "B"。---题目: ${question}---选项:${options.map((opt, index) => `${String.fromCharCode(65 + index)}. ${opt}`).join('\n')}---你的答案 (仅字母):`;
            log("正在请求AI回答...");
            GM_xmlhttpRequest({
                method: "POST",
                url: "https://api.deepseek.com/v1/chat/completions",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                data: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [{ "role": "user", "content": prompt }],
                    max_tokens: 10,
                    temperature: 0,
                }),
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        const data = JSON.parse(response.responseText);
                        const answer = data.choices[0].message.content.trim().toUpperCase().replace(/[^A-Z]/g, '');
                        log(`AI 回答: ${answer}`);
                        resolve(answer);
                    } else {
                        log(`API 请求失败: ${response.statusText}`);
                        resolve(null);
                    }
                },
                onerror: function(error) {
                    log(`API 调用出错: ${error.statusText || '网络错误'}`);
                    resolve(null);
                }
            });
        });
    }

    /**
     * [UPDATED] 学习参考脚本中更可靠的“等待题目切换”函数
     * @param {string} qNum - 期望加载的题号
     * @param {number} timeout - 超时毫秒数
     * @returns {Promise<void>}
     */
    function waitForQuestionChange(qNum, timeout = 7000) {
        log(`正在等待第 ${qNum} 题加载...`);
        return new Promise((resolve, reject) => {
            const intervalTime = 200;
            let elapsedTime = 0;
            const interval = setInterval(() => {
                elapsedTime += intervalTime;
                if (elapsedTime >= timeout) {
                    clearInterval(interval);
                    reject(new Error(`等待第 ${qNum} 题超时`));
                    return;
                }

                // 第一重检查：答题卡中的题号是否已激活
                const answerCardItem = Array.from(document.querySelectorAll('.answer-card .list .item'))
                                            .find(item => item.textContent.trim() === qNum);
                if (!answerCardItem || !answerCardItem.classList.contains('active')) {
                    return; // 答题卡还没切换，继续等待
                }

                // 第二重检查：页面中显示的题目是否是期望的题目 (寻找可见的题目容器)
                let questionContainer = null;
                const visibleExamItem = Array.from(document.querySelectorAll('.exam-item')).find(el => el.offsetHeight > 0);
                 if (visibleExamItem) {
                    questionContainer = visibleExamItem.querySelector('.question-item');
                }

                const titleElement = questionContainer?.querySelector('.quest-title .option-index');
                if (titleElement && titleElement.textContent.trim().startsWith(qNum)) {
                    log(`第 ${qNum} 题加载成功!`);
                    clearInterval(interval);
                    resolve(); // 两项检查都通过，加载完成
                }
            }, intervalTime);
        });
    }

    /**
     * [REFACTORED] 答题页逻辑重构
     */
    async function processTestPage() {
        log("进入答题页面，开始处理...");
        try {
            await waitForQuestionChange("1", 10000);
        } catch(e) {
            log(`错误: ${e.message}`);
            toggleAutoMode(false);
            return;
        }

        const questionItems = document.querySelectorAll('.answer-card .list .item');
        log(`共 ${questionItems.length} 道题。`);

        for (const questionEl of questionItems) {
            if (!autoMode) {
                log("自动答题已停止。");
                return;
            }

            if (questionEl.classList.contains('violet')) {
                continue;
            }

            const questionNumber = questionEl.textContent.trim();
            log(`开始处理第 ${questionNumber} 题...`);

            if (!questionEl.classList.contains('active')) {
                reliableClick(questionEl);
            }

            try {
                await waitForQuestionChange(questionNumber);
                await new Promise(r => setTimeout(r, 300));

                const questionContainer = document.querySelector('.exam-item:not([style*="display: none"]) .question-item');
                const questionType = questionContainer.querySelector('.quest-type')?.innerText.trim() || '单选题';
                const questionTitle = questionContainer.querySelector('.quest-title .option-name')?.innerText.trim();
                const optionsElements = Array.from(questionContainer.querySelectorAll('.el-radio, .el-checkbox'));
                const optionsText = optionsElements.map(el => el.querySelector('.preStyle')?.innerText.trim());

                if (!questionTitle || optionsElements.length === 0) {
                    log("错误: 无法解析题目或选项，跳过此题。");
                    continue;
                }

                log(`题目 (${questionType}): ${questionTitle}`);

                const aiAnswer = await getAIAnswer(questionTitle, optionsText, questionType);
                if (aiAnswer) {
                    log(`尝试选择AI答案: ${aiAnswer}`);
                    for (let char of aiAnswer) {
                        const optionIndex = char.charCodeAt(0) - 65;
                        if (optionIndex >= 0 && optionIndex < optionsElements.length) {
                            const labelElement = optionsElements[optionIndex];
                            const inputElement = labelElement.querySelector('.el-radio__original, .el-checkbox__original');
                            if (inputElement) {
                                log(`正在点击选项 ${char} 的内部input`);
                                reliableClick(inputElement);
                            } else {
                                log(`错误：找不到选项 ${char} 的内部input元素。`);
                            }
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                }
                await new Promise(r => setTimeout(r, 1500));

            } catch (err) {
                log(`处理第 ${questionNumber} 题时出错: ${err.message}, 跳过此题。`);
                continue;
            }
        }

        if (autoMode) {
            log("所有题目回答完毕，准备提交...");
            const submitButton = document.querySelector('.submit');
            reliableClick(submitButton);
            log("已提交答案。");
        }
    }


    async function processResultsPage() {
        if (!autoMode) return;
        log("进入结算页面，准备返回...");
        await new Promise(r => setTimeout(r, 3000));
        const backButton = document.querySelector('.backup-icon');
        if (backButton) {
            backButton.click();
            log("已返回主页面，准备开始下一轮。");
        } else {
            log("错误: 未找到返回按钮。");
        }
    }

    async function findAndClickGrayItem() {
        log("在主页面，寻找灰色项目...");
        let grayItem;
        await new Promise(resolve => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                grayItem = document.querySelector('.item-box.gray');
                if (grayItem) {
                    clearInterval(interval);
                    resolve();
                }
                if (Date.now() - startTime > 10000) {
                    clearInterval(interval);
                    log("超时：10秒内未找到灰色项目。");
                    resolve();
                }
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
            if (improveButton) {
                log("找到'提升掌握度'按钮，点击进入...");
                reliableClick(improveButton);
            } else {
                log("未找到'提升掌握度'按钮，10秒后重试...");
                setTimeout(mainLoop, 10000);
            }
        } else {
            log("恭喜！未找到灰色项目，任务全部完成。");
            toggleAutoMode(false);
        }
    }

    function mainLoop() {
        if (!autoMode) return;
        const currentUrl = window.location.href;
        if (currentUrl.includes('/study/mastery')) {
            findAndClickGrayItem();
        } else if (currentUrl.includes('/exam')) {
            processTestPage();
        } else if (currentUrl.includes('/pointOfMastery')) {
            processResultsPage();
        }
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
            startButton.style.backgroundColor = '#28a745';
            log('自动答题已停止。');
        }
    }

    // --- 5. 启动脚本和监听器 ---
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
        log("AI答题脚本已加载。请在右侧面板输入API Key并开始。");
    }, false);

})();

