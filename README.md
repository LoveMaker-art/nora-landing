# 诺拉宣传页

诺拉酒馆介绍、ClawChat 下载与添加入口。

使用 GitHub Pages 从 main 分支根目录发布。

添加码和语言配置位于 integration.js。

## 安装包下载入口

本地下载由 `installers.js` 通过 GitHub Releases API 自动解析，不在页面维护版本号。三个稳定入口为 `#download-windows`、`#download-mac-arm64`、`#download-mac-x64`，项目 README 可长期使用。

优先使用最新正式发布中的三平台完整安装包；若最新发布只含组件更新，查找最近 100 条发布中的最新完整安装包。请求失败时明确提示并跳转 GitHub 发布页，不使用写死的旧安装包。

按现有 `v主版本.次版本.修订号` 正式标签及 `Nora-Tavern-Launcher-版本-win-x64-setup.exe`、`-mac-arm64.dmg`、`-mac-x64.dmg` 命名发布即可自动更新。若未来更改文件命名或发布规则，需要同步调整解析规则。
