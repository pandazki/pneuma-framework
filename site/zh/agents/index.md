# 用 agent 构建 Host

越来越多扩展 Creation Host 的"开发者"本身就是 **coding agent**——Claude Code、Codex
之类。本页正是写给这类读者的:契约优先、祈使、可自检。如果你是人类,它也是一份行车
规则。

::: tip 把你的 agent 指到这里
在你的 coding agent 写 Host 代码前,把本页(以及仓库的 `CLAUDE.md` / `CONTEXT.md`)作为
上下文给它。完整版在 `docs/developer/host-builder-agent-guide.md`。
:::

## 写 Host 代码前必守

1. **让四层保持可见。** Framework → Creation Host → Generated Application →
   Published Application。任务说"那个 pneuma app"时,先判定它指哪一层。
2. **跑[所有权判据](/zh/architecture/boundaries)。** 碰 栈/领域/UI/数据/部署/身份 →
   归 Host(只给契约或插槽)。纯时序/治理/机制 → 伸手去用框架 helper。
3. **遵守[受治理循环不变量](/zh/architecture/governed-loop)。** 它们编码了框架存在的
   理由;优先于你的直觉。

## 不可协商的不变量

1. scaffold 的 `verify` 是提案前门禁。没它就没 proposal。
2. **处处 fail-closed。** 缺失/含糊的信号阻断,绝不放行。超时不是成功——kill、verify,
   只有检查通过才继续。
3. 批准守护变更;拒绝发生在变更*之前*,绝不之后。
4. 迁移是 additive / forward-only / 幂等。回滚里不放破坏性 down-migration。
5. 回滚只回代码。数据前向兼容;回退它是一次*显式的纠正性 proposal*,绝非自动 drop。
6. code agent 编辑 **draft**,绝非 active 源。

## 真实世界的坑(你会撞)

- **完成事件漂移。** 某 code-agent backend 可能用一*组*事件表示"回合结束"(如
  `turn/completed` **或** `thread/status` idle),而非单一事件。匹配这一组;fail-closed
  超时让漏检变安全。
- **回合时长波动。** 同一 prompt 可能远低于、或超过一个短上限。用宽裕、可配置的超时。
- **云部署保护。** 全新部署目标可能把每个 URL 挡在鉴权后(`READY` 部署却返回 `401`)。
  回执需要访问路径,而非只有 URL——"已部署" ≠ "可访问"。
- **控制平面 vs 连接串。** Postgres URL 驱动不了分支/管理(如数据库需 API key,且 org
  级 key 需显式 project id)。
- **端口分配。** 给临时运行时选真正空闲的端口;固定计数器会撞孤儿进程,残留进程会应答
  你的 health check。

## 产出 proposal 或宣称"完成"前的自检

1. scaffold 的 `verify` 在 draft 上真的通过了吗?(不是"agent 说通过了"。)
2. 改动只碰了 editable roots 吗?(看 diff。)
3. schema 变更是 additive / 幂等、带 forward 迁移吗?
4. 我采集了前后的 schema + bundle 证据吗?
5. preview / 预演与生产数据隔离吗?
6. 任何"已部署"声明是否带*可达*检查,而非只有 URL?
7. 我是否在把任何 栈/领域/UI/数据形状 的东西塞进框架?若是,停——改成 Host 契约。
8. 若有失败或跳过,我有没有坦白说出(fail-closed),而非报告成功?

## 应当拒绝的反模式

- "直接改 active app 更快。" → 不;draft + verify + 批准。
- "回滚顺手把新列删了。" → 不;additive + 显式纠正性 proposal。
- "部署返回了 ID,就算已发布。" → 不;smoke 一个可达端点。
- "给框架加个 Vercel/Neon/Bun 依赖。" → 不;reference adapter、opt-in、core 永不依赖。
- "为了用真实数据,直接对生产库预览。" → 不;分支或内存预演。

---

吃透[判据](/zh/architecture/boundaries)与[循环不变量](/zh/architecture/governed-loop),
你基本不会出错;其余是细节。框架拥有时序与治理;你通过闭包与 adapter 拥有一切副作用。
