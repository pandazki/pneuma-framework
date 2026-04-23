# ToolJet 深度调研 — pneuma-framework 视角

调研版本：ToolJet commit `8ce1dcc`（`git log -1` at `~/Codes/tmp/tooljet`，shallow clone）。
本报告引用路径均相对 ToolJet 仓库根。行号取自该 commit。

---

## TL;DR

1. **ToolJet 是一个非 AI-native 的 Retool 克隆，但正在用 EE-only 的 "TooljetAi" 把 AI 当功能补丁贴在拖拽式 Builder 上**。CE 仓库里的 `AiService` / `AgentsService` / `GraphService` 全部 `throw new Error('not implemented')`（`server/src/modules/ai/service.ts:8-34`），真逻辑在 EE 版本。Pneuma 所押的赌注（"对话是第一公民、不是侧边栏"）在 ToolJet 这里得到**反证式印证**——它用十来个 AI FEATURE_KEY 去对齐十来个 AI 用例（生成 Component、生成 Query、生成 BusinessLogic、生成 EntireApp…），说明一旦要做 AI 构建，就必须枚举所有领域动作。pneuma 把它们收敛到 Operation 这一层抽象上是对的。
2. **pneuma 必须补的 1 点：`app_history` 的 snapshot+delta 落盘协议**。ToolJet 用 Postgres jsonb 行、snapshot-every-10 + JSON-Patch delta + 保留最近 11 组（110 行）构建了一个不依赖 git 的 rollback 存储（`server/src/modules/app-history/constants/index.ts:43-55`；`server/src/modules/app-history/repository.ts:109-184`），还带了 `is_ai_generated` 字段（`server/src/entities/app_history.entity.ts:60`）。ADR-0017 说了"shadow-git"这一条术语，但没有 bake 下 retention / pruning / patch 类型的可落盘 schema，ToolJet 的版本可以直接拿来做 v1 的落地。
3. **pneuma 因 AI-native 能显著胜出的 1 点：Operation 作为 UI/Agent 双绑定的 single primitive（ADR-0018）**。ToolJet 的事件 action 是 FE 硬编码的 ~30 条 `switch (event.actionId)` 分支（`frontend/src/AppBuilder/_stores/slices/eventsSlice.js:514-1210`），全部只存在于浏览器、服务端不知情；"confirmation before run" 是 Builder 手动勾的一个 checkbox 标志（`frontend/src/AppBuilder/QueryManager/constants.js:47-52`），不是 policy/destructive 自动派生的。pneuma 的 Operation 声明天然让 "UI 按钮 / Agent tool / audit event / confirm 门槛 / policy check" 从同一条声明派生，是 ToolJet 这种非 AI-native 产品**即便想补也补不上**的结构性优势——因为 Builder 是人，不是能读 schema 的 Agent。

---

## 0. 调研方法与代码指针

**克隆**：`git clone --depth 1 https://github.com/ToolJet/ToolJet ~/Codes/tmp/tooljet`；head 为 `8ce1dcc`（PR #16056，slack-notify 相关，无关代码）。

**仓库形态**（相对根）：

| 顶层目录 | 作用 | 本次关注度 |
|---|---|---|
| `server/` | NestJS + TypeORM 后端 | **核心** |
| `server/src/modules/` | 60+ NestJS 模块（功能域切片） | **核心** |
| `server/src/entities/` | TypeORM entity，是 DB schema 的 SoT | **核心** |
| `plugins/packages/` | 47 个数据源 plugin（独立 npm 包） | **核心**（Adapter 对标） |
| `plugins/packages/common/lib/` | `QueryService` 接口、OAuth、错误类型 | **核心** |
| `frontend/` | React + Zustand Builder / Viewer | 浅看（action dispatcher、AI sidebar 位置） |
| `frontend/src/AppBuilder/` | Builder 主树 | 浅看 |
| `frontend/src/AppBuilder/Viewer/` | Viewer 主树（End-User 侧） | 浅看 |
| `server/templates/` | 66 个预打包 app 模板（manifest + definition.json） | 验证模板机制 |
| `server/ee/` | EE-only 代码。**在本仓库是空的** | 无实质内容 |
| `docker*`, `deploy/`, `terraform/`, `cli/` | 部署 / CLI | 跳过 |

**EE 空洞**：CE 仓库里 `server/ee/` 实际为空，EE 类逻辑通过 `@InitFeature(FEATURE_KEY.X)` 装饰器 + 运行期 license 注入实现（典型例：`server/src/modules/ai/controller.ts:10-70` 所有端点全返回 `NotFoundException`）。**这意味着 AI 相关的具体实现我们看不到**，但能看到实体 schema、Controller 接口、FEATURE_KEY 清单——这一层已足以推断出 AI 的形态。

**引用约定**：`路径:行号`；长文件只引用关键段落。

---

## 1. 产品定位与角色模型（A）

### 1.1 三种角色在 schema 里是硬编码的

`server/src/modules/group-permissions/constants/index.ts:8-18`：

```ts
export enum USER_ROLE {
  END_USER = 'end-user',
  ADMIN = 'admin',
  BUILDER = 'builder',
}
```

ToolJet **就叫** "End-user / Builder / Admin"，跟 pneuma 的 Builder / End-User 术语基本对齐。Builder 能创建/删除 app、workflow、data source、org constants、folders；End-User 全部为 false。这与 pneuma-framework 在 CLAUDE.md 描述的"Builder 创建 / End-User 消费"是同一套心智模型。

### 1.2 Builder 和 End-User 走不同前端入口

FE 有两个完全独立的 React 树：

- **Builder** UI：`frontend/src/AppBuilder/` —— 包含 `QueryManager/`, `LeftSidebar/`, `CodeEditor/`, `Widgets/`
- **End-User** UI：`frontend/src/AppBuilder/Viewer/` + `frontend/src/Editor/Viewer/` —— 典型组件 `Viewer.jsx` 287 行，只渲染 `<AppCanvas>` + header/nav；**没有编辑态工具**。

这对 pneuma 的 ADR 是一个**强印证**：Builder/End-User UI 物理分离比运行时权限开关更稳健，这也是 pneuma-app-template 里 `dev.sh` / Release 产出的心智模型。

### 1.3 Builder 的创建流：拖拽 + AI（EE-only 且后加）

核心创建流是**拖拽**，**直接编辑 JSON 不是正式流**。但 ToolJet 近两年补了个"AI Builder"入口：

- `frontend/src/modules/AiBuilder/` —— 整个模块只有 `index.js` + `CreateAppWithPrompt.jsx`，CE 里只是一个 `withEditionSpecificComponent(..., 'AiBuilder')` 的空 stub（`frontend/src/modules/AiBuilder/components/CreateAppWithPrompt/CreateAppWithPrompt.jsx:4-6`）
- `frontend/src/AppBuilder/LeftSidebar/TooljetAi/index.jsx` —— 空 stub，同样 EE-only
- App entity 上埋了专用字段：`server/src/entities/app.entity.ts:72-104`

```ts
@Column({ name: 'is_initialised_from_prompt', default: false })
isInitialisedFromPrompt: boolean;

@Column({ name: 'app_generated_from_prompt', default: false })
appGeneratedFromPrompt: boolean;

@Column({ type: 'enum', enum: ['ai', 'visual'], default: 'visual' })
appBuilderMode: string;

@Column({ name: 'ai_generation_metadata', type: 'jsonb', nullable: true })
aiGenerationMetadata: {
  steps: { name; id; loadingStates }[];
  appInitialisationPrompt?: string;
  appName?: string;
  completedSteps: string[];
  activeStep: string;
  dataSource: { kind; name; id };
};
```

这是一个**逆向印证 pneuma 路线正确**的证据：ToolJet 给 App 加了 `appBuilderMode: 'ai' | 'visual'` 的枚举——承认 AI 构建和视觉构建是两种独立模式，但**架构上它是补丁**（visual 是 default）；pneuma 把 AI 构建直接当 default。

### 1.4 "app" artifact 形态：一个 jsonb 巨 blob + 若干边表

`server/src/entities/app_version.entity.ts:35-42`：

```ts
@Column('simple-json', { name: 'definition' })
definition;

@Column('simple-json', { name: 'global_settings' })
globalSettings;

@Column('simple-json', { name: 'page_settings' })
pageSettings;
```

App 的主体是 `app_versions.definition` 这个 JSON，外加:

- `pages` → `components` → `component_permissions` / `layouts` 的关系表（`server/src/entities/page.entity.ts`、`component.entity.ts:18-67`）
- `data_queries.options` 也是 simple-json（`server/src/entities/data_query.entity.ts:29`）
- `event_handlers.event` 是 simple-json（`server/src/entities/event_handler.entity.ts:31-38`）

也就是说 **ToolJet 是 "jsonb blob + 若干规整边表" 的混合策略**，不是完全 JSON 也不是完全 relational。Export/import 通过模板系统实现（`server/templates/*/definition.json`，每个模板的 definition.json 是一个巨大的静态 JSON——`admin-panel-tooljet-db/definition.json` 就有 54420 行）。Git sync 通过 `app_git_sync` 表（`server/src/entities/app_git_sync.entity.ts:15-72`）把 `last_commit_id` / `git_version_id` 等元数据和 App 关联起来，由 EE 的 GitSync 模块推拉到外部 git 仓库。

**对 pneuma 的启示**：
- 不必避讳 jsonb blob——ToolJet 这种大厂产品就大量用；关键是**围绕它建 rollback / delta / 导入导出**的机制，这方面它做得很成熟（见 §7）。
- "Export 为 JSON 模板" 是 ToolJet 实际复用的路径，pneuma-app 的"fork for template"也应该走同一条。

---

## 2. 数据模型（B，对标 ADR-0002）

pneuma ADR-0002 把 **typed cells**（封闭类型集）定为 first-class primitive。ToolJet 怎么做？

### 2.1 ToolJet 有内置 storage：ToolJet Database（TJDB）

不像大多数 BI / low-code 工具把所有数据都推给 data source，ToolJet 内置了一个 **"ToolJet Database"** 作为一等公民的 data source（kind = `tooljetdb`，`frontend/src/AppBuilder/QueryManager/constants.js:7`）。

实现：
- 每个 org 有独立的 pg role + schema（`server/src/entities/organization_tjdb_configurations.entity.ts:20-25`: `pg_user`, `pg_password`）
- Table metadata 存在 `internal_tables` 表（`server/src/entities/internal_table.entity.ts:14-35`），真正的行数据直接落在 Postgres 物理表
- 读写走 **PostgREST** proxy（`server/src/modules/tooljet-db/services/postgrest-proxy.service.ts`）—— 这是他们最大的一个架构决策：**不自己写 CRUD，让 PostgREST 把 schema 暴露成 REST，自己做薄 proxy**

### 2.2 类型系统：封闭、但极小

`server/src/modules/tooljet-db/types.ts:4-15`：

```ts
export const TJDB = {
  character_varying: 'character varying',
  integer: 'integer',
  bigint: 'bigint',
  serial: 'serial',
  double_precision: 'double precision',
  boolean: 'boolean',
  timestampz: 'timestamp with time zone',
  jsonb: 'jsonb',
};
export type TooljetDatabaseDataTypes = (typeof TJDB)[keyof typeof TJDB];
```

**只有 8 种类型**，其中一半是数字变体，没有 Email / URL / Enum / File / User reference / Currency 等 semantic type。**所有领域语义都被 character_varying + jsonb 兜住**。

这和 pneuma ADR-0002 的设计方向形成**鲜明反差**：
- ToolJet 的类型 = Postgres 物理类型，Builder 能碰到的所有 "email validation / phone validation" 在 FE 的 `component.validation` 字段里（`server/src/entities/component.entity.ts:49-50`）是 UI 层正则，不是 storage primitive。
- pneuma 要的 typed cell（Email / URL / Currency / FileRef）是 **semantic** 级的——它让 Agent 能知道"此列是 email 所以应该用 email 校验 + 收件地址 adapter"。

**判断**：ToolJet 这条路是把 storage 压到 Postgres 原生、把 semantic 丢给 UI/Builder 去补。pneuma 选择 semantic types 是**正确且独特**的决策。但 ToolJet 证明：**底层落盘必须有封闭物理类型集**——pneuma typed cell 需要一个到 SQL 物理列 / Postgres jsonb path 的 canonical 映射表，这一层 pneuma v0 spec 里可能还没写清。

### 2.3 关系：first-class，和 pneuma Ref primitive 对齐

`server/src/modules/tooljet-db/types.ts:31-40`：

```ts
export type TooljetDatabaseForeignKey = {
  column_names: string[];
  referenced_table_name: string;
  referenced_column_names: string[];
  on_update: string;
  on_delete: string;
  constraint_name: string;
  referenced_table_id: string;
};
```

- **支持 composite FK**（`column_names` 是数组）
- **支持 on_update / on_delete**（CASCADE / SET NULL / ...）
- 存在 `join_tables` 专属 operation（`server/src/modules/tooljet-db/services/tooljet-db-data-operations.service.ts:56-57`）

对 pneuma Ref primitive 是强印证：**关系必须是第一公民**，不是 "用 string column 存个外键 id 约定俗成"。

### 2.4 Builder 能直接改 schema（但粒度粗）

`server/src/modules/tooljet-db/types.ts:61-77`：

```ts
export type TooljetDbActions =
  | 'add_column' | 'create_foreign_key' | 'create_table'
  | 'delete_foreign_key' | 'drop_column' | 'drop_table'
  | 'edit_column' | 'edit_table' | 'join_tables'
  | 'update_foreign_key' | 'view_table' | 'view_tables'
  | 'sql_execution' | 'bulk_upload' | 'proxy_postgrest'
  | 'bulk_upsert_with_primary_key';
```

这是 TJDB 的**语义动作词表**——Builder 对话里说"加一列"，就对应到 `add_column`。pneuma ADR-0018 (Operations as Primitive) 会喜欢这个词表：**它已经证明"schema 修改也可以被离散化成有限动词"**，不必把自由 SQL 作为 Builder 操作的唯一接口。

但 ToolJet 这个词表还停留在"后端 action 路由"层面，没有对应的 Agent tool 直接注册——还是 REST endpoint + FE 按钮。

---

## 3. 权限模型（C，对标 ADR 0006-0011）

### 3.1 从 "粗粒度 AppGroupPermission" 演化到 "Granular + 每资源用户表"

ToolJet 权限有**两代 schema 并存**。老代已被明确标记 DEPRECATED（`server/src/entities/group_permission.entity.ts:21-30` 顶部有巨大 ASCII 框框写 "DEPRECATED"）：

- 老代：`group_permissions`（全局 boolean 开关）+ `app_group_permissions`（app 级 read/update/delete）——粗粒度 RBAC
- 新代：`permission_groups`（`server/src/entities/group_permissions.entity.ts:21-90`） + `granular_permissions`（`server/src/entities/granular_permissions.entity.ts:17-57`） + `apps_group_permissions`（`server/src/entities/apps_group_permissions.entity.ts:18-66`）

新代的 `apps_group_permissions` 关键字段：

```ts
@Column({ name: 'can_edit' })
canEdit: boolean;
@Column({ name: 'can_view' })
canView: boolean;
@Column({ name: 'hide_from_dashboard' })
hideFromDashboard: boolean;
@Column({ name: 'can_access_development' })
canAccessDevelopment: boolean;
@Column({ name: 'can_access_staging' })
canAccessStaging: boolean;
@Column({ name: 'can_access_production' })
canAccessProduction: boolean;
@Column({ name: 'can_access_released' })
canAccessReleased: boolean;
```

**重要观察**：Dev/Staging/Prod/Released 的**环境权限**是**和资源权限同 schema 表达**的——这不是 pneuma ADR-0009 (default posture) 和 ADR-0016 (dev-prod isolation) 目前交叉考虑到的维度。

### 3.2 粒度：到 page / query / component 级，但无行级 / 列级

ToolJet 对 App 内部的资源做了 "三级粒度"：

- **Page 级**：`page_permissions` + `page_users`（`server/src/entities/page_permissions.entity.ts`）
- **Query 级**：`query_permissions` + `query_users`（`server/src/entities/query_permissions.entity.ts:7-29`）
- **Component 级**：`component_permissions` + `component_users`（`server/src/entities/component_permissions.entity.ts:7-29`）

所有三类 permission 表结构几乎一模一样，区别只是 foreign key 指向。`type` 字段是枚举：

`server/src/modules/app-permissions/constants/index.ts:1-5`：

```ts
export enum PAGE_PERMISSION_TYPE {
  SINGLE = 'SINGLE',  // 单个用户可访问
  GROUP = 'GROUP',   // 某 permission group 可访问
  ALL = 'ALL',       // 所有人可访问
}
```

**行级 / 列级权限则完全没有**——这是 ToolJet 相对 nocodb 的一个明显退步（nocodb 有 per-row filter-based permission）。对 pneuma ADR-0006（granularity）有警示：**TJDB 的 row/column 权限靠 Postgres 原生 `has_table_privilege`**（`server/src/modules/tooljet-db/services/tooljet-db-data-operations.service.ts:548-554`）**直接交给 PG 去检查**。这是一条备选路径但绑死 Postgres。

### 3.3 规则表达形式：CASL ability + 外部 service 决策

`server/src/modules/casl/abilities/apps-ability.factory.ts:15-47`：

```ts
@Injectable()
export class AppsAbilityFactory {
  constructor(private abilityService: AbilityService) {}

  async appsActions(user: User, id?: string) {
    const { can, build } = new AbilityBuilder<...>(Ability as ...);
    const userPermission = await this.abilityService.resourceActionsPermission(
      user, { organizationId: user.organizationId,
              ...(id && { resources: [{ resource: MODULES.APP, resourceId: id }] }) }
    );
    const userAppPermissions = userPermission?.[MODULES.APP];
    const appUpdateAllowed = userAppPermissions?.isAllEditable
      || userAppPermissions?.editableAppsId.includes(id);
    const appViewAllowed = appUpdateAllowed || userAppPermissions?.isAllViewable
      || userAppPermissions?.viewableAppsId.includes(id);

    if (appViewAllowed || superAdmin) can(APP_RESOURCE_ACTIONS.VIEW, App);
    can(APP_RESOURCE_ACTIONS.VIEW, App, { isPublic: true });
    return build({ detectSubjectType: ... });
  }
}
```

规则**不是一份声明式 DSL**，而是代码里的 AbilityBuilder 调用 —— 每个资源类型一个 factory，服务器端 runtime compile。**CASL 自带了"根据已 build 的 rules 反向解释"能力**，比如 `ability.cannot('update', app)` 会返回 rule 源，但实际上 ToolJet 没有一个地方给 Builder "为什么 Bob 不能编辑这个 app" 的解释面板。

对 pneuma ADR-0007（Permission DSL）和 ADR-0008（NL bidirectional）：
- ToolJet 选的 **CASL + TS code** 比 pneuma 押注的"YAML + predicate DSL"更不对 Agent 友好——CASL 没有自然语言双向解释。
- pneuma 不应该照抄 CASL；方向是对的。

### 3.4 默认姿态：`is_public: true`

`server/src/entities/app.entity.ts:44`：

```ts
@Column({ name: 'is_public', default: true })
isPublic: boolean;
```

**ToolJet 新建 App 默认 public！** 这是一个很重要的产品选择——"low-code 工具对内网管理员"场景下 public-by-default 减少摩擦。pneuma ADR-0009 的立场是"restricted by default"；ToolJet 的对比说明：**对 pneuma-app-template 里 archetype 为 'public tool' 的情形**（例如 webcraft），模板可以显式声明 default posture，而不是框架一刀切。建议 ADR-0009 amend：default posture 应成为 template 声明。

---

## 4. 表达式与查询（D，对标 ADR-0019/0020）

### 4.1 没有统一 expression AST

ToolJet 的 filter / expression **按使用场景各用各的**：

| 使用点 | 表达形式 | 位置 |
|---|---|---|
| TJDB `list_rows` filter | `{key: {column, operator, value, order, jsonpath}}` 扁平对象 | `tooljet-db-data-operations.service.ts:664-684` |
| TJDB filter → PostgREST | URL query 字符串 `col=eq.value` | `server/src/helpers/postgrest_query_builder.ts` |
| SQL query (postgresql plugin) | 原生 SQL + `:param` 占位 | `plugins/packages/postgresql/lib/index.ts:150-157` |
| Event handler trigger | `event: any`（jsonb blob） | `server/src/entities/event_handler.entity.ts:31-38` |
| FE 模板表达式 | CodeMirror + 自己的 `{{ ... }}` 模板解析 | `frontend/src/AppBuilder/CodeEditor/` |
| 权限规则 | CASL `MongoAbility`（MongoDB 语法的 JSON query） | `casl/abilities/` |

**过滤器 AST 只在 TJDB 这一条路径存在**（搜 `where_filters` 全仓库只命中 `tooljet-db-data-operations.service.ts`）。Pneuma ADR-0019 要求**一个 WhereClause AST 跨 query / permission / hook 复用**，ToolJet 证明："不复用"是默认路径，谁都能活下来，但**同一个 Builder 概念（"某用户看到的东西"）在 ToolJet 里要用至少 3 种语法描述一遍**（TJDB filter、RESTapi query params、CASL rule），对非程序员 Builder 是巨大的学习负担，对 Agent 是不可能完成的任务。

这正是 pneuma 的 AI-native 押注：**一份 WhereClause AST，Agent 写一次跨所有面复用。** ToolJet 的碎片化在没有 Agent 的世界里勉强能活；有了 Agent，它就是一个结构性限制。

### 4.2 PostgREST filter builder（TJDB 用的 DSL）

`server/src/helpers/postgrest_query_builder.ts:1-177` 提供了完整的 PostgREST 查询参数封装：

```ts
eq(col, v) { append(col, `eq.${v}`); }
neq(col, v) { ... }
gt/gte/lt/lte(col, v) { ... }
like/ilike(col, pattern) { ... }
is(col, v)                // null / not null
in(col, values)
contains/containedBy(col, v)
rangeLt/Gt/Gte/Lte/Adjacent(col, range)
overlaps(col, v)
textSearch(col, q, {config, type})  // ts/fts
or(filters, {foreignTable})         // 跨表 OR
not(col, v, operator)
```

**这是一个接近完整的 WhereClause 算子集**，和 nocodb 的 filter 很像。ToolJet 有实现但**没把它抽象成 AST**——它只是 fluent builder，最后输出 URL 字符串。pneuma ADR-0019 的算子集可以直接参照这个。

### 4.3 CurrentUser 注入：没有统一机制

FE 的 `{{currentUser.email}}` 模板字符串通过 Zustand state 注入。后端 permission 检查里没看到 currentUser-based row filter（因为没有行级权限）。workflow context 在 `queryService.run(... , context: { user?: User; app?: App })` 里（`plugins/packages/common/lib/query_service.interface.ts:5-13`），**但这个 context 只用于 OAuth token 注入**（`plugins/packages/common/lib/oauth.ts:123-147`），不用于 filter 改写。

对 pneuma ADR-0019 的 currentUser 语义：ToolJet 证明**缺这一层就会让 per-user 视图不可能 at the storage level**。pneuma 要早定义好这条语义。

---

## 5. UI↔Action 绑定（E，对标 ADR-0018 —— **最关键章节**）

ADR-0018 的核心承诺：**Operation 是一个 first-class primitive，UI 按钮 / Agent tool / audit event / permission check / confirm 门槛，从同一份声明派生**。

ToolJet 几乎是 ADR-0018 的**反面教材**——它有极其丰富的"UI 按钮 ↔ Backend action"绑定基础设施，但**它从未把 action 抽象成一个统一 primitive**。各个维度完全分开维护。

### 5.1 Event 作为唯一"粘合层"

`server/src/entities/event_handler.entity.ts:1-53`：

```ts
export enum Target {
  page = 'page',
  component = 'component',
  dataQuery = 'data_query',
  tableColumn = 'table_column',
  tableAction = 'table_action',
}

@Entity({ name: 'event_handlers' })
export class EventHandler {
  @Column() name: string;
  @Column() index: number;
  @Column('simple-json') event: any;       // <<< untyped blob
  @Column({ name: 'source_id' }) sourceId: string;
  @Column() target: Target;
  @Column({ name: 'app_version_id' }) appVersionId: string;
}
```

- `event` 是 untyped `simple-json` blob —— 后端**不知道**里面存了什么 actionId / 什么参数
- `target` + `sourceId` 粘连到 UI 元素（page / component / column / table row）
- **后端没有"action 执行引擎"**

### 5.2 真正的 action dispatch 完全在 FE switch statement 里

`frontend/src/AppBuilder/_stores/slices/eventsSlice.js:514-1210` 有一个大约 30 branch 的 `switch (event.actionId)`：

```
show-alert / log-info / log / log-error
run-query / reset-query / logout
open-webpage / go-to-app
show-modal / close-modal
copy-to-clipboard / set-localstorage-value
generate-file / set-table-page
set-custom-variable / get-custom-variable / unset-*
set-page-variable / get-page-variable / unset-*
control-component / toggle-app-mode / switch-page
```

**后果一**：event handler schema 里的 action 清单是 FE 常量，服务端代码里**搜不到** `'show-alert'`。后端绝无可能对某个"用户点了删除"做 policy check 或 audit —— 后端只看到 `run-query(queryId=XYZ)`，不知道这个 query 在业务语义上是 `deleteUser`。

**后果二**：Agent（EE-only 的 AI Builder）在生成 event handler 时，实际上是在生成一个 FE `switch` 能理解的 JSON blob。"Builder 对话说'加一个删除确认'"的实现路径一定是：Agent 生成一条 `actionId: 'run-query', queryId: ...`，再生成一条 Component property `confirm_before_run: true`——**两个独立位点**。这正是 ADR-0018 要消灭的路径分叉。

### 5.3 Confirmation 是 Builder 手动勾的一个 checkbox

`frontend/src/AppBuilder/QueryManager/constants.js:47-52`：

```js
requestConfirmation: {
  dataCy: 'confirmation-before-run',
  action: 'requestConfirmation',
  label: 'Request confirmation before running query',
  translatedLabel: 'editor.queryManager.confirmBeforeQueryRun',
},
```

这是**query-level** property。不基于:
- Policy（未检测到是否 destructive）
- Adapter capability（没有 `"sideEffect: destructive"` 标签）
- User role（不区分 Builder / End-User 的 confirm 需求）

pneuma ADR-0017 和 ADR-0018 想做的是"destructive 的 side-effect **强制** disclosure + confirm"。ToolJet 的方案是**完全交给 Builder 自觉**。如果 Builder 忘了勾，End-User 一点就删。**这就是 pneuma AI-native 能补的缺口之一**——Agent 生成 Operation 时能读 Adapter capability 自动加 confirm，人类 Builder 做不到这件事。

### 5.4 一个动作的完整"从点到写"路径

以"用户点 `DeleteUser` 按钮"为例，ToolJet 的路径是：

1. FE：Component（Button）上挂 event handler JSON，`{ actionId: 'run-query', queryId: 'Q_DELETE_USER' }`
2. FE switch 命中 `case 'run-query':` → 检查 `requestConfirmation` flag → 弹 native confirm（`frontend/src/AppBuilder/_stores/slices/eventsSlice.js:567-615`）
3. FE 发 POST `/api/data_queries/:id/run` → 后端 DataQueriesController
4. 后端查 `data_queries` 表，拿 options，交给对应 plugin 的 `QueryService.run(sourceOptions, queryOptions, ...)`
5. Plugin 执行（比如 postgresql.run 跑 raw SQL `DELETE FROM users WHERE id=:id`）
6. 结果回 FE，触发 `onSuccess` event chain

**整个链路没有 "DeleteUser" 这个名字**——它在后端就是一个 queryId UUID。Audit log 只能记 `resource_type: 'DataQueries', action_type: 'run', resource_id: 'Q_DELETE_USER'`（`server/src/entities/audit_log.entity.ts:17-36`），不能记业务语义 "userA 删除了 userB"。

**对 pneuma ADR-0018 的强化**：Operation 必须是一个有业务名字的 entity——"deleteBookmark" 不仅是 tool 名字，**也是 audit event 名字**。ToolJet 的无名 queryId 方案在 audit / GDPR / trust & safety 这三个维度都站不住脚，这是它 enterprise 上的已知痛点。

### 5.5 Action 复用边界：workflow 和 event handler 是两种语言

ToolJet 有两种自动化：

- **Event handler**（component 事件 → action）：FE switch
- **Workflow**（Temporal-scheduled 或 webhook-triggered 的节点图）：`server/src/modules/workflows/`

两者**不共享 action 定义**。Workflow 有自己的 node types（`workflow_execution_node` / `workflow_execution_edge` 是图存储），event handler 是扁平列表。ADR-0018 的承诺之一"Operation 同时是 workflow 节点"是 ToolJet 没做到的——**这是 pneuma 能领先的另一个维度**。

---

## 6. 集成 / Adapter（F，对标 ADR-0004/0005/0011/0021）

### 6.1 Plugin 就是一个 npm 包 + 两个 JSON schema

`plugins/packages/postgresql/` 结构：

```
lib/
├── index.ts          <- 实现 QueryService
├── manifest.json     <- JSON Schema：sourceOptions 字段定义
├── operations.json   <- JSON Schema：queryOptions UI + 字段
├── types.ts          <- TS 类型
└── icon.svg
package.json           <- 独立 npm 包，可发布
```

**ToolJet 有 47 个**这样的 plugin（从 airtable 到 zendesk）。

### 6.2 QueryService 接口：极简，无 capability

`plugins/packages/common/lib/query_service.interface.ts:5-16`：

```ts
export interface QueryService {
  run(
    sourceOptions: object,
    queryOptions: object,
    dataSourceId?: string,
    dataSourceUpdatedAt?: string,
    context?: { user?: User; app?: App }
  ): Promise<QueryResult>;

  getConnection?(...): Promise<object>;
  testConnection?(sourceOptions): Promise<ConnectionTestResult>;
  invokeMethod?(methodName, ...args): Promise<QueryResult>;
}
```

**关键观察**：
- **没有 capability 声明** —— plugin 不说自己能不能 filter pushdown、能不能 paginate、能不能 schema introspect。
- `queryOptions.operation` 字段是 plugin 私有 string enum，框架不理解。比如 TJDB 有 `list_rows / create_row / update_rows / delete_rows / join_tables / sql_execution / bulk_update_with_primary_key`（`server/src/modules/tooljet-db/services/tooljet-db-data-operations.service.ts:47-71`），而 postgresql plugin 有 `sql / gui` mode + `bulk_update_pkey`（`plugins/packages/postgresql/lib/index.ts:60-82`）。**每个 plugin 都重新发明自己的动作动词**。
- 过滤器也是 plugin 各自表达——没有 "filter AST → plugin translate" 的标准机制。

对 pneuma ADR-0004（Adapter Protocol）和 ADR-0005（Adapter Capabilities）：
- ToolJet 的现状是 ADR-0005 要解决的问题的**清晰案例**：没有 capability，Agent 不知道 "能 pushdown 还是 fetch-all-then-filter"，只能瞎猜。
- pneuma 把 capability 固化是正确选择。

### 6.3 OAuth: 二元模型 multiple_auth_enabled

`plugins/packages/common/lib/oauth.ts:112-147`：

```ts
const isMultiAuthEnabled = sourceOptions['multiple_auth_enabled'];
const tokenData = sourceOptions['tokenData'];
const isAppPublic = context?.app.isPublic;
const userData = context?.user;
const currentToken = getCurrentToken(isMultiAuthEnabled, tokenData, userData?.id, isAppPublic);
```

**两种模式**：
- `multiple_auth_enabled: false` → 单一 token 存在 data source 上（**app-level**，所有用户共用）
- `multiple_auth_enabled: true` → 按 userId keyed 的 token map（**per-user**）

**没有 pneuma ADR-0021 设计的 "admin_delegated" 第三种模式**——"管理员一次 OAuth 授权，之后 Builder 指定哪些查询可以代表哪些 End-User 执行"。ToolJet 只能二选一：要么所有人共享一个 bot account token、要么强制每个 End-User OAuth。

这正是 pneuma ADR-0021 所识别的缺口，且 ToolJet 也没解决——**印证 pneuma 的判断正确**。

### 6.4 Credential 加密：只有一张密文表

`server/src/entities/credential.entity.ts:3-16`：

```ts
@Entity({ name: 'credentials' })
export class Credential extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ name: 'value_ciphertext' })
  valueCiphertext: string;
  ...
}
```

单一 AES 加密列，不区分 scope，不 bind token type。简单但缺少 metadata。

### 6.5 Marketplace

`marketplace/plugins/` 是 ToolJet 社区 plugin 的 lerna 子包。没有签名 / 审核 / 治理流程的证据。任何人按约定写一个 npm 包就能用。

对 pneuma **marketplace 治理**：ToolJet 没解决。v1 不必复制这一块，保持最小。

---

## 7. 生命周期 / Rollback（G，对标 ADR-0016/0017 —— **pneuma 可借鉴最多的章节**）

### 7.1 多环境是一等公民

`server/src/entities/app_environments.entity.ts:17-47`：

```ts
@Entity({ name: 'app_environments' })
@Unique(['name', 'organizationId'])
@Unique(['organizationId', 'priority'])
export class AppEnvironment extends BaseEntity {
  @Column() name: string;           // "development" / "staging" / "production"
  @Column({ name: 'default' }) isDefault: boolean;
  @Column() priority: number;       // 顺序
  @Column() enabled: boolean;
  ...
}
```

`AppVersion` 有 `currentEnvironmentId` 和 `promotedFrom`（`server/src/entities/app_version.entity.ts:53-57`）：

```ts
@Column({ name: 'current_environment_id' })
currentEnvironmentId: string;

@Column({ name: 'promoted_from' })
promotedFrom: string;

@Column({ name: 'parent_version_id', type: 'uuid', nullable: true })
parentVersionId: string;

@Column({ type: 'enum', enum: AppVersionStatus })
status: AppVersionStatus;  // DRAFT / PUBLISHED / RELEASED
```

AppVersionStatus = `DRAFT | PUBLISHED | RELEASED`（`server/src/entities/app_version.entity.ts:14-18`）。

**每个环境的数据源是分开的**：`data_source_options`（`server/src/entities/data_source_options.entity.ts`，未深入看）按 environment 存 options。典型 Retool-style：dev 连 dev DB，prod 连 prod DB。

对 pneuma ADR-0016：印证 "dev/prod data isolation" 是必要的一等公民，但 ToolJet 的方案仅限 "data source credentials 按环境分"。ADR-0016 想做的"构造期 Builder Agent 不能误触 prod data"需要走更深——ToolJet 依赖 `can_access_production: bool` 的粗粒度权限，没有 Agent 级 safeguard。

### 7.2 Rollback：snapshot + JSON-Patch delta，按序号 prune

这是 ToolJet 最干净、最可复用的设计。

`server/src/modules/app-history/constants/index.ts:1-55`：

```ts
export enum HISTORY_TYPE {
  SNAPSHOT = 'snapshot',
  DELTA = 'delta',
}

export enum ACTION_TYPE {
  COMPONENT_ADD, COMPONENT_UPDATE, COMPONENT_DELETE,
  QUERY_ADD, QUERY_UPDATE, QUERY_DELETE,
  PAGE_ADD, PAGE_UPDATE, PAGE_DELETE, PAGE_REORDER,
  EVENT_ADD, EVENT_UPDATE, EVENT_DELETE, EVENT_REORDER,
  GLOBAL_SETTINGS_UPDATE, PAGE_SETTINGS_UPDATE,
  BATCH_UPDATE,
  AI_CHANGE,                // <<< AI 生成的变更被单独标记
  HISTORY_RESTORE,
  INITIAL_SNAPSHOT,
}

// Snapshot creation frequency: Every 10th change creates a complete state snapshot
export const SNAPSHOT_FREQUENCY = 10;

// Maximum visible entries in the UI history list
export const RETENTION_VISIBLE_LIMIT = 100;

// Maximum total entries before cleanup is triggered
// 110 entries = 11 complete snapshot groups (each group: 1 snapshot + 9 deltas)
export const RETENTION_BUFFER_LIMIT = 110;
```

`server/src/entities/app_history.entity.ts:17-67`：

```ts
@Entity({ name: 'app_history' })
@Index('IDX_UNIQUE_SEQ_PER_APP_VERSION', ['appVersionId', 'sequenceNumber'], { unique: true })
@Check('check_history_payload_type', `
  (history_type = 'snapshot' AND jsonb_typeof(change_payload) = 'object') OR
  (history_type = 'delta' AND jsonb_typeof(change_payload) = 'array')
`)
export class AppHistory {
  @Column({ name: 'app_version_id' }) appVersionId: string;
  @Column() sequenceNumber: number;
  @Column({ name: 'parent_id', nullable: true }) parentId: string | null;
  @Column({ type: 'enum', enum: ['snapshot', 'delta'] })
  historyType: 'snapshot' | 'delta';
  @Column({ name: 'action_type' }) actionType: string;
  @Column({ name: 'operation_scope', type: 'jsonb' }) operationScope: Record<string, any>;
  @Column() description: string;
  @Column({ name: 'change_payload', type: 'jsonb' }) changePayload: Record<string, any> | any[];
  @Column({ name: 'is_ai_generated', default: false }) isAiGenerated: boolean;
  // ...
}
```

**关键 insight**（相对 pneuma 现有 ADR-0017）：

1. **`is_ai_generated: boolean` 字段** —— 在存储层就区分"人改的"和"AI 改的"，这个粒度 ADR-0017 没明确，但是**做 rollback UX 必需**的（典型场景："把最近三次 AI 改动回滚但保留我自己的"）。
2. **`historyType` 的 DB CHECK 约束** —— snapshot 必须是 object，delta 必须是 array（JSON Patch 规范是 array）。pg CHECK 强制了 shape，整洁。
3. **sequence_number + snapshot_frequency + retention_buffer_limit** 形成了一个**自包含的 prune 协议**（`server/src/modules/app-history/repository.ts:134-184`）：只有满整 10 条的 group 才会被整组删除，**保证任何保留下来的 delta 总能回溯到一个 snapshot**。这一点 pneuma ADR-0017 "shadow-git" 隐含要 gc，但没有算法。
4. **action_type + operation_scope** —— 这里的 `operation_scope` 是 jsonb，记"变更影响到哪些 resourceIds"。Builder / Agent 要做"这次变更到底改了什么"的解释（ADR-0008 NL bidirectional）时，这一层数据是关键。

**对 pneuma 的直接行动项**：ADR-0017 可以直接把这份 schema 作为 v1 的落地形态，`is_ai_generated` 字段是必要的一等公民。

### 7.3 构造期崩溃：没有 Agent-级 safeguard

ToolJet 没有 pneuma 在 "Dev 模式崩溃 Agent 决定是否重启" 的设计空间——因为 ToolJet 没有 build-phase agent 可以做决策。崩溃直接对 Builder 暴露。这是 pneuma 差异化空间。

### 7.4 Schema migration / data migration

`server/migrations/` 有 184 个 TypeORM migration 文件——全部是 framework 级 schema 演进，不是 Builder 创建的 app 内 schema migration。

对 TJDB 的用户表，migration 是"Builder 调 `edit_column` API → 服务端 ALTER TABLE"。没有"把 userA 的 data source 从 mongo 迁到 postgres"的通用迁移工具。

---

## 8. 多租户 / SaaS（H）

### 8.1 Workspace / Organization 作为根容器

`server/src/entities/organization.entity.ts` 是一切资源的 owner。App → Organization、DataSource → Organization、User 通过 `organization_users` 多对多。

### 8.2 隔离模型：混合

- **主元数据**：同一 Postgres DB，所有表行级带 `organization_id` 列过滤（**row-level tenant**）。
- **TJDB 用户数据**：每个 org 一个独立 Postgres schema + 独立 pg_role + encrypted password（`server/src/entities/organization_tjdb_configurations.entity.ts:20-25`，`server/src/helpers/tooljet_db.helper.ts` 的 `findTenantSchema`, `createNewTjdbRole` 等）—— **schema per tenant，PG-native 强隔离**。

这个混合策略对 pneuma ADR-0001（archetype scope）非常有参考价值：**框架元数据用 row-level 多租户就够，用户业务数据建议 schema-level 隔离**。

### 8.3 Licensing / billing

有完整 license + AI credits 系统：

- `server/src/modules/licensing/` —— license 解析、feature gating
- `server/src/entities/organization_license.entity.ts`
- `server/src/entities/organization_ai_credit_history.entity.ts` —— **AI 调用按 credit 计费**
- `server/src/entities/organization_subscription.entity.ts`, `organization_subscription_invoice.entity.ts`
- `server/src/entities/selfhost_*` —— self-host 客户专用

pneuma 目前没有计费 primitive。如果 pneuma v1 有 hosted 版本，需要参考 ToolJet 的 AI credit 模型——**AI 动作是 metered**，和普通操作计费维度不同。

---

## 9. 观测性（I，对标 ADR 0013-0015）

### 9.1 Audit log：单表，按资源类型枚举

`server/src/entities/audit_log.entity.ts:7-48`：

```ts
@Entity({ name: 'audit_logs' })
export class AuditLog extends BaseEntity {
  @Column() userId: string;
  @Column() organizationId: string;
  @Column() resourceId: string;
  @Column() resourceName: string;
  @Column({ type: 'enum', enum: MODULES }) resourceType: MODULES;
  @Column('simple-json') resourceData;
  @Column() actionType: string;
  @Column() ipAddress: string;
  @Column('simple-json') metadata;
  @CreateDateColumn() createdAt: Date;
}
```

`MODULES` 枚举（`server/src/modules/app/constants/modules.ts:1-60`）列了所有资源类型（APP / DATA_SOURCE / USER / PLUGIN / WORKFLOWS / TOOLJET_DATABASE / AI / ...）。`actionType` 是字符串，约定是 `create/update/delete/run/export/import` 等。

**对 pneuma ADR-0013 / ADR-0014**：
- ToolJet 把 audit 和普通 telemetry 放在同一张表（没有独立 sink）—— ADR-0014 提的 "audit subset 独立 sink" 是 ToolJet 没做的优化。
- `resourceData: simple-json` 可以塞任何 snapshot，但是**没有 schema**。ADR-0013 的"typed event category"比这严格。
- `ipAddress` 在 Audit 表里但不在普通事件里 —— **两者耦合**。

### 9.2 Winston + auditLog format 过滤

`server/src/modules/audit-logs/constants/index.ts:1-10`：

```ts
import * as winston from 'winston';

export const auditLog = winston.format((info) => {
  info.auditLog = info.options;
  delete info.options;
  info.label = info.auditLog?.['resourceType'];
  return info;
});
```

就是一个 winston formatter 标记。很朴素。

### 9.3 WebSocket events

`server/src/modules/events/events.gateway.ts:14-50`：JWT-authed ws broadcast，按 appId 广播给在同一 app 的其他编辑者。仅用于多人同时编辑 sync，不是 telemetry 通道。

---

## 10. Template / Customization（J）

### 10.1 66 个模板是静态 JSON

`server/templates/`：66 个目录，每个包含 `manifest.json`（name/description/widgets/sources/category）和 `definition.json`（几万行的 app 序列化）。`server/templates/index.ts:1-11` 只是把所有 manifest 读出来给前端列表。

**没有模板升级机制** —— 一旦 Builder 用了模板创建 app，这个 app 就是独立的、和模板脱钩。原模板将来改了，已创建的 app 不会收到改动提示。

**有趣观察**：66 个模板里有 3 个 `ai-powered-*`（code-explainer / reimbursement-tracker / sql-query-generator），暗示 ToolJet 通过"预置 OpenAI plugin 调用"做 AI 功能的 showcase，而不是通过内置 AI Builder。

### 10.2 App Git Sync（EE）

`app_git_sync` 表（`server/src/entities/app_git_sync.entity.ts:15-72`）记 `last_commit_id / last_commit_user / git_version_id / last_push_date / last_pull_date` + `allow_editing`。EE 的 GitSync 模块把 app definition 推到外部 git 仓库（GitHub/GitLab）。

对 pneuma**：pneuma-framework 的 `fork.sh` + `build.sh` 生命周期 + shadow-git 的组合可以完全覆盖 ToolJet GitSync 的功能面，且**不依赖外部 git 托管**（shadow-git 是 framework 内部 shadow），更灵活。

### 10.3 关于"Builder 改模板后如何跟随模板升级"

ToolJet **根本没试图解决这个问题** —— 模板和 app 一旦分离，就不再同步。这是 low-code 的经典难题。pneuma-app-template 机制（template 里声明 `fork.sh` / `migrate.sh`）理论上有更好的答案，但 v0 spec 里也没完全定义。**这是 pneuma 要设计的下一步**，ToolJet 没有提供可借鉴答案。

---

## 11. AI-Native（K —— pneuma 独特维度）

### 11.1 AI 是什么形态

**CE 里全是 stub**，但从 controller + entity schema 可以反推 EE 实现的形态：

AI FEATURE_KEY（`server/src/modules/ai/constants/index.ts:1-11`）：

```ts
export enum FEATURE_KEY {
  PING = 'ping',
  FETCH_ZERO_STATE = 'fetchZeroState',       // 欢迎页 + suggestions
  SEND_USER_MESSAGE = 'sendUserMessage',     // 用户发消息
  SEND_DOCS_MESSAGE = 'sendDocsMessage',     // 查文档
  APPROVE_PRD = 'approvePrd',                // 批准 PRD 后进入生成
  REWIND_STEP = 'rewindStep',                // 回退到某步
  REGENERATE_MESSAGE = 'regenerateMessage',  // 重新生成
  VOTE_MESSAGE = 'voteMessage',              // 👍👎
  GET_CREDITS_BALANCE = 'getCreditsBalance', // 余额
}
```

AI operation enum（`server/src/entities/ai_chat_prompt.entity.ts:3-14`）：

```ts
export enum AIOperation {
  Component = 'component',
  Query = 'query',
  Events = 'events',
  BusinessLogic = 'business_logic',
  Agentic = 'agentic',
  TableGeneration = 'table_generation',
  ColorTheme = 'color_theme',
  ModifyLayout = 'modify_layout',
  Docs = 'docs',
  EntireAppGeneration = 'entire_app_generation',
}
```

AI Provider 枚举（`server/src/entities/ai_chat_prompt.entity.ts:27-28`）：`'openai' | 'claude' | 'docs' | 'copilot'`。

Conversation 数据模型（`server/src/entities/ai_conversation.entity.ts:15-55`）：

```ts
@Entity('ai_conversations')
export class AiConversation {
  @Column({ name: 'app_id' }) appId: string;
  @Column({ type: 'enum', enum: ['generate', 'learn'] })
  conversationType: 'generate' | 'learn';
  @Column({ name: 'user_id' }) userId: string;
  // ...
}
```

`server/src/entities/ai_conversation_message.entity.ts:17-72`：

```ts
@Entity('ai_conversation_messages')
export class AiConversationMessage {
  @Column({ type: 'enum', enum: ['ai', 'user'] }) messageType;
  @Column() content: string | null;
  @Column({ type: 'jsonb' }) references: any;     // 引用的 component/query id
  @Column({ type: 'jsonb' }) metadata: any;
  @Column({ default: false }) deleted: boolean;
  @Column({ default: true, name: 'is_latest' }) isLatest: boolean;
  @Column({ name: 'parent_id' }) parentId: string | null;
  @OneToMany(() => Artifact, a => a.message) artifacts: Artifact[];
}
```

`server/src/entities/artifact.entity.ts:13-51`：

```ts
@Entity('artifacts')
export class Artifact {
  @Column() conversationId: string;
  @Column() messageId: string;
  @Column({ type: 'jsonb', nullable: false }) content: any;
  @Column() identifier: string;   // eg 'component:<id>' / 'query:<id>'
}
```

**这是 pneuma 和 ToolJet 最直接可对比的部分**：

| 设计点 | ToolJet | pneuma 立场 |
|---|---|---|
| Conversation 绑定到 App | Yes（`appId` 必填） | Yes（一个 pneuma-app 有一个/多个 build session） |
| 消息有 user/ai 两种 + tree（parent_id） | Yes | 对应 Agent SDK 的 message 模型 |
| Message 生成的 Artifact 独立存储 | Yes（artifacts 表） | pneuma：Operation 输出 / Transform 输出可对应 |
| AI 操作枚举为有限集 | 10 条 | pneuma 推向"任何 Operation = 任何 AI tool"（更开放） |
| AI provider 切换 | 枚举 `openai/claude/docs/copilot` | ADR-0012 AgentBackend pluggable（更开放） |
| PRD → Approve → Generate 流程 | Yes（`APPROVE_PRD` feature） | pneuma 没明确过，**值得考虑** |
| Rewind step | Yes（`rewindStep` feature） | ADR-0017 rollback（一致） |
| Vote 消息质量 | Yes（ai_response_votes 表） | pneuma 尚无，对模型训练 loop 有价值 |
| Credits billing | Yes（org_ai_credit_history） | pneuma 尚无，如果 hosted 需要 |

### 11.2 分类 "generate" vs "learn"

`conversationType: 'generate' | 'learn'`（`ai_conversation.entity.ts:32-38`）—— 一个明显的**双模式 Agent** 设计：
- `generate`：Builder 模式，Agent 输出 Artifact
- `learn`：Docs QA 模式，Agent 回答问题但不改 app

**这是 pneuma 可以立即借鉴的**：pneuma Build-phase Agent 至少也应该显式区分"询问模式 vs 构建模式"，避免"问一句 'table 怎么用' 的结果是 AI 真去改了 schema"。

### 11.3 End-User 维度的 AI：没有

ToolJet **没有 Runtime Agent**。`ai_conversations.userId` 是 Builder 自己，不是 App 的 End-User。`aiConversations` relation 从 `User.aiConversations` 出发（`server/src/entities/ai_conversation.entity.ts:42-44`），但 User 表是 ToolJet 员工/Builder，不是某个 Builder 创建的 app 的 "myapp.users"。

对 pneuma ADR-0012 Runtime Agent（在 Release mode 里可选嵌入 Runtime Agent）：**ToolJet 根本没考虑这个维度**。pneuma 的 two-agents（Build-phase + Runtime）心智模型是**独特的**。

### 11.4 AI 改动可追溯：是

`app_history.isAiGenerated`（§7.2）+ `ai_conversation_messages.artifacts` 关联到具体 component/query/page。**每一个由 AI 生成的 artifact 在 audit 维度都可追溯**。pneuma 要做到这个必须也有等价的字段——建议 ADR-0017 显式 bake。

### 11.5 AI-Native 判决

ToolJet 的 AI 是：**一个按生成类型（10 种）分门别类的 PRD→Approve→Generate 流程，带 credits billing + vote + rewind**。非常"产品化"，不非常"框架化"。

- **Cosmetic**（生成组件代码）：Component/ColorTheme/ModifyLayout/Query——多是生成代码片段。
- **Semantic**（理解数据/业务生成决策）：EntireAppGeneration + Agentic——更野心，但 CE 里看不到实现。
- 本质上仍是**"LLM 生成 JSON blob → 存进 definition → 让 Builder 审视"** 的模式。没有 pneuma ADR-0018 "Operation 声明作为单一真理源"的结构。

---

## 12. 对比矩阵：ToolJet vs pneuma ADR

| ADR | pneuma 方案 | ToolJet 方案 | 判断 |
|---|---|---|---|
| **0001** Archetype Scope | 3 种原型（solo / team / platform） | 一种多租户 SaaS + self-host | ToolJet 只实现了 platform 原型；pneuma 更有野心 |
| **0002** Storage typed cells | 封闭 semantic type 集（Email/URL/File/...） | 8 种 PG 物理类型 + jsonb 兜底 + FE 正则 validation | **pneuma 更强**，但需补 "semantic → 物理"映射表 |
| **0003** Transform primitive | Transform 作为一等公民 | 无对应物（有 `runjs` plugin 的临时代码） | **pneuma 独有** |
| **0004** Adapter Protocol | 严格接口 + capability | `QueryService.run(options)` 极简 | pneuma 方向正确，ToolJet 为反例 |
| **0005** Adapter Capabilities | 显式 capability 声明（list/filter/pushdown/...） | 无 capability 声明 | **pneuma 必需**，ToolJet 证明不这样做的代价 |
| **0006** Permission Granularity | 行级 / 列级 / action 级 | 无行级无列级；page/query/component 级 | ToolJet 较弱；TJDB 靠 PG-native `has_table_privilege` 兜底行级（绑 PG） |
| **0007** Permission DSL | YAML/predicate 声明式 | CASL AbilityBuilder（代码） | pneuma 方向正确；ToolJet 的 CASL 对 Agent 不友好 |
| **0008** NL bidirectional | 规则自然语言双向解释 | 未做 | **pneuma 独有** |
| **0009** Permission default posture | restricted by default | `is_public: true` 默认 | **pneuma 应 amend**：允许 template 声明 posture |
| **0010** User ID grants | 用户 ID 直接 grant 规则 | `page_users / query_users / component_users` 表 | 一致；ToolJet 的实现很接近 pneuma 构想 |
| **0011** Adapter credential modes | per-user + admin + admin_delegated | per-user + app-level，**无 admin_delegated** | **pneuma 独有**第三种 |
| **0012** Agent permissions | Agent 有独立权限视角 | 无对应物 | **pneuma 独有** |
| **0013** Telemetry event model | 类别化事件 + schema | winston + AuditLog 单表 `actionType: string` | pneuma 更严格；ToolJet 够用但缺 schema |
| **0014** Audit subset | 独立 sink | 与通常日志混合 | pneuma 更强 |
| **0015** Sinks and trace | 多 sink + 可追溯 trace | 单 sink | pneuma 更强 |
| **0016** Dev/Prod data isolation | Build-phase Agent 不触 prod | `can_access_production: bool` 粗粒度 | pneuma 方向更深，但需要具体机制 |
| **0017** Rollback data semantics | shadow-git + 时间旅行 | **snapshot+delta+retention 已生产级** | **ToolJet 有可直接借鉴 schema**，pneuma 应 bake 进 v1 |
| **0018** Operations as Primitive | Operation 是 UI+Agent+audit+policy 的 single source | FE `switch (actionId)` 30 分支 + 后端 `event_handler.event: any` jsonb | **pneuma 独有**，且是结构性优势 |
| **0019** WhereClause AST | 一份 AST 跨 query / permission / hook 复用 | filter 只在 TJDB 一条路径存在；CASL 用 Mongo 语法；FE 用 `{{}}` 模板；各自为政 | **pneuma 独有**，ToolJet 碎片化 |
| **0020** Query DSL | 统一 query DSL | 每个 plugin 自己的 `operation` enum；SQL 裸写；TJDB 的 6+6 动作集 | **pneuma 独有** |
| **0021** Admin-delegated credential | 第三种 OAuth 模式 | 二元模型（app-level / per-user） | **pneuma 独有** |

---

## 13. ToolJet 暴露的 pneuma 盲点

### 13.1 **Rollback 的具体落盘 schema（必补）**

ADR-0017 还停留在"shadow-git + 时间旅行"的**术语层**，没定义：

- 存储媒介（git 对象 vs jsonb 行）
- snapshot 频率
- retention / pruning 算法
- is_ai_generated / actor / description 字段
- 约束（snapshot 必须是 object, delta 必须是 array）

**建议**：把 ToolJet `app_history` 的 schema 作为 v1 落地蓝本。pneuma 的"shadow-git"更适合做**大文件 / 模板 asset** 的追踪，小粒度的 config 变更可能 jsonb 行更轻。

### 13.2 **多环境（Dev/Staging/Prod/Released）是 app-level 一等公民**

ToolJet 的 `app_environments` + `AppVersionStatus` 说明"环境"不是纯 infra 概念，而是**影响权限、data source、commit 行为**的应用层概念。pneuma CLAUDE.md 里只有 Dev / Release 两档，可能需要：

- `Staging` 中间态：Builder 还能碰、但 End-User 也看得到
- `Released` 冻结态：已 publish，允许新 version 继续
- `PUBLISHED` vs `RELEASED` 的区分

这超出 ADR-0001（archetype）和 ADR-0016（dev-prod），**建议新增 ADR**：Application Environment Model。

### 13.3 **多人协同编辑需要 ws 层**

ToolJet 有 `EventsGateway` 通过 WS 广播 app 内编辑事件（§9.3）+ `YjsGateway`（搜到了 `modules/events/yjs.gateway.ts`）做 CRDT。pneuma 未讨论 **Builder 团队协同** 的 story。如果 pneuma-app 模板允许多 Builder 合作，WS + CRDT 是必要层。建议新增 ADR 或在 ADR-0018 里扩展 Operation 的并发语义。

### 13.4 **AI 消息/artifact 持久化 schema**

ToolJet `ai_conversations + ai_conversation_messages + artifacts + ai_response_votes + ai_chat_prompts + organization_ai_credit_history` 是一个**完整的 AI 构建历史子系统**。pneuma 目前 CLAUDE.md 只提"Build-phase Agent 与 Builder 对话"，没给出对话持久化的 schema。建议新增 ADR：AI Conversation Persistence Model。

### 13.5 **PRD / Approval gate**

ToolJet 有 `APPROVE_PRD` feature + conversation "generate" mode。这是一个重要的 UX 设计：**Agent 不是直接改，而是先出 PRD，Builder 看过批准再改**。pneuma ADR-0008（NL bidirectional）有"解释 / 确认"但没有 PRD approval gate。值得 amend。

### 13.6 **Credits / usage metering**

如果 pneuma 要 hosted，必须有 AI credits 表（不同 model 不同费率）。ToolJet 的 `organization_ai_credit_history` + `organization_subscription` 是成熟方案。

---

## 14. ToolJet 解决不了但 pneuma 因 AI-native 能解决的

### 14.1 **UI ↔ Agent 语义对等（ADR-0018 的核心价值）**

ToolJet：
- FE `switch` 30 分支 action handling
- 后端 `event: jsonb` 盲存
- Audit 只能记 queryId，不能记 "deleteUser"
- Agent tool（EE）另一套 FEATURE_KEY，10 种 AI operation 平行于 30 种 FE action

→ Agent 想做 "让 alice 能删自己的书签" 必须分别生成：（a）Button component、（b）event handler JSON、（c）Query 及其 SQL、（d）QueryPermission 行、（e）可能还要 UI 的 confirmation flag。

pneuma：
- 一个 Operation 声明自动派生 UI 按钮 / tool / audit / policy / confirm
- "Agent 说出 Operation 名字" ≡ "Builder 拖出按钮" ≡ "audit 记一行"

**ToolJet 补不上这一点**，因为它的 Builder 用户是人类，人类能容忍 5 处维护。Agent 容忍不了。

### 14.2 **权限规则的自然语言双向解释（ADR-0008）**

ToolJet 的 CASL ability + granular_permissions 表是两套维护：规则改了必须程序员调代码。Builder 想问 "为什么 Bob 不能看这个 page" 没有解释面板。

pneuma 把规则表达成可被 Agent 读写的 DSL，"为什么 Bob 不能" 是自然语言 query。

### 14.3 **Admin-delegated credential（ADR-0021）**

ToolJet：要么所有人共享 bot token（合规差），要么每个 End-User 自己 OAuth（UX 差）。**没有第三种**。

pneuma 的 admin_delegated 模式（admin 一次授权，Builder 声明"这个 operation 代表哪些 End-User 使用这个 cred"）是 ToolJet **架构上没考虑**的维度。

### 14.4 **Runtime Agent 嵌入到 Released app**

ToolJet 完全没有 Runtime Agent 概念（§11.3）。pneuma template 可以选择 "ship 一个 Agent 给 End-User 聊"，这是 ToolJet 做不到的——它的 UI 栈和 Agent 栈分开。

### 14.5 **基于 Operation 自动派生 policy 违反提示**

因为 Operation 有 input schema + side-effect 声明，Agent 能在生成时就知道"这是 destructive"。ToolJet 的 `requestConfirmation` 要 Builder 手勾。pneuma Agent 自动勾。

### 14.6 **Template → fork → migrate 的自动同步**

§10.3 说 ToolJet 模板和 app 分离后不同步。pneuma-app-template 可以声明 `migrate.sh`，Builder 选择"接受 template 新版本的这些 diff"，由 Agent 协助 resolve 冲突。这是人类 Builder 做不到、Agent 能做到的事。

---

## 15. 建议行动项

### A. ADR amend（在已有 ADR 上修订）

- **ADR-0017 (Rollback)**：bake ToolJet `app_history` schema 作为 v1 落地蓝本。明确：
  - `historyType = snapshot | delta`
  - `snapshotFrequency = 10`（可调）
  - `retentionBufferLimit = N * snapshotFrequency`
  - `isAiGenerated: boolean`
  - `operationScope: jsonb`（变更影响到的 resource id 集合）
  - pg `CHECK` 约束 payload shape
- **ADR-0009 (Default posture)**：允许 template 声明 default posture；默认仍 restricted，但 "public-tool" archetype 可以声明 public-by-default。
- **ADR-0008 (NL bidirectional)**：明确加入 **PRD approval gate** 步骤（generate 前 Agent 先给 PRD，Builder approve 后才执行）。
- **ADR-0017**：加 `conversationType: 'generate' | 'learn'` 或等价概念（Agent 的 read-only 问答 vs build-write 模式）。

### B. 新 ADR（需要新写）

- **ADR-0022: Application Environment Model**。Dev / Staging / Production / Released 作为 app-level 一等公民；`app_environments` + `AppVersionStatus` 设计；环境和权限的交叉模型（can_access_*）。
- **ADR-0023: AI Conversation Persistence**。`ai_conversations / messages / artifacts / votes / prompts / credits`。与 ADR-0017 rollback 集成（AI 改动可追溯）。与 Operation primitive 集成（Artifact 一定是某 Operation 的产出）。
- **ADR-0024: Builder Team Collaboration**。WS broadcast + 可能的 CRDT（Yjs-like）。如果 pneuma-app 模板允许多 Builder 协同，需要。否则显式声明"单 Builder-only" 也可。
- **ADR-0025: AI Usage Metering**（可延到 v2，如果 hosted 才做）。

### C. v1 抓紧补证的 v0 spec 缺口

- **Typed cell → 物理存储映射表**。pneuma ADR-0002 typed cell 要 runnable，必须说明每个 semantic type 落到 Postgres 的哪种物理列（或 jsonb path）。ToolJet 只有 8 种物理类型，pneuma 会多，建议设计时明确。
- **Operation 的 wire schema**。ADR-0018 定了 primitive，但没给出 Operation 作为 wire-format 时的字段集（ID / inputSchema / sideEffects / handler ref / UI hints / Agent hints / audit category / confirmOverride / policyRef）。v1 先 bake 一份最小可行 schema。
- **Adapter capability 的具体词表**。ADR-0005 说要 capability，词表是什么？建议至少 `read / list / createOne / updateOne / deleteOne / filterPushdown / paginate / orderBy / textSearch / schemaIntrospect`，ToolJet PostgrestQueryBuilder 的 16 种算子可以作为 `filterPushdown` 子能力集的起点。

### D. 研究 follow-up（可选）

- ToolJet EE 代码访问：如果能看到 EE 里的 `AiService.sendUserMessage` 真实现，能验证关于 PRD / approve flow 的推测。
- nocodb 和 ToolJet 的**权限模型对比报告**（两者都是 pneuma 的参照系，但侧重点不同：nocodb 有行级；ToolJet 有环境级）。
- ToolJet workflow engine（Temporal-based）的深入分析——如果 pneuma 未来要做"跨 App 协作 workflow"，这是直接参照。

---

*本报告基于 ToolJet CE 的静态源码分析。EE 实现未在仓库内，结论仅限 CE + 可推断的 EE 形态（通过 entity schema + controller 接口 + FEATURE_KEY 枚举）。*
