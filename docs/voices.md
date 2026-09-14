# 棋友语音

三位棋友共有 **108 句普通话合成语音**：每人 9 类反应，每类 4 句。全部 MP3 随应用打包，游戏中播放这些本地文件，无须联网，也不依赖系统是否安装中文语音。台词为本项目原创，人物为虚构角色，没有克隆或模仿特定真人。

当前素材总时长约 6 分 25 秒、体积 2.31 MB，单句为 2.02～5.40 秒。交付前已对全部 108 个文件进行解码、非静音和 SHA-256 校验；最高峰值为 -2.9 dBFS。

## 人物与声音

| 人物 | 合成声音 | 台词与语气设计 | 基础语速／音高 |
| --- | --- | --- | --- |
| 阿棠 | `zh-CN-XiaoyiNeural` | 活泼、直率；得子时雀跃，失子时懊恼，愿意继续学棋 | `+5%` / `+2Hz` |
| 沈砚 | `zh-CN-YunxiNeural` | 温和克制的书生；讲究礼数，也会为失算叹息 | `-5%` / `-3Hz` |
| 陆隐 | `zh-CN-YunjianNeural` | 沉稳低缓的年长棋客；有耐心，也欣赏对手的好棋 | `-12%` / `-12Hz` |

使用 Microsoft Edge 在线语音合成服务，通过开源构建工具 [edge-tts 7.2.8](https://github.com/rany2/edge-tts) 制作。工具支持语速、音量和音高参数；本项目使用台词、停顿和适度的语速／音高变化表现情绪，并未使用真人录音或声称具有专业配音演员的情感表演。

## 事件目录

| 事件 | 场景 | 每个角色的变体数量 |
| --- | --- | --- |
| `intro` | 开局、准备对弈 | 4 |
| `capture` | 角色吃掉玩家的普通棋子 | 4 |
| `lost` | 角色的普通棋子被玩家吃掉 | 4 |
| `strongCapture` | 角色吃掉较重要的棋子 | 4 |
| `strongLost` | 角色丢失较重要的棋子 | 4 |
| `thinking` | 偶尔思考时的短句 | 4 |
| `win` | 角色赢得本局 | 4 |
| `lose` | 角色输掉本局 | 4 |
| `undo` | 悔棋后重新思考 | 4 |

所有台词都从角色视角书写。不播报将军、不提示应将，也不引入对危险棋步的拦截。

## 文件与重新生成

- 台词、声音和基础参数：[`scripts/voice-script.json`](../scripts/voice-script.json)
- 生成工具：[`scripts/render-voices.py`](../scripts/render-voices.py)
- 带类型的界面目录：[`src/audio/voiceLines.ts`](../src/audio/voiceLines.ts)
- 音频：`public/voices/<character-id>/<event>-<1..4>.mp3`
- 每个文件的大小和 SHA-256：[`public/voices/assets.json`](../public/voices/assets.json)

安装仅在素材制作阶段使用的依赖，再执行生成工具：

```sh
python -m pip install edge-tts==7.2.8
python scripts/render-voices.py
```

默认保留已有的完整音频。修改台词或声音参数后，使用 `python scripts/render-voices.py --force` 重新合成。`--samples` 只生成每个人物的第一句得子和失子语音，便于先试听；`--manifest-only` 只更新 TypeScript 目录。

在线服务的声音模型可能更新，重复合成不保证逐字节相同。仓库中的 MP3 和 SHA-256 清单记录了随当前版本交付的实际音频；运行应用不会再次调用在线合成服务。
