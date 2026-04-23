# ngon-junk

`ngon-junk` is a desktop-first 3D preview and material playground for fast look-dev, UV edits, stylized motion blur and export.  
The app is built with `Electron + React + TypeScript + Three.js`. Its renderer core is browser-friendly, so the project can be adapted to a web build later.

## Version

- Current version: `v0.1.0`
- Portable Windows build: `release/ngon-junk-0.1.0.exe`

## Quick Start

```bash
npm install
npm run dev
```

```bash
npm run build
npm run dist:win
```

## Current Limits

- Import supports `OBJ`, `FBX`, `3DS`, `STL`, `BLEND`, `SKP`.
- Model export currently supports `GLB` and `OBJ`.
- `FBX` export is not included in the current build.
- Bake export does not include `bloom` or `shadow`.
- Reflection can be baked into generated maps for export.

## Türkçe

### Ne İçin Var?

`ngon-junk`, hafif ve hızlı bir masaüstü 3D önizleme uygulamasıdır. Model yükleyip sahnede görmeni, materyal vermeni, UV ile oynamanı, motion blur üretmeni ve görsel ya da model çıktısı almanı sağlar.

### Güncel Özellikler

- `OBJ`, `FBX`, `3DS`, `STL`, `BLEND`, `SKP` model import
- Dosya seçme veya sürükle-bırak ile model yükleme
- `original`, `altin`, `obsidian`, `ice`, `concrete` materyal presetleri
- `diffuse` ve `coating` renk seçimi
- `reflection`, `refraction`, `bump`, `coating` slider kontrolleri
- `diffuse`, `reflection`, `refraction`, `bump`, `roughness`, `metallic`, `normal` map slotları
- UV düzenleme: `scale x/y`, `move x/y`, `rotate`, tile lock
- `smooth` aç/kapat ile tüm modelde yumuşatılmış gölgelendirme
- Işık sistemi: `studio`, `sun`, `spot`
- Işık ayarları: `amount`, `bloom`, `turn`, `lift`, `shadow`, `shadow soft`, `antialias`
- Motion blur modları: `trail`, `smear`, `silhouette`
- Motion blur ayarları: `power`, `distance`, `gauss blur`, `strobe`, `left/right`, `up/down`, `front/back`
- Wireframe görünümü: aç/kapat, modeli göster/gizle, renk, kalınlık
- Opsiyonel preview frame: `16:9`, `9:16`, `1:1`
- Uzun süren işlemlerde dotted loading overlay
- `Ctrl/Cmd + Z` ile viewport geri alma, `Z` ile view reset
- JPG/PNG görsel export
- Görsel export dialogu: uzun kenar, `2x / 4x`, `72 / 150 / 300 dpi`
- `PNG` exportta transparan arkaplan, `JPG` exportta preview arkaplanı
- `GLB` ve `OBJ` model export
- Bake popup:
  - `tek modelde bake et`
  - `kanallari ayri ver`
  - `combined map`
  - `base map`
  - `yansimayi maplere gom`
- Ayrı kanal exportunda zip üretimi

### Notlar

- Uygulama masaüstü odaklıdır, ama render katmanı web'e taşınabilecek yapıdadır.
- `bloom` ve `shadow` bake export içine dahil edilmez.

## English

### What Is It For?

`ngon-junk` is a lightweight desktop 3D preview app for loading models, assigning materials, tweaking UVs, creating stylized motion blur and exporting either images or models.

### Current Features

- Model import: `OBJ`, `FBX`, `3DS`, `STL`, `BLEND`, `SKP`
- File picker and drag-and-drop loading
- Material presets: `original`, `gold`, `obsidian`, `ice`, `concrete`
- `diffuse` and `coating` color pickers
- `reflection`, `refraction`, `bump`, `coating` controls
- Texture slots for `diffuse`, `reflection`, `refraction`, `bump`, `roughness`, `metallic`, `normal`
- UV editing: `scale x/y`, `move x/y`, `rotate`, tile lock
- Global `smooth` toggle for softer shading across the loaded model
- Lighting modes: `studio`, `sun`, `spot`
- Lighting controls: `amount`, `bloom`, `turn`, `lift`, `shadow`, `shadow soft`, `antialias`
- Motion blur modes: `trail`, `smear`, `silhouette`
- Motion controls: `power`, `distance`, `gauss blur`, `strobe`, `left/right`, `up/down`, `front/back`
- Wireframe controls: enable/disable, show model, color, thickness
- Optional preview frame presets: `16:9`, `9:16`, `1:1`
- Dotted loading overlay for longer calculations
- `Ctrl/Cmd + Z` viewport undo, `Z` view reset
- Image export: `JPG`, `PNG`
- Image export dialog: long edge, `2x / 4x`, `72 / 150 / 300 dpi`
- `PNG` export with transparent background, `JPG` export with the preview background
- Model export: `GLB`, `OBJ`
- Bake export flow:
  - bake into one model
  - export channels separately
  - `combined map`
  - `base map`
  - bake visible reflection into the generated maps
- Zip output when separate channels are exported

### Notes

- The app is desktop-first, but the renderer architecture is suitable for a future web version.
- Bake export does not include `bloom` or `shadow`.

## Deutsch

### Wofür Ist Es?

`ngon-junk` ist eine leichte Desktop-App für 3D-Vorschau, Materialtests, UV-Anpassungen, stilisierten Motion Blur und den Export von Bildern oder Modellen.

### Aktuelle Funktionen

- Modellimport: `OBJ`, `FBX`, `3DS`, `STL`, `BLEND`, `SKP`
- Laden per Dateidialog oder Drag-and-drop
- Material-Presets: `original`, `gold`, `obsidian`, `ice`, `concrete`
- Farbauswahl für `diffuse` und `coating`
- Regler für `reflection`, `refraction`, `bump`, `coating`
- Texture-Slots für `diffuse`, `reflection`, `refraction`, `bump`, `roughness`, `metallic`, `normal`
- UV-Bearbeitung: `scale x/y`, `move x/y`, `rotate`, Tile-Lock
- Globaler `smooth`-Schalter für weichere Schattierung
- Lichtmodi: `studio`, `sun`, `spot`
- Lichtsteuerung: `amount`, `bloom`, `turn`, `lift`, `shadow`, `shadow soft`, `antialias`
- Motion-Blur-Modi: `trail`, `smear`, `silhouette`
- Motion-Regler: `power`, `distance`, `gauss blur`, `strobe`, `left/right`, `up/down`, `front/back`
- Wireframe-Steuerung: ein/aus, Modell zeigen, Farbe, Dicke
- Optionale Preview-Frames: `16:9`, `9:16`, `1:1`
- Dotted-Loading-Overlay bei längeren Berechnungen
- `Ctrl/Cmd + Z` für Undo im Viewport, `Z` für View-Reset
- Bildexport: `JPG`, `PNG`
- Bildexport-Dialog: lange Kante, `2x / 4x`, `72 / 150 / 300 dpi`
- `PNG` mit transparentem Hintergrund, `JPG` mit dem Hintergrund der Vorschau
- Modellexport: `GLB`, `OBJ`
- Bake-Export:
  - in ein einzelnes Modell backen
  - Kanäle getrennt ausgeben
  - `combined map`
  - `base map`
  - sichtbare Reflexion in die Maps einbacken
- ZIP-Ausgabe bei getrennten Kanälen

### Hinweise

- Die App ist Desktop-orientiert, die Renderer-Struktur kann später aber ins Web übertragen werden.
- `Bloom` und `Shadow` werden nicht in den Bake-Export übernommen.

## Français

### À Quoi Sert L'Application ?

`ngon-junk` est une application desktop légère pour prévisualiser des modèles 3D, tester des matériaux, ajuster les UV, générer un motion blur stylisé et exporter des images ou des modèles.

### Fonctions Actuelles

- Import de modèles : `OBJ`, `FBX`, `3DS`, `STL`, `BLEND`, `SKP`
- Chargement par sélecteur de fichier ou glisser-déposer
- Presets de matériau : `original`, `gold`, `obsidian`, `ice`, `concrete`
- Sélecteurs de couleur pour `diffuse` et `coating`
- Réglages `reflection`, `refraction`, `bump`, `coating`
- Slots de texture pour `diffuse`, `reflection`, `refraction`, `bump`, `roughness`, `metallic`, `normal`
- Édition UV : `scale x/y`, `move x/y`, `rotate`, verrouillage du tile
- Option `smooth` globale pour adoucir l'ombrage du modèle
- Modes de lumière : `studio`, `sun`, `spot`
- Réglages de lumière : `amount`, `bloom`, `turn`, `lift`, `shadow`, `shadow soft`, `antialias`
- Modes de motion blur : `trail`, `smear`, `silhouette`
- Réglages du motion blur : `power`, `distance`, `gauss blur`, `strobe`, `left/right`, `up/down`, `front/back`
- Contrôles wireframe : activer/désactiver, afficher le modèle, couleur, épaisseur
- Cadres optionnels pour la preview : `16:9`, `9:16`, `1:1`
- Overlay de chargement pointillé pour les opérations plus longues
- `Ctrl/Cmd + Z` pour annuler dans le viewport, `Z` pour reset la vue
- Export d'image : `JPG`, `PNG`
- Dialogue d'export image : côté long, `2x / 4x`, `72 / 150 / 300 dpi`
- `PNG` avec fond transparent, `JPG` avec le fond visible dans la preview
- Export modèle : `GLB`, `OBJ`
- Flux de bake :
  - bake dans un modèle unique
  - sortie séparée des canaux
  - `combined map`
  - `base map`
  - intégration de la réflexion visible dans les maps
- Export ZIP quand les canaux sont séparés

### Notes

- L'application est pensée pour le desktop, mais le coeur du renderer peut être adapté au web.
- Le bake export n'inclut pas `bloom` ni `shadow`.

## Русский

### Для Чего Это Нужно?

`ngon-junk` — это лёгкое desktop-приложение для просмотра 3D-моделей, настройки материалов, редактирования UV, создания стилизованного motion blur и экспорта изображений или моделей.

### Текущие Возможности

- Импорт моделей: `OBJ`, `FBX`, `3DS`, `STL`, `BLEND`, `SKP`
- Загрузка через диалог выбора файла или drag-and-drop
- Пресеты материалов: `original`, `gold`, `obsidian`, `ice`, `concrete`
- Выбор цвета для `diffuse` и `coating`
- Настройки `reflection`, `refraction`, `bump`, `coating`
- Слоты текстур для `diffuse`, `reflection`, `refraction`, `bump`, `roughness`, `metallic`, `normal`
- Редактирование UV: `scale x/y`, `move x/y`, `rotate`, tile lock
- Глобальный переключатель `smooth` для сглаженного шейдинга модели
- Режимы света: `studio`, `sun`, `spot`
- Настройки света: `amount`, `bloom`, `turn`, `lift`, `shadow`, `shadow soft`, `antialias`
- Режимы motion blur: `trail`, `smear`, `silhouette`
- Параметры motion blur: `power`, `distance`, `gauss blur`, `strobe`, `left/right`, `up/down`, `front/back`
- Управление wireframe: вкл/выкл, показывать модель, цвет, толщина
- Опциональные preview-кадры: `16:9`, `9:16`, `1:1`
- Dotted loading overlay для долгих операций
- `Ctrl/Cmd + Z` для отмены изменений во viewport, `Z` для сброса вида
- Экспорт изображений: `JPG`, `PNG`
- Диалог экспорта изображений: длинная сторона, `2x / 4x`, `72 / 150 / 300 dpi`
- `PNG` с прозрачным фоном, `JPG` с фоном как в preview
- Экспорт моделей: `GLB`, `OBJ`
- Bake-экспорт:
  - bake в одну модель
  - отдельная выдача каналов
  - `combined map`
  - `base map`
  - запись видимого отражения в карты
- ZIP-экспорт при раздельной выдаче каналов

### Заметки

- Приложение ориентировано на desktop, но рендер-ядро можно адаптировать под web.
- Bake export не включает `bloom` и `shadow`.
