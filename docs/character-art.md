# NPC character artwork

The three original fictional NPC portraits were generated on 2026-09-14 with the built-in `image_gen` tool, using one separate generation request per character. CLI/API fallback was not used. No input reference images were supplied. Images are saved in this repository for offline Electron packaging.

Visual review: all three outputs were inspected with `view_image`. Each has one clearly legible face, coherent historical clothing and warm light, natural hands, no visible text, no logo, and no watermark. The faces sit in the upper middle for avatar cropping.

The prompts requested 1024 × 1024; the built-in tool returned square 1254 × 1254 PNG assets, preserved unchanged.

## 阿棠

Asset: `public/characters/a-tang.png`

Final generation prompt:

```text
Use case: stylized-concept
Asset type: premium Chinese Xiangqi desktop game NPC portrait, square 1024 x 1024 image
Style/medium: original realistic painterly illustration with refined natural human anatomy, subtle ink brush texture, tactile fabrics, premium historical Chinese game concept art, restrained colors.
Composition/framing: one character only, half body, face large and centered in the upper middle for circular avatar cropping. Eye level camera, direct three-quarter gaze toward viewer. Give face clear separation and exceptional legibility at small UI sizes.
Lighting/mood: soft warm side light on face, gentle shadow, welcoming contemplative chess-house ambience.
Color palette: atmospheric dark jade (#151b18), warm parchment, muted wood tones.
Constraints: ordinary original fictional Chinese person, no celebrity resemblance. No writing, no Chinese lettering, no logos, no watermarks, no caption, no UI, no borders. No weapons, no fantasy armor. Natural hands.
Primary request: cheerful Chinese young adult woman age 22, called A Tang, a humble apprentice in a traditional wooden chess house.
Subject: warm natural smile, lively kind eyes, dark hair in a simple bun with a plain red ribbon, terracotta and ivory hanfu, modest cloth layers. She gently holds one circular wooden Chinese chess piece between fingers at chest level; its visible side is plain wood without text.
Scene/backdrop: softly blurred traditional wooden chess-house interior, warm parchment and dark jade atmosphere, subtle wood grain. Focus attention on her face, with no distracting furniture.
Materials/textures: fine natural skin texture, matte woven cloth, polished warm wooden chess piece.
```

## 沈砚

Asset: `public/characters/shen-yan.png`

Final generation prompt:

```text
Use case: stylized-concept
Asset type: premium Chinese Xiangqi desktop game NPC portrait, square 1024 x 1024 image
Style/medium: original realistic painterly illustration with refined natural human anatomy, subtle ink brush texture, tactile fabrics, premium historical Chinese game concept art, restrained colors.
Composition/framing: one character only, half body, face large and centered in the upper middle for circular avatar cropping. Eye level camera, direct three-quarter gaze toward viewer. Give face clear separation and exceptional legibility at small UI sizes.
Lighting/mood: soft warm side light on face, gentle shadow, welcoming contemplative chess-house ambience.
Color palette: atmospheric dark jade (#151b18), warm parchment, muted wood tones.
Constraints: ordinary original fictional Chinese person, no celebrity resemblance. No writing, no Chinese lettering, no logos, no watermarks, no caption, no UI, no borders. No weapons, no fantasy armor. Natural hands.
Primary request: refined Chinese male adult age 32, called Shen Yan, a thoughtful scholar and chess player.
Subject: calm thoughtful eyes, slight friendly smile, black hair half tied up with a simple tie, handsome yet natural non-celebrity face, slate blue and ink gray scholar robe. Holding a simple closed fan near chest level, elegant relaxed pose.
Scene/backdrop: softly blurred quiet traditional pavilion with muted timber and distant soft light, dark jade and warm parchment atmosphere.
Materials/textures: natural skin, softly textured woven scholar robe, simple bamboo folded fan.
```

## 陆隐

Asset: `public/characters/lu-yin.png`

Final generation prompt:

```text
Use case: stylized-concept
Asset type: premium Chinese Xiangqi desktop game NPC portrait, square 1024 x 1024 image
Style/medium: original realistic painterly illustration with refined natural human anatomy, subtle ink brush texture, tactile fabrics, premium historical Chinese game concept art, restrained colors.
Composition/framing: one character only, half body, face large and centered in the upper middle for circular avatar cropping. Eye level camera, direct three-quarter gaze toward viewer. Give face clear separation and exceptional legibility at small UI sizes.
Lighting/mood: soft warm side light on face, gentle shadow, welcoming contemplative chess-house ambience.
Color palette: atmospheric dark jade (#151b18), warm parchment, muted wood tones.
Constraints: ordinary original fictional Chinese person, no celebrity resemblance. No writing, no Chinese lettering, no logos, no watermarks, no caption, no UI, no borders. No weapons, no fantasy armor. Natural hands.
Primary request: dignified Chinese man age 65, called Lu Yin, a serene experienced chess master.
Subject: silver hair in a traditional topknot, neatly trimmed silver beard and moustache, serene experienced expression, wise kind eyes with subtle smile, natural wrinkles. Dark jade and taupe robe. Gently holds a small circular wooden Chinese chess piece near chest, its visible side plain wood without lettering.
Scene/backdrop: atmospheric bamboo and mountain mist softly blurred behind him, dark jade tones blending into warm parchment light. Gentle serene depth.
Materials/textures: natural aged skin, softly woven robe, warm polished wood. No glowing effects.
```
