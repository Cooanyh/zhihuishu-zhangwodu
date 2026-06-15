# 项目进展

> 本文档统一记录:已完成内容、当前状态、遇到的问题、下一步计划。
> 最近更新于:2026-06-15

## 项目简介
- 仓库:`zhihuishu`(智慧树自动答题 Userscript)
- 主脚本:[`zhs.user.js`](file:///d:/githubprograms/zhihuishu/zhs.user.js)
- 当前版本:v2.1.0
- 目标平台:智慧树学习(`studywisdomh5.zhihuishu.com` / `wisdom-mooc.zhihuishu.com`)

## 已完成内容
- [2026-06-15] 完成项目结构盘点与代码初识
- [2026-06-15] 初始化本地 Git 仓库,创建 `.gitignore` 与本文档
- [2026-06-15] 新建分支 `zhihuishu_chaoxing` 并完成首次提交

## 当前状态
- 本地 Git 仓库已初始化
- 默认工作分支:`zhihuishu_chaoxing`
- 远程仓库:已配置 `origin` 指向 `https://github.com/Cooanyh/zhihuishu-zhangwodu.git`
- 远程分支:`zhihuishu_chaoxing`(首次 push 状态待确认)

## 进行中
- 无

## 遇到的问题
- 无

## 下一步计划
1. 在 GitHub 端确认远程仓库已创建(若尚未创建则需先在 GitHub 手动创建 `zhihuishu-zhangwodu`),然后 `git push -u origin zhihuishu_chaoxing`
2. 评估脚本中疑似有误的模型名/版本号(如 `deepseek-v4-flash`、`glm-4`),必要时升级
3. 补充 README,说明三种模式的使用方法与题库 JSON 格式

## 提交记录
| 日期 | 分支 | 提交 | 说明 |
|------|------|------|------|
| 2026-06-15 | zhihuishu_chaoxing | chore: init repo | 初始化仓库,添加 .gitignore 与 doc/progress.md |
