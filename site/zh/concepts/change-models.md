# 两种变更模型

这是其余领域模型所悬挂的那条区分,也是最值得弄清的一条:一个 Generated Application
能以**两种根本不同的方式**被改变,而它们不可互换。

![两条 lane:definition-as-data 通过 definition.apply 改系统表里的受治理行;code change lane 通过 draft、verify、proposal、apply 改源文件](/diagrams/change-models.png)

| | **定义即数据** | **代码变更 lane** |
|---|---|---|
| 改的是 | 系统表里受治理的*行* | scaffold 里的*源文件* |
| 机制 | `definition.apply` / `definition.apply_change_set` | draft → verify → proposal → apply |
| 单元 | 一张表、列、operation、view 或 policy | `writable_roots` 上的一份 unified diff |
| 住在 | 运行时受治理数据 | 源码控制 |
| 拥有者 | 框架的定义模型 | Host(开放式产物) |
| 经由谁回退 | `definition.rollback`(版本历史) | 重新发布 / 纠正性 proposal |
| ADR | ADR-0018、ADR-0029 | ADR-0031、ADR-0033、ADR-0034 |

## Lane A —— 改*定义*

有些变更在框架原生理解的意义上是结构性的:*加表*、*加列*、*加 operation*、*加 view*、
*改 policy*。它们不是文件——它们是系统拥有的表(`pneuma_tables`、`pneuma_operations`、
`pneuma_views`、`pneuma_policy_rules`)里的**行**。你通过调用一个语义工具 `definition.apply`
来改它们,它把这些行经由*与普通数据变更相同的受治理 pipeline* 来变更。

app 的结构是**数据,不是迁移**。这就是[定义即数据](./definition-as-data)模型,正是它
让 Build-phase Agent 通过框架可检查、可门禁、可版本化、可回滚的工具调用,来重塑一个
app 的 schema 与行为——而从不写一个迁移文件。

## Lane B —— 改*源码*

另一些变更是开放式的,没有固定 schema 能捕捉:*重写这个 React view*、*改样式*、
*加一条路由*、*调这个 server handler*。它们是真正的**源文件**编辑。它们流经
[Code Change Lane](./verify-gate):agent 编辑一个 draft,scaffold 的 `verify` 给它门禁,
一个 [proposal](./proposal-and-evidence) 披露 diff,[apply](./apply-and-versions) 物化
一个新版本。

ADR-0031 明确画了线:开放式源码产物是 **Host 拥有**且在 Host 层批准的。它们*不是*框架
定义行,也*不*经过 `definition.apply_change_set`。它们是源码控制里的 diff,由循环治理。

## 怎么判断一个变更属于哪条 lane

判据,就是把[边界 litmus](/zh/architecture/boundaries)用在*变更*而非功能上:

> 被改的东西,是一个**框架建模的结构原语**(表 / 列 / operation / view / policy)吗?
> → **Lane A**,定义即数据。
>
> 还是一段框架刻意不建模的**开放式源码**(UI、路由、样式、handler 逻辑)?
> → **Lane B**,代码变更 lane。

- "加一个 `priority` 列和一个设置它的 operation" → **Lane A**。框架知道列和 operation
  是什么;它能加行、派生 agent 工具与 UI 绑定、版本化这个变更。
- "重新设计看板 view 并加一个拖拽排序交互" → **Lane B**。没有 `pneuma_*` 行捕捉一个
  拖拽交互;它是 React 源码,经由 draft + verify + proposal 改动。

## 为什么是两条 lane 而非一条

你可以想象把一切都逼进源文件(对 schema 失去原生、可检查、可回滚的结构),或把一切都
逼进定义数据(失去真实代码的开放式表达力)。框架拒绝这两种坍缩。**框架能推理的结构是
数据;其余一切是受治理的源码。** 把两条 lane 保持分离,正是让框架在能建模变更处严格、
在不能处让路——而绝不让一个变更失去治理。

两条 lane 共享一件事:治理。两者都在 [BuildThread](./build-thread) 上记录意图与决策;
两者都把变更挡在显式批准之后。它们只在*改什么*与*怎么检查*上不同。

::: details 框架明确否决了什么(ADR-0031)
有两种"坍缩"被考虑过,又被否掉:

- **现在就用一条框架治理的 lane 收编一切**——把开放式产物(UI、路由、样式)提升为
  新的框架定义原语,好让它们共享定义即数据的治理。否决:证据太薄(只有一个开放式例子),
  而把一个建站工具专属的模型烤进一个意在支撑多种 Host profile 的框架,为时过早。
- **让 agent 直接改开放式文件**(只留 git / 进程 / 发布证据)。否决的理由,与 ADR-0029
  否掉 v0 设计的理由相同:UI 动作、agent 工具调用、批准证据、策略、历史与回滚会全部发散,
  对*改了什么*、*为什么改*留不下任何持久的语义契约。

于是开放式源码留作 Host 所有、由 code change lane 治理——一份真实 diff 进入一条真实的
批准/应用路径——而不被硬塞进定义行里。
:::

下一篇:结构那条 lane 的细节——[定义即数据](./definition-as-data)。
