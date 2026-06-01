# Draft 与 verify gate

循环里几乎所有的安全工作,靠两个想法完成:agent 编辑一个 **draft**,而非线上应用;
而一个 draft **只有 `verify` 通过**才成为 proposal。其余都是在这两点之上的细节。

![一个从 active 源拷贝出来的 draft 工作区;agent 编辑它;verify 门禁把 draft 放行为 proposal 或退回 draft](/diagrams/verify-gate.png)

## draft 是副本,不是应用

当 Build-phase Agent 开始工作,它不碰 active 源。它编辑一个 **draft 工作区**——
active 版本源码的副本,限定在 profile 的 `writable_roots` 内。这一层间接换来很多:

- 线上应用在 agent 工作时继续运行、继续预览。
- 一个改坏或弃置的 draft 不花任何代价——直接扔掉。
- 有一个稳定的基(active 源)可供 draft 去 diff,这正是
  [proposal](./proposal-and-evidence)具体可见的原因。

这就是不变量*"code agent 编辑 draft,绝非 active 源"*。它不是约定;apply 步骤会在
任何变更之前重新核对边界,以此强制它。

::: details 为什么不让 agent 直接改线上应用、出错再 undo?
因为 agent 说的"做完了"信不得,而 undo 栈是错的那张安全网。

- **信号会骗人。** backend 可能改完了却从没发出完成事件(Codex 上就发生过)。
  直接改 + undo 信的是那个前向信号;draft 门禁只信一次通过的 `verify`——见下文
  *fail-closed*。
- **直接改会让语义发散。** 就地改文件,会把 UI 动作、agent 工具调用、策略、批准证据、
  审计历史、回滚与发布语义散落各处——没有唯一一个被记录的决策点。draft → proposal →
  批准这条链把它们拧成一束,且可检视。
- **undo 脆弱,版本不脆弱。** apply 落成一个不可变的 [`vNext`](./apply-and-versions);
  回滚只是挪一下指针——崩溃安全、且持久。undo 栈是易逝的,崩溃即失,还得一态一态重放。
- **拒绝发生在变更*之前*。** 被拒的 proposal 什么都不碰;不存在"改了 5 个文件里的 3 个,
  然后 Builder 说不"。
:::

## `verify` 是门禁——scaffold 自带的检查

门禁不是框架提供的某个 linter。它是 **scaffold 自带的 `verify` 命令**——typecheck、
测试、构建——声明在 manifest 的 `pre_proposal` guardrails 里。规则,由 ADR-0034 和
Code Change Lane 给出:

> 在 `pre_proposal` guardrails 通过之前,不要请 Builder 批准一个代码变更 proposal。

一个 typecheck 失败、碰了 protected 路径,或算不出 diff 的 draft,是一次 **draft 失败**,
不是一个批准问题。它作为反馈退回给 agent(或 Builder),绝不作为"你批准这个吗?"
前进给人。批准面向的是一个连贯、受检的变更——而非调试一个坏掉的 draft。

框架附带三个内建检查,与 scaffold 自带的一起跑:

| 检查 | 断言什么 |
|---|---|
| `diff-computable` | 至少有一个改动文件;能算出 diff。 |
| `protected-paths-unchanged` | 没有改动与 `protected_paths` 重叠。 |
| `base-snapshot-unchanged` | 自证据准备以来,active 源没动过。 |

## Agent Debug Loop 发生在门禁*之前*

真实的 agent 不会一次写对。**ADR-0049(Agent Debug Loop)** 把一个有预算的修复循环
放在 proposal 创建*之前*:agent 拿到有限次尝试,看到失败检查的输出,再试。debug 证据
记录在 [BuildThread](./build-thread) 上。如果预算耗尽而检查仍失败,循环 **fail-closed**
结束:不创建 proposal。事后修复是一个*新 proposal*,绝不是悄悄改代码。

所以门禁按设计是二元的:要么 draft 通过、赢得一个 proposal,要么没通过、留作 draft。
不存在"带已知失败批准"这条路。

## fail-closed 才是要点

`verify` 是门禁——而不是"agent 说它做完了"——的原因在于:信号会骗人。在一次真实运行里,
Codex backend 改完了代码,却从没发出 host 在等的完成事件。把缺失的信号当成功,会发布
未经审查的工作。把它当失败——**fail-closed**——意味着 host kill 了进程、跑 `verify`、
发现通过,于是仍建出了正确的 proposal。

> 超时不是成功。没跑的检查没有通过。含糊的信号阻断。

正是这个姿态,让你在 agent backend 行为异常时仍能信任门禁。下一篇:一个通过的 draft
会变成什么——[proposal 与证据](./proposal-and-evidence)。
