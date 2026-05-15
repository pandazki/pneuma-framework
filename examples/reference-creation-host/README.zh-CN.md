# Reference Creation Host

**状态：** M45 canonical consumer
**English version:** [README.md](./README.md)

这个 example 是 0.4.0 implementation-framework lane 的长期 Reference Host。它不是一次性的 milestone demo。

## 场景

Host 从一个名为 **Team Notes Board** 的 Generated Application 开始。

```text
v0:
  notes list
  create/update shape represented by source fields

Builder asks:
  Add a review queue so notes can be marked needs_review and approved.

v1:
  review_status field
  review queue preview
  carry-forward data receipt
```

Host 要求 Reviewer approval。Bob 是 Builder；Alice 是 Reviewer。

## 运行

```bash
PORT=8893 bun run --cwd examples/reference-creation-host serve
```

打开：

```text
http://127.0.0.1:8893/
```

## 测试

```bash
bun test examples/reference-creation-host/reference-host.test.ts
bun test examples/reference-creation-host/ui-state.test.ts
```

## 流程

1. Create v0。
2. Ask Agent for the review queue。
3. Bob approval 被 blocked。
4. Alice approval 成功。
5. Code Change Lane apply guarded source change。
6. Preview Data Rehearsal 给已有 notes 设置 `review_status=not_required`。
7. Preview start。
8. Publish 记录 runtime/data evidence。
9. Rollback 把 active version 回到 v0。

## 它替代什么

如果 M45 后续保持健康，这个 example 可以替代 `examples/m16-reference-creation-host/` 的大部分 operational value。

## 它还没有证明什么

它没有证明：

- production IAM；
- production credential vault；
- cloud deployment；
- arbitrary raw patch coding agent；
- fully open-ended UI generation；
- Docker as the default deployment path。

这些仍然是后续 pressure lanes，不是 M45 的前置条件。

