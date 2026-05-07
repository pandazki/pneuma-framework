# 下游项目升级到 pneuma-rc-0.1.1

**读者：** 当前使用 `pneuma-rc-0.1.0` 的下游 Creation Host 项目
**English version:** [upgrading-to-rc-0.1.1.md](./upgrading-to-rc-0.1.1.md)

`pneuma-rc-0.1.1` 是 developer-contract patch。它不改变四层产品模型，也不要求已有 Host 重新设计。升级重点是把本地依赖指向新的 RC checkout，并把一些手写的 framework 约定替换成导出的常量/helper。

## 1. 更新本地 framework 路径

如果下游项目在 `package.json` 里引用本地 RC checkout，把所有 `@pneuma-framework/*` 路径从：

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.0/packages/core"
```

改为：

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/core"
```

每个 package 使用对应目录：

```text
/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/core
/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/core-domain
/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/runtime
/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/cli
/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/viewer-react
```

然后重新安装：

```bash
bun install
```

## 2. 替换 runtime magic strings

如果 Host 里硬编码了 runtime SQLite env var：

```ts
process.env.PNEUMA_SQLITE_PATH = sqlitePath;
```

建议改成：

```ts
import { PNEUMA_SQLITE_PATH_ENV } from "@pneuma-framework/runtime";

process.env[PNEUMA_SQLITE_PATH_ENV] = sqlitePath;
```

注意：要在 import 任何会构造 `AppConfig` 的模块之前设置。

如果 Host 里硬编码了 framework-internal HTTP token 名称：

```ts
"PNEUMA_INTERNAL_HTTP_TOKEN"
"x-pneuma-internal-token"
```

建议改成：

```ts
import {
  PNEUMA_INTERNAL_HTTP_TOKEN_ENV,
  PNEUMA_INTERNAL_HTTP_TOKEN_HEADER,
} from "@pneuma-framework/runtime";
```

这个 token 仍然只是 internal local-process pattern，不是公开鉴权机制。

## 3. 替换手写 service marker

如果 runtime 直接打印 marker lines：

```ts
console.log(`##pneuma:service-ready api ${url}`);
console.log("##pneuma:ready");
console.log("##pneuma:stopping");
```

建议改成：

```ts
import {
  printReadyMarker,
  printServiceReadyMarker,
  printStoppingMarker,
} from "@pneuma-framework/core";

printServiceReadyMarker("api", url);
printReadyMarker();
printStoppingMarker();
```

## 4. 检查 authoring manifests

如果 Host 手写 Authoring Kit 或 Sharing Governance 文件，请重新阅读：

- [Creation Host Contract 中文版](./creation-host-contract.zh-CN.md)
- [AppConfig Authoring 中文版](./app-config-authoring.zh-CN.md)
- [Runtime Composition 中文版](./runtime-composition.zh-CN.md)
- [Release Rollout Authoring 中文版](./release-rollout-authoring.zh-CN.md)

RC 0.1.1 中容易漏掉的 shape：

- `CredentialRequirement` 是完整对象，不是 id 字符串。
- `ShareArtifactManifest.app_id` 和 `SharingGovernanceManifest.app_id` 是 literal generated-app id。
- `credential_rebinding_policy.requirements` 是完整 `CredentialRequirement[]`。
- `init_recipe.steps[].kind` 在当前 RC 里只能是 `"semantic-operation"`。
- Sharing subjects 是具体 ref，例如 `user:alice`、`role:maintainer`、`org:acme` 或 `team:platform`；wildcard install 当前属于 Host-owned distribution policy。

## 5. 运行下游验证

建议最低验证：

```bash
bun install
bun run typecheck
bun test
```

如果项目有 Host doctor 流程，用你实际要发布的文件跑：

```bash
bun /Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/cli/src/index.ts doctor-host \
  --workspace <your-host-workspace> \
  --profiles <profiles.json> \
  --agent-package <agent-package.json> \
  --provider-capabilities <provider-capabilities.json> \
  --share-artifact <share-artifact.json> \
  --sharing-governance <sharing-governance.json> \
  --credential-rebinding <credential-rebinding.json>
```

Docker-backed smoke tests 可以单独跑，但如果卡在 Docker credential helper，应先当作环境问题排查，不要直接归因为 RC 0.1.1 迁移失败。

## 6. 预期影响

预期会发生：

- Host runtime 里的 hard-coded framework strings 变少；
- manifest validation failure 更容易对照文档理解；
- AppConfig、runtime、rollout shape 不再需要靠读 framework source 才能发现。

不预期发生：

- 不需要数据迁移；
- 不需要重写 app definition；
- 不需要改变四层产品模型；
- 这个 patch 不提供新的生产 OAuth/session/security primitive。
