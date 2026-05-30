# Publish 与回执

[apply](./apply-and-versions)让一个新版本*存在*。**publish** 让一个版本*可达*——它跑
迁移,然后把版本服务或部署给 End User,返回一份**结构化回执**作为证据。回执是要点:
一次无法证明它做了什么的发布,不是你能治理的发布。

![publish 跑一次 additive 迁移、部署版本,返回带 target、url、persistence、deployment id 与 schema 的回执](/diagrams/publish-receipts.png)

## publish 是 migrate-then-serve

一次发布是固定顺序的两个动作:

1. **迁移。** 把版本的 schema 变更应用到真实持久化后端。迁移是 **additive、
   forward-only、幂等**——和[让回滚安全](./rollback)的是同一个属性。系统里任何地方
   都没有破坏性 down-migration。
2. **服务或部署。** 要么本地服务 active 版本,要么通过 Host 拥有的 adapter(参考是
   Vercel REST adapter)部署到一个由真实持久化(参考是 Neon)支撑的真实 URL。

顺序要紧:schema 先于流量。End User 绝不会撞上一个数据库尚未跟上的部署。

## 回执是结构化的,不是一行日志

框架定义回执的*形状*;Host 用真实值填它:

```ts
PublishReceipt = {
  target,          // "local" | "vercel" | ...
  versionId,       // 现在线上的是哪个版本
  url,             // End User 打开的访问路径
  persistence,     // 数据在哪(如 Neon branch/role)
  deploymentId?,   // provider 的部署句柄
  files?,          // 上传了什么
  dbSchema,        // 现在线上的 schema
  migrateTail,     // 迁移运行的尾部
}
```

回执是让发布*可审计*的东西:几个月后,你能从一个存好的对象回答"到底是什么在服务 v2、
对着哪个数据库、何时部署、用什么 schema?"——而不是 SSH 进某台机器。

## "已部署"不等于"可达"

回执刻意携带一个**访问路径**(`url`)。一个返回 `200 deployed` 却对真实访客返回 `401`
的部署,没有发布出任何有用的东西。我们真撞上过:一个全新的 Vercel project 默认开着
Deployment Protection,于是部署是活的,但每个请求都得到 `401`。修复是 Host 的事——
`PATCH` 该 project 关掉 SSO 保护——而教训写进了契约:

> 发布返回含访问路径的证据。"已部署" ≠ "可达"——回执必须证明后者,而非只证明前者。

## 持久化比部署活得久

回执把 `url`/`deploymentId`(部署)与 `persistence`(数据)分开。它们有不同的生命期,
而这个分离正是[回滚](./rollback)所依赖的:你可以重指或重新部署线上 URL 而不碰数据,
且数据跨版本持续累积,因为迁移只会增加。

## 框架在哪里止步

publish 是最能看清[边界](/zh/architecture/boundaries)的地方。框架拥有*顺序*
(migrate-then-serve)、*回执形状*与 *fail-closed 门禁*。它**不**拥有 Vercel、Neon、
Docker 或任何部署目标——那些是 Host 消费或替换的可选参考 adapter
(`@pneuma-framework/adapter-vercel`、`@pneuma-framework/adapter-neon`)。结构化部署
回执目前还是 Host/example 本地的;把它提升进框架包,正是边界留待 RC 后决定的那类事。

下一篇:同一份持久化如何在改 schema 的发布之前被安全演练——[preview 与数据演练](./preview-and-rehearsal)。
