# 弈境 · 3D 中国象棋

一款可离线运行的 Electron 中国象棋游戏。使用 React、TypeScript 和 Three.js 制作，立体棋盘与棋子搭配木纹、雕刻字面、倒角和实时阴影。

## 下载与安装

前往 [最新版本](https://github.com/ovo4096/xiangqi/releases/latest)，在 Assets 中下载 Windows 10 / 11 x64 安装包或便携版：

| 文件 | 使用方式 |
| --- | --- |
| `YiJing-Xiangqi-版本号-x64-Setup.exe` | 双击安装，之后从开始菜单或桌面启动 |
| `YiJing-Xiangqi-版本号-x64-Portable.exe` | 双击直接运行，无需安装 |
| `SHA256SUMS.txt` | 校验下载文件的 SHA-256 摘要 |

应用自带运行环境，无需安装 Node.js、启动服务器或联网。当前版本未进行代码签名，Windows 可能显示“未知发布者”提示。3D 渲染需要支持 WebGL 2 的显卡与驱动。

## 玩法

- **人机对战**：玩家执红先行，从阿棠、沈砚、陆隐、闻弈四位棋友中选择对手；四人的棋力由浅入深。闻弈是新增的最强对手，擅长连续交换与全局攻防，落子前会稍作长考。
- **双人对战**：两位玩家在同一设备上轮流操作红黑双方；暂不支持网络联机。
- 点击自己的棋子，再点击合法落点；再次点击选中棋子可取消选择。
- 拖动旋转棋盘，滚轮或双指缩放；支持俯视与视角重置。
- 棋盘获得键盘焦点后，使用方向键移动光标，回车或空格选棋、落子，Esc 取消。
- 人机模式悔棋会撤销玩家与 NPC 的一整个回合；NPC 思考期间也可悔棋。
- 支持走棋记录、吃子记录、音效、认输和对局计时。
- 不提示将军，也不强制应将。允许冒险走其他棋，**实际吃掉对方将／帅才判胜**；认输也可结束棋局。
- 原创背景音乐「松风入弦」在首次点击或键盘操作后播放，可独立暂停、调节音量；设置在本机保存。
- 四位棋友共有 **160 句离线角色语音**，覆盖开场、吃子、被吃、痛失大子、交换、思考、悔棋和胜负。同类台词轮换播放，避免紧邻重复；语音可独立关闭、调节音量和重播，说话时背景音乐自动降低。
- 连续吃子先等这一轮交换完成，再作回应；双方互吃时使用克制的交换台词，不接连播放失子叹息和得子欢呼。过时的语音会取消，快棋时适当减少发言。
- 点击「开始对弈」或落下第一步后，界面只显示当前棋友；「更换棋友」打开选择弹窗，确认后才开始新局。
- 角色具有平静、喜悦、懊恼三套表情图，配合呼吸、点头、摇头和光效回应棋局。关闭语音后表情及字幕仍会变化。
- 桌面界面随窗口高度伸缩，棋盘、当前角色和主要操作保持可见。棋谱可用滚轮或键盘浏览，不显示滚动条。

棋局保存在当前窗口内存中，关闭应用或刷新页面后会重新开局。

## 四位棋友

| 阿棠 · 棋馆学徒 | 沈砚 · 青衫棋客 | 陆隐 · 山中棋隐 | 闻弈 · 天元棋师 |
| --- | --- | --- | --- |
| <img src="public/characters/a-tang.png" width="180" alt="阿棠角色图" /> | <img src="public/characters/shen-yan.png" width="180" alt="沈砚角色图" /> | <img src="public/characters/lu-yin.png" width="180" alt="陆隐角色图" /> | <img src="public/characters/wen-yi.png" width="180" alt="闻弈角色图" /> |
| 活泼好胜，落子轻快，适合轻松切磋 | 攻守均衡，善于布局，适合日常过招 | 推演更深，落子审慎，适合认真挑战 | 沉着善谋，擅长连环攻防，当前最强对手 |

四张角色原图及八张喜悦／懊恼表情图使用内置 image_gen 生成、编辑，均为原创虚构人物。图像切换与轻量动画表现情绪，不含唇形同步视频。[完整生成提示词与资产说明](docs/character-art.md)。

角色声音为普通话合成语音，每位角色 10 类事件、每类 4 个变体；应用只播放随包提供的 MP3，不调用在线合成服务。[声音来源、完整台词和重新生成方法](docs/voices.md)。

闻弈在后台线程中进行更深入的局面计算，思考期间仍可调整棋盘视角、悔棋或更换对手。[搜索设计、战术测试与对战基准](docs/ai.md)。

## 自由对弈规则

保留车马炮等棋子的走法、九宫与过河限制、蹩马腿、塞象眼和炮架规则。取消自陷将军过滤与强制应将，将帅照面时允许飞将吃子；系统不显示将军提醒，也不会以将死或困毙提前结束棋局。胜负由实际吃将或认输决定，不包含长将、长捉、重复局面及自然限着的赛事裁定。

## 背景音乐

「松风入弦」为原创五声音阶器乐，包含拨弦、柔和笛音及轻微环境持续音；80 秒立体声循环，随安装包离线提供，不依赖网络或第三方音源。音乐与落子音效分别控制。

[音乐来源与音频参数](docs/music.md)。运行 `node scripts/render-music.mjs` 可重新生成同一音频。

## 本地开发

建议使用 Node.js 24 与 npm。首次安装依赖和制作安装包需要联网下载构建工具。

```sh
npm ci
npm test
npm run electron:dev
```

`electron:dev` 会先构建页面，再启动 Electron。修改代码后重新运行此命令即可查看桌面版效果。需要浏览器热更新时：

```sh
npm run dev
```

然后打开终端显示的本地地址，通常为 `http://127.0.0.1:5173/`。

## 构建 Windows 应用

在 Windows x64 环境执行：

```sh
npm ci
npm test
npm run electron:dist
```

桌面启动与打包命令会先自动准备锁定版本的 Electron 运行时；首次执行需要联网下载，之后复用本机缓存。

安装版与便携版输出到 `release/`。其他开发命令：

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 类型检查并构建前端到 `dist/` |
| `npm run electron:pack` | 生成未压缩的桌面应用目录 |
| `npm run electron:smoke` | 检查 Electron 启动和游戏页面加载 |
| `npm run preview` | 在浏览器中预览已构建的前端 |

## 发布新版本

更新 `package.json` 与 `package-lock.json` 中的版本号，提交修改后推送对应的 `v版本号` 标签。例如发布 `1.3.2`：

```sh
npm version 1.3.2
git push origin HEAD
git push origin v1.3.2
```

[Windows 发布工作流](https://github.com/ovo4096/xiangqi/actions/workflows/release.yml) 会校验标签与应用版本一致，运行测试，构建安装版与便携版，启动打包后的应用进行检查，并生成 `SHA256SUMS.txt`，最后创建 GitHub Release。若该标签已有 Release，工作流会保留现有发布及附件；本次构建仍可在 Actions 中下载。

也可在 Actions 页面手动运行工作流来验证构建。手动运行仅保存构建产物，不创建 Release。自动发布使用仓库内置的 `GITHUB_TOKEN`，无需配置个人访问令牌。

## 项目结构

- `src/App.tsx`：游戏界面、对局状态、悔棋与交互。
- `src/scene/BoardScene.ts`：3D 建模、材质、灯光、拾取与动画。
- `src/game/engine.ts`：规则引擎和 NPC 搜索。
- `src/game/ai.worker.ts`：在后台线程中计算 NPC 落子。
- `src/game/engine.test.ts`：规则和 NPC 测试。
- `src/game/master.ts`、`master.test.ts`：闻弈的搜索引擎与战术回归测试。
- `scripts/benchmark-ai.ts`：可重复的新旧引擎对战基准。
- `src/game/characters.ts`：四位棋友的角色资料及内部棋力映射。
- `public/characters/`：原创新角色图。
- `public/music/`：离线背景音乐。
- `public/voices/`：160 句离线角色语音和校验清单。
- `src/audio/voiceScheduler.ts`：按交锋组织语音、合并互吃、取消过时回应；配套假时钟回归测试。
- `src/audio/`：语音轮换、播放队列、音量偏好与背景音乐管理。
- `src/scene/CharacterPortrait.tsx`：角色表情图与情绪动画。
- `src/layout.css`：桌面窗口自适应布局。
- `electron/`：桌面应用入口与启动检查（含角色图、音乐控制和吃将规则验证）。
- `.github/workflows/release.yml`：Windows 构建与发布流程。

棋盘木纹采用程序生成，不依赖远程素材。
