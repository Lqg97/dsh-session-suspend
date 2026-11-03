# 需求：ui-workspace 增加「工作区行」扩展槽位与工作区级挂起状态

> 提出方：本地插件 `@local/dsh-session-suspend`（本目录）
> 目标包：`@deepseek-ai/dsh-client-ui-workspace`（当前安装版本 `0.2.1-rc.5`），必要时含 `@deepseek-ai/dsh-api-workspace-controller` / `@deepseek-ai/dsh-workspace`
> 结论：会话级挂起已经能用增量槽实现；**工作区级挂起（整组收起/恢复）当前无扩展点**，需要上述两个包配合。

## 0. 一句话

Session 行有 `sidebar.workspaces.session.menu.item` / `.row.action` 两个增量插槽，**工作区分组行没有对应插槽**，Host 也没有工作区级归档/收起状态；请补 ① 工作区行的菜单与悬停按钮插槽，②（推荐）工作区级挂起状态或在列表派生阶段可用的「工作区可见性」扩展。

## 1. 背景

本插件已经用宿主提供的增量槽实现了会话级挂起：

- 挂起：`uiWorkspace.archiveSession(sessionId)` + 本地记录，宿主默认归档筛选把行移出列表；
- 折叠组：`sidebar.footer.action` 里一个「已挂起 N」按钮，展开后逐个/整批恢复；
- 入口：`sidebar.workspaces.session.menu.item`（菜单 420）与 `sidebar.workspaces.session.row.action`（悬停按钮 90）。

用户现在希望对**工作区（侧边栏分组）**提供同样的能力：「把整个工作区收进挂起组，需要时整组恢复」。缺少扩展点导致插件无法实现。

## 2. 现状取证（0.2.1-rc.5）

| 事实 | 依据 |
| --- | --- |
| `sidebar.workspaces` 由 `ui-sidebar` 声明、`ui-workspace` 注册（single，`replaceRisk: shadows-shipped-ui`），内部含区头、搜索、分组/平铺列表与全部工作区对话框 | client slot catalog：`Slots.listSubTree` 的 `sidebar.workspaces` 条目 |
| 它声明的子槽全部面向 Session 行：`sidebar.workspaces.session.menu.item`、`sidebar.workspaces.session.row.action`、`sidebar.workspaces.directoryFlow`、`sidebar.session.row.leading`、`sidebar.session.row.hover` | 同上，子槽列表 |
| 工作区行自带「...」菜单（`rename`、`delete` 两项在包内内联构造）与行尾「新会话」悬停按钮，折叠交互也在包内；**没有 slot 出口** | `ui-workspace/lib/client.js`：`MenuItems = [{id:"rename"},{id:"delete"}]`、`actions.newSession` 按钮 |
| Client 服务 `workspaces` 只有 `create/rename/delete/archiveSession/unarchiveSession/insertSessionBefore`；`uiWorkspace` 同样只到会话粒度 | client Service 目录 |
| 直接替换 `sidebar.workspaces` 不可行 | `replaceRisk: shadows-shipped-ui`：会丢掉搜索、分组方式、拖拽排序、水线、归档筛选、工作区树、目录流 |

补充：工作区本身已支持**折叠**（点分组标题展开/收起，宿主记住状态），所以「把工作区收起来」原生存在；缺的是「挂起」——收进可恢复的组、并且有宿主状态可查询。

## 3. 需求

### R1（必须）`sidebar.workspaces.workspace.menu.item`

- `kind: list`，`scope: root`；
- ownerProps 建议：

  ```ts
  /** Owner share of one Workspace row action occurrence. */
  export interface WorkspaceRowOwnerProps {
    /** 行对应的工作区。 */
    workspaceId: WorkspaceId
    /** 行显示标题（自建标题优先，其次目录名）。 */
    displayTitle: string
    /** 工作区目录。 */
    path: string
    /** 当前工作区内会话数（含已归档；供插件决定批量动作的可见文案）。 */
    sessionCount: number
  }
  ```

- 注册项选项与 session 菜单保持一致：`id`（必填）、`order`、`label`；
- `slotInject` 需要关闭菜单的能力，与 session 菜单同构：

  ```ts
  slotInject: {
    hooks: {
      menuOpenState: SlotHookFactory<'sidebar.workspaces.workspace.menu.item', UseMenuOpenState>
    }
  }
  ```

- 渲染契约（与 session 菜单一致）：条目自行渲染一个 `role="menuitem"` 按钮；键盘 ↑/↓ 与焦点返回按 DOM 走；条目自己决定显隐、自己带浮层；文案走贡献包 locale。
- 内置行建议 id / order：`new-session`(100)、`rename`(200)、`delete`(300)，插件行 `order ≥ 400`；同一 id 不同 `priority` 可遮蔽内置行（与 session 菜单规则一致）。
- 声明方式：在 WorkspaceBrowser 条目的 `children` 里声明（声明即认领），插件侧用 `ctx.slots.inject` 注册。

### R2（必须）`sidebar.workspaces.workspace.row.action`

- `kind: list`，`scope: root`，ownerProps 同 R1（可只保留 `workspaceId` / `displayTitle`）；
- 渲染契约：工作区行尾悬停按钮条里的一个图标按钮；点击不触发行导航（同 session 的 strip 行为）；
- 内置行建议 id / order：`new-session`(100)，插件行 `order ≥ 200`。

### R3（可选）`sidebar.workspace.row.leading`

- 行首 16px 装饰位，语义同 `sidebar.session.row.leading`，用于给「已挂起」工作区行一个标记（月亮/暂停点）。

### R4（关键，二选一）工作区级挂起状态

只有 R1/R2 时，插件最多做到「批量归档该工作区所有会话」：工作区标题行仍会渲染（宿主对空分组也保留组头），达不到「整组收起」。两种做法请择一：

**R4a（推荐，宿主状态）**

- `WorkspaceView` 增加 `suspendedWorkspaceIds: readonly WorkspaceId[]`，持久化到 Workspace Controller，并随 `follow()` 增量帧下发（新帧类型 `suspended`，与 `archived` / `pinned` 同构）；
- 默认归档筛选下：挂起工作区**只渲染组头**（带「已挂起 N 个会话」与恢复入口），不渲染成员行；或整组不渲染，由插件在自己的折叠组里提供「显示已挂起工作区」；
- Client 新增：`suspendWorkspace(workspaceId, options?: { stopActivity?: boolean })` / `resumeWorkspace(workspaceId)`，以及标准 hook `useWorkspaceSuspended`（或 hub 上 `hooks: { suspendedWorkspaces }`）；
- 活动工作拒绝：建议复用会话归档的语义——不带 `stopActivity` 时若工作区内仍有运行中的工作则拒绝，错误码建议 `workspace/workspace-active`（details 列出 `turn` / `subagent` / `job` / `schedule` 家族）。

**R4b（最小改动，客户端状态）**

- 不引入 Host 协议，只把列表派生需要的本地视图操作开放给插件，例如：

  ```ts
  // 标准 hooks / 视图操作
  useWorkspaceExpansion: (selector) => ...
  setWorkspaceExpanded(workspaceId: WorkspaceId, expanded: boolean): void
  ```

  插件据此自己维护挂起集合（localStorage）并在挂起时把工作区折叠；
- 缺点：挂起不是宿主状态，搜索、其他设备、其他入口都看不到；优点：纯客户端、无协议风险。

### R5（可选，低优先级）派生阶段过滤注册表

若不想引入「挂起」概念，可提供一个 additive 的注册表：`ctx.workspaces.registerGroupFilter((workspace) => 'shown' | 'hidden')`，由插件决定某个工作区是否参与列表派生。多插件顺序与冲突需要定义，风险高于 R1/R4b，仅作备选。

## 4. 兼容性与风险

- R1/R2/R3 都是 additive list slot、`replaceRisk: none`；没有注册项时行为与当前版本完全一致。
- R4a 涉及 Host 协议与持久化（schema 版本、follow 增量帧、错误码），建议作为独立 minor 特性；`suspendedWorkspaceIds` 默认空数组，升级后无行为变化。
- R4b 只有客户端改动，但「挂起」变成浏览器本地状态。
- R5 会改动列表派生主路径，建议放最后。

## 5. 验收标准

1. `cordis_inspect_query`（client `Slots`）能查到 R1/R2 两个槽及 ownerProps / standardProps，`replaceRisk: none`。
2. 一个最小插件注册 R1 一行后：工作区行「...」菜单出现该行，点击执行、菜单关闭、↑/↓ 键盘可达、中英文标签跟随 locale。
3. R2 按钮出现在行尾悬停条，点击不触发行导航。
4. 三种视图下都不报错且行为一致：分组方式=按工作区 / 按工作区树、单一列表（搜索替代列表）、归档筛选三档。
5. 若实现 R4a：挂起后刷新页面仍保持；默认筛选下不渲染成员行；恢复后成员顺序不变；运行中工作被拒绝时错误码与 details 结构稳定。
6. 槽缺失的旧版本上，插件 `ctx.slots.inject` 不注册、页面无异常（本插件已在 0.2.1-rc.5 上按此模式运行）。

## 6. 拿到槽位后的插件接入草图

```js
// 工作区行菜单：挂起 / 恢复
ctx.slots.inject('sidebar.workspaces.workspace.menu.item', () => ctx.slots.register({
  name: 'sidebar.workspaces.workspace.menu.item',
  id: 'session-suspend.workspace',
  order: 400,
  locale: NS,
  inject: () => ({ suspendWorkspace, resumeWorkspace }),
}, WorkspaceSuspendMenuItem))
```

```ts
type WorkspaceSuspendMenuItemProps =
  PropsRuntime<'sidebar.workspaces.workspace.menu.item'> // workspaceId, displayTitle, path, sessionCount
  & PropsLocale<typeof NS>
  & InjectFace<{
      suspendWorkspace(workspaceId: WorkspaceId): void
      resumeWorkspace(workspaceId: WorkspaceId): void
    }>
  & { useMenuOpenState: UseMenuOpenState }
```

R4b 路线的接入：菜单项里调用 `setWorkspaceExpanded(workspaceId, false)` 并把 workspaceId 记入本地挂起集合，底部折叠组按工作区分组列出、逐组恢复时 `setWorkspaceExpanded(workspaceId, true)`。

## 7. 可直接贴的 issue 摘要

> `dsh-client-ui-workspace` 给 Session 行提供了 `sidebar.workspaces.session.menu.item` / `.row.action` 两个 additive slot，但**工作区分组行没有任何插槽**，Host 也没有工作区级归档/收起状态，插件无法实现「工作区挂起（整组收起、可整组恢复）」。
>
> 请新增：
> 1. `sidebar.workspaces.workspace.menu.item`、`sidebar.workspaces.workspace.row.action`（list / scope root；ownerProps 给 `workspaceId` / `displayTitle` / `path` / `sessionCount`；菜单槽带 `menuOpenState` hookContext，规则与 session 行槽一致，内置行 id/order 建议 `new-session`100 / `rename`200 / `delete`300 / `new-session`(按钮)100）；
> 2. （推荐）Workspace Controller 增加 `suspendWorkspace` / `resumeWorkspace` 与持久化的 `suspendedWorkspaceIds`（follow 增量帧同 `archived` / `pinned`），默认筛选下收起成员行、只留组头；或退而求其次，暴露 `setWorkspaceExpanded` 等列表视图操作供插件自管状态。
>
> 两类槽均为 additive（`replaceRisk: none`），未注册时行为不变。
