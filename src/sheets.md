# Что генерируем

4 листа на 58 элементов, лист портретов для карточек и арт главного экрана. Генерируем только то, что держится на материале и рисунке: кнопки, иконки, частицы, декали, портреты, большие иллюстрации.
Всё, что сводится к простой форме с текстом или цифрой, делаем кодом по палитре эталона.
Валюты не смешиваем: дублон (монета) только в гринде, золото меты везде слитками.
К каждому листу первым изображением прикладывается `art/reference/etalon.png`, формат 1:1, 4K. К арту главного экрана прикладывается сплеш `art/probes/splashcreen.png`, формат 9:16. К портретам прикладываются сплеш и эталон, формат 16:9.

По ставке из ГДД около $0,15 за генерацию: 4 листа по 5-6 попыток, добор пропущенных элементов, по 5-6 попыток на портреты и арт главного, всего около 42 генераций, примерно $6-7.

## Листы

| # | Лист | Состав | Шт | Ракурс |
|---|---|---|---|---|
| 1 | Кнопки и плашки | лица кнопок синее, золотое, тёмное и нижние грани к ним; круглые лица светлое и зелёное и грань; квадратные рамки аватара синяя и красная; плашки Victory и Defeat; рубашка карты; рамка карточки юнита | 15 | фронтально |
| 2 | Иконки | якорь, скрещённые сабли, силуэт бойца, щит VS без букв, дублон, золото, кубок, чертёж, жемчуг, сундук, ром, бинт, вихрь Reroll, замок, рука-подсказка, мушкет с саблей для таба, череп | 17 | фронтально |
| 3 | Частицы | дым ×3, всплеск ×2, пыль ×2, щепки ×3, клочки ткани ×2, вспышка выстрела ×3, абордажная кошка | 16 | игровая камера |
| 4 | Декали и облака | трещина ×2, пробоина ×2, подпалина ×2, обломок фальшборта, облака ×3 | 10 | сверху, плоско |
| 5 | Портреты для карточек | канонир, стрелок, абордажник: погрудно, фронтально, стиль между сплешем и эталоном | 3 | фронтально, 16:9 |
| 6 | Арт главного экрана | корабль с парусами примерно на 65% ширины, паруса служат фоном для трёх карточек | 1 | как сплеш, 9:16 |

Порядок: 3 и 4 первыми, они нужны песочнице корабля. Потом 5 и 6, затем 1 и 2. Резать UI под размеры после второй подписи раскладки.

## Кодом, не генерируем

- Бейджи ранга: круг цвета стороны с цифрой, у супера золотой.
- Бейдж бочки: квадрат, иконка дублона и «+10».
- Пузырь «+1/+2», бирка «+X», зелёная галочка готовности.
- Плашки-«таблетки»: дублоны, золото и кубки, число бойцов.
- Полоска корпуса: рамка, заливка, след урона.
- Лицо карты и рамка редкости (тинт по hex из ГДД), слот иконки карты у аватара.
- Плиты: нижняя панель с горбом под дублоны, таб-бар и подсветка таба, панель поиска, панель награды, плашки причины и подсказки, карточки игроков на экране VS.
- Баннер раунда: тёмная полоса с золотыми линиями.
- Кольцо таймера, полоски HP матросов, пунктирный кружок погибшего, кучка монет из иконок дублона.
- Нажатое и неактивное состояние кнопок, все тексты и цифры.
- Вода, блики, пена: тайл и спрайты из эталона. Кольца, звёзды, штрихи, лучи и колонна света, как в ГДД.
- 3D: корабль, пушки, бочки, вымпел, ядро. Бойцы в 3D уже есть.
- Имя на карточке юнита кодом. Подписи «что делает» убраны.
- Слитки `ic_ingot` и `ic_ingots` временно нарисованы кодом, заменятся слитками из листа 8 без правок кода.

## Готовые промпты

Эталон это `art/reference/etalon.png`, сплеш это `art/probes/splashcreen.png`. Изображения прикладывать в указанном порядке.

### 1. Кнопки и плашки
Прикрепить: эталон. Формат 1:1.

```
Image 1 is the style reference. Match its art style exactly: cartoon mobile game art, thick near-black outlines, saturated flat colors with soft painted shading, light from the top-left. Create one game asset sheet on a solid flat #FF00FF magenta background. Arrange the elements in clear rows with generous empty space around each one, so no two elements touch and none touches the image edge. All elements are seen strictly from the front, with straight clean edges and even borders that can be stretched with 9-slice. Row 1: three wide rounded-rectangle button faces without a bottom lip: bright blue like the Hire button in Image 1, warm gold-orange, dark slate. Row 2: the three matching bottom lips as separate darker strips of the same width. Row 3: two round button faces, light steel blue-grey and fresh green, and one darker round bottom lip that fits under them. Row 4: two square bevelled avatar frames with empty centers, one blue and one red, like the avatar frames in Image 1. Row 5: a wide victory plaque in gold and blue and a wide defeat plaque in grey and dark red, both with empty centers. Row 6: a card back with a simple nautical pattern and a tall vertical unit card frame in warm parchment and blue with an empty center and an empty name plate at the bottom. No text, no numbers, no letters anywhere. No characters. No drop shadows or glow on the background. Square 1:1 image, 4K resolution.
```

### 2. Иконки
Прикрепить: эталон. Формат 1:1.

```
Image 1 is the style reference. Match its art style exactly: cartoon mobile game art, thick near-black outlines, saturated flat colors with soft painted shading, light from the top-left. Create one game asset sheet on a solid flat #FF00FF magenta background. Arrange the elements in clear rows with generous empty space around each one, so no two elements touch and none touches the image edge. Seventeen separate icons seen strictly from the front, in four rows: a white anchor emblem, crossed sabers with gold hilts, a grey-blue crew silhouette of head and shoulders, a gold shield badge with an empty center, a gold doubloon coin with an embossed anchor, a small pile of gold coins, a gold trophy cup, a rolled blueprint scroll, a white pearl, a small wooden treasure chest, a rum bottle, a white bandage roll, a mint-green swirl, a padlock, a white pointing hand, a crossed musket and saber emblem, a cartoon skull. No text, no numbers, no letters anywhere. No characters. No drop shadows or glow on the background. Square 1:1 image, 4K resolution.
```

### 3. Частицы
Прикрепить: эталон. Формат 1:1.

```
Image 1 is the style reference. Match its art style exactly: cartoon mobile game art, thick near-black outlines, saturated flat colors with soft painted shading, light from the top-left. Create one game asset sheet on a solid flat #FF00FF magenta background. Arrange the elements in clear rows with generous empty space around each one, so no two elements touch and none touches the image edge. Sixteen separate effect sprites seen from above with a slight tilt, like the camera in Image 1, in four rows: three white-grey smoke puffs of different sizes, two white water splashes, two small dust puffs, three wooden splinters, two small torn cloth scraps, three muzzle flashes drawn as solid yellow-orange starbursts with dark outlines, and one grappling hook with three prongs. No text, no numbers, no letters anywhere. No characters. No drop shadows or glow on the background. Square 1:1 image, 4K resolution.
```

### 4. Декали и облака
Прикрепить: эталон. Формат 1:1.

```
Image 1 is the style reference. Match its art style exactly: cartoon mobile game art, thick near-black outlines, saturated flat colors with soft painted shading, light from the top-left. Create one game asset sheet on a solid flat #FF00FF magenta background. Arrange the elements in clear rows with generous empty space around each one, so no two elements touch and none touches the image edge. Ten separate elements seen straight from above as flat textures with no perspective, in three rows: two crack decals in dark wood, two jagged hole decals showing dark depth, two scorch marks, one broken piece of wooden rail, and three soft cartoon clouds of different shapes. No text, no numbers, no letters anywhere. No characters. No drop shadows or glow on the background. Square 1:1 image, 4K resolution.
```

### 5. Портреты для карточек
Прикрепить: **сплеш первым**, эталон вторым. Формат 16:9.

```
Image 1 shows three pirate characters: an old gunner with a white beard, a feathered blue tricorn hat and a cannon rammer; a shooter with a wide-brimmed blue hat, a moustache and a flared blunderbuss; a young boarder with a blue bandana, an eye patch and a cutlass. Image 2 is the in-match art style of the same game. Create card portraits of these three characters. Keep their faces, hats, clothes and colors recognizable from Image 1, but use a style halfway between the two references: stylized 3D with smooth simplified forms, matte materials, far fewer small details and textures than Image 1, clean readable shapes with a thin dark outline closer to Image 2, soft light from the top-left. Each portrait is a head-and-shoulders bust facing the viewer, with the signature item showing at the shoulder: the rammer, the blunderbuss, the cutlass. The hat is one tone darker than the clothes. Only the boarder wears an eye patch. Place the three portraits side by side in one row, each in its own square tile with identical framing, identical head size and the same plain blue background that gets slightly darker toward the bottom. Fill the space between and around the tiles with solid flat #FF00FF magenta. No text, no frames, no card borders. 16:9 image, 4K resolution.
```

### 6. Арт главного экрана
Прикрепить: **сплеш**. Формат 9:16.

```
Image 1 is the style reference: match its rendering exactly, the same stylized 3D look, materials, lighting and color temperature. Create a vertical 9:16 mobile game main-screen illustration: a pirate ship at sea seen from the front three-quarter view, centered and taking about 65% of the image width, with open sea and sky around it. Its three masts carry wide, clean, light canvas sails that together form a broad calm backdrop between 21% and 48% of the image height and across the central 60% of the width; the sails have no emblems, because game cards will be placed on top of them. A small dark-blue pennant flies from the top of the main mast. The hull with gun ports and a dark-blue stripe along the waterline sits between 48% and 62% of the height. The top 10% is clear bright sky for counters. The bottom 30% is calm deep emerald sea, slightly darker toward the bottom edge, with no important details, because buttons and a tab bar go there. No characters, no people, no animals, no text, no logos. 4K resolution.
```

## Экран победы и баннеры между схватками

Две генерации, прикладывается только эталон. Сплеш нужен для сплеша и немного для портретов карточек, сюда его не берём. Нарядно, но без перегруза. 7 это концепт экрана: по нему собираю экран кодом, буквы и цифры с него не берём. 8 это лист деталей для сборки. По $0,15 за генерацию и около 5 попыток на каждую выходит примерно $1,5.

### 7. Экран победы, концепт
Прикрепить: эталон. Формат 9:16.

```
Image 1 is the in-game style reference for UI, shapes and colors. Create a vertical 9:16 mobile game victory screen mockup in exactly this style: cartoon mobile game art, thick near-black outlines, saturated colors with soft painted shading, light from the top-left. Festive but clean and readable, not overloaded. Background: a deep teal-blue radial gradient with soft golden light rays behind the plaque and a few sparkles; a light scatter of confetti in blue, red and gold near the top. Upper third: a gold-and-blue victory ribbon plaque like a game title banner, with a small gold crown on top; its center plate is empty. Middle: a dark rounded reward panel with three empty rows, each starting with an icon: a small stack of shiny gold bars, a small gold hourglass, a gold trophy cup; a few gold bars pop out over the top edge of the panel. No coins anywhere on this screen. Below the panel: an empty thin caption line and an empty small hint plate. Bottom: a big glossy gold-orange rounded button with an empty face. No characters. All plates, rows and the button stay empty: no text, no numbers, no letters anywhere. 4K resolution.
```

### 8. Плашки победы и поражения, баннеры раунда и боя, слитки
Прикрепить: эталон. Формат 1:1.

```
Image 1 is the style reference. Match its art style exactly: cartoon mobile game art, thick near-black outlines, saturated flat colors with soft painted shading, light from the top-left. Create one game asset sheet on a solid flat #FF00FF magenta background. Arrange the elements in clear rows with generous empty space around each one, so no two elements touch and none touches the image edge. All elements are seen strictly from the front and stay simple and readable, not overloaded with ornaments. Row 1: a victory plaque, a gold frame around a deep blue center plate with a small gold crown on top and short blue ribbon tails; next to it a matching defeat plaque, a dull silver frame around a dark red center plate with short grey ribbon tails and no crown. Row 2: a wide horizontal banner for the pause between fights, a long blue ribbon with gold trim and folded ends and a small gold shield with crossed sabers on its top edge; next to it a wide fight banner, a long red ribbon with gold trim and folded ends and crossed cutlasses on its top edge. Row 3: one classic trapezoid gold bar seen from the front three-quarter view with a bright highlight on its top face, a small pyramid stack of three such gold bars, a gold trophy cup. No coins. The center plates of both plaques and the middle of both ribbons stay flat and empty so text can be placed on them later. No text, no numbers, no letters anywhere. No characters. No drop shadows or glow on the background. Square 1:1 image, 4K resolution.
```

### 10. Окно усилений: рамки карт по редкости и арт шести карт
Прикрепить: эталон. Формат 1:1. Около 5 попыток, примерно $0,75. Под новый набор карт (проклятие, шторм, знахарь, порох, ром, пузырь), если его утвердим.

```
Image 1 is the style reference. Match its art style exactly: cartoon mobile game art, thick near-black outlines, saturated colors with soft painted shading, light from the top-left. Create one game asset sheet on a solid flat #FF00FF magenta background. Arrange the elements in clear rows with generous empty space around each one, so no two elements touch and none touches the image edge. Row 1: three tall vertical card frames of the same size and shape, seen strictly from the front, each with an empty arched picture window in the upper half, an empty ribbon for a name across the middle and an empty lower panel: a common frame of weathered light wood with silver corner caps; a rare frame of deep blue enamel with gold trim and a small blue gem at the top; an epic frame of royal purple with ornate gold filigree, three small gems and a crown-like crest at the top. Rows 2 and 3: six square card illustrations without frames, each a small dramatic scene with its own rich background that fills the whole square: 1) green cursed ghost fog swirling around a cutlass, with a faint green ghostly skull in the mist, dark green background; 2) a jagged white-blue lightning bolt that splits and chains between three crossed sabers, stormy dark blue background; 3) a leather healer's satchel with rolled bandages and glowing green plus signs floating up, soft light green background; 4) a black powder keg bursting into a big orange explosion with flying wooden staves, warm orange background; 5) a rum bottle wrapped in red fiery rage flames, deep red background; 6) a translucent shimmering water bubble shield with a seashell in its center, aqua background. No text, no numbers, no letters anywhere. No characters. No drop shadows or glow on the magenta background. Square 1:1 image, 4K resolution.
```
