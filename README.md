# SupplySync AI 采购语音 Agent Demo

一个本地可运行的网页端中文采购语音 Agent MVP。当前版本模拟“AI 采购主动给供应商打电话”的场景：页面左侧填写采购 JSON 和补充话术后，点击开始外呼，AI 会先用中文开场；用户扮演供应商接听并回复，右侧会持续整理结构化采购信息。

## 技术栈

- 前端：React 19 + Vite + TypeScript + Tailwind CSS v4
- 后端：Node.js + Express + WebSocket + dotenv
- 实时理解：Gemini Live API
- 语音发声：火山引擎 TTS（支持克隆音色）
- 结构化总结：Gemini 文本模型生成 JSON

## 当前实现说明

- 实时链路：浏览器采集麦克风音频，前端转为 `16-bit PCM / 16kHz / mono` 后通过本地 WebSocket 发给后端
- 对话理解：后端持有 Gemini API Key，并通过官方 `@google/genai` SDK 建立 Live 会话，负责听懂用户中文、生成采购外呼话术和结构化摘要
- 语音发声：后端将 Gemini 生成的最终回复文本交给火山引擎 TTS，用克隆音色合成为 `24kHz` PCM，再回传给前端播放
- 采购面板：每轮对话后，后端用文本模型提取结构化采购字段并刷新右侧面板
- 最终总结：点击“生成采购总结”后，返回标准 JSON 结构

## 目录结构

```text
sound agent/
  frontend/
    public/
    src/
      components/
      hooks/
      utils/
    .env.example
    package.json
  backend/
    src/
      server.ts
      geminiLive.ts
      sessionManager.ts
      summary.ts
      prompts.ts
      env.ts
      types.ts
    .env.example
    package.json
  README.md
```

## 环境变量

后端环境变量写在 [backend/.env.example](</Users/zhaogongbin/Desktop/sound agent/backend/.env.example>) 对应的 `.env` 中：

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.1-flash-live-preview
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_VOICE_NAME=Kore
VOLCENGINE_API_KEY=your_volcengine_api_key_here
VOLCENGINE_TTS_RESOURCE_ID=seed-icl-2.0
VOLCENGINE_TTS_VOICE_ID=your_cloned_voice_id_here
VOLCENGINE_TTS_SPEECH_RATE=45
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

前端可选环境变量写在 [frontend/.env.example](</Users/zhaogongbin/Desktop/sound agent/frontend/.env.example>) 对应的 `.env.local` 中：

```bash
VITE_API_BASE_URL=http://localhost:3001
```

说明：

- `GEMINI_API_KEY` 必填，且只放在后端，不会暴露到前端代码
- `GEMINI_MODEL` 默认使用 `gemini-3.1-flash-live-preview`
- `GEMINI_TEXT_MODEL` 用于生成采购结构化摘要
- `GEMINI_VOICE_NAME` 可选，只影响 Gemini Live 会话的内建语音配置；当前实际播报给用户的声音来自火山引擎克隆音色
- `VOLCENGINE_API_KEY` 必填，用于调用火山引擎 TTS
- `VOLCENGINE_TTS_RESOURCE_ID` 当前克隆音色 2.0 默认填 `seed-icl-2.0`
- `VOLCENGINE_TTS_VOICE_ID` 必填，填写你在火山控制台复刻成功后的音色 ID
- `VOLCENGINE_TTS_SPEECH_RATE` 可选，默认 `45`；火山官方范围为 `-50` 到 `100`，数值越大语速越快

## 安装依赖

分别安装前后端依赖：

```bash
cd /Users/zhaogongbin/Desktop/sound\ agent/backend
npm install
```

```bash
cd /Users/zhaogongbin/Desktop/sound\ agent/frontend
npm install
```

## 启动方式

先启动后端：

```bash
cd /Users/zhaogongbin/Desktop/sound\ agent/backend
cp .env.example .env
# 然后把 GEMINI_API_KEY、VOLCENGINE_API_KEY、VOLCENGINE_TTS_VOICE_ID 改成你自己的配置
npm run dev
```

再启动前端：

```bash
cd /Users/zhaogongbin/Desktop/sound\ agent/frontend
npm run dev
```

启动后，打开终端里 Vite 提示的本地地址，通常是：

- [http://localhost:5173](http://localhost:5173)

## 如何测试采购外呼

1. 打开网页，允许浏览器使用麦克风
2. 在左侧填写采购 JSON，必要时补充“额外话术说明”并上传文本附件
3. 点击“开始外呼”
4. 等待 AI 先开场，你扮演供应商回复
5. 页面左侧会显示：
   - 供应商（你）的语音转文字
   - 采购 Agent 的回复转录
6. 页面右侧会实时刷新：
   - 产品信息
   - 采购计划
   - 报价要求
   - 认证与供应商要求
   - 缺失信息和下一步问题
7. 点击“生成采购总结”，查看最终 JSON

## 常见问题

### 1. 听不到 AI 声音

- 确认浏览器没有静音
- 建议首次点击“开始对话”后不要切到后台标签页
- 建议佩戴耳机，减少回声和串音
- 检查后端 `.env` 里的 `VOLCENGINE_API_KEY` 与 `VOLCENGINE_TTS_VOICE_ID`

### 2. 麦克风正常但 AI 没有回应

- 检查后端 `.env` 里的 `GEMINI_API_KEY`
- 确认本地网络可以访问 Gemini API
- 查看后端控制台是否有 Gemini Live / 火山 TTS 报错

### 3. 右侧面板字段为空

- 面板只会提取用户明确说过的信息
- 如果信息还不完整，系统会把缺失项列在 `missing_information`

### 4. 为什么没有把 API Key 放到前端

- 这是故意的
- 当前实现走“浏览器 -> 你的后端 -> Gemini / 火山”代理链路，避免前端泄露密钥

## 已验证内容

已完成本地构建验证：

```bash
cd /Users/zhaogongbin/Desktop/sound\ agent/backend && npm run build
cd /Users/zhaogongbin/Desktop/sound\ agent/frontend && npm run build
```

说明：当前版本已经验证过 Gemini Live 会话、火山克隆音色 TTS 单测，以及 WebSocket 外呼首句链路；填好 `.env` 后即可做浏览器真机测试。

## 后续可扩展方向

- 替换为临时凭证或 ephemeral token，支持更安全的前端直连
- 接入电话侧音频桥接，为 SIP / Twilio / TCCC 预留适配层
- 升级为火山双向流式 / RTC 方案，进一步优化可打断和首响时延
- 增加角色切换：采购 / 供应商 / 客户 / 采购主管
- 导出对话 Markdown、导出 JSON/CSV
- 本地保存最近一次会话记录
- 增加采购完成度评分解释和追问策略配置

## 参考

- [Gemini Live API Overview](https://ai.google.dev/gemini-api/docs/live-api)
- [Gemini Live API Capabilities Guide](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- [Gemini Live API WebSocket Reference](https://ai.google.dev/api/live)
- [火山引擎语音合成大模型](https://www.volcengine.com/docs/6561/1257543)
- [火山引擎声音复刻 API](https://www.volcengine.com/docs/6561/1305191?lang=zh)
