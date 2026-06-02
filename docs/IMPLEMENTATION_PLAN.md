# WhisperAnnote — План имплементации для агента-кодера

> **Роли.** Архитектор (контроллер) держит контракты в `docs/*.xml` — это источник истины.
> Кодер (воркер) реализует модули по `ExecutionPacket`-ам ниже: пишет код с GRACE-разметкой,
> гоняет тесты, возвращает graph/verification-дельты. **Backend (Phase-2) готов** (13 модулей,
> 48 тестов). Этот план покрывает **Phase-1, 3–8** + вводит общий модуль **M-SHARED**.
>
> Канонический формат выдачи задачи — `ExecutionPacket` из `docs/operational-packets.xml`.
> Полные контракты модулей — в `docs/development-plan.xml` (ищи `M-<ID>`), критерии приёмки —
> в `docs/verification-plan.xml` (ищи `V-M-<ID>`). Здесь — то, чего в графе нет:
> кросс-процессные интерфейсы, тулинг, порядок и Definition of Done.

---

## 0. Правила работы кодера (read first)

1. **Один пакет = один модуль = один коммит.** Не выходить за `write-scope` пакета.
2. **Сначала контракт.** Перед кодом прочитать `M-<ID>` (development-plan.xml) и `V-M-<ID>`
   (verification-plan.xml). Код реализует контракт, не наоборот.
3. **GRACE-разметка обязательна** (см. `AGENTS.md` §«Semantic Markup Reference»):
   `START_MODULE_CONTRACT`/`MAP`, `START_CONTRACT:` на каждую публичную функцию,
   `START_BLOCK_<NAME>` на критические участки. Логи — маркерами `[Module][fn][BLOCK]`.
4. **Тесты зелёные** перед закрытием пакета: `npm run typecheck`, `npm test` (Vitest),
   относящиеся к модулю. ML/Electron — мокаются (без реального GPU/окна в юнит-тестах).
5. **Обновить граф и верификацию** дельтами (`GraphDelta`/`VerificationDelta` из operational-packets).
   Контроллер вливает их в `docs/*.xml`.
6. **Stop-условия** (вернуть контроллеру, не изобретать): нужна новая зависимость / новый модуль /
   неясный внешний интерфейс / противоречие контракта.
7. **Инварианты проекта** (`AGENTS.md` §«Ключевые инварианты») не нарушать никогда:
   GPU-only, без чанкинга, очередь concurrency=1, backend на 127.0.0.1 + токен + CORS-allowlist +
   валидация путей, temp только в системном каталоге, секреты не логировать.

---

## 1. Архитектурные решения, зафиксированные архитектором

### 1.1 Тулинг и языки
- **electron-vite (vite 6)** — единый бандлинг main/preload/renderer + HMR + TS. **electron-builder** — инсталлятор.
- React 18 + TS 5.5; **Tailwind 4** + **shadcn/ui** (Radix); **Zustand**; **react-i18next**;
  **@tanstack/react-virtual** (виртуализация), **@tanstack/react-query** (фетчинг/кэш) — опционально, можно на голом fetch.
- Main-зависимости: **electron-store**, **chokidar**, **node-cron**.
- Тесты: **Vitest** + **@testing-library/react** + **jsdom** (renderer); Vitest + мок `electron` (main).

### 1.2 Финальная структура репозитория
```
electron/                 # Electron main + preload (TS, GRACE-разметка)
  main.ts                 # M-MAIN (+ регистрация app:// протокола в prod)
  preload.ts              # M-PRELOAD (contextBridge → window.electron)
  config-store.ts         # M-CONFIG-STORE
  python-manager.ts       # M-PY-MANAGER
  file-watcher.ts         # M-WATCHER
  scheduler.ts            # M-SCHEDULER
  ipc-handlers.ts         # M-IPC
src/                      # React renderer
  main.tsx, App.tsx
  shared/                 # M-SHARED — контракты, общие с electron/ (импортируется ОБОИМИ процессами)
    contract.ts           #   IPC-каналы (имена+типы), AppConfig, BackendInfo, события
    dto.ts                #   зеркало pydantic-DTO backend (TranscriptSegment, TaskInfo, WSMessage, ...)
    index.ts
  components/ui/          # M-UI (shadcn)
  components/layout/      # M-APP-SHELL
  components/upload/      # M-UPLOAD
  components/transcription/ # M-RESULTS
  components/batch/       # M-BATCH
  components/settings/    # M-SETTINGS
  components/onboarding/  # M-ONBOARDING
  stores/                 # M-STORES (zustand)
  lib/api.ts              # M-API-CLIENT
  i18n/                   # M-I18N (ru/en)
tests/
  main/                   # тесты electron-модулей (мок electron)
  frontend/               # тесты renderer (jsdom + RTL)
  packaging/              # smoke-install.md (ручной чек на чистой машине)
scripts/build.ps1         # M-PACKAGING
electron.vite.config.ts   # entries: main=electron/main.ts, preload=electron/preload.ts, renderer=src/
electron-builder.yml      # M-PACKAGING
tsconfig.json / tsconfig.node.json
vitest.config.ts
tailwind.config.ts, postcss.config.js
package.json
backend/                  # ГОТОВО (Phase-2)
```
> `electron.vite.config.ts` переопределяет дефолтные пути electron-vite на `electron/` и `src/`
> через `build.lib.entry` / `root`. Renderer root = `src/`, `index.html` в корне или в `src/`.

### 1.3 Модель токенов и backend-info handshake (КРИТИЧНО)
Два независимых секрета — не путать:
- **backendToken** — случайный сессионный секрет (`crypto.randomBytes(32).hex`), генерится M-PY-MANAGER
  при старте, живёт в памяти main. Им авторизуются ВСЕ HTTP/WS вызовы renderer→backend.
- **HF-токен** — пользовательский, хранится зашифрованно (safeStorage) в M-CONFIG-STORE,
  **никогда не отдаётся renderer**, пробрасывается в backend только через env при spawn.

Поток запуска:
```
main.bootstrap
 └─ ConfigStore.load()
 └─ PyManager.start():
      port = свободный (net.bind 127.0.0.1:0) или config.preferredPort
      backendToken = randomBytes(32).hex
      env = { BACKEND_HOST=127.0.0.1, BACKEND_PORT=port, BACKEND_TOKEN=backendToken,
              HUGGINGFACE_HUB_TOKEN=<safeStorage|''>, MODEL_CACHE_DIR=<userData/models>,
              ALLOWED_ROOTS=<outputFolder; watchFolder>, CORS_ORIGINS=<renderer origin> }
      spawn(bundledPython, ['-m','uvicorn','backend.server:app','--host',127.0.0.1,'--port',port], {env, cwd})
      poll GET /api/health (Bearer backendToken) до 200 | timeout(30s) → running=true
 └─ renderer грузится → window.electron.getBackendInfo()
      → { baseUrl:`http://127.0.0.1:${port}`, wsBaseUrl:`ws://127.0.0.1:${port}`, token, port, running }
      → useBackendStore сохраняет → M-API-CLIENT шлёт `Authorization: Bearer ${token}`, WS `?token=${token}`
```
**Токен попадает в renderer** (через `backend:get-info`). Это приемлемо: 127.0.0.1-only, токен даёт
доступ только к локальному backend (без системных прав), renderer контекст-изолирован, без удалённого
контента, с жёстким CSP. Более строгая альтернатива (проксировать все вызовы через main, не отдавая
токен) — отложена как будущее ужесточение; усложняет стриминг WS-прогресса.

### 1.4 CORS / origin renderer
- **dev**: renderer на `http://localhost:5173` (vite) — уже в allowlist backend (`_cors_origins`).
- **prod**: M-MAIN регистрирует кастомный стандартный протокол **`app://`** и грузит окно из
  `app://index.html` → Origin = `app://.` (уже в allowlist backend). Не грузить prod-renderer через
  `file://` (даст Origin `null` и боль с CORS).

### 1.5 Каталог IPC и поверхность `window.electron` (живёт в M-SHARED `contract.ts`)
**invoke (renderer → main → ответ):**

| channel | request | response |
|---|---|---|
| `dialog:select-file` | `{filters?}` | `string \| null` |
| `dialog:select-folder` | — | `string \| null` |
| `config:get` | — | `AppConfig` |
| `config:set` | `Partial<AppConfig>` | `AppConfig` |
| `config:get-hf-token-status` | — | `boolean` |
| `config:set-hf-token` | `{token}` | `{ok:true}` (шифрует + рестарт backend) |
| `config:clear-hf-token` | — | `{ok:true}` |
| `backend:get-info` | — | `BackendInfo` |
| `backend:get-status` | — | `{running,healthy,port}` |
| `backend:restart` | — | `{ok:true}` |
| `watcher:start` | `{folder,cron?}` | `{ok:true}` |
| `watcher:stop` | — | `{ok:true}` |
| `watcher:get-status` | — | `{watching,folder?}` |
| `shell:open-path` | `{path}` | `{ok}` |

**события (main → renderer, `window.electron.on`):**
`watcher:new-file {filePath,fileName}` · `backend:status {running,healthy,port}` · `backend:log {line}` (debug).

Все каналы — строго по белому списку (массив-константа в `contract.ts`); preload не пробрасывает `ipcRenderer` напрямую.

### 1.6 AppConfig (M-CONFIG-STORE / M-SHARED)
```ts
interface AppConfig {
  language: 'ru' | 'en';
  theme: 'light' | 'dark' | 'system';
  model: 'faster-whisper-large-v3' | 'faster-whisper-large-v3-turbo' | 'faster-whisper-medium';
  numSpeakers: number | null;          // подсказка диаризации; null = авто
  outputFolder: string;                // куда писать результаты (входит в ALLOWED_ROOTS)
  outputFormats: ('json'|'txt'|'srt'|'docx')[];
  watchFolder: string | null;          // папка автообработки (входит в ALLOWED_ROOTS)
  watchEnabled: boolean;
  cronExpression: string;              // дефолт '*/5 * * * *'
  preferredPort: number | null;        // null = эфемерный порт
  firstRun: boolean;
  hasHfToken: boolean;                 // ПРОИЗВОДНОЕ; сам токен в safeStorage, не здесь
}
```
HF-токен хранится отдельным ключом через `safeStorage.encryptString` (electron-store как контейнер blob).

### 1.7 WS и backend-DTO (M-SHARED `dto.ts`) — зеркало pydantic
```ts
type WSMessage =
  | { type:'stage'; stage:string }
  | { type:'progress'; percent:number; message?:string }
  | { type:'log'; message:string }
  | { type:'complete'; output_files:Record<string,string>; duration_sec:number }
  | { type:'error'; message:string };
// + TranscriptSegment, SpeakerSegment, TranscriptionResult, TaskInfo, TaskStatus,
//   AvailableModels, HealthStatus — поля 1:1 с backend/models.py (snake_case сохраняем).
```
> Источник правды по форме DTO — `backend/models.py`. При расхождении правит контроллер.

### 1.8 Резолвинг bundled-python (M-PY-MANAGER)
- **dev**: `python` = `process.env.WA_PYTHON` ?? `<repo>/.venv/{Scripts/python.exe|bin/python}`;
  `cwd` = repo root (чтобы `backend` импортировался). Запуск `-m uvicorn backend.server:app`.
- **prod**: `python` = `${process.resourcesPath}/python/{Scripts/python.exe|bin/python}` (bundled .venv);
  `cwd` = `process.resourcesPath` (там лежит `backend/`). Эти же пути готовит M-PACKAGING (extraResources).

### 1.9 Известные доработки backend (координируются с контроллером)
- **R-1 (Phase-6):** `POST /api/models/download` сейчас синхронный/блокирующий. Для онбординга с
  прогрессом — переделать в фоновую задачу + WS-канал `model:<name>` + ответ `202 {status:'started'}`.
  Затрагивает `M-MODELS`/`M-SERVER`, обновить `V-M-MODELS`. Кодер не делает это сам — сигналит контроллеру.
- **R-2:** BatchView обновляет очередь поллингом `GET /api/queue/status` (раз в ~2с на активной вкладке),
  плюс реагирует на событие `watcher:new-file`. Реалтайм-пуш очереди в main→renderer — не требуется в v1.

---

## 2. Новый модуль M-SHARED (вводится архитектором)

**Зачем.** Единственный типизированный контракт, который импортируют ОБА процесса (electron/ и src/):
имена IPC-каналов, их payload-типы, `AppConfig`, `BackendInfo`, события и зеркало backend-DTO.
Убирает дрейф между main и renderer.

- **Путь:** `src/shared/` (`contract.ts`, `dto.ts`, `index.ts`), ROLE=TYPES.
- **Зависит:** none. **Зависят от него:** M-PRELOAD, M-IPC, M-CONFIG-STORE, M-API-CLIENT, M-STORES, и все view.
- **Тесты:** `tests/frontend/shared.test.ts` — каналы уникальны, `WSMessage` исчерпывающий (exhaustive switch),
  типы компилируются (`tsc --noEmit`). **V-M-SHARED.**
- Граф/верификация уже обновлены контроллером (M-SHARED + V-M-SHARED + CrossLinks).

---

## 3. ExecutionPacket-ы по фазам (порядок имплементации)

> Для каждого пакета: **write-scope** (что можно трогать), **ключевые интерфейсы** (что зафиксировал
> архитектор), **зависимости**, **тест/V-M**, **DoD/опасности**. Полный контракт — `M-<ID>` в development-plan.xml.

### Phase-1 — Каркас + фундамент

**PKG-SCAFFOLD** (setup, без отдельного M-)
- write-scope: `package.json`, `electron.vite.config.ts`, `tsconfig*.json`, `vitest.config.ts`,
  `tailwind.config.ts`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx` (заглушка),
  `electron/main.ts` (минимальное окно), `electron/preload.ts` (пустой мост), `.eslintrc`, `.prettierrc`.
- DoD: `npm run dev` поднимает пустое frameless-окно; `npm run typecheck` и `npm test` (0 тестов) зелёные;
  `npm run build` собирает. Скрипты: `dev/build/typecheck/test/lint/package` (см. AGENTS.md команды).
- Опасности: настроить electron-vite entries на `electron/` и `src/`; `contextIsolation:true`,
  `nodeIntegration:false`, `sandbox:true`; CSP в `index.html` (`default-src 'self'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*`).

**M-SHARED** → §2. write-scope: `src/shared/*`, `tests/frontend/shared.test.ts`.
Реализовать §1.5–1.7 ровно. DoD: typecheck зелёный, каналы — `as const` массив, `WSMessage` exhaustive-тест.

**M-UI** — shadcn-примитивы (~15: button, card, input, select, switch, tabs, dialog, progress, table,
toast/sonner, tooltip, badge, scroll-area, separator, label). write-scope: `src/components/ui/*`,
`tests/frontend/ui.test.tsx`. Deps: none. V-M-UI. DoD: рендер + a11y smoke; тёмная тема через Tailwind.

**M-I18N** — react-i18next, `ru` (основной) + `en` (fallback). write-scope: `src/i18n/*`,
`tests/frontend/i18n.test.ts`. Deps: none. V-M-I18N. DoD: `t('key')` резолвится в обоих языках,
переключение языка. (Адаптировать ключи из Whisperer_v1 locales.)

### Phase-3 — Electron Shell

**M-CONFIG-STORE** — `electron/config-store.ts`. Deps: M-SHARED.
- Интерфейс: `getConfig():AppConfig`, `setConfig(patch):AppConfig`, `getSecretHfToken():string|null`,
  `setSecretHfToken(t)`, `clearHfToken()`, `hasHfToken():boolean`. HF-токен — `safeStorage.encryptString`,
  отдельный ключ; в открытый JSON НЕ писать. V-M-CONFIG-STORE (security: открытый config не содержит токен).
- Опасности: `safeStorage.isEncryptionAvailable()` может быть false (Linux без keyring) — внятная ошибка.

**M-PY-MANAGER** — `electron/python-manager.ts`. Deps: M-CONFIG-STORE, M-SHARED.
- Интерфейс: `start():Promise<BackendInfo>`, `stop():Promise<void>`, `restart()`, `getStatus()`, `getInfo()`.
- Реализовать §1.3 и §1.8. Маркер `[PyManager][start][BLOCK_SPAWN_BACKEND]`. Токен — через env, НЕ argv.
  Shutdown: SIGTERM → ждать 5с → SIGKILL (Windows: `taskkill /pid <pid> /T /F` для дерева процессов).
  Health-poll с backoff. V-M-PY-MANAGER. Ошибки: `PYTHON_NOT_FOUND`, `BACKEND_START_FAILED`.

**M-PRELOAD** — `electron/preload.ts`. Deps: M-SHARED.
- `contextBridge.exposeInMainWorld('electron', api)` строго по каналам M-SHARED. `on(event,cb)` →
  `ipcRenderer.on`, возвращает unsubscribe; снимать листенеры. V-M-PRELOAD (Node-API недоступны из renderer).

**M-IPC** — `electron/ipc-handlers.ts`. Deps: M-PY-MANAGER, M-CONFIG-STORE, M-WATCHER(*позже*), M-SHARED.
- `registerIpc(deps)`: `ipcMain.handle` на каждый канал белого списка; ничего вне списка. dialog:* через
  `dialog.showOpenDialog`. `config:set-hf-token` → store + `pyManager.restart()`. V-M-IPC.
  *(watcher-каналы включить в Phase-5, когда появится M-WATCHER.)*

**M-MAIN** — `electron/main.ts`. Deps: M-IPC, M-PY-MANAGER, M-PRELOAD (+ watcher/scheduler в Phase-5).
- `bootstrap()`: frameless `BrowserWindow` (`contextIsolation`, `sandbox`, preload), регистрация `app://`
  протокола (prod) и загрузка renderer (dev: vite URL; prod: `app://index.html`), init менеджеров, IPC,
  graceful shutdown backend на `before-quit`. Маркер `[Main][bootstrap][BLOCK_INIT_MANAGERS]`. V-M-MAIN.

### Phase-4 — UI транскрибации (ручной поток end-to-end)

**M-STORES** — `src/stores/*`. Deps: M-SHARED.
- `useSettingsStore` (зеркало AppConfig + sync через `window.electron.getConfig/setConfig`),
  `useTranscriptionStore` (`tasks: Record<taskId,TaskInfo>`, `speakerNames: Record<taskId,Record<string,string>>`),
  `useBatchStore` (история/очередь), `useBackendStore` (`BackendInfo` + health/GPU). `device` всегда 'cuda'
  (нет пути в cpu). V-M-STORES.

**M-API-CLIENT** — `src/lib/api.ts`. Deps: M-STORES, M-SHARED.
- `createApi(backendInfo)`: типизированные методы под маршруты backend (`/api/transcribe`(multipart),
  `/api/queue`, `/api/queue/status`, `DELETE /api/queue/:id`, `/api/models`, `/api/models/download`,
  `/api/health`) с `Authorization: Bearer`. `useWebSocket(taskId)`: подключение `ws://…/ws/progress/:id?token=`,
  reconnect с backoff, **на reconnect**: `GET /api/queue/status` затем resubscribe. Маркер
  `[ApiClient][useWebSocket][BLOCK_WS_RECONNECT]`. V-M-API-CLIENT. Ошибки: `UNAUTHORIZED`, `NETWORK`.

**M-APP-SHELL** — `src/components/layout/*`. Deps: M-UI, M-I18N, M-STORES.
- Sidebar (3 вкладки: Транскрибация/Автообработка/Настройки), frameless Header (draggable title bar +
  оконные кнопки), StatusBar (backend/watcher/GPU/версия), тема. V-M-APP-SHELL.

**M-UPLOAD** — `src/components/upload/*`. Deps: M-API-CLIENT, M-STORES, M-UI.
- Drag-and-drop + file picker (`window.electron.selectFile`), QuickSettings (модель, numSpeakers),
  кнопка «Расшифровать» → `POST /api/transcribe` (multipart), ProgressCard по WS. V-M-UPLOAD. Поток DF-TRANSCRIBE.

**M-RESULTS** — `src/components/transcription/*`. Deps: M-API-CLIENT, M-STORES, M-UI.
- `SegmentList` (виртуализация @tanstack/react-virtual; 5000 сегментов без лагов), `SpeakerLegend`
  (переименование → `useTranscriptionStore.speakerNames`), `ExportPanel` (экспорт уже на backend; имена
  применяются и в UI, и при экспорте), копирование. V-M-RESULTS. Поток DF-EXPORT.

### Phase-5 — Автообработка

**M-WATCHER** — `electron/file-watcher.ts`. Deps: M-CONFIG-STORE, M-SHARED.
- chokidar; стабилизация файла **2с** (`awaitWriteFinish`), фильтр расширений (аудио/видео), **игнор
  сгенерированных** (outputFolder, временные), дедуп по `path+size+mtime`. На стабильный файл → main
  делает `POST /api/queue` (валидация пути на backend) и эмитит `watcher:new-file` в renderer.
  Маркер `[Watcher][onStable][BLOCK_STABILIZE_FILE]`. V-M-WATCHER. Инвариант: результаты в watchFolder не пишем → нет петли.

**M-SCHEDULER** — `electron/scheduler.ts`. Deps: M-WATCHER, M-CONFIG-STORE. node-cron, периодический скан
  папки (догон пропущенных), та же дедуп. V-M-SCHEDULER. + дописать watcher-каналы в M-IPC и init в M-MAIN.

**M-BATCH** — `src/components/batch/*`. Deps: M-API-CLIENT, M-STORES, M-UI. FolderConfig (папка+cron+вкл/выкл
  через IPC `watcher:*`), QueueList (поллинг `/api/queue/status`, R-2), HistoryTable. V-M-BATCH. Поток DF-WATCH.

### Phase-6 — Настройки + онбординг

**M-SETTINGS** — `src/components/settings/*`. Deps: M-STORES, M-UI. ModelSettings (модель; GPU фиксирован,
  показать только), OutputSettings (папка/форматы), HfTokenSettings (`config:set/clear-hf-token`,
  показывать только статус), General (язык/тема/порт). V-M-SETTINGS.

**M-ONBOARDING** — `src/components/onboarding/*`. Deps: M-API-CLIENT, M-STORES, M-UI.
- FirstRunWizard (`firstRun=true`): шаги — проверка `GET /api/health` (FFmpeg/CUDA; при отсутствии CUDA —
  явная ошибка, не падение), ввод HF-токена, загрузка моделей с прогрессом по WS, `firstRun=false`.
  V-M-ONBOARDING. Поток DF-ONBOARD. **Здесь нужен R-1** — сигналь контроллеру до старта.

### Phase-7 — Экспорт + ошибки + тесты + CI
- React error boundary; единый маппинг `ErrorCode`→человекочитаемые сообщения (i18n); toasts.
- DOCX уже на backend (M-FORMAT) — проверить сквозной путь.
- Поднять покрытие; **GitHub Actions CI**: `pytest` + `npm run typecheck && npm test` (без GPU).
  write-scope: `.github/workflows/ci.yml`, error-boundary компонент, доводка тестов.

### Phase-8 — Упаковка (см. technology.xml → Packaging, M-PACKAGING)
- `scripts/build.ps1`: создать `.venv` через **uv** (**torch cu124 ДО pyannote**, затем nvidia-cudnn/cublas),
  `uv.lock`; собрать renderer/main (electron-vite); `electron-builder` с `extraResources`:
  `python/`(=.venv) + `backend/`. `electron-builder.yml`: target nsis x64, win.
- DoD: smoke на чистой Windows+GPU (VF-CLEAN-INSTALL): bundled-python стартует, `torch.cuda.is_available()`,
  CTranslate2 видит cuDNN, транскрибация проходит. Маркер `[Packaging][build_venv][BLOCK_INSTALL_WHEELS]`. V-M-PACKAGING.

---

## 4. Definition of Done (общая для каждого пакета)
- [ ] Контракт `M-<ID>` прочитан; код ему соответствует; GRACE-разметка на месте.
- [ ] `npm run typecheck` без ошибок; тесты модуля + `npm test` зелёные (ML/Electron мокаются).
- [ ] Критические ветки логируют `[Module][fn][BLOCK]`, совпадающие с `required-log-markers` в V-M.
- [ ] Секреты не залогированы; инварианты не нарушены.
- [ ] `GraphDelta` + `VerificationDelta` возвращены контроллеру (он вливает в docs/*.xml).
- [ ] `CHANGE_SUMMARY` при правке существующего кода.

## 5. Карта зависимостей (порядок безопасной сборки)
```
PKG-SCAFFOLD → M-SHARED → {M-UI, M-I18N}
M-SHARED → M-CONFIG-STORE → M-PY-MANAGER → M-PRELOAD → M-IPC → M-MAIN
M-SHARED → M-STORES → M-API-CLIENT → M-APP-SHELL → {M-UPLOAD, M-RESULTS}
M-CONFIG-STORE → M-WATCHER → M-SCHEDULER → M-BATCH(+IPC/MAIN доводка)
{M-STORES,M-UI} → M-SETTINGS ; {M-API-CLIENT,M-STORES,M-UI} → M-ONBOARDING (требует R-1)
всё → Phase-7 (CI/ошибки) → M-PACKAGING (Phase-8)
```
> Полный граф рёбер — `docs/knowledge-graph.xml` (`CrossLink`). Полные критерии — `docs/verification-plan.xml`.
