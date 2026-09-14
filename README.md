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

- **人机对战**：玩家执红先行，从阿棠、沈砚、陆隐三位棋友中选择对手；三人的棋力由浅入深。
- **双人对战**：两位玩家在同一设备上轮流操作红黑双方；暂不支持网络联机。
- 点击自己的棋子，再点击合法落点；再次点击选中棋子可取消选择。
- 拖动旋转棋盘，滚轮或双指缩放；支持俯视与视角重置。
- 棋盘获得键盘焦点后，使用方向键移动光标，回车或空格选棋、落子，Esc 取消。
- 人机模式悔棋会撤销玩家与 NPC 的一整个回合；NPC 思考期间也可悔棋。
- 支持走棋记录、吃子记录、音效、认输和对局计时。
- 不提示将军，也不强制应将。允许冒险走其他棋，**实际吃掉对方将／帅才判胜**；认输也可结束棋局。
- 原创背景音乐「松风入弦」在首次点击或键盘操作后播放，可独立暂停、调节音量；设置在本机保存。

棋局保存在当前窗口内存中，关闭应用或刷新页面后会重新开局。

## 三位棋友

| 阿棠 · 棋馆学徒 | 沈砚 · 青衫棋客 | 陆隐 · 山中棋隐 |
| --- | --- | --- |
| <img src="public/characters/a-tang.png" width="200" alt="阿棠角色图" /> | <img src="public/characters/shen-yan.png" width="200" alt="沈砚角色图" /> | <img src="public/characters/lu-yin.png" width="200" alt="陆隐角色图" /> |
| 活泼好胜，落子轻快，适合轻松切磋 | 攻守均衡，善于布局，适合日常过招 | 推演更深，落子审慎，适合认真挑战 |

三张角色图使用内置 image_gen 分别生成，均为原创虚构人物。[完整生成提示词与资产说明](docs/character-art.md)。

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

安装版与便携版输出到 `release/`。其他开发命令：

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 类型检查并构建前端到 `dist/` |
| `npm run electron:pack` | 生成未压缩的桌面应用目录 |
| `npm run electron:smoke` | 检查 Electron 启动和游戏页面加载 |
| `npm run preview` | 在浏览器中预览已构建的前端 |

## 发布新版本

更新 `package.json` 与 `package-lock.json` 中的版本号，提交修改后推送对应的 `v版本号` 标签。例如发布 `1.1.1`：

```sh
npm version 1.1.1
git push origin HEAD
git push origin v1.1.1
```

[Windows 发布工作流](https://github.com/ovo4096/xiangqi/actions/workflows/release.yml) 会校验标签与应用版本一致，运行测试，构建安装版与便携版，启动打包后的应用进行检查，并生成 `SHA256SUMS.txt`，最后创建 GitHub Release。若该标签已有 Release，工作流会保留现有发布及附件；本次构建仍可在 Actions 中下载。

也可在 Actions 页面手动运行工作流来验证构建。手动运行仅保存构建产物，不创建 Release。自动发布使用仓库内置的 `GITHUB_TOKEN`，无需配置个人访问令牌。

## 项目结构

- `src/App.tsx`：游戏界面、对局状态、悔棋与交互。
- `src/scene/BoardScene.ts`：3D 建模、材质、灯光、拾取与动画。
- `src/game/engine.ts`：规则引擎和 NPC 搜索。
- `src/game/ai.worker.ts`：在后台线程中计算 NPC 落子。
- `src/game/engine.test.ts`：规则和 NPC 测试。
- `src/game/characters.ts`：三位棋友的角色资料及内部棋力映射。
- `public/characters/`：原创新角色图。
- `public/music/`：离线背景音乐。
- `electron/`：桌面应用入口与启动检查（含角色图、音乐控制和吃将规则验证）。
- `.github/workflows/release.yml`：Windows 构建与发布流程。

棋盘木纹采用程序生成，不依赖远程素材。
