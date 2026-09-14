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


## Expressive portrait variants

On 2026-09-14, six expression variants were created with the built-in `image_gen` tool in **edit** mode, one separate call per image. Each edit used the matching neutral portrait above as its sole `referenced_image_paths` edit target, after that source was inspected with `view_image`. CLI/API fallback was not used.

All six square 1254 × 1254 PNG outputs were visually inspected and copied unchanged into this repository. Joy is a cheerful, character-appropriate smile; regret visibly removes the smile, lowers the gaze and furrows the brow. Faces, costumes, props, framing and background remain aligned with the original portraits for UI crossfades. The originals are preserved.

The exact final prompt for each image is the shared prefix below, followed by one space and its per-image `Primary request` text.

Shared prompt prefix:

```text
Use case: identity-preserve. Asset type: expressive NPC portrait variant for a Chinese Xiangqi desktop game. Input image 1 is the EDIT TARGET. Preserve the exact fictional person's identity, facial proportions, skin detail, hair, clothing, hands, held prop, background, warm lighting, color grading, camera position, square framing, head size and head location. Change ONLY facial expression. This is a matching animation frame that will crossfade against the neutral original; do not recompose or zoom. Retain the realistic painterly photographic quality. No text, logo, watermark, UI, borders or added objects. Output one square portrait.
```

### `public/characters/a-tang-joy.png`

Edit target: `public/characters/a-tang.png`

```text
Primary request: A Tang has just made a clever capture and feels delighted and playfully proud. Give her bright happy eyes, gently lifted eyebrows and a lively genuine smile with a small glimpse of teeth, cheeks lifted. Recognizably joyful and excited but natural, not exaggerated, no change of pose.
```

### `public/characters/shen-yan-joy.png`

Edit target: `public/characters/shen-yan.png`

```text
Primary request: Shen Yan has just won a valuable chess piece through a clever tactic and feels pleased, quietly excited and self-assured. Give him bright satisfied eyes, subtly raised eyebrows and a clear warm confident smile with slightly parted lips. Keep his refined scholarly personality. Expression clearly happier than neutral but natural, no change of pose.
```

### `public/characters/lu-yin-joy.png`

Edit target: `public/characters/lu-yin.png`

```text
Primary request: Lu Yin has just completed a clever capture and feels pleased and warmly amused. Give him a broad kindly knowing smile, gently lifted cheeks, smiling crow's feet and lively satisfied eyes. Keep his dignified experienced personality; a warm quiet chuckle, not a caricature, no change of pose.
```

### `public/characters/a-tang-regret.png`

Edit target: `public/characters/a-tang.png`

```text
Primary request: A Tang has just lost an important chess piece through a mistake and regrets it. Give her a clearly disappointed rueful expression: brows drawn slightly upward toward center, eyes softly downcast, lips pressed into a small unhappy pout with corners lowered. Her usual smile is completely gone. Express a natural little 'oh no' reaction, endearing and mildly frustrated, no tears or dramatic grief, no change of pose.
```

### `public/characters/shen-yan-regret.png`

Edit target: `public/characters/shen-yan.png`

```text
Primary request: Shen Yan has just lost an important chess piece by overlooking a tactic and regrets it. Give him a clearly regretful, thoughtful frown: brows lightly furrowed, eyes slightly downcast, lips pressed and mouth corners lowered. His usual smile is completely gone. He looks ruefully disappointed and reconsidering his plan, restrained and refined, no anger, no tears, no change of pose.
```

### `public/characters/lu-yin-regret.png`

Edit target: `public/characters/lu-yin.png`

```text
Primary request: Lu Yin has just lost an important chess piece after a rare oversight and regrets it. Give him a clearly rueful disappointed expression: brows gently knit, eyes pensively lowered, closed lips with downward corners, a quiet sigh. His usual smile is completely gone. He remains dignified and calm while visibly regretting his mistake, no tears, no dramatic grief, no change of pose.
```
