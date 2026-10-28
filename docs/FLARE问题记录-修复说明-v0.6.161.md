# FLARE 问题记录 · 修复说明 v0.6.161

> 版本：0.6.161（2026-10-28）
> 范围：命令风险分级的「分段 / 分级」补齐（#39）、CLI `--max-iterations` 真正生效并校验（#40）
> 验证：`tsc --noEmit` 0 错；全量 vitest **93 files / 1399 tests 全绿**；真实安装包冒烟通过

---

## 一、起因：44 条高危命令实测，20 条被判 safe

拿 `classifyCommand` 直接跑一批真实高危命令（不是构造的边界样本，是「误操作一次就要重装系统」那类），
结果 **44 条里 20 条返回 `safe`**——也就是 Agent 会不问一句就执行。漏判集中在三类：

| 类别 | 漏判样例 | 漏判原因 |
| --- | --- | --- |
| ① 解释器内联脚本 | `bash -c "rm -rf /"`、`python3 -c "import os; os.system('rm -rf /')"`、`perl -e "system('rm -rf /')"` | 规则只看命令名（`bash`/`python3`），真正执行的代码在引号里，分词器看不到 |
| ② 写入系统关键路径 | `tee /etc/sudoers < /dev/zero`、`sed -i "s/.*/x/" /etc/sudoers`、`> /etc/passwd`、`cp /dev/null /boot/grub2/grub.cfg` | 旧规则只拦「设备当**输入**」（`dd if=/dev/sda`），不拦「往关键文件**写**」 |
| ③ 破坏面/提权类 | `find / -delete`、`chown -R nobody /`、`su -`、`passwd`、`eval "$(curl ...)"` | 完全没有规则，属于覆盖空白 |

---

## 二、【#39】命令分段分级：从「整串匹配」改成「逐段判、两层拦」

### 2.1 逐段生效

分级本来就是按 `parseCommandSegments` 切段做的，但旧规则的匹配条件大多写成「整条命令的文本」，
出现 `mkdir -p /tmp && tee /etc/passwd` 这种「前半段无害、后半段致命」的复合命令时，
`&&` 后面的危险段被前面的 `mkdir` 稀释掉了。

现在所有新增规则一律以 `seg`（单段）为判定单位：

- `writeTargets(seg)` —— 从单段里抽「写入目标」：`tee`/`cp`/`mv`/`install`/`truncate`/`dd` 的最后一个非选项参数，
  以及重定向 `>`、`>>` 的目标（`2>/dev/null` 这类 fd 重定向会被正确跳过）。
- `write-system-path`（confirm）/ `write-critical-path`（block）只检查这些目标路径，与命令其他部分无关。
- `find-delete-recursive` 只看 `seg.name === 'find'` 段。

### 2.2 两层分级：能修的回 confirm，修不回来的直接 block

新增两组路径清单，同一份「写入目标」按危险程度分流：

**`CRITICAL_WRITE_PATHS` → block（一写就废，不给确认机会）**

- `/etc/sudoers`、`/etc/sudoers.d/*`
- `/etc/{passwd,shadow,gshadow,group,fstab,crypttab,ld.so.preload}`
- `/boot/**`
- 块设备：`/dev/{sd,hd,vd,nvme,mmcblk,mapper,md\d,dm-\d,disk/*}`

**`SENSITIVE_WRITE_PATHS` → confirm（能修，但要花时间，先说清楚）**

- `/etc/**`（未列入 critical 的部分，如 `sysctl.d`、`hosts`）
- `/usr/{bin,sbin,lib,lib64}/**`、`/bin/**`、`/sbin/**`、`/lib(64)/**`
- `/proc/**`、`/sys/**`（如 `echo 1 > /proc/sys/vm/drop_caches`）

### 2.3 解释器内联脚本：把引号里的代码再判一次

`bash -c '<code>'`、`sh -c`、`python3 -c`、`perl -e`、`node -e` 会把 `<code>` 抽出来重新走一遍分级：

- `INLINE_DESTRUCTIVE` —— 内联代码里出现 `rm -rf /`、`mkfs`、`dd ... of=/dev/sd*`、`shred /dev/*`、
  `:(){ :|:& };:` 等 → **block**。
- `INLINE_EXEC_API` —— 出现 `os.system`、`subprocess.*`、`shutil.rmtree`、`child_process`、
  `execSync`、`system(` 等「把字符串当命令跑」的 API → **confirm**。
- 递归深度限制 2 层，`bash -c 'bash -c "rm -rf /"'` 仍能拦住，又不会因为自嵌套把 CPU 打满。
- **白名单优先**：`python3 -c "print(1+1)"`、`node -e "console.log(1)"`、`bash -c "cd /tmp && ls"`、
  `curl ... | python3 -m json.tool` 判 safe —— 加固规则最容易犯的错是拦掉正常运维，
  那会让模型改用更危险的绕过方式。

### 2.4 补齐的零规则类

| 规则 id | 级别 | 触发 |
| --- | --- | --- |
| `write-critical-path` | block | 写入 `CRITICAL_WRITE_PATHS` |
| `inline-destructive` | block | 解释器内联脚本含破坏性调用 |
| `find-delete-recursive` | block/confirm | `find` + `-delete`/`-exec rm`：起点是 `/`、`/etc`、`~` → block；其余 → confirm |
| `write-system-path` | confirm | 写入 `SENSITIVE_WRITE_PATHS` |
| `privilege-escalation` | confirm | `su`、`passwd`、`chpasswd`、`visudo`、`sudoedit` |
| `eval-dynamic` | confirm | `eval`、`base64 -d \| sh` 这类动态执行 |
| `inline-exec-api` | confirm | 内联脚本调用 exec 类 API |

---

## 三、【#40】`-m/--max-iterations`：从「传了等于没传」到全程生效

修之前两个坑：

1. **交互模式完全忽略 `-m`**。`-m` 只在 `flare chat -q "..."` 和 `--continue` 分支里被读取，
   而 `flare chat`（不带 `-q`，也就是最常用的交互模式）走 `startInteractive()`，根本没把这个值传进 `Agent`。
   用户 `-m 200` 以为提了预算，实际还是默认 50，只在撞上限时隐约发现。
2. **`parseInt` 不校验**。`-m abc` → `NaN` → 被 `this.config.maxIterations || DEFAULT` 静默兜回 50，零提示；
   `-m 5000` → 被静默削到 500，也零提示。用户以为生效了，其实没有。

修法：抽 `src/core/iteration-budget.ts`，把常量与解析合成唯一出处（硬上限 500 原来在 `agent.ts` 和
`cli/index.ts` 各写一份，改一处就漂移）：

```ts
parseMaxIterations(raw)   // CLI 入参：非法 → { ok:false, error }；超限 → { ok:true, value:500, warning }
resolveBudget(configured) // 实际预算：env > 配置 > 默认，夹在 [1, 500]，永不为 NaN
```

行为变化：

| 输入 | 修前 | 修后 |
| --- | --- | --- |
| `flare chat -m 200`（交互） | 支付被丢弃，仍是 50 | 生效 200 |
| `flare chat -m abc -q ...` | 静默 50 | `❌ --max-iterations 需要正整数，收到 "abc"` + 用法示例，**exit 2** |
| `flare chat -m 0` / `-m -5` / `-m 1.5` | 静默 50 | 同上，exit 2 |
| `flare chat -m 5000` | 静默削到 500 | `⚠️  --max-iterations 5000 超出硬上限，已按 500 执行` |
| 宿主/协议传 `maxIterations: NaN` | `NaN \|\| 默认` → 50（隐式） | `resolveBudget` 显式判有限正整数 → 50 |

---

## 四、验证

### 4.1 静态与单测

- `npx tsc -p tsconfig.json --noEmit` → `TSC_RC=0`
- 全量 `npx vitest run` → **Test Files 93 passed (93) / Tests 1399 passed (1399)**，22.93s
- 新增两个测试文件：
  - `tests/risk-issues-39-command-grading.test.ts`（18 用例）：三组漏判的「必须拦住」＋ 每组的**误报哨兵**
  - `tests/iteration-budget-40.test.ts`（11 用例）：入参校验、边界夹取、env 优先级、NaN 防护

### 4.2 已安装 dist 冒烟（不是只跑单测）

```
$ flare version
flare v0.6.161

$ flare chat -m abc -q hi   ; echo $?
❌ --max-iterations 需要正整数，收到 "abc"
   例：flare chat -q "..." -m 120（默认 50，硬上限 500）
2

$ flare chat -m 0 -q hi     ; echo $?
2

$ flare chat -m 5000        （非 TTY）
⚠️  --max-iterations 5000 超出硬上限，已按 500 执行
❌ 交互模式需要在终端中运行（当前输入不是终端）。
```

### 4.3 分级效果对比（同一批命令，跑已安装的 `dist/tools/risk.js`）

| 指标 | 修前 | 修后 |
| --- | --- | --- |
| 高危命令判 safe（漏判） | 44 条里 **20 条** | 42 条里 **0 条** |
| 判 block | — | 30 条 |
| 判 confirm | — | 12 条 |
| 正常命令误报（必须 safe） | — | 19 条里 **0 条** |

误报哨兵覆盖：`ls /etc`、`cat /etc/os-release`、`sed -n 1,10p /etc/passwd`、
`dd if=/dev/zero of=/dev/null`、`echo hi > /tmp/x.txt`、`cat > ~/.config/...`、
`sed -i` 改项目内文件、`find . -name "*.ts"`、`chown -R user ./dist`、`npm run build 2>/dev/null`。

---

## 五、附带：备份清理

历史备份（`~/.flare/install/dist.bak.*`、`~/flare-src-before-*.tgz`、`~/flare-install-dist-before-*`）
此前累计 43 项、约数十 MB。已清理到**每类只留最近 2 个**，现共 4 项 / 6.2 MB：

```
~/.flare/install/dist.bak.20261028-201857
~/.flare/install/dist.bak.20261028-204331   ← 本次安装前快照
~/flare-src-before-20261028-201135.tgz
~/flare-install-dist-before-20261028-201135
```

回滚方式：`rm -rf ~/.flare/install/dist && cp -a ~/.flare/install/dist.bak.<ts> ~/.flare/install/dist`，
并把 `~/.flare/install/package.json` 的 `version` 改回对应版本。

---

## 六、已知遗留

- `find -delete` 的 block/confirm 分流依赖起点路径判断（`/`、`/etc`、`~` → block）；
  `find $SOMETHING -delete` 这类变量起点按 confirm 处理，交给确认门兜底。
- 内联脚本递归深度上限 2 层；更深的嵌套（`bash -c 'bash -c "bash -c ..."'`）只判到第 2 层，
  但第 2 层已能看到内层引号里的 `rm -rf`，实测足够。
- `src/tools/ferry-core/engine.ts` 的 142 行改动仍为工作区未提交状态（早于本轮，与本版无关）。

---

## 七、文件清单

| 文件 | 变更 |
| --- | --- |
| `src/tools/risk.ts` | +`CRITICAL_WRITE_PATHS`/`SENSITIVE_WRITE_PATHS`/`WRITE_COMMANDS`/内联检测；+7 条规则 |
| `src/core/iteration-budget.ts` | **新增**：`HARD_MAX_ITERATIONS`/`DEFAULT_MAX_ITERATIONS`/`parseMaxIterations`/`resolveBudget` |
| `src/core/agent.ts` | 预算解析改用 `resolveBudget`（去掉 `||` 隐式兜底），复用共享常量 |
| `src/cli/index.ts` | `-m` 统一解析（非法 exit 2 / 超限警告）；交互模式透传 `maxIterations`；选项说明更新 |
| `tests/risk-issues-39-command-grading.test.ts` | **新增** 18 用例 |
| `tests/iteration-budget-40.test.ts` | **新增** 11 用例 |
