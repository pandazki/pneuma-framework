# Apply 与版本

批准是循环里唯一发生变更的时刻。它之前的一切都"靠什么都不做"即可逆:draft 被扔掉,
proposal 被丢弃。**apply** 是那个枢纽——框架以相称的审慎对待它。

![批准把一个 proposal 转成不可变的 vNext 目录;active 指针移动;采集观察证据](/diagrams/apply-versions.png)

## 批准守护变更

不变量直白:

> 只有显式批准后才应用;拒绝发生在任何变更*之前*。

一个被拒的 proposal 什么都不碰。不存在"应用了 5 个文件中的 3 个,然后 Builder 说不"
——决策先被记录([BuildThread](./build-thread) 得到一个 `user_decision` turn),只有
`approved` 决策才进入变更。`rejected` 决策产出一个状态为 `rejected` 的
`host_execution_receipt` 并停止。

无论变更是*源码*([Code Change Lane](./change-models))还是*定义数据*(一次
`definition.apply_change_set`——见[定义即数据](./definition-as-data)),这是同一道
门禁。一个 Builder 意图,一次批准,然后变更。

## apply 重新核对它被许诺的边界

批准必要但不充分。在拷贝任何一个文件之前,apply 会重跑安全检查,因为 proposal 准备
之后世界可能已经移动:

1. **`pre_apply` guardrails** 对 active 源跑。
2. **writable-roots 强制** —— 任何 `writable_roots` 之外的改动文件被拒。批准不会给
   agent 新的领地。
3. **stale-base / stale-draft 拒绝** —— 若 active 源或 draft 自
   [证据准备](./proposal-and-evidence)以来移动了,apply 拒绝。

三者全通过后,改动文件才从 draft 拷进一个新版本。

## 版本不可变;移动的是指针

apply 把变更物化为 **`vNext`**——一个新的、不可变的版本目录。上一个版本不被原地编辑;
它原样留存。变的是一个指针:*active 版本*现在指向 `vNext`。

这正是[回滚廉价且只回代码](./rollback)的结构性原因:上一个 `vN` 仍躺在磁盘上,完整
物化。"回滚"只是把 active 指针移回去——无需重建、无需重构、无风险。

```text
v0  ──apply──▶  v1  ──apply──▶  v2     (不可变,全在磁盘上)
                                 ▲
                          active 指针
        rollback ◀── 只移指针;什么都不重建
```

## post-apply 检查能回滚 apply 本身

拷贝文件不是终点。`post_apply` guardrails 对现已变更的源跑。若失败,apply **不**成立:
框架恢复备份,记录一个状态为 `failed_validate_rolled_back` 的 `host_execution_receipt`。
一次坏的 apply 让 active 版本停在原处——fail-closed 一路贯穿到变更内部。

## 观察证据:把效果当事实

apply 成功后,框架采集**观察证据**——`{ appSchemaSignature, bundleManifest, dbSchema }`。
这是刻意的:它把"变更做了我们预期的事"从断言变成被记录的事实。你能跨两个版本 diff
schema 签名,*看见* `v1` 加了一张表;能 diff bundle manifest,*看见*构建产物变成了
什么。[proposal](./proposal-and-evidence)以 before/after 预览过的同一份证据,如今被
采集为真实的 after。

下一篇:把一个已应用的版本变成 End User 能打开之物——[publish 与回执](./publish-and-receipts)。
