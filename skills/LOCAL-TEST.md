# 技能库本地测试

当前只保留浏览、搜索、下载、安装启用和使用。网站、管理技能与极狐技能资源均未发布。服务启动：在项目目录运行 `npm run preview:skills`，访问 http://127.0.0.1:8776/skills/ 。

## 首次安装管理技能

下载 packages/nora-skill-library-0.3.0.zip，解压，将完整 nora-skill-library 文件夹放进测试实例的 skills/creative/。让诺拉用 skill_view 加载这个技能。管理技能尚未预装；本轮不修改正式实例或启动器。

当前实例的 HERMES_HOME 必须对应你指定的测试实例。使用当前 Hermes 的 Python；若程序不在该实例的 hermes-agent 子目录，核实后使用 --hermes-root 指定程序目录。不要把正式实例当成临时测试目录。

## 按用户旅程测试

对诺拉说：

> 使用管理技能，从本地测试库 http://127.0.0.1:8776/skills/ 帮我找人格设计技能，先介绍用途，不安装。

> 把这个技能安装到我指定的测试实例并启用，然后加载它，帮我设计人格。只生成文稿，不替换活动人格。

正常路径由诺拉完成查找、下载安装启用和加载，不要求用户自己敲多条命令。这里只是技能指令与脚本已经具备相应步骤，实际对话效果仍需你验收。

命令排查示例（全局参数在动作前）：

```text
python <管理技能目录>/scripts/library.py --local-test http://127.0.0.1:8776/skills/ search 人格
python <管理技能目录>/scripts/library.py --local-test http://127.0.0.1:8776/skills/ info nora-persona-designer
python <管理技能目录>/scripts/library.py --local-test http://127.0.0.1:8776/skills/ install nora-persona-designer --confirm --platform clawchat
```

## 结果与边界

- list/search/info：只查询，不安装。
- download：只获取校验通过的 ZIP。
- installed + enabled:true：文件写入且 Hermes 可见与可读取；诺拉当前会话再通过 skill_view 加载。
- installed_not_enabled：文件已经安装，启用未确认；保留文件，不冒称可用。
- already-installed：完整文件一致，没有覆盖。
- ALREADY_EXISTS：已有同名不同内容，保留原内容，不自动更新。
- --files-only：仅隔离文件测试，不代表启用。

人格技能只生成文稿；原版酒馆控制仍需 st-mcp。安装不自动执行技能任务或配置依赖。本地源仅访问本机；未来公开源才依次使用极狐、官网同版本同哈希文件。云端诺拉的 127.0.0.1 不能访问你的电脑。

上传、投稿、回执查询和审核功能已撤除。已有私有数据保留在原私有目录中，不再通过此服务访问。没有发布、上传镜像或改动正式诺拉。Windows/Linux 与真实诺拉对话工作流尚待验收。
